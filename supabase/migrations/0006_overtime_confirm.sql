-- 계약 종료 시각 이후 근무(연장)는 근무자·관리자가 서로 확인해야 금액에 들어감
-- ot_by가 요청·제안한 쪽, 상대가 확인하면 ot_status = agreed. 그 전까지 계약 종료 시각까지만 계산
alter table public.attendance
  add column ot_minutes integer not null default 0,
  add column ot_status text check (ot_status in ('pending', 'agreed', 'rejected')),
  add column ot_by text check (ot_by in ('worker', 'admin'));

-- 이미 지급까지 끝난 기록은 지금 금액 그대로 (연장 인정으로 둠)
update public.attendance set ot_status = 'agreed', ot_by = 'admin', ot_minutes = 100000 where paid;
