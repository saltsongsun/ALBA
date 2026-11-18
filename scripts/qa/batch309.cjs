// 묶음 309 (정기 개선 2026-11-19 04:35 KST)
// · 근무자 '내 근무': 오늘 하는 근무에 지원하고 확정을 기다리는 중이면 '오늘 예정된 근무가 없어요 · 다른 알바 보기' 대신
//   '오늘 근무는 아직 확정 전이에요 · 확정되면 바로 알려 드려요' (숨 쉬는 주황 점 · 다른 알바를 권하지 않음)
// · 관리자 홈 '확정 대기 지원자' 카드: 오늘 하는 근무인데 아직 시작 전이면 공고 이름 옆 '오늘 HH:MM 시작' (먼저 정할 사람이 보이게)
// node scripts/qa/batch309.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const J9 = 'cccccccc-0000-4000-8000-000000030901', J10 = 'cccccccc-0000-4000-8000-000000030902'
const K9 = '33333333-0000-4000-8000-000000030901', K10 = '33333333-0000-4000-8000-000000030902'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 오늘 밤 23:58 시작 공고(J9) · 내일 공고(J10) — 시간에 상관없이 '오늘 아직 시작 전'이 되게
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J9, title: '오늘밤 무대 정리 스태프', start_date: kday(), end_date: kday(), start_time: '23:58:00', end_time: '23:59:00', status: 'open', applications: [], attendance: [], created_at: new Date().toISOString() })
  await rest('jobs', 'POST', { ...jb, id: J10, title: '내일 주차 안내 스태프', start_date: kday(1), end_date: kday(1), status: 'open', applications: [], attendance: [], created_at: new Date().toISOString() })
  const [j9] = await rest(`jobs?id=eq.${J9}`)
  const [j10] = await rest(`jobs?id=eq.${J10}`)
  // 근무자 둘: 오늘 공고 대기(K9) · 내일 공고 대기(K10) — 확정된 근무 없음
  const [u] = await rest(`users?id=eq.${K}`)
  const { attendance: _ua, ratings: _ur, ...ub } = u
  await rest('users', 'POST', { ...ub, id: K9, name: '오늘대기', phone: '01030903091', created_at: '2026-10-20T00:00:00Z' })
  await rest('users', 'POST', { ...ub, id: K10, name: '내일대기', phone: '01030903092', created_at: '2026-10-20T00:00:00Z' })
  const [u9] = await rest(`users?id=eq.${K9}`)
  const [u10] = await rest(`users?id=eq.${K10}`)
  const [app] = await rest(`applications?user_id=eq.${K}&job_id=eq.${J}`)
  const now = new Date().toISOString()
  await rest('applications', 'POST', { ...app, id: '11111111-0000-4000-8000-000000030901', user_id: K9, user: u9, job_id: J9, job: j9, available_dates: null, message: null, created_at: now })
  await rest('applications', 'POST', { ...app, id: '11111111-0000-4000-8000-000000030902', user_id: K10, user: u10, job_id: J10, job: j10, available_dates: null, message: null, created_at: now })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 오늘 근무 확정 대기: '오늘 근무는 아직 확정 전이에요'
  const w = await mk(K9)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const row = w.locator('[data-today-empty="waiting"]')
  ok("오늘 근무 확정 대기 → '오늘 근무는 아직 확정 전이에요 · 확정되면 바로 알려 드려요'", (await row.locator('b').textContent().catch(() => '')) === '오늘 근무는 아직 확정 전이에요' && one(await row.textContent().catch(() => '')).endsWith('확정되면 바로 알려 드려요'), one(await row.textContent().catch(() => '')))
  const main = one(await w.locator('main').textContent())
  ok("'오늘 예정된 근무가 없어요'·'다른 알바 보기'는 안 나옴 (같은 날 겹쳐 지원하지 않게)", !main.includes('오늘 예정된 근무가 없어요') && !main.includes('다른 알바 보기'))
  ok('위에 확정 대기 칸이 그대로 (그 공고)', (await w.locator(`[data-waiting="first"] [data-waiting-app="${J9}"]`).count()) === 1)
  ok('주황 점은 움직임 줄이기면 멈춤 (motion-reduce:hidden)', (await row.locator('.animate-ping.motion-reduce\\:hidden').count()) === 1)
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
  if (SHOTS) {
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await w.waitForTimeout(300)
    await w.screenshot({ path: `${SHOTS}/me-today-waiting.png` })
  }
  // 움직임 줄이기: 점이 멈춘 채로 보임
  await w.emulateMedia({ reducedMotion: 'reduce' })
  ok('움직임 줄이기면 깜빡이는 점은 숨고 점 하나만', (await row.locator('.animate-ping').isVisible()) === false && (await row.locator('.bg-amber-500').isVisible()))

  // ── 2. 내일 공고만 대기: 오늘은 그대로 '오늘 예정된 근무가 없어요'
  const w2 = await mk(K10)
  await w2.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok("내일 공고만 대기 → 오늘 줄은 그대로 '오늘 예정된 근무가 없어요'", (await w2.locator('[data-today-empty="waiting"]').count()) === 0 && one(await w2.locator('[data-today-empty="compact"]').textContent().catch(() => '')).includes('오늘 예정된 근무가 없어요'))

  // ── 3. 관리자 홈 확정 대기 카드: 오늘 시작 전이면 '오늘 23:58 시작'
  const a = await mk(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const card = (name) => a.locator('div.card', { has: a.getByRole('link', { name, exact: true }) }).filter({ has: a.locator('[data-pending-today], a[href*="tab=apps"]') }).first()
  const t9 = card('오늘대기').locator('[data-pending-today]')
  ok("오늘 하는 근무 지원자 카드: 공고 옆 '오늘 23:58 시작'", one(await t9.textContent().catch(() => '')) === '오늘 23:58 시작', one(await t9.textContent().catch(() => '')))
  ok('내일 근무 지원자 카드에는 없음', (await card('내일대기').count()) === 1 && (await card('내일대기').locator('[data-pending-today]').count()) === 0)
  ok('배지가 공고 이름 줄에서 한 줄 (360px 옆으로 안 밀림)', await noSide(a))
  const box = await t9.boundingBox().catch(() => null)
  ok('배지가 한 줄 높이 (줄바꿈 없음)', !!box && box.height < 30, JSON.stringify(box))
  if (SHOTS) {
    await card('오늘대기').scrollIntoViewIfNeeded()
    await card('오늘대기').screenshot({ path: `${SHOTS}/dash-pending-today.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
