-- 공고 화면에서 숨길 기본 항목 (예: {break, tax}). 비어 있으면 모두 보임.
-- 근로계약서 등 서류 내용에는 영향 없음 (공고 안내 화면·모집 문구에만 적용)
alter table public.jobs add column hidden_fields text[] not null default '{}';
