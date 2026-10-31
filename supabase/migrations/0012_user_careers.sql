-- 근무자 경력 (가입할 때 또는 내 정보에서 입력): [{ "event": "행사명", "period": "2025.10", "role": "안내 스태프" }, ...]
alter table public.users add column careers jsonb not null default '[]'::jsonb;
