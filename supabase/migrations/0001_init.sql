-- 소켓 알바 초기 스키마
-- 모든 읽기·쓰기는 Next.js 서버에서 service role(secret) 키로만 합니다.
-- 테이블마다 RLS를 켜고 정책을 두지 않아, 공개(anon) 키로는 어떤 행도 읽거나 쓸 수 없습니다.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 회원(근무자·관리자)
create table public.users (
  id uuid primary key default gen_random_uuid(),
  role text not null default 'worker' check (role in ('worker', 'admin')),
  name text not null,
  phone text not null unique,                 -- 숫자만 (01012345678)
  pin_hash text not null,                     -- scrypt
  rrn_enc text,                               -- 주민등록번호 AES-256-GCM 암호문
  rrn_hash text unique,                       -- 중복 가입 확인용 HMAC
  rrn_masked text,                            -- 900101-1******
  birth_date date,
  gender text check (gender in ('M', 'F')),
  is_foreigner boolean not null default false,
  address text,
  bank_name text,
  bank_account_enc text,                      -- 계좌번호 암호문
  account_holder text,
  bank_changed_at timestamptz,
  emergency_phone text,
  admin_memo text,
  active boolean not null default true,
  privacy_agreed_at timestamptz,
  failed_logins int not null default 0,
  locked_until timestamptz,
  session_version int not null default 1,     -- 비밀번호 변경·초기화 시 올려서 기존 로그인 무효화
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- 회사 정보 (1행)
create table public.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default '주식회사 소켓씨앤씨',
  ceo_name text default '유대현',
  business_no text,
  company_address text,
  company_phone text,
  contact_name text,                          -- 비밀번호 분실 등 문의 담당자
  contact_phone text,
  seal_image text,                            -- 직인 PNG data URL
  default_hourly_wage int not null default 10320,
  workplace_5plus boolean not null default true, -- 상시 5인 이상 사업장 (가산수당 기본값)
  updated_at timestamptz not null default now()
);
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
insert into public.settings (id) values (1);

-- 서류 서식 (근로계약서·서약서·동의서 등)
create table public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'contract' check (kind in ('contract', 'pledge', 'consent', 'other')),
  title text not null,
  body text not null,
  is_default boolean not null default false,  -- 새 공고에 기본으로 체크
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger doc_templates_updated_at before update on public.doc_templates
  for each row execute function public.set_updated_at();

-- 아르바이트 공고
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_name text,
  description text,
  task text,                                  -- 업무내용
  location_name text,
  address text,
  lat double precision,
  lng double precision,
  gps_required boolean not null default false,
  gps_radius_m int not null default 300,
  start_date date not null,
  end_date date not null,
  start_time time not null,
  end_time time not null,                     -- start_time보다 이르면 다음날 종료(야간 근무)
  headcount int not null default 1,
  pay_type text not null default 'hourly' check (pay_type in ('hourly', 'daily')),
  hourly_wage int not null default 10320,
  daily_wage int not null default 0,
  break_mode text not null default 'auto' check (break_mode in ('auto', 'fixed', 'none')),
  break_minutes int not null default 0,
  round_unit int not null default 1 check (round_unit in (1, 5, 10, 15, 30)),
  early_clamp boolean not null default false, -- 시작 시각 전에 누른 출근은 시작 시각부터 인정
  premium_enabled boolean not null default false, -- 연장(8시간 초과)·야간(22~06시) 50% 가산
  allowance int not null default 0,           -- 1일 수당 (교통비·식대 등)
  allowance_label text default '교통비',
  tax_type text not null default 'daily' check (tax_type in ('daily', 'business', 'none')),
  employment_insurance boolean not null default true,
  pay_day text,
  dress_code text,
  supplies text,
  meeting_point text,
  manager_name text,
  manager_phone text,
  required_docs uuid[] not null default '{}',
  auto_approve boolean not null default false,
  status text not null default 'open' check (status in ('draft', 'open', 'closed', 'done')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create index jobs_status_dates on public.jobs (status, start_date);

-- 지원
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'approved', 'rejected', 'cancelled')),
  available_dates date[],                     -- 여러 날 행사에서 가능한 날짜 (null이면 전체)
  message text,
  admin_memo text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);
create index applications_user on public.applications (user_id);

-- 전자서명 서류
create table public.signed_docs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  template_id uuid references public.doc_templates(id) on delete set null,
  kind text not null default 'contract',
  title text not null,
  body text,                                  -- 서명 시점에 치환된 본문 스냅샷
  signature text,                             -- 근로자 서명 PNG data URL
  seal_image text,                            -- 서명 시점 회사 직인
  company_snapshot jsonb,                     -- 서명 시점 회사 정보
  signed_at timestamptz,
  signed_ip text,
  signed_ua text,
  status text not null default 'pending' check (status in ('pending', 'signed', 'void')),
  created_at timestamptz not null default now()
);
-- 무효 처리한 서류는 남겨 두고 같은 서식으로 다시 서명받을 수 있게
create unique index signed_docs_active on public.signed_docs (job_id, user_id, template_id) where status <> 'void';
create index signed_docs_user on public.signed_docs (user_id);

-- 출퇴근 기록 (1일 1행)
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  in_lat double precision,
  in_lng double precision,
  out_lat double precision,
  out_lng double precision,
  in_distance_m int,
  out_distance_m int,
  adj_in timestamptz,                         -- 관리자 보정 출근
  adj_out timestamptz,                        -- 관리자 보정 퇴근
  break_override int,
  extra_pay int not null default 0,
  deduction int not null default 0,
  note text,
  source text not null default 'app' check (source in ('app', 'admin')),
  confirmed boolean not null default false,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, user_id, work_date)
);
create trigger attendance_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();
create index attendance_user on public.attendance (user_id, work_date);
create index attendance_job_date on public.attendance (job_id, work_date);

-- 개인정보 처리 기록 (주민번호 열람·신고자료 내려받기 등)
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  target_user_id uuid references public.users(id) on delete set null,
  detail text,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_created on public.audit_logs (created_at desc);

-- 공개 키로 접근 차단
alter table public.users enable row level security;
alter table public.settings enable row level security;
alter table public.doc_templates enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.signed_docs enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
