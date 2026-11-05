-- 근무자 접속 여부(최고 관리자만 봄) + 행동 패턴 기록
-- users.last_seen_at: 앱을 열어 둔 동안 1분에 한 번쯤 새로 고침 (5분 안이면 '접속 중')
-- usage_events: 누른 버튼 이름(label)·화면을 내려 본 깊이(depth %)·오류·답답함(같은 곳 연달아 누름)
-- 이름·연락처·입력한 글은 남기지 않음 (버튼 이름의 숫자는 #으로 바꿈)
alter table public.users add column if not exists last_seen_at timestamptz;
alter table public.usage_events add column if not exists label text;
alter table public.usage_events add column if not exists depth smallint;
alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check check (kind in ('view', 'leave', 'click', 'error', 'rage'));
create index if not exists usage_events_kind_at on public.usage_events (kind, at);
