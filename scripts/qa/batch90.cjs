// 묶음 90: 관리자 시나리오 (사용자 요청 "관리자가 겪을 시나리오 10가지 만들고 해결 · 디자인은 심플하게")
// 1 전날 밤 '확정자가 진짜 올까?' → 공고에 '⏰ 전날 안내 확인 n/m명' + 안 읽은 사람 전화
// 2 현장 인터넷이 안 됨 → '출석부 인쇄' (이름·배치·연락처·출근·퇴근·서명 + 빈 줄)
// 3 문제 있던 사람이 또 지원 → 지원 카드에 '📝 우리 메모'
// 4 당일 결원 → '미출근 n명 · 대기자 m명 대신 확정'
// 5 비·사고로 일찍 끝냄 → '행사 일찍 끝내기' (근무 중인 사람은 지금 시각으로 종료 + 행사 종료)
// 6 인원이 다 찼는데 지원이 계속 → '인원이 다 찼어요 · 모집 마감'
// 7 '돈 언제 들어와요?' → 관리자 답장 제안 '정산 예정일은 …이에요.'
// 8 다음 행사도 같은 팀 → 끝난 행사에서 '복사해서 다음 행사 만들기'
// (9 연락 두절 → 출퇴근 탭 비상연락처, 10 계좌 없음 → 정산 탭 계좌 등록 요청: 이미 있음)
// node scripts/qa/batch90.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', C = '99999999-0000-4000-8000-000000000099'
const X = 'bbbbbbbb-0000-4000-8000-0000000000ea'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms = 0) => new Date(Date.now() + 9 * 3600e3 + ms).toISOString().slice(0, 10)
const today = kst(), tomorrow = kst(86_400_000)
const patchJob = (b) => rest(`jobs?id=eq.${J}`, 'PATCH', b)

