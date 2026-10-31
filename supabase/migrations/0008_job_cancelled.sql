-- 행사 취소 (우천·주최측 사정 등): 공고 상태에 'cancelled'를 더함. 기존 데이터는 그대로
alter table public.jobs drop constraint jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('draft', 'open', 'closed', 'done', 'cancelled'));
