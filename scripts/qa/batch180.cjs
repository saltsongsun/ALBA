// 묶음 180 (정기 개선 2026-11-10 19:35 KST)
// · 회사 간 자료 분리 점검: 대시보드가 견적을 '우리 회사의 열린 견적 요청'에 달린 것만 읽음
//   (예전엔 모든 회사의 견적 금액을 통째로 읽어 와 골랐음 — 화면엔 안 나왔지만 다른 회사 자료는 아예 읽지 않게)
//   → 우리 견적이 들어오면 '견적 마감 · 비교하고 선정' 1건 · 다른 회사 견적만 있으면 안 뜸
// · 정산·신고자료: 기록이 없는 달이면 '기록이 있는 n월 보기 →' (다른 해면 연도까지) · 기록이 아예 없으면 안내만
// · 관리자 공고 탭 빈 화면: 다음에 할 일 안내 + 바로 가기 (서류 지정 · 출퇴근 보기 · 대기자 확정하러 · 모집 문구 올리기)
// node scripts/qa/batch180.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const CO = '99999999-0000-4000-8000-000000000099', OTHER = 'ffffffff-0000-4000-8000-000000000180'
const V1 = 'eeeeeeee-0000-4000-8000-0000000180a1', R1 = 'dddddddd-0000-4000-8000-0000000180b1', R2 = 'dddddddd-0000-4000-8000-0000000180b2'
const Q1 = 'dddddddd-0000-4000-8000-0000000180c1', Q2 = 'dddddddd-0000-4000-8000-0000000180c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const today = kstDay(Date.now()), tmr = kstDay(Date.now() + 864e5)
  const now = new Date().toISOString()

  // ── 1. 대시보드 '견적 마감': 우리 회사 견적만 셈
  const due = a.getByText(/견적 마감 · 비교하고 선정/)
  // 다른 회사의 열린 견적 요청(마감 오늘) + 금액 들어온 견적 — 우리 대시보드엔 안 뜸
  await rest('quote_requests', 'POST', { id: R2, company_id: OTHER, title: '다른 회사 조명 견적', details: null, due_date: today, job_id: null, status: 'open', created_at: now })
  await rest('quotes', 'POST', { id: Q2, request_id: R2, vendor_id: V1, token: 'tok-180-other', status: 'submitted', amount: 990000, vat_included: true, note: null, submitted_at: now, created_at: now })
  // 우리 회사의 열린 견적 요청(마감 오늘) — 견적은 아직 금액 없음
  await rest('quote_requests', 'POST', { id: R1, company_id: CO, title: '무대 음향 견적', details: null, due_date: today, job_id: null, status: 'open', created_at: now })
  await rest('quotes', 'POST', { id: Q1, request_id: R1, vendor_id: V1, token: 'tok-180-ours', status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, created_at: now })
  await a.goto(`${D}/admin`)
  await a.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(500)
  ok('다른 회사 견적에만 금액이 있으면 우리 대시보드엔 안 뜸', (await due.count()) === 0)
  // 우리 견적에 금액이 들어오면 1건
  await rest(`quotes?id=eq.${Q1}`, 'PATCH', { amount: 500000, status: 'submitted', submitted_at: now })
  await a.goto(`${D}/admin`)
  await due.first().waitFor({ timeout: 15000 }).catch(() => {})
  const row = due.first().locator('xpath=ancestor::a[1]')
  const rt = ((await row.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  ok("우리 견적이 들어오면 '견적 마감 · 비교하고 선정 · 무대 음향 견적' 1건", rt.startsWith('견적 마감 · 비교하고 선정 · 무대 음향 견적') && /1건/.test(rt) && (await row.getAttribute('href')) === `/admin/vendors/requests/${R1}`, rt)

  // ── 2. 정산·신고자료: 빈 달 → 기록이 있는 최근 달로
  // (가짜 DB는 날짜 범위 조건을 무시해서 '다른 달'을 못 만듦 → 이 달 기록을 지우고, 지난 달 기록 한 줄만 둠.
  //  그 줄은 공고·사람을 묶어 두지 않아 합계에는 안 잡히고 '기록이 있는 달'로만 읽힘)
  const ym = today.slice(0, 7), mNo = Number(ym.slice(5)), yNo = Number(ym.slice(0, 4))
  const prev = new Date(Date.UTC(yNo, mNo - 2, 1)).toISOString().slice(0, 7) // 지난달
  const [att0] = await rest(`attendance?user_id=eq.${W}`)
  await rest(`attendance?company_id=eq.${CO}`, 'DELETE')
  const OLD = 'eeeeeeee-0000-4000-8000-0000000180d1'
  await rest('attendance', 'POST', { ...att0, id: OLD, company_id: CO, work_date: `${prev}-15`, clock_in: `${prev}-15T00:00:00Z`, clock_out: `${prev}-15T08:00:00Z`, job: null, user: null })
  await a.goto(`${D}/admin/reports`)
  const latest = a.locator('[data-report-latest]')
  await latest.waitFor({ timeout: 15000 }).catch(() => {})
  const pm = Number(prev.slice(5)), py = Number(prev.slice(0, 4))
  const want = `기록이 있는 ${py === yNo ? '' : `${py}년 `}${pm}월 보기 →`
  const lt = ((await latest.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  ok(`이 달이 비었으면 '${want}'`, lt === want && (await latest.getAttribute('href')) === `/admin/reports?month=${prev}`, lt)
  ok("빈 달 안내 '이 달의 근무 기록이 없어요' · 360px 옆으로 안 밀림", (await a.getByText('이 달의 근무 기록이 없어요').count()) === 1 && (await noSide(a)))
  if (SHOTS) await a.locator('.card', { hasText: '이 달의 근무 기록이 없어요' }).first().screenshot({ path: `${SHOTS}/report-empty.png` }).catch(() => {})
  // 다른 해의 기록이면 연도까지
  await rest(`attendance?id=eq.${OLD}`, 'PATCH', { work_date: `${yNo - 1}-08-15` })
  await a.goto(`${D}/admin/reports`)
  await latest.waitFor({ timeout: 15000 }).catch(() => {})
  const lt2 = ((await latest.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  ok(`다른 해: '기록이 있는 ${yNo - 1}년 8월 보기 →'`, lt2 === `기록이 있는 ${yNo - 1}년 8월 보기 →`, lt2)
  await latest.click()
  await a.waitForURL((u) => u.searchParams.get('month') === `${yNo - 1}-08`, { timeout: 15000 }).catch(() => {})
  ok('누르면 그 달로', new URL(a.url()).searchParams.get('month') === `${yNo - 1}-08`, a.url())
  // 기록이 아예 없으면 안내만
  await rest(`attendance?id=eq.${OLD}`, 'DELETE')
  await a.goto(`${D}/admin/reports`)
  await a.getByText('이 달의 근무 기록이 없어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("기록이 아예 없으면 '근무가 끝나면 여기에 모여요' (바로 가기 없음)", (await a.locator('[data-report-latest]').count()) === 0 && (await a.getByText('근무가 끝나면 여기에 모여요').count()) === 1)

  // ── 3. 공고 탭 빈 화면
  const empty = (title) => a.locator('.card', { hasText: title }).first()
  // 서류 탭: 지정한 서류가 없음 → 서류 지정하기
  await rest(`jobs?id=eq.${J}`, 'PATCH', { required_docs: [], start_date: tmr, end_date: tmr })
  await rest(`signed_docs?job_id=eq.${J}`, 'DELETE')
  await a.goto(`${D}/admin/jobs/${J}?tab=docs`)
  const nextDocs = a.locator('[data-empty-next=docs]')
  await nextDocs.waitFor({ timeout: 15000 }).catch(() => {})
  ok("서류 탭: '서명받을 서류가 없어요' + '근로계약서 등 서류 지정하기 →'", (await a.getByText('서명받을 서류가 없어요').count()) === 1 && ((await nextDocs.innerText().catch(() => '')) ?? '').trim() === '근로계약서 등 서류 지정하기 →' && (await nextDocs.getAttribute('href')) === `/admin/jobs/${J}/edit#docs`, (await nextDocs.innerText().catch(() => '')) ?? '')
  if (SHOTS) await empty('서명받을 서류가 없어요').screenshot({ path: `${SHOTS}/docs-empty.png` }).catch(() => {})
  // 정산 탭: 근무 기록 없음 → 출퇴근 보기
  await rest(`attendance?job_id=eq.${J}`, 'DELETE')
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  const nextAtt = a.locator('[data-empty-next=att]')
  await nextAtt.waitFor({ timeout: 15000 }).catch(() => {})
  ok("정산 탭: '아직 근무 기록이 없어요' + '출퇴근 보기 →'", (await a.getByText('아직 근무 기록이 없어요').count()) === 1 && (await nextAtt.getAttribute('href')) === `/admin/jobs/${J}?tab=att`)
  ok('정산 빈 화면: 안내와 바로 가기가 각각 한 줄 · 옆으로 안 밀림', (await nextAtt.locator('xpath=..').evaluate((el) => [...el.children].every((c) => c.getBoundingClientRect().height < 26))) && (await noSide(a)))
  // 출퇴근 탭: 확정자 없음 + 이날 가능한 대기자 2명 → 확정하러 가기
  await rest(`applications?job_id=eq.${J}`, 'PATCH', { status: 'applied', available_dates: null })
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${tmr}`)
  const nextApps = a.locator('[data-empty-next=apps]')
  await nextApps.waitFor({ timeout: 15000 }).catch(() => {})
  ok("출퇴근 탭: '이날 근무 명단이 없어요' + '대기 2명 확정하러 가기 →'", (await a.getByText('이날 근무 명단이 없어요').first().isVisible().catch(() => false)) && ((await nextApps.innerText().catch(() => '')) ?? '').trim() === '대기 2명 확정하러 가기 →' && (await nextApps.getAttribute('href')) === `/admin/jobs/${J}?tab=apps`, (await nextApps.innerText().catch(() => '')) ?? '')
  if (SHOTS) await empty('이날 근무 명단이 없어요').screenshot({ path: `${SHOTS}/att-empty.png` }).catch(() => {})
  // 대기자도 없으면 안내만
  await rest(`applications?job_id=eq.${J}`, 'PATCH', { status: 'rejected' })
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${tmr}`)
  await a.getByText('이날 근무 명단이 없어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("대기자가 없으면 '지원자를 확정하면 여기에 보여요'", (await a.locator('[data-empty-next=apps]').count()) === 0 && (await a.getByText('지원자를 확정하면 여기에 보여요').first().isVisible().catch(() => false)))
  // 지원자 탭: 지원자 없음 → 모집 문구 올리기 (모집 중일 때만)
  await rest(`applications?job_id=eq.${J}`, 'DELETE')
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await a.getByText('아직 지원자가 없어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("지원자 탭: '아직 지원자가 없어요' + '위의 모집 문구를 단톡방에 올려 보세요'", (await empty('아직 지원자가 없어요').innerText().catch(() => '')).replace(/\s+/g, ' ').includes('아직 지원자가 없어요 위의 모집 문구를 단톡방에 올려 보세요'), (await empty('아직 지원자가 없어요').innerText().catch(() => '')).replace(/\s+/g, ' '))
  ok('360px 옆으로 안 밀림', await noSide(a))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'closed' })
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await a.getByText('아직 지원자가 없어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('모집을 마감한 공고엔 모집 문구를 권하지 않음', (await a.getByText('위의 모집 문구를 단톡방에 올려 보세요').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
