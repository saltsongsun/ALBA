-- 1) 근로계약서 받는 방법: 앱 전자서명(app) / 종이로 따로(paper) / 모두싸인 등 다른 전자계약 서비스(external)
--    종이·외부로 받으면 관리자가 '받음'을 표시 (contract_received_at)
alter table public.jobs add column contract_method text not null default 'app'
  check (contract_method in ('app', 'paper', 'external'));
alter table public.jobs add column contract_url text; -- 외부 서비스 서명 안내 링크 (선택)
alter table public.applications add column contract_received_at timestamptz;

-- 2) 근무시간 변경과 근무자 동의
--    그날 그 근무자에게 적용할 시작·종료 시각 (변경에 동의했거나, 공고 시간이 바뀌기 전에 일한 날을 그대로 지킴)
alter table public.attendance add column sched_start time;
alter table public.attendance add column sched_end time;

create table public.shift_changes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  work_date date,                 -- null이면 공고 전체 일정 변경
  start_time time not null,
  end_time time not null,
  prev_start time not null,
  prev_end time not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'agreed', 'declined', 'superseded')),
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.users(id) on delete set null, -- 본인이 아니라 관리자가 '현장 동의'로 기록했으면 그 관리자
  answer_ip text
);
create index shift_changes_job on public.shift_changes (job_id, work_date);
create index shift_changes_user on public.shift_changes (user_id, status);
alter table public.shift_changes enable row level security;
revoke all on public.shift_changes from anon, authenticated;
