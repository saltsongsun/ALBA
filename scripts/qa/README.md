# 화면 점검 (QA)

실제 Supabase 없이 가짜 데이터로 앱을 띄워, 모든 화면을 휴대폰(360px)·컴퓨터 크기로 열어 보고
화면 밖으로 넘치는 요소·잘리는 글자·자바스크립트 오류를 찾습니다. 화면마다 스크린샷을 남깁니다.

```bash
# 1) 가짜 Supabase
LAT=5 node scripts/qa/mock-supabase.mjs &

# 2) 앱 (비밀 값은 아무 값이나: 실제 데이터에 접근하지 않음)
export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=dummy \
  SESSION_SECRET=0123456789abcdef0123456789abcdef0123 \
  ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ADMIN_SETUP_CODE=x
npm run build && npx next start -p 3002 &

# 3) 점검 (Playwright 필요)
node scripts/qa/audit.cjs http://127.0.0.1:3002 /tmp/shots
```

가짜 데이터: 관리자 1명, 근무자 1명, 오늘 진행하는 공고 1개, 출근 기록·서류·서식 각 1개.
`SCENARIO=working`(서류 서명 끝·근무 중), `SCENARIO=fresh`(서류 서명 끝·출근 전)로 다른 상황도 볼 수 있습니다.
가짜 서버는 PostgREST의 단순 필터(eq, is, in)만 흉내 내므로, 새 조회 문법은 실제 DB에서 따로 확인하세요.

## 기능·보안 테스트

- `scenarios.cjs`: 현장 시나리오 10가지 (`SCENARIOS.md`). 가짜 Supabase 3개와 앱 3개(`CRON_SECRET=test-cron`)를 띄우고 실행.
- `security.cjs`: 로그인 무차별 대입 잠금(점점 길게)·계정 존재 숨김·IP 단위 차단·봇 함정 칸·쉬운 비밀번호 거절·보안 헤더·로봇 차단.
  `node scripts/qa/security.cjs http://127.0.0.1:3002 http://127.0.0.1:54321` (default 가짜 데이터, 실행 후 다시 띄우기)
