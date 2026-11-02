-- 같은 근무 단체채팅방: 공고마다 하나. 그 공고에 확정된 근무자와 회사 관리자만 (앱 서버가 확인)
-- 근무자끼리는 이름만 보임 (전화번호 안 보임). 관리자는 글을 '공지'로 고정할 수 있음
create table public.job_chat (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  from_admin boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  pinned_at timestamptz,                                   -- 공지로 고정한 시각 (가장 최근 것 하나를 위에 보여 줌)
  created_at timestamptz not null default now()
);
create index job_chat_job_time on public.job_chat (job_id, created_at desc);
create index job_chat_pinned on public.job_chat (job_id, pinned_at desc) where pinned_at is not null;
-- 회사는 공고에서 (다른 표와 같은 규칙)
create trigger job_chat_company before insert on public.job_chat for each row execute function public.company_from_job();

-- 사람마다 그 방을 마지막으로 읽은 시각 (안 읽은 수 표시)
create table public.job_chat_reads (
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create index job_chat_reads_user on public.job_chat_reads (user_id);

-- 다른 표와 같이: 앱 서버(서비스 키)만 읽고 씀
alter table public.job_chat enable row level security;
alter table public.job_chat_reads enable row level security;
revoke all on public.job_chat, public.job_chat_reads from anon, authenticated;
