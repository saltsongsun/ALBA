-- 커뮤니티 2단계: 함께 일한 사람 연결 ('동료 맺기')
-- 같은 공고에서 함께 출근한 근무자끼리만 요청할 수 있음(앱에서 확인). 서로 맺으면(양쪽 행이 있으면) '동료'
-- 동료가 되면: 내 동료 목록, 동료가 지원·확정된 공고에 '동료 N명' 표시. 별명으로만 보임
create table public.coworker_links (
  from_id uuid not null references public.users(id) on delete cascade,
  to_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index coworker_links_to on public.coworker_links (to_id);

alter table public.coworker_links enable row level security;
revoke all on public.coworker_links from anon, authenticated;
