// '연결 없음' 화면 (정기 개선 2026-11-11 22:36 KST)
// 인터넷 없이 앱을 열거나 신호가 약해 화면을 못 받으면 뜨는 화면(public/offline.html · 서비스 워커가 보여 줌).
// 보안 설정(스크립트 제한)을 넣은 뒤로 이 화면의 '다시 시도' 버튼이 눌러도 아무 일도 일어나지 않았음
// · '다시 시도' → 스크립트 없이도 되는 링크로 (보던 주소를 다시 엶)
// · 누르지 않아도 8초마다 다시 엶 → 연결이 돌아오면 저절로 보던 화면이 열림 (차오르는 줄로 표시)
// 서버를 껐다 켜야 해서 앱과 가짜 DB를 따로 띄움
// node scripts/qa/offline-page.cjs <shots>
const { chromium, devices } = require('playwright')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const [SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const MP = 54397, PORT = 3033
const D = `http://127.0.0.1:${PORT}`, MD = `http://127.0.0.1:${MP}`
const ROOT = path.join(__dirname, '../..')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const up = async (url) => { for (let i = 0; i < 160; i++) { if (await fetch(url).then(() => true, () => false)) return true; await sleep(250) } return false }
let app = null
const appUp = async () => {
  app = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, env: { ...process.env, SUPABASE_URL: MD, SUPABASE_SERVICE_ROLE_KEY: 'dummy', SESSION_SECRET: SECRET, ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', ADMIN_SETUP_CODE: 'x', CRON_SECRET: 'test-cron' }, stdio: 'ignore', detached: true })
  return up(`${D}/login`)
}
const appDown = async () => { try { process.kill(-app.pid, 'SIGKILL') } catch {} app = null; await sleep(600) }

;(async () => {
  const mock = spawn('node', ['scripts/qa/mock-supabase.mjs'], { cwd: ROOT, env: { ...process.env, SCENARIO: 'default', PORT: String(MP) }, stdio: 'ignore' })
  process.on('exit', () => { try { if (app) process.kill(-app.pid, 'SIGKILL') } catch {} mock.kill('SIGKILL') })
  await up(`${MD}/rest/v1/companies`)
  if (!(await appUp())) { console.log('FAIL  앱이 뜨지 않음'); process.exit(1) }

  const b = await chromium.launch()
  const errs = [], csp = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  p.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) csp.push(m.text().slice(0, 120)) })
  let loads = 0
  p.on('load', () => loads++)

  // ── 1. 화면 자체: '다시 시도'가 눌림 · 자동으로 다시 엶
  await p.goto(`${D}/offline.html`, { waitUntil: 'load' })
  const txt = ((await p.locator('main').innerText()) ?? '').replace(/\s+/g, ' ').trim()
  ok('안내 문구 (연결 없음 · 연결되면 자동으로 다시 열어요)', txt.includes('인터넷에 연결되어 있지 않아요') && txt.includes('출퇴근은 연결된 뒤에 눌러야 저장돼요.') && txt.includes('연결되면 자동으로 다시 열어요'), txt)
  const retry = p.locator('[data-offline-retry]')
  const before = loads
  await retry.click()
  await p.waitForTimeout(1200)
  ok("'다시 시도'를 누르면 다시 엶 (전에는 눌러도 그대로였음)", loads > before, `${before} → ${loads}`)
  ok('보안 설정에 막히는 스크립트 없음', csp.length === 0, csp.join(' | '))
  ok('버튼 높이 44px 이상 · 한 줄 · 옆으로 안 밀림', await retry.evaluate((el) => { const r = el.getBoundingClientRect(); return r.height >= 44 && r.height < 60 && document.scrollingElement.scrollWidth <= innerWidth + 1 }))
  ok('안내 문장이 한 글자만 다음 줄로 넘어가지 않음 (줄마다 5글자 이상)', await p.locator('main p').first().evaluate((el) => { const r = document.createRange(); const lines = new Map(); const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) for (let i = 0; i < n.length; i++) { r.setStart(n, i); r.setEnd(n, i + 1); const t = Math.round(r.getBoundingClientRect().top); lines.set(t, (lines.get(t) ?? 0) + 1) } return [...lines.values()].every((c) => c >= 5) }))
  ok('차오르는 줄 (8초)', await p.locator('.bar i').evaluate((el) => { const s = getComputedStyle(el); return s.animationName === 'fill' && s.animationDuration === '8s' }))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/offline-page.png`, clip: { x: 0, y: 150, width: 360, height: 440 } }).catch(() => {})
  const mid = loads
  await p.waitForTimeout(9500)
  ok('누르지 않아도 8초 뒤 다시 엶', loads > mid, `${mid} → ${loads}`)

  // ── 2. 실제 흐름: 서버에 닿지 못하면 이 화면 → 다시 닿으면 저절로 보던 화면
  await p.goto(`${D}/login`, { waitUntil: 'networkidle' })
  const controlled = await p.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 250)); return !!navigator.serviceWorker.controller }).catch(() => false)
  ok('서비스 워커가 화면을 맡음', controlled)
  await appDown()
  await p.goto(`${D}/login`, { waitUntil: 'load' }).catch(() => {})
  ok('서버에 닿지 못하면 연결 없음 화면 (주소는 보던 주소 그대로)', (await p.getByRole('heading', { name: '인터넷에 연결되어 있지 않아요' }).count()) === 1 && new URL(p.url()).pathname === '/login', p.url())
  // 아직 안 닿을 때 '다시 시도' → 여전히 이 화면
  await p.locator('[data-offline-retry]').click()
  await p.waitForTimeout(1500)
  ok("아직 안 닿을 때 '다시 시도' → 그대로 이 화면", (await p.getByRole('heading', { name: '인터넷에 연결되어 있지 않아요' }).count()) === 1)
  await appUp() // 다시 닿음 (사람은 아무것도 누르지 않음)
  const back = await p.getByRole('heading', { name: '로그인' }).waitFor({ timeout: 30000 }).then(() => true, () => false)
  ok('다시 닿으면 누르지 않아도 보던 화면(로그인)이 열림', back && (await p.getByRole('heading', { name: '인터넷에 연결되어 있지 않아요' }).count()) === 0, p.url())
  // 열린 뒤에는 더 다시 열지 않음 (자동으로 다시 여는 것은 연결 없음 화면에서만)
  const stable = loads
  await p.waitForTimeout(10000)
  ok('보던 화면이 열린 뒤에는 저절로 다시 열지 않음', loads === stable, `${stable} → ${loads}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  await appDown()
  mock.kill('SIGKILL')
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
