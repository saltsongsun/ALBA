-- 외주사(협력업체) 관리: 우리가 일을 맡기는 인력·장비·음향·경호 등 업체에 견적을 요청하고 대금 지급을 관리
-- 새 표만 추가 (기존 표는 바꾸지 않음). 서버(서비스 키)만 읽고 쓰므로 anon·authenticated 권한은 모두 막음

-- 외주사
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,                     -- 상호
  category text,                          -- 분야 (인력·장비·음향/조명·경호·운송·기타)
  contact_name text,                      -- 담당자
  phone text,
  email text,
  business_no text,                       -- 사업자등록번호
  bank_name text,
  bank_account_enc text,                  -- 계좌번호 (근무자 계좌와 같은 방식으로 암호화)
  account_holder text,
  memo text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 견적 요청 (공고에 연결할 수 있음)
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  title text not null,                    -- 예: 무대 음향 장비 2일
  details text,                           -- 품목·수량·일정·장소 등
  due_date date,                          -- 견적 마감일
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 업체별 견적: 요청 1건에 여러 업체. 업체가 링크(token)로 직접 내거나 관리자가 받은 견적을 기록
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  token text not null unique,             -- 업체 입력 링크용 (추측할 수 없는 무작위 값)
  amount bigint check (amount is null or amount >= 0),
  vat_included boolean not null default true,
  note text,
  status text not null default 'requested' check (status in ('requested', 'submitted', 'selected', 'rejected')),
  submitted_at timestamptz,
  submitted_by text check (submitted_by is null or submitted_by in ('vendor', 'admin')),
  created_at timestamptz not null default now(),
  unique (request_id, vendor_id)
);
create index quotes_request on public.quotes (request_id);

-- 외주 대금 지급 (선정한 견적에서 만들거나 직접 등록)
create table public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  title text not null,
  amount bigint not null check (amount >= 0),
  vat_included boolean not null default true,
  due_date date,                          -- 지급 예정일
  invoice_at date,                        -- 세금계산서 받은 날
  paid_at date,                           -- 지급한 날
  memo text,
  created_at timestamptz not null default now()
);
create index vendor_payments_job on public.vendor_payments (job_id);
create index vendor_payments_due on public.vendor_payments (paid_at, due_date);

alter table public.vendors enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.vendor_payments enable row level security;
revoke all on public.vendors, public.quote_requests, public.quotes, public.vendor_payments from anon, authenticated;
