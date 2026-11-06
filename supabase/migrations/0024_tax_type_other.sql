-- 0024: 공고 세금 종류에 '기타소득'(8.8%, 지급액 12만 5천원 이하는 과세최저한으로 0) 추가
-- 사용자 요청 2026-11-06 "기타소득 만들어주고 8.8% 인데 12만 5천원 미만은 공제없는걸로 메뉴에 만들어줘"
-- 계산은 앱(src/lib/pay.ts settle)에서 함 · DB는 허용 값만 늘림 (기존 공고는 그대로)
alter table public.jobs drop constraint if exists jobs_tax_type_check;
alter table public.jobs add constraint jobs_tax_type_check check (tax_type in ('daily', 'business', 'other', 'none'));
