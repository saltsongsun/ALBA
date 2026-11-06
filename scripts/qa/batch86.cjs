// 묶음 86: 가입 — 주민등록번호를 쓰는 동안 바로 확인 (인사이트: '주민등록번호 13자리를 정확히 입력해 주세요'를 가입을 누른 뒤에야 보고 그 칸을 여러 번 누름)
// · 앞자리가 날짜가 아니면 '앞 6자리는 생년월일이에요' · 뒷자리 첫 숫자가 1~8이 아니면 알려 줌 · 맞으면 '✓ 1999년 3월 15일생'
// · 덜 쓴 채 칸을 벗어나거나 가입을 누르면 '뒷자리 7자리를 모두 넣어 주세요' + 서버로 보내지 않고 그 칸으로 · 사진이 없으면 사진 칸 먼저
// · 맨 위 로고: 지금 그 화면이면 맨 위로 (다른 화면에선 그대로 홈으로) · 360px
// node scripts/qa/batch86.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
const FACE = path.join(__dirname, 'face.jpg')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  let posts = 0
  p.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts++ })
  await p.goto(`${D}/signup?type=worker`)
  await p.locator('input[name=rrn1]').waitFor({ timeout: 10000 })
  const hint = p.locator('[data-rrn-hint]')
  const r1 = p.locator('input[name=rrn1]'), r2 = p.locator('input[name=rrn2]')
  ok('처음엔 원래 안내 (세금·보험 신고 · 암호화)', (await hint.getAttribute('data-rrn-hint')) === 'note' && (await hint.innerText()).includes('암호화해서 보관해요'))

  // ── 1. 쓰는 동안 바로 ──
  await r1.pressSequentially('991340')
  await p.waitForTimeout(200)
  ok("앞자리가 날짜가 아니면 '앞 6자리는 생년월일이에요'", (await hint.innerText()).includes('앞 6자리는 생년월일이에요') && (await r1.getAttribute('aria-invalid')) === 'true')
  await r1.fill('990315')
  await r2.fill('9')
  await r2.dispatchEvent('input')
  await p.waitForTimeout(200)
  ok("뒷자리 첫 숫자가 1~8이 아니면 알려 줌", (await hint.innerText()).includes('1~8') && (await r2.getAttribute('aria-invalid')) === 'true')
  await r2.fill('')
  await r2.pressSequentially('1234567')
  await p.waitForTimeout(300)
  ok("맞으면 '✓ 1999년 3월 15일생'", (await hint.getAttribute('data-rrn-hint')) === 'ok' && (await hint.innerText()).includes('1999년 3월 15일생'))
  ok('안내는 한 줄 (360px)', (await hint.evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 22)))

  // ── 2. 덜 쓴 채 벗어나면 ──
  await r2.fill('12')
  await r2.dispatchEvent('input')
  await p.locator('input[name=name]').click()
  await p.waitForTimeout(200)
  ok("덜 쓴 채 칸을 벗어나면 '뒷자리 7자리를 모두 넣어 주세요'", (await hint.innerText()).includes('뒷자리 7자리를 모두'))

  // ── 3. 그대로 가입을 누르면: 사진이 없으면 사진 칸 먼저 ──
  await p.locator('input[name=name]').fill('주민확인')
  await p.locator('input[name=phone]').fill('010-7777-0861')
  await p.locator('input[name=pin]').fill('583920')
  await p.locator('input[name=pin2]').fill('583920')
  for (const n of ['agree_privacy', 'agree_third', 'agree_rrn']) await p.locator(`input[name=${n}]`).check()
  await p.getByRole('button', { name: /가입하기/ }).last().click()
  await p.waitForTimeout(700)
  ok('사진이 없으면 사진 칸 먼저 (서버로 안 보냄)', posts === 0 && (await p.locator('[data-photo-need]').count()) === 1, `posts=${posts}`)
  await p.locator('[data-photo-field] input[type=file]').last().setInputFiles(FACE)
  await p.locator('[data-photo-field] img[alt="내 사진"]').waitFor({ timeout: 8000 }).catch(() => {})
  await p.getByRole('button', { name: /가입하기/ }).last().click()
  await p.waitForTimeout(900)
  const inView = await r2.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  ok('주민번호를 덜 쓴 채 가입을 누르면 서버로 보내지 않고 그 칸으로', posts === 0 && new URL(p.url()).pathname === '/signup' && inView && (await p.evaluate(() => document.activeElement?.getAttribute('name'))) === 'rrn2', `posts=${posts}`)
  ok('입력한 칸은 그대로', (await p.locator('input[name=name]').inputValue()) === '주민확인' && (await r1.inputValue()) === '990315')
  ok('360px: 옆으로 안 밀림 (가입)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 로고: 지금 그 화면이면 맨 위로 ──
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  await w.goto(`${D}/`)
  await w.locator('main').waitFor()
  await w.evaluate(() => scrollTo(0, 900))
  await w.waitForTimeout(300)
  const before = await w.evaluate(() => scrollY)
  await w.locator('header[data-app-header] a[href="/"]').first().click()
  await w.waitForTimeout(1000)
  ok('홈에서 로고를 누르면 맨 위로', before > 200 && (await w.evaluate(() => scrollY)) < 5 && new URL(w.url()).pathname === '/', `before=${before}`)
  await w.goto(`${D}/me/profile`)
  await w.locator('main').waitFor()
  await w.locator('header[data-app-header] a[href="/"]').first().click()
  await w.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10000 }).catch(() => {})
  ok('다른 화면에선 로고가 그대로 홈으로', new URL(w.url()).pathname === '/')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
