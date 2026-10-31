-- 공고 조회 현황 (관리자만 봄): 공고를 연 사람(가입자는 계정, 아니면 브라우저 표시로 구분)과 마지막으로 본 시각
-- '확인한 인원' = 행 수, '지금 보는 인원' = 마지막으로 본 시각이 1분 안. 관리자 본인 조회는 기록하지 않음
create table public.job_views (
  job_id uuid not null references public.jobs(id) on delete cascade,
  viewer text not null,                 -- 'u:<user_id>' 또는 'v:<브라우저 표시>'
  user_id uuid references public.users(id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  visits int not null default 1,        -- 30분 넘게 지나 다시 열면 1씩 늘어남
  primary key (job_id, viewer)
);
create index job_views_live on public.job_views (job_id, last_seen desc);
alter table public.job_views enable row level security;
revoke all on public.job_views from anon, authenticated;
