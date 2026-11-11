// 오류 화면의 '다시 시도' (정기 개선 2026-11-11 19:36 KST)
// 운영 기록: DB 연결이 20초쯤 끊겼을 때(11/5) 오류 화면이 떴는데, '다시 시도'가 화면을 서버에서 다시 받아 오지 않아 되살아나지 않았음
// · '다시 시도' → 서버에서 다시 받아 와 화면이 되살아남 (누르는 동안 '다시 여는 중…')
// · 잠깐의 끊김은 누르지 않아도: 3초 · 8초 뒤 자동으로 한 번씩 (남은 시간 + 차오르는 줄) · 두 번 뒤에는 멈춤
// · 오류 화면에서 다른 것(오류 내용 복사 등)을 누르면 자동 시도를 멈춤 — 보던 것이 갑자기 바뀌지 않게
// 가짜 DB를 껐다 켜야 해서 앱과 가짜 DB를 따로 띄움
// node scripts/qa/error-retry.cjs <shots>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', A = 'aaaaaaaa-0000-4000-8000-000000000001'
const MP = 54399, PORT = 3031
const D = `http://127.0.0.1:${PORT}`, MD = `http://127.0.0.1:${MP}`
const ROOT = path.join(__dirname, '../..')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const up = async (url) => { for (let i = 0; i < 120; i++) { if (await fetch(url).then(() => true, () => false)) return true; await sleep(250) } return false }
let mock = null
const dbUp = async () => { mock = spawn('node', ['scripts/qa/mock-supabase.mjs'], { cwd: ROOT, env: { ...process.env, SCENARIO: 'default', PORT: String(MP) }, stdio: 'ignore' }); return up(`${MD}/rest/v1/companies`) }
const dbDown = async () => { mock?.kill('SIGKILL'); mock = null; await sleep(400) }

