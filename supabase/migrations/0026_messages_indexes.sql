-- 문의(1:1 메시지) 조회 빠르게 (사용자 승인 2026-11-16 "색인 넣어줘")
-- 데이터는 바꾸지 않고 찾는 길만 추가 · 이미 있으면 그대로

-- 회사 문의함 · 아래 탭 안 읽은 수 · 새로고침 확인: 회사 메시지를 최근 것부터
-- (예전엔 (company_id, thread_user_id, created_at) 색인뿐이라 회사 전체를 시간순으로 읽을 때 매번 정렬했음)
create index if not exists messages_company_time on public.messages (company_id, created_at desc);

-- 공고별 마지막 공지 · 정산 예정일 안내 · 계좌 요청 때 찾기
create index if not exists messages_job_time on public.messages (job_id, created_at desc) where job_id is not null;
