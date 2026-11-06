// 묶음 81: 가입 — 얼굴 사진 없이 '가입하기'를 누르면 서버까지 가지 않고 사진 칸으로 (빨간 표시 · '가입하려면 얼굴 사진 1장이 필요해요')
// · 인사이트: 가입을 누른 뒤에야 맨 아래에 '얼굴 사진을 찍거나 골라 주세요'가 떠서, 화면 위쪽 사진 칸을 찾아 헤맴(가입 화면 평균 97초)
// · 사진을 고르면 빨간 표시가 사라짐 · 360px
// node scripts/qa/batch81.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const [D] = process.argv.slice(2)
const FACE = path.join(__dirname, 'face.jpg')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  let posts = 0
  p.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts++ })
  await p.goto(`${D}/signup?type=worker`)
  await p.locator('input[name=name]').waitFor({ timeout: 10000 })
  // 사진 빼고 필수 칸을 모두 채움
  await p.locator('input[name=name]').fill('사진없음')
  await p.locator('input[name=rrn1]').fill('990303')
  await p.locator('input[name=rrn2]').fill('1234567')
  await p.locator('input[name=phone]').fill('010-7777-0456')
  await p.locator('input[name=pin]').fill('583920')
  await p.locator('input[name=pin2]').fill('583920')
  for (const n of ['agree_privacy', 'agree_third', 'agree_rrn']) await p.locator(`input[name=${n}]`).check()
  await p.getByRole('button', { name: /가입하기/ }).last().click()
  await p.waitForTimeout(900)
  const field = p.locator('[data-photo-field]')
  ok('서버로 보내지 않음 · 같은 화면', posts === 0 && new URL(p.url()).pathname === '/signup', `posts=${posts}`)
  ok("사진 칸: '가입하려면 얼굴 사진 1장이 필요해요' · 빨간 표시", (await p.locator('[data-photo-need]').count()) === 1 && (await field.getAttribute('data-invalid')) !== null)
  ok('사진 칸이 화면 안으로 옮겨짐', await field.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await field.locator('input[type=file]').last().setInputFiles(FACE)
  await field.locator('img[alt="내 사진"]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('사진을 고르면 빨간 표시가 사라짐', (await p.locator('[data-photo-need]').count()) === 0 && (await field.getAttribute('data-invalid')) === null)
  ok('입력한 칸은 그대로', (await p.locator('input[name=name]').inputValue()) === '사진없음' && (await p.locator('input[name=pin2]').inputValue()) === '583920')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
