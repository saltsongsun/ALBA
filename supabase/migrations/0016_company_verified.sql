-- 회사가 직접 가입해 바로 시작 (공고·지원·출퇴근·정산은 바로 쓸 수 있음).
-- 다만 해피워크 전체 회원 명단(다른 회사에 지원한 사람 포함)은 최고 관리자가 '확인'한 회사만 봄:
-- 회사인 척 가입해 근무자 연락처를 모아 가지 못하게.
-- 지금까지 있던 회사(최고 관리자가 만든 회사)는 모두 확인된 회사.
alter table public.companies
  add column verified boolean not null default true;

-- 직접 가입한 회사는 앱에서 verified=false로 만들고, 최고 관리자가 회사 관리에서 '확인'
