// 묶음 226 (정기 개선 2026-11-13 04:35 KST)
// · 내 근무 '이번 주 내 근무': 확정이 없는 날에 지원하고 기다리는 근무가 있으면 점선 칸 (빈 동그라미) · 누르면 그 '확정 대기' 카드로 (테두리 표시)
//   제목 옆 '1일 · 대기 1일' · 칸 아래 '점선은 확정 대기' 한 줄 · 확정이 있는 날은 확정이 먼저 · 대기만 있어도 이번 주 칸이 보임
// · 내 근무로 갈 때: 일반 카드 두 개 대신 내 근무 화면 모양의 회색 자리 (인사 · 오늘의 근무 카드 · 이번 주 7칸)
// node scripts/qa/batch226.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const N = '44444444-0000-4000-8000-000000022601', N2 = '44444444-0000-4000-8000-000000022602'
const JX = 'cccccccc-0000-4000-8000-0000000c2261', JY = 'cccccccc-0000-4000-8000-0000000c2262', JZ = 'cccccccc-0000-4000-8000-0000000c2263'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const nowIso = new Date().toISOString()
  const mkJob = (id, title, d) => ({ ...j1, id, title, start_date: d, end_date: d, start_time: '10:00:00', end_time: '17:00:00', status: 'open', applications: [], created_at: nowIso })
  const jx = mkJob(JX, '내일 확정 근무', kst(1)), jy = mkJob(JY, '모레 지원한 근무', kst(2)), jz = mkJob(JZ, '내일 같이 지원한 근무', kst(1))
  for (const j of [jx, jy, jz]) await rest('jobs', 'POST', j)
  const [w] = await rest(`users?id=eq.${W}`)
  const u = { ...w, id: N, name: '대기주간', phone: '01022600001', photo_at: nowIso }
  const u2 = { ...w, id: N2, name: '대기만', phone: '01022600002', photo_at: nowIso }
  await rest('users', 'POST', u)
  await rest('users', 'POST', u2)
  const jobCopy = (j) => { const c = { ...j }; delete c.applications; return c }
  const app = (id, j, uid, user, status) => ({ id, job_id: j.id, user_id: uid, company_id: j.company_id, status, available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: status === 'approved' ? nowIso : null, held_at: null, created_at: nowIso, user, job: jobCopy(j) })
  const AX = '55555555-0000-4000-8000-000000022611', AY = '55555555-0000-4000-8000-000000022612', AZ = '55555555-0000-4000-8000-000000022613', A2 = '55555555-0000-4000-8000-000000022614'
  await rest('applications', 'POST', app(AX, jx, N, u, 'approved'))
  await rest('applications', 'POST', app(AY, jy, N, u, 'applied'))
  await rest('applications', 'POST', app(AZ, jz, N, u, 'applied'))
  await rest('applications', 'POST', app(A2, mkJob('cccccccc-0000-4000-8000-0000000c2264', '사흘 뒤 지원만', kst(3)), N2, u2, 'applied'))
  await rest('jobs', 'POST', mkJob('cccccccc-0000-4000-8000-0000000c2264', '사흘 뒤 지원만', kst(3)))

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 확정 + 대기가 섞인 주
  const p = await mk(N)
  await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const week = p.locator('[data-week]')
  await week.waitFor({ timeout: 15000 }).catch(() => {})
  const cells = week.locator('ol > li')
  ok("제목 옆 '1일 · 대기 1일'", one(await week.locator('[data-week-count]').innerText().catch(() => '')) === '1일 · 대기 1일', one(await week.locator('[data-week-count]').innerText().catch(() => '')))
  ok('내일(확정 + 같은 날 지원): 확정 칸이 먼저 (파란 칸 · 그 근무로)', (await cells.nth(1).locator('a').getAttribute('href')) === `#work-${AX}` && (await cells.nth(1).locator('[data-week-wait]').count()) === 0)
  const wait = cells.nth(2).locator('a[data-week-wait]')
  ok('모레(지원만): 점선 칸 · 그 대기 카드로', (await wait.getAttribute('href')) === `#wait-${AY}` && ((await wait.getAttribute('class')) ?? '').includes('border-dashed'))
  ok("칸 아래 '점선은 확정 대기' 한 줄", one(await week.locator('[data-week-legend]').innerText().catch(() => '')) === '점선은 확정 대기' && (await week.locator('[data-week-legend]').evaluate((el) => el.getBoundingClientRect().height < 20)))
  ok('360px: 7칸 한 줄 · 옆으로 안 밀림', (await cells.evaluateAll((l) => new Set(l.map((e) => Math.round(e.getBoundingClientRect().top))).size === 1)) && (await noSide(p)))
  if (SHOTS) {
    await week.scrollIntoViewIfNeeded().catch(() => {})
    await p.waitForTimeout(500)
    await week.screenshot({ path: `${SHOTS}/week-wait.png` }).catch(() => {})
  }
  await wait.evaluate((el) => el.click())
  await p.waitForTimeout(700)
  ok('누르면 그 확정 대기 카드로 (주소 #wait-… · 테두리 표시)', new URL(p.url()).hash === `#wait-${AY}` && (await p.locator(`#wait-${AY}`).evaluate((el) => el.matches(':target') && getComputedStyle(el).boxShadow !== 'none')))

  // ── 2. 대기만 있는 근무자도 이번 주 칸이 보임
  const q = await mk(N2)
  await q.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const week2 = q.locator('[data-week]')
  await week2.waitFor({ timeout: 15000 }).catch(() => {})
  ok("대기만 있어도 이번 주 칸 · '대기 1일' (0일 없음)", (await week2.count()) === 1 && one(await week2.locator('[data-week-count]').innerText().catch(() => '')) === '대기 1일')

  // ── 3. 내 근무로 갈 때 그 화면 모양 회색 자리
  await q.goto(`${D}/`, { waitUntil: 'networkidle' })
  await q.route('**/me**', async (route) => {
    const r = route.request()
    if (r.headers()['next-router-prefetch'] || new URL(r.url()).pathname !== '/me') return route.continue()
    await new Promise((res) => setTimeout(res, 1500))
    route.continue().catch(() => {})
  })
  await q.locator('nav[data-bottom-nav] a[href="/me"]').first().click()
  const sk = await q.locator('[data-skeleton="me"]').waitFor({ timeout: 3000 }).then(() => true, () => false)
  ok('내 근무로 갈 때: 그 화면 모양 회색 자리 (me)', sk)
  if (SHOTS && sk) await q.screenshot({ path: `${SHOTS}/skeleton-me.png`, clip: { x: 0, y: 0, width: 360, height: 560 } }).catch(() => {})
  await q.unroute('**/me**')
  await q.locator('[data-skeleton="me"]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
  ok('다 불러오면 회색 자리 사라짐 · 옆으로 안 밀림', (await q.locator('[data-skeleton="me"]').count()) === 0 && (await noSide(q)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
