-- 관리자 가입: 기존 회사의 '관리자 초대 코드'를 넣고 신청 → 그 회사 대표 관리자가 승인하면 관리자가 됨.
-- 코드는 대표 관리자가 회사 설정에서 보고 바꿀 수 있음 (처음 볼 때 앱이 만들어 넣음, 기존 회사는 비어 있음)
alter table public.companies
  add column join_code text unique;

-- 승인을 기다리는 관리자 가입 신청 (승인되면 company_members로 옮기고 지움, 거절하면 지움)
create table public.company_join_requests (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_join_requests_user on public.company_join_requests (user_id);

-- 다른 표와 같이: 앱 서버(서비스 키)만 읽고 씀
alter table public.company_join_requests enable row level security;
revoke all on public.company_join_requests from anon, authenticated;
