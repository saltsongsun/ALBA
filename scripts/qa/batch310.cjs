// 묶음 310 (정기 개선 2026-11-19 06:35 KST)
// · 근무자 명단 잠금: 비밀번호 칸 옆 6칸 점(쓴 만큼 채워지고 6자리면 초록 · 로그인과 같은 모양)
//   손으로 6번째 숫자를 쓰면 잠깐 뒤 저절로 '명단 열기' (10분마다 여는 화면이라 한 번 덜 누르게)
//   숫자 말고는 안 들어감 · 다 쓰고 바로 고쳐 쓰면 안 보냄 · 틀리면 칸·점이 비워짐
//   한 번에 붙여 넣은 값(자동 완성)은 저절로 보내지 않고 버튼으로 (두 번 보내지 않음)
// node scripts/qa/batch310.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac, randomBytes, scryptSync } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C1 = '99999999-0000-4000-8000-000000000099'
const A3 = 'aaaaaaaa-0000-4000-8000-0000000310a3'
const PIN = '583014'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 같은 회사의 다른 관리자 (같은 비밀번호) — 틀린 횟수가 다른 잠금 테스트와 섞이지 않게
  const [a1] = await rest(`users?id=eq.${A}`)
  const { attendance: _a, ratings: _r, ...ab } = a1
  // 비밀번호는 앱과 같은 방식의 해시로
  const salt = randomBytes(16)
  await rest('users', 'POST', { ...ab, id: A3, name: '셋째관리자', phone: '01031003100', is_super: false, pin_hash: `s1:${salt.toString('base64')}:${scryptSync(PIN, salt, 32).toString('base64')}` })
  await rest('company_members', 'POST', { company_id: C1, user_id: A3, role: 'admin', created_at: '2026-10-15T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A3), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const dots = p.locator('[data-roster-lock] [data-pin-dots]')
  const filled = () => dots.getAttribute('data-pin-dots').then(Number).catch(() => -1)
  const pin = p.locator('#roster-pin')

  await p.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  ok('명단 잠금 화면 · 6칸 점(처음엔 빈 점)', (await p.locator('[data-roster-lock]').count()) === 1 && (await filled()) === 0 && (await dots.locator('> span').count()) === 6)
  ok('360px 옆으로 안 밀림 (명단 잠금)', await noSide(p))

  // ── 1. 숫자만 · 쓴 만큼 점이 채워짐
  await pin.click()
  await p.keyboard.type('a5b8')
  ok("숫자 말고는 안 들어감 ('a5b8' → '58') · 점 2칸", (await pin.inputValue()) === '58' && (await filled()) === 2, await pin.inputValue())
  if (SHOTS) await p.locator('[data-roster-lock] .card').screenshot({ path: `${SHOTS}/roster-lock-dots.png` }).catch(() => {})

  // ── 2. 6자리를 쓰고 바로 하나 지우면 안 보냄
  await pin.fill('')
  await pin.click()
  await p.keyboard.type('11111')
  await p.keyboard.type('1')
  await p.keyboard.press('Backspace')
  await p.waitForTimeout(900)
  ok('다 쓰고 바로 고쳐 쓰면 저절로 보내지 않음 (안내 없음 · 그대로 잠금 · 점 5칸)', (await p.getByText('비밀번호가 맞지 않아요').count()) === 0 && (await p.locator('[data-roster-lock]').count()) === 1 && (await filled()) === 5)

  // ── 3. 틀린 6자리 → 저절로 보내고 '맞지 않아요' · 칸과 점이 비워짐
  await pin.fill('')
  await pin.click()
  await p.keyboard.type('111111')
  ok('6자리면 점이 모두 초록', (await dots.locator('.bg-emerald-500').count()) === 6)
  const wrong = await p.getByText('비밀번호가 맞지 않아요').first().waitFor({ timeout: 8000 }).then(() => true, () => false)
  ok("틀린 6자리: 버튼을 안 눌러도 확인 → '비밀번호가 맞지 않아요'", wrong)
  await p.waitForTimeout(300)
  ok('틀리면 칸이 비워지고 점도 빈 점으로 (다시 쓰기 좋게)', (await pin.inputValue()) === '' && (await filled()) === 0)

  // ── 4. 맞는 6자리 → 저절로 명단이 열림
  await pin.click()
  await p.keyboard.type(PIN)
  await p.locator('[data-roster-open]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('맞는 6자리: 버튼을 안 눌러도 명단이 열림', (await p.locator('[data-roster-open]').count()) === 1 && (await p.locator('[data-roster-lock]').count()) === 0)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/roster-opened.png` }).catch(() => {})

  // ── 5. 버튼으로 여는 방법도 그대로 (다 쓰고 바로 누르면 한 번만 보냄)
  await p.getByRole('button', { name: '지금 잠그기' }).click()
  await p.locator('[data-roster-lock]').waitFor({ timeout: 8000 }).catch(() => {})
  let posts = 0
  p.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts++ })
  await pin.fill(PIN)
  await p.waitForTimeout(800)
  ok('한 번에 넣은 6자리는 저절로 보내지 않음 (점은 6칸 초록)', posts === 0 && (await filled()) === 6 && (await p.locator('[data-roster-lock]').count()) === 1, `posts=${posts}`)
  await p.getByRole('button', { name: '명단 열기' }).click()
  await p.locator('[data-roster-open]').waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(600)
  ok("한 번에 넣은 값(자동 완성)은 '명단 열기'를 눌러 열림 · 한 번만 보냄", (await p.locator('[data-roster-open]').count()) === 1 && posts === 1, `posts=${posts}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
