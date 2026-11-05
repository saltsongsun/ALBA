-- 화면 이동 기록 (자체 분석): 사람들이 어떤 화면을 보고 어디로 옮겨 가는지 · 얼마나 머무는지
-- 개인정보 없이: 이름·연락처·회원 id를 남기지 않고, 탭마다 바뀌는 무작위 값(session)과 회원 유형·성별·나이대만
-- 180일이 지난 기록은 매일 예약 작업(/api/cron/remind)에서 지움
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  session text not null,
  role text not null,          -- guest | worker | expert | vendor | admin
  gender text,                 -- M | F
  age_band text,               -- 10대 | 20대 | 30대 | 40대 | 50대 이상
  path text not null,          -- 화면 모양 (/jobs/[id] 처럼 번호는 뺌)
  prev text,                   -- 바로 전 화면 (이동 흐름)
  kind text not null default 'view' check (kind in ('view', 'leave')),
  ms integer                   -- 떠날 때: 그 화면에 머문 시간(밀리초)
);
create index if not exists usage_events_at on public.usage_events (at);

alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
