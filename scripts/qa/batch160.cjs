// 묶음 160 (정기 개선 2026-11-09 10:35)
// · 오늘 근무 시간이 다 지났는데 출근 기록이 없으면: 큰 '근무 시작' 대신 '오늘 근무 시간(..)이 지났어요'
//   + '담당자에게 알리기 →' (문의 창에 '오늘 출근했는데 근무 시작을 못 눌렀어요…' 빠른 답장) · 근무 시작은 '지금 근무를 시작해야 하나요?'에 접어 둠
//   (예전엔 끝난 뒤에도 근무 시작이 그대로 있어 누르면 금액 0인 기록이 생김)
// · 홈 카드: '오늘 근무가 있어요 · 출퇴근' 대신 '오늘 근무 시간이 지났어요 · 확인'
// node scripts/qa/batch160.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', DOC = 'dddddddd-0000-4000-8000-000000000004', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wide = () => w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const visibleMain = () => w.locator('#today-work [data-clock-main]').evaluateAll((els) => els.filter((e) => e.checkVisibility()).length)

  // 준비: 출근 기록 없음 · 서명할 서류 없음 · 위치 확인 없음
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'signed' })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { lat: null, lng: null, gps_required: false })
  const kst = new Date(Date.now() + 9 * 3600e3)
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()

  // ── 1. 근무 시간(00:00~00:30)이 지남 → 안내 + 알리기 · 근무 시작은 접힘
  if (mins < 35) console.log('SKIP  00:35 전이라 근무 시간이 지난 경우 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:30:00' })
    await w.goto(`${D}/me`)
    const over = w.locator('[data-shift-over]')
    await over.waitFor({ timeout: 15000 }).catch(() => {})
    ok("'오늘 근무 시간(00:00~00:30)이 지났어요'", (await over.innerText().catch(() => '')).includes('오늘 근무 시간(00:00~00:30)이 지났어요'), await over.innerText().catch(() => ''))
    ok("큰 '근무 시작' 버튼은 안 보임 (접힌 칸 안)", (await visibleMain()) === 0 && (await over.locator('summary').innerText()).includes('지금 근무를 시작해야 하나요?'))
    ok('제목 줄 한 줄 · 360px 옆으로 안 밀림', (await over.locator('p.font-bold').evaluate((el) => el.getBoundingClientRect().height < 28)) && (await wide()))
    if (SHOTS) await w.locator('#today-work').screenshot({ path: `${SHOTS}/shift-over.png` }).catch(() => {})
    // 접힌 칸을 펼치면 근무 시작 그대로 있음
    await over.locator('summary').click()
    ok('펼치면 근무 시작 버튼', (await visibleMain()) === 1)
    // 담당자에게 알리기 → 문의 창 빠른 답장
    const ask = w.locator('[data-shift-over-ask]')
    ok('알리기 → 이 회사 문의 창 (ask=missed)', (await ask.getAttribute('href')) === `/me/chat?co=${C}&ask=missed`)
    await Promise.all([w.waitForURL(/\/me\/chat/, { timeout: 15000 }).catch(() => {}), ask.click()])
    ok("문의 창에 '오늘 출근했는데 근무 시작을 못 눌렀어요. 기록 부탁드려요.'", await w.getByText('오늘 출근했는데 근무 시작을 못 눌렀어요. 기록 부탁드려요.').first().waitFor({ timeout: 10000 }).then(() => true, () => false))
    // 홈 카드
    await w.goto(`${D}/`)
    const card = w.locator('a[href="/me#today-work"], a[href^="/me"]', { hasText: '오늘 근무 시간이 지났어요' }).first()
    ok("홈 카드 '오늘 근무 시간이 지났어요 · 확인 →'", await card.waitFor({ timeout: 10000 }).then(async () => (await card.innerText()).includes('확인 →'), () => false))
  }

  // ── 2. 아직 근무 시간 안(끝 23:59) → 예전처럼 큰 근무 시작
  if (mins >= 23 * 60 + 58) console.log('SKIP  23:58 넘어 근무 시간 안 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
    await w.goto(`${D}/me`)
    await w.locator('#today-work [data-clock-main]').first().waitFor({ timeout: 15000 }).catch(() => {})
    ok('근무 시간 안: 안내 없음 · 큰 근무 시작', (await w.locator('[data-shift-over]').count()) === 0 && (await visibleMain()) === 1)
    await w.goto(`${D}/`)
    ok("홈 카드는 그대로 '오늘 근무가 있어요'", await w.getByText('오늘 근무가 있어요').first().waitFor({ timeout: 10000 }).then(() => true, () => false))
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
