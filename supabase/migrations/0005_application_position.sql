-- 확정된 근무자의 현장 배치 (예: A게이트, 주차장 안내). 비어 있으면 미배치
alter table public.applications add column position text;
