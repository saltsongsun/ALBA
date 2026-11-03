-- 커뮤니티 1단계: 근무자 게시판(글·댓글·좋아요·신고) + 별명 + 회사·행사 후기
-- 가입한 회원 모두 보고 씀(회사 관리자는 읽기만), 글쓴이는 별명으로 보임. 앱 서버(서비스 키)만 읽고 씀

-- 별명 (게시판·후기에 실명 대신). 비어 있으면 앱이 처음 쓸 때 '병아리1234'처럼 만들어 줌. 대소문자 구분 없이 하나만
alter table public.users add column nickname text check (nickname is null or char_length(nickname) between 2 and 12);
create unique index users_nickname_key on public.users (lower(nickname)) where nickname is not null;

-- 게시판 글 (자유·꿀팁·질문)
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('free', 'tip', 'question')),
  title text not null check (char_length(title) between 2 and 60),
  body text not null check (char_length(body) between 2 and 3000),
  hidden_at timestamptz,                -- 운영자가 가렸거나 신고가 쌓여 자동으로 가려진 시각
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_posts_recent on public.community_posts (created_at desc);
create index community_posts_author on public.community_posts (author_id, created_at desc);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index community_comments_post on public.community_comments (post_id, created_at);

create table public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 신고 (같은 사람이 같은 것을 한 번만). 신고가 쌓이면 앱이 글을 자동으로 가림
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment', 'review')),
  target_id uuid not null,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 200),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  unique (target_type, target_id, reporter_id)
);
create index community_reports_open on public.community_reports (created_at desc) where resolved_at is null;

-- 회사·행사 후기: 그 공고에서 실제로 일한(출퇴근 기록이 있는) 근무자만, 공고마다 한 번 (고칠 수 있음)
create table public.company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 5 and 500),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, author_id)
);
create index company_reviews_company on public.company_reviews (company_id, created_at desc);
-- 회사는 공고에서 (다른 표와 같은 규칙: 엉뚱한 회사에 후기가 붙지 않게)
create trigger company_reviews_company before insert on public.company_reviews for each row execute function public.company_from_job();

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;
alter table public.company_reviews enable row level security;
revoke all on public.community_posts, public.community_comments, public.community_likes, public.community_reports, public.company_reviews from anon, authenticated;
