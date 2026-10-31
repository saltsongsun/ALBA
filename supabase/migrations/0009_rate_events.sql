-- 자동화 공격(봇·AI 에이전트) 방어용 요청 기록: 로그인 실패·가입·민감 정보 열람 등을 IP·계정별로 세어 너무 잦으면 막음
-- 서버(서비스 키)만 씀. 하루 지난 기록은 매일 지움
create table public.rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,           -- 예: 'login-fail:ip:1.2.3.4', 'signup:ip:1.2.3.4'
  created_at timestamptz not null default now()
);
create index rate_events_bucket_time on public.rate_events (bucket, created_at desc);
alter table public.rate_events enable row level security;
revoke all on public.rate_events from anon, authenticated;
