-- 공고 근무 조건 · 문의 채팅 · 관리자 평점
-- 기존 데이터는 바꾸지 않고 칸과 테이블만 더합니다.

-- 공고마다 넣고 뺄 수 있는 근무 조건 [{ "label": "식사", "value": "점심 도시락 제공" }, ...]
alter table public.jobs add column conditions jsonb not null default '[]'::jsonb;

-- 문의 채팅: 근무자 한 명당 대화방 하나 (thread_user_id = 그 근무자)
create table public.messages (
  id bigint generated always as identity primary key,
  thread_user_id uuid not null references public.users(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  from_admin boolean not null default false,
  job_id uuid references public.jobs(id) on delete set null,   -- 어느 공고에 대한 문의인지 (선택)
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,                                           -- 상대편(근무자↔관리자)이 읽은 시각
  created_at timestamptz not null default now()
);
create index messages_thread on public.messages (thread_user_id, created_at desc);
create index messages_unread_from_worker on public.messages (created_at desc) where not from_admin and read_at is null;

-- 관리자끼리만 보는 근무자 평점 (근무자 화면에는 나오지 않음)
create table public.worker_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  rater_id uuid references public.users(id) on delete set null,
  score int not null check (score between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 한 관리자가 한 공고의 한 근무자에게는 평점 하나 (다시 매기면 바뀜). 공고 없는 메모는 여러 개 가능(NULL은 서로 다름)
  unique (user_id, job_id, rater_id)
);
create index worker_ratings_user on public.worker_ratings (user_id);
create trigger worker_ratings_updated_at before update on public.worker_ratings
  for each row execute function public.set_updated_at();

-- 공개 키로 접근 차단 (새 테이블은 Supabase 기본 권한이 붙으므로 명시적으로 회수)
alter table public.messages enable row level security;
alter table public.worker_ratings enable row level security;
revoke all on public.messages, public.worker_ratings from anon, authenticated;
