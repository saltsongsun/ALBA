-- 여러 회사가 함께 쓰기
-- · 회사(companies): 회사마다 상호·대표·직인·기본 시급 등 (예전 settings 1행 → 첫 회사)
-- · 관리자는 회사에 소속(company_members)되고, 한 관리자가 여러 회사를 오가며 운영
-- · 최고 관리자(users.is_super)만 회사를 만들고 관리자를 초대
-- · 근무자 계정은 모든 회사 공용 (한 번 가입으로 여러 회사 공고 지원).
--   공고·지원·출퇴근·서류·문의·평가·서식·외주는 회사별로 나뉘어 다른 회사에는 보이지 않음
-- 기존 자료는 모두 첫 회사로 옮김. 서버(서비스 키)만 읽고 쓰므로 anon·authenticated 권한은 모두 막음

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  ceo_name text,
  business_no text,
  company_address text,
  company_phone text,
  contact_name text,
  contact_phone text,
  seal_image text,
  default_hourly_wage int not null default 10320,
  workplace_5plus boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- 예전 회사 정보 → 첫 회사 (가장 먼저 만든 회사가 '기본 회사': 로그인 화면 문의처 등)
insert into public.companies (
  company_name, ceo_name, business_no, company_address, company_phone, contact_name, contact_phone,
  seal_image, default_hourly_wage, workplace_5plus, created_at
)
select company_name, ceo_name, business_no, company_address, company_phone, contact_name, contact_phone,
  seal_image, default_hourly_wage, workplace_5plus,
  coalesce((select min(created_at) from public.users), now())
from public.settings where id = 1;
insert into public.companies (company_name)
select '회사명 (설정에서 입력)' where not exists (select 1 from public.companies);

create or replace function public.first_company_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.companies order by created_at, id limit 1
$$;

-- 회사 관리자
create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user on public.company_members (user_id);

-- 최고 관리자: 회사를 만들고 관리자를 초대 (처음 설치한 관리자)
alter table public.users add column is_super boolean not null default false;
update public.users set is_super = true
where id = (select id from public.users where role = 'admin' order by created_at, id limit 1);
insert into public.company_members (company_id, user_id, role)
select public.first_company_id(), id, 'owner' from public.users where role = 'admin';