;(async () => {
  // 준비: 확정자 X(아직 안 옴) 추가 · 오늘 하루 종일 행사
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const xu = { ...w1, id: X, name: '안온엑스', phone: '01077770901', created_at: new Date().toISOString() }
  await rest('users', 'POST', xu)
  await rest('applications', 'POST', { ...wApp, id: undefined, user_id: X, user: xu, position: null })
  await patchJob({ start_time: '00:00:00', end_time: '23:59:00' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const acts = a.locator('[data-job-actions]')
  const openJob = async (q = '') => { await a.goto(`${D}/admin/jobs/${J}${q}`); await acts.first().waitFor({ timeout: 10000 }).catch(() => {}) }
  const wide = () => a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 4. 당일 결원 → 대기자로 대신 확정 ──
  await openJob()
  const sub = a.locator('[data-substitute]')
  ok("4 당일 결원: '미출근 1명 · 대기자 1명 대신 확정' (→ 지원자 탭)", (await sub.innerText().catch(() => '')).includes('미출근 1명 · 대기자 1명 대신 확정') && (await sub.getAttribute('href')).includes('tab=apps'))

  // ── 3. 지원 카드에 우리 메모 ──
  await rest('company_worker_notes', 'POST', { company_id: C, user_id: AP, memo: '지난 행사 지각 2회 · 확정 전 통화', updated_at: new Date().toISOString() })
  await openJob('?tab=apps')
  const memo = a.locator('[data-worker-memo]').first()
  await memo.waitFor({ timeout: 10000 }).catch(() => {})
  ok("3 지원 카드: '📝 우리 메모 · 지난 행사 지각 2회 …'", (await memo.innerText().catch(() => '')).includes('📝 우리 메모 · 지난 행사 지각 2회'))
  ok('3 메모 한 줄 · 360px 옆으로 안 밀림', (await memo.evaluate((el) => el.getBoundingClientRect().height < 32).catch(() => false)) && (await wide()))

  // ── 2. 출석부 인쇄 ──
  await openJob(`?tab=att&date=${today}`)
  const rl = a.locator('[data-roster-link]')
  ok("2 출퇴근 탭에 '출석부 인쇄'", (await rl.getAttribute('href').catch(() => '')) === `/print/roster/${J}?date=${today}`)
  await a.goto(`${D}/print/roster/${J}?date=${today}`)
  const sheet = a.locator('[data-roster]')
  await sheet.waitFor({ timeout: 10000 }).catch(() => {})
  const rows = await sheet.locator('[data-roster-row]').allInnerTexts().catch(() => [])
  ok('2 출석부: 확정자 2명 (이름·배치·연락처) + 출근 시각 채움', rows.length === 2 && rows.some((r) => r.includes('근무자') && r.includes('A게이트') && /010-3333-4444/.test(r) && /\d{2}:\d{2}/.test(r)) && rows.some((r) => r.includes('안온엑스')), JSON.stringify(rows))
  ok('2 출석부: 손으로 적을 빈 줄', (await sheet.locator('tbody tr').count()) >= rows.length + 3)
  ok('2 360px: 화면은 옆으로 안 밀림 (표만 밀림)', await wide())

  // ── 7. 정산 문의 → 답장 제안 ──
  await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, company_id: C, job_id: null, body: '돈 언제 들어와요?', created_at: new Date().toISOString() })
  await a.goto(`${D}/admin/chat/${W}`)
  const qr = a.locator('[data-quick-replies] button:not([data-button-toggle])').first()
  await qr.waitFor({ timeout: 10000 }).catch(() => {})
  ok("7 '돈 언제 들어와요?' → 첫 답장 제안 '정산 예정일은 …이에요.'", /^정산 예정일은 .+이에요\.$/.test(await qr.innerText().catch(() => '')), await qr.innerText().catch(() => ''))

  // ── 1. 전날 안내 확인 ──
  await patchJob({ start_date: tomorrow, end_date: tomorrow })
  const remind = (uid, read) => rest('messages', 'POST', { thread_user_id: uid, sender_id: null, from_admin: true, company_id: C, job_id: J, body: `⏰ 내일 근무 안내\n내일 09:00 · 광장`, read_at: read ? new Date().toISOString() : null, created_at: new Date().toISOString() })
  await remind(W, true)
  await remind(X, false)
  await openJob()
  const rr = a.locator('[data-remind-read]')
  await rr.waitFor({ timeout: 10000 }).catch(() => {})
  ok("1 전날 안내 확인 '1/2명' + 안 읽은 사람 '📞 안온엑스'(전화)", /전날 안내 확인 1\/2명/.test(await rr.innerText().catch(() => '')) && (await rr.locator('[data-unread-person]').innerText()).includes('안온엑스') && (await rr.locator('[data-unread-person]').getAttribute('href')) === 'tel:01077770901')

  // ── 6. 인원이 다 참 → 모집 마감 ──
  await patchJob({ headcount: 2, status: 'open' })
  await openJob()
  const full = acts.getByRole('button', { name: '인원이 다 찼어요 · 모집 마감' })
  ok("6 확정 2/2명: 큰 '인원이 다 찼어요 · 모집 마감'", (await full.count()) === 1)
  await full.click()
  await acts.getByRole('button', { name: '한 번 더 누르면 모집 마감' }).click()
  await a.waitForTimeout(1500)
  ok('6 두 번 누르면 모집 마감', (await rest(`jobs?id=eq.${J}`))[0].status === 'closed')

  // ── 5. 일찍 끝내기 ──
  await patchJob({ start_date: today, end_date: today, status: 'open' })
  await openJob()
  const early = acts.getByRole('button', { name: '행사 일찍 끝내기' })
  ok("5 마지막 날 근무 중: '행사 일찍 끝내기'", (await early.count()) === 1)
  await early.click()
  await acts.getByRole('button', { name: '한 번 더 누르면 지금 모두 종료' }).click()
  await a.waitForURL(/tab=pay/, { timeout: 15000 }).catch(() => {})
  const wAtt = (await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`))[0]
  ok('5 지금 시각으로 근무 종료 + 행사 종료', (await rest(`jobs?id=eq.${J}`))[0].status === 'done' && !!wAtt?.clock_out && Math.abs(Date.parse(wAtt.clock_out) - Date.now()) < 120_000)

  // ── 8. 다음 행사 복사 ──
  await openJob()
  await acts.getByRole('button', { name: '복사해서 다음 행사 만들기' }).click()
  await a.waitForURL(/\/admin\/jobs\/[^/]+\/edit/, { timeout: 15000 }).catch(() => {})
  ok("8 끝난 행사 → '복사해서 다음 행사 만들기' → 새 공고 수정 화면", /\/admin\/jobs\/[0-9a-f-]{36}\/edit/.test(a.url()) && !a.url().includes(J))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
