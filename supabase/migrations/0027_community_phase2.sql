-- 0027: 커뮤니티 2단계 (사용자 요청 2026-11-21 "커뮤니티 2단계도 진행해줘")
-- 출석 체크 · 투표 글 · 새 말머리(현장 썰 · 같이 가요) · 이모지 반응 · 원하는 사람만 주간 랭킹
-- 새 표만 더하고, 글 말머리 허용 목록에 두 개를 더함 (이미 있는 글·댓글·좋아요·후기는 그대로).
-- 다른 커뮤니티 표처럼 앱 서버(서비스 키)만 읽고 씀 · 회원이 지워지면 함께 지워짐

-- 1) 새 말머리: 현장 썰(story) · 같이 가요(together) — 기존 세 가지(free·tip·question)는 그대로
alter table public.community_posts drop constraint if exists community_posts_category_check;
alter table public.community_posts add constraint community_posts_category_check
  check (category in ('free', 'tip', 'question', 'story', 'together'));

-- 2) 출석 체크: 한 사람 하루 한 번 (한국 날짜)
create table if not exists public.community_checkins (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists community_checkins_day on public.community_checkins (day);

-- 3) 투표 글: 글 하나에 보기 2~4개 · 한 사람 한 표 (다른 보기로 바꿀 수 있음)
create table if not exists public.community_polls (
  post_id uuid primary key references public.community_posts(id) on delete cascade,
  options text[] not null check (array_length(options, 1) between 2 and 4),
  created_at timestamptz not null default now()
);
create table if not exists public.community_poll_votes (
  post_id uuid not null references public.community_polls(post_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 4) 이모지 반응: 글마다 다섯 가지 (웃겨요·대단해요·놀라워요·슬퍼요·힘내요) · 같은 반응은 한 사람 한 번
create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null check (emoji in ('laugh', 'clap', 'wow', 'sad', 'cheer')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
create index if not exists community_reactions_user on public.community_reactions (user_id);

-- 5) 주간 랭킹: '참여하기'를 누른 사람만 (별명과 이번 주 점수만 보임 · 그만하면 줄이 지워짐)
create table if not exists public.community_rank_members (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.community_checkins enable row level security;
alter table public.community_polls enable row level security;
alter table public.community_poll_votes enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_rank_members enable row level security;
revoke all on public.community_checkins, public.community_polls, public.community_poll_votes, public.community_reactions, public.community_rank_members from anon, authenticated;