-- 회사별 근무자 메모 (예전 users.admin_memo는 모든 회사에 보이므로 회사별로 옮김)
create table public.company_worker_notes (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  memo text,
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
insert into public.company_worker_notes (company_id, user_id, memo)
select public.first_company_id(), id, admin_memo from public.users where admin_memo is not null and admin_memo <> '';

-- ── 회사별 자료에 company_id ──
-- 공고에 딸린 자료(지원·출퇴근·서류·근무시간 변경)는 늘 공고의 회사로 맞춤 (코드가 잘못 넣어도 섞이지 않게)
create or replace function public.company_from_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_id is not null then
    new.company_id := (select company_id from public.jobs where id = new.job_id);
  end if;
  if new.company_id is null then
    new.company_id := public.first_company_id();
  end if;
  return new;
end;
$$;

-- 공고가 없을 수도 있는 자료(문의·평가·견적·대금)는 공고가 있으면 공고의 회사, 없으면 코드가 넣은 회사.
-- 둘 다 없으면 기본 회사 (배포가 바뀌는 몇 분 동안 예전 코드가 넣는 행 대비)
create or replace function public.company_from_job_or_given()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_id is not null then
    new.company_id := coalesce((select company_id from public.jobs where id = new.job_id), new.company_id);
  end if;
  if new.company_id is null then
    new.company_id := public.first_company_id();
  end if;
  return new;
end;
$$;

create or replace function public.company_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is null then
    new.company_id := public.first_company_id();
  end if;
  return new;
end;
$$;

-- 공고·서식·외주사
alter table public.jobs add column company_id uuid references public.companies(id) on delete cascade;
alter table public.doc_templates add column company_id uuid references public.companies(id) on delete cascade;
alter table public.vendors add column company_id uuid references public.companies(id) on delete cascade;
update public.jobs set company_id = public.first_company_id();
update public.doc_templates set company_id = public.first_company_id();
update public.vendors set company_id = public.first_company_id();
alter table public.jobs alter column company_id set not null;
alter table public.doc_templates alter column company_id set not null;
alter table public.vendors alter column company_id set not null;
create trigger jobs_company before insert on public.jobs for each row execute function public.company_default();
create trigger doc_templates_company before insert on public.doc_templates for each row execute function public.company_default();
create trigger vendors_company before insert on public.vendors for each row execute function public.company_default();
create index jobs_company on public.jobs (company_id, status, start_date);
create index doc_templates_company on public.doc_templates (company_id);
create index vendors_company on public.vendors (company_id);

-- 공고에 딸린 자료
alter table public.applications add column company_id uuid references public.companies(id) on delete cascade;
alter table public.attendance add column company_id uuid references public.companies(id) on delete cascade;
alter table public.signed_docs add column company_id uuid references public.companies(id) on delete cascade;
alter table public.shift_changes add column company_id uuid references public.companies(id) on delete cascade;
update public.applications t set company_id = j.company_id from public.jobs j where j.id = t.job_id;
update public.attendance t set company_id = j.company_id from public.jobs j where j.id = t.job_id;
update public.signed_docs t set company_id = j.company_id from public.jobs j where j.id = t.job_id;
update public.shift_changes t set company_id = j.company_id from public.jobs j where j.id = t.job_id;
update public.applications set company_id = public.first_company_id() where company_id is null;
update public.attendance set company_id = public.first_company_id() where company_id is null;
update public.signed_docs set company_id = public.first_company_id() where company_id is null;
update public.shift_changes set company_id = public.first_company_id() where company_id is null;
alter table public.applications alter column company_id set not null;
alter table public.attendance alter column company_id set not null;
alter table public.signed_docs alter column company_id set not null;
alter table public.shift_changes alter column company_id set not null;
create trigger applications_company before insert or update of job_id on public.applications for each row execute function public.company_from_job();
create trigger attendance_company before insert or update of job_id on public.attendance for each row execute function public.company_from_job();
create trigger signed_docs_company before insert or update of job_id on public.signed_docs for each row execute function public.company_from_job();
create trigger shift_changes_company before insert or update of job_id on public.shift_changes for each row execute function public.company_from_job();
create index applications_company on public.applications (company_id, status);
create index attendance_company on public.attendance (company_id, work_date);
create index signed_docs_company on public.signed_docs (company_id, status);
create index shift_changes_company on public.shift_changes (company_id, status);

-- 공고가 없을 수도 있는 자료
alter table public.messages add column company_id uuid references public.companies(id) on delete cascade;
alter table public.worker_ratings add column company_id uuid references public.companies(id) on delete cascade;
alter table public.quote_requests add column company_id uuid references public.companies(id) on delete cascade;
alter table public.vendor_payments add column company_id uuid references public.companies(id) on delete cascade;
update public.messages set company_id = public.first_company_id();
update public.worker_ratings set company_id = public.first_company_id();
update public.quote_requests set company_id = public.first_company_id();
update public.vendor_payments set company_id = public.first_company_id();
alter table public.messages alter column company_id set not null;
alter table public.worker_ratings alter column company_id set not null;
alter table public.quote_requests alter column company_id set not null;
alter table public.vendor_payments alter column company_id set not null;
create trigger messages_company before insert on public.messages for each row execute function public.company_from_job_or_given();
create trigger worker_ratings_company before insert on public.worker_ratings for each row execute function public.company_from_job_or_given();
create trigger quote_requests_company before insert on public.quote_requests for each row execute function public.company_from_job_or_given();
create trigger vendor_payments_company before insert on public.vendor_payments for each row execute function public.company_from_job_or_given();
create index messages_company_thread on public.messages (company_id, thread_user_id, created_at desc);
create index worker_ratings_company on public.worker_ratings (company_id, user_id);
create index quote_requests_company on public.quote_requests (company_id, status);
create index vendor_payments_company on public.vendor_payments (company_id, paid_at, due_date);

-- 기록 (회사 일이 아닌 가입·로그인 등은 비어 있음)
alter table public.audit_logs add column company_id uuid references public.companies(id) on delete set null;
update public.audit_logs set company_id = public.first_company_id();
create index audit_logs_company on public.audit_logs (company_id, created_at desc);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_worker_notes enable row level security;
revoke all on public.companies, public.company_members, public.company_worker_notes from anon, authenticated;
revoke execute on function public.first_company_id() from anon, authenticated;
