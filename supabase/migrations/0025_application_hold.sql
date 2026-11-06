-- 0025: 지원자 '보류' (사용자 요청 2026-11-06 "지원자 확정과 미선발 외에도 보류도 넣어줘 · 근무자에게는 따로 알림 가지 않게")
-- 상태(status)는 그대로 'applied' — 근무자 화면은 계속 '검토 중', 알림 없음. 관리자 화면만 보류 칸으로 따로 모음
alter table public.applications add column if not exists held_at timestamptz;
