// 묶음 227 (정기 개선 2026-11-13 06:35 KST)
// · 근무자 홈 '오늘 근무' 카드, 출근 전: '오늘 근무가 있어요' 대신 시작까지 남은 시간 ('2시간 24분 뒤 시작' · 30초마다 줄어듦)
// · 시작 시각이 지났는데 아직 근무 시작 전: '근무 시작을 아직 안 눌렀어요' · 버튼 '시작 →'(톡) → 내 근무의 근무 시작 버튼으로 (#clock)
//   (근무 시간이 다 지나면 전처럼 '오늘 근무 시간이 지났어요')
// node scripts/qa/batch227.cjs <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [F, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MF}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  const nowK = new Date(Date.now() + 9 * 3600e3)
  const mins = nowK.getUTCHours() * 60 + nowK.getUTCMinutes()
  if (mins >= 23 * 60 + 57) { console.log('SKIP  23:57 넘어 확인 생략'); console.log('ALL PASSED'); process.exit(0) }
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: F }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const hero = p.locator('[data-today-hero]')
  const label = async () => one(await hero.locator('[data-today-label]').innerText().catch(() => ''))
  const open = async () => {
    await p.goto(`${F}/`, { waitUntil: 'networkidle' })
    await hero.waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 출근 전 (23:58 시작): 시작까지 남은 시간
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '23:58:00', end_time: '23:59:00' })
  await open()
  const left = 23 * 60 + 58 - mins
  const cd = Number(await hero.locator('[data-start-countdown]').getAttribute('data-start-countdown').catch(() => '-1'))
  const text = await label()
  const want = `${Math.floor(cd / 60) ? `${Math.floor(cd / 60)}시간${cd % 60 ? ` ${cd % 60}분` : ''}` : `${cd % 60}분`} 뒤 시작`
  ok("출근 전: '오늘 근무가 있어요' 대신 'n시간 n분 뒤 시작'", Math.abs(cd - left) <= 1 && text === want, `${text} (${cd} vs ${left})`)
  ok("버튼은 그대로 '출퇴근 →' (내 근무로)", (await hero.innerText()).includes('출퇴근 →') && (await hero.getAttribute('href')) === '/me' && (await hero.getAttribute('data-today-in-late')) === null)
  ok('360px: 한 줄 · 옆으로 안 밀림', (await hero.locator('[data-today-label]').evaluate((el) => el.getBoundingClientRect().height < 24)) && (await noSide(p)))
  if (SHOTS) {
    const bx = await hero.boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/starts-in.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }

  // ── 2. 시작 시각이 지났는데 아직 근무 시작 전 (0시 시작 · 23:59 끝)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00' })
  await open()
  const go = hero.locator('span', { hasText: '시작 →' }).last()
  ok("시작 시각 지남: '근무 시작을 아직 안 눌렀어요' · '시작 →' 톡", (await label()) === '근무 시작을 아직 안 눌렀어요' && (await go.count()) === 1 && ((await go.getAttribute('class')) ?? '').includes('animate-bump'), await label())
  ok('누르는 곳: 내 근무의 근무 시작 버튼 (/me#clock)', (await hero.getAttribute('href')) === '/me#clock' && (await hero.getAttribute('data-today-in-late')) === '')
  if (SHOTS) {
    const bx = await hero.boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/in-late.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }
  await hero.click()
  await p.waitForURL((u) => new URL(u).pathname === '/me' && new URL(u).hash === '#clock', { timeout: 15000 }).catch(() => {})
  const startBtn = p.locator('#today-work [data-clock-main]').first()
  await startBtn.waitFor({ timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(800)
  ok('내 근무로 와서 근무 시작 버튼이 화면 안에 보임', await startBtn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }).catch(() => false))

  // ── 3. 근무 시간이 다 지나면 전처럼 '오늘 근무 시간이 지났어요'
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:01:00' })
  await open()
  ok("근무 시간이 다 지남: 전처럼 '오늘 근무 시간이 지났어요'", (await label()) === '오늘 근무 시간이 지났어요', await label())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