;(async () => {
  await dbUp()
  const app = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, SUPABASE_URL: MD, SUPABASE_SERVICE_ROLE_KEY: 'dummy', SESSION_SECRET: SECRET, ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', ADMIN_SETUP_CODE: 'x', CRON_SECRET: 'test-cron' },
    stdio: 'ignore',
    detached: true,
  })
  const stop = () => { try { process.kill(-app.pid, 'SIGKILL') } catch {} mock?.kill('SIGKILL') }
  process.on('exit', stop)
  if (!(await up(`${D}/login`))) { console.log('FAIL  앱이 뜨지 않음'); process.exit(1) }

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const errShown = (p, ms = 15000) => p.getByRole('heading', { name: '잠시 문제가 생겼어요' }).waitFor({ timeout: ms }).then(() => true, () => false)
  const auto = (p) => p.locator('[data-auto-retry]')
  const posts = (p) => { const n = { c: 0 }; p.on('request', (r) => { if (r.method() === 'GET' && new URL(r.url()).pathname === '/me/history') n.c++ }); return n }

  // ── 1. 잠깐 끊겼다 돌아오면: 누르지 않아도 저절로 되살아남
  const p = await pg(W)
  await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await dbDown()
  await p.goto(`${D}/me/history`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  ok('DB가 끊기면 오류 화면', await errShown(p))
  await auto(p).waitFor({ timeout: 4000 }).catch(() => {})
  const line = ((await auto(p).innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  ok("남은 시간 안내 ('n초 뒤 자동으로 다시 시도해요')", /^[123]초 뒤 자동으로 다시 시도해요$/.test(line), line)
  ok('차오르는 줄이 움직임 (3초짜리)', await auto(p).locator('span span').evaluate((el) => { const s = getComputedStyle(el); return s.animationName === 'grow' && s.animationDuration === '3s' }).catch(() => false))
  ok('360px: 옆으로 안 밀림 · 버튼 두 개 한 줄', (await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)) && (await p.locator('[data-retry]').evaluate((el) => { const r = el.getBoundingClientRect(), o = el.nextElementSibling.getBoundingClientRect(); return Math.abs(r.top - o.top) < 2 && r.height >= 40 })))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/error-auto-retry.png`, clip: { x: 0, y: 150, width: 360, height: 440 } }).catch(() => {})
  await dbUp() // 서버가 돌아옴 (사람은 아무것도 누르지 않음)
  const back = await p.getByRole('heading', { name: /지난 근무/ }).first().waitFor({ timeout: 20000 }).then(() => true, () => false)
  ok('돌아오면 누르지 않아도 화면이 되살아남 (자동 다시 시도)', back && (await p.getByRole('heading', { name: '잠시 문제가 생겼어요' }).count()) === 0 && new URL(p.url()).pathname === '/me/history', p.url())
  ok('되살아난 화면이 그대로 쓸 수 있음 (머리글·아래 메뉴)', (await p.locator('[data-app-header]').count()) === 1 && (await p.getByRole('link', { name: /내 근무|홈/ }).count()) > 0)

  // ── 2. '다시 시도'를 직접 누르면: 서버에서 다시 받아 와 되살아남 (전에는 그대로 오류 화면)
  const q = await pg(W)
  await q.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await dbDown()
  await q.goto(`${D}/me/history`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  ok('오류 화면 (두 번째)', await errShown(q))
  // 오류 내용 복사를 누르면 자동 시도가 멈춤 → 그 뒤에는 직접 눌러야 함
  await auto(q).waitFor({ timeout: 4000 }).catch(() => {})
  await q.getByRole('button', { name: '📋 오류 내용 복사' }).click()
  await q.waitForTimeout(300)
  ok('다른 것을 누르면 자동 시도를 멈춤 (보던 것이 바뀌지 않게)', (await auto(q).count()) === 0)
  await dbUp()
  await q.waitForTimeout(4500)
  ok('멈춘 뒤에는 서버가 돌아와도 저절로 바뀌지 않음', (await q.getByRole('heading', { name: '잠시 문제가 생겼어요' }).count()) === 1)
  await q.locator('[data-retry]').click()
  const back2 = await q.getByRole('heading', { name: /지난 근무/ }).first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  ok("'다시 시도'를 누르면 화면이 되살아남", back2 && (await q.getByRole('heading', { name: '잠시 문제가 생겼어요' }).count()) === 0)

  // ── 3. 계속 끊겨 있으면: 자동은 두 번(3초 · 8초)까지만 — 끝없이 되풀이하지 않음
  const r = await pg(W)
  await r.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await dbDown()
  const n = posts(r)
  await r.goto(`${D}/me/history`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  ok('오류 화면 (세 번째)', await errShown(r))
  // 첫 자동 시도(3초) 뒤 두 번째 안내는 8초짜리
  const second = await r.waitForFunction(() => { const el = document.querySelector('[data-auto-retry] span span'); return !!el && getComputedStyle(el).animationDuration === '8s' }, null, { timeout: 12000 }).then(() => true, () => false)
  ok('한 번 실패하면 다음은 8초 뒤 (간격을 늘림)', second && (await errShown(r, 3000)))
  // 두 번째 시도(8초 뒤)까지 실패하고 나면: 안내가 사라지고 버튼은 다시 누를 수 있음 (서버가 죽어 있으면 한 번 시도에 몇 초 걸림)
  const settled = await r.waitForFunction(() => { const btn = document.querySelector('[data-retry]'); return !document.querySelector('[data-auto-retry]') && !!btn && !btn.disabled }, null, { timeout: 40000 }).then(() => true, () => false)
  ok('두 번 뒤에는 자동 시도를 멈춤 (안내 사라짐 · 오류 화면과 버튼은 그대로)', settled && (await auto(r).count()) === 0 && (await errShown(r, 3000)) && (await r.locator('[data-retry]').isEnabled()))
  const after = n.c
  await r.waitForTimeout(10000)
  ok('그 뒤로는 서버를 다시 부르지 않음 (안내도 다시 뜨지 않음)', n.c === after && (await auto(r).count()) === 0, `요청 ${after} → ${n.c}`)
  ok("안내 문구는 그대로 ('계속되면 담당자에게 알려 주세요' · 오류 번호)", ((await r.locator('main').innerText().catch(() => '')) ?? '').includes('담당자에게 알려 주세요') && (await r.getByText(/오류 번호 \w+/).count()) === 1)
  if (SHOTS) await r.screenshot({ path: `${SHOTS}/error-manual.png`, clip: { x: 0, y: 150, width: 360, height: 440 } }).catch(() => {})
  // 누르는 동안 '다시 여는 중…' (서버가 아직 죽어 있어 다시 오류 화면)
  await r.locator('[data-retry]').click()
  const busy = await r.waitForFunction(() => document.querySelector('[data-retry]')?.textContent?.includes('다시 여는 중'), null, { timeout: 3000 }).then(() => true, () => false)
  ok("누르면 '다시 여는 중…' (눌렸다는 표시)", busy)
  await dbUp()
  await r.waitForTimeout(1500)
  await r.locator('[data-retry]').click({ timeout: 15000 }).catch(() => {})
  ok('서버가 돌아온 뒤 누르면 되살아남', await r.getByRole('heading', { name: /지난 근무/ }).first().waitFor({ timeout: 15000 }).then(() => true, () => false))

  // ── 4. 관리자 화면도 같게
  const a = await pg(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await dbDown()
  await a.goto(`${D}/admin/jobs`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  ok('관리자: 오류 화면 + 자동 시도 안내', (await errShown(a)) && (await auto(a).waitFor({ timeout: 4000 }).then(() => true, () => false)))
  await dbUp()
  ok('관리자: 돌아오면 저절로 공고 화면', await a.waitForFunction(() => !document.body.innerText.includes('잠시 문제가 생겼어요') && location.pathname === '/admin/jobs' && !!document.querySelector('nav'), null, { timeout: 20000 }).then(() => true, () => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  stop()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
