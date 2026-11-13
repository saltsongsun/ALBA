// 묶음 243 (정기 개선 2026-11-14 04:36 KST)
// · 회사로 시작하기: 사업자등록번호 10자리를 다 쓰면 이미 해피워크를 쓰는 회사인지 바로 (회사 이름은 안 알려 줌)
//   있으면 그 자리에서 '기존 회사에 합류 →' (담당자·비밀번호까지 다 쓰고 가입을 눌러서야 막히지 않게)
// · 디자인: 사업자등록번호 칸에 숫자만 쳐도 사업자등록증처럼 3-2-5 줄표 (105-87-12345) · 가운데를 고쳐도 커서가 끝으로 튀지 않음
// node scripts/qa/batch243.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099'
const TAKEN = '1058712345', FREE = '1234567891', BAD = '1234567890'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 이 회사(주식회사 테스트)가 이미 쓰는 번호
  await rest(`companies?id=eq.${C1}`, 'PATCH', { business_no: '105-87-12345' })
  await rest('companies?id=eq.1', 'PATCH', { business_no: '105-87-12345' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const biz = p.locator('#business_no')
  const check = p.locator('#business_no-check')
  const type = async (v) => { await biz.fill(''); await biz.pressSequentially(v, { delay: 25 }) }
  const state = () => check.getAttribute('data-biz-check')

  await p.goto(`${D}/start`, { waitUntil: 'networkidle' })
  await biz.waitFor({ timeout: 15000 }).catch(() => {})

  // ── 1. 줄표: 숫자만 쳐도 3-2-5
  await type('1058')
  ok("숫자 '1058' → '105-8' · '4/10자리'", (await biz.inputValue()) === '105-8' && one(await check.innerText()) === '4/10자리', await biz.inputValue())
  await biz.pressSequentially('712345', { delay: 25 })
  ok("10자리 → '105-87-12345' (사업자등록증처럼)", (await biz.inputValue()) === '105-87-12345', await biz.inputValue())

  // ── 2. 이미 쓰는 회사: 바로 알려 주고 '기존 회사에 합류 →'
  await p.waitForFunction(() => document.querySelector('#business_no-check')?.getAttribute('data-biz-check') === 'taken', null, { timeout: 8000 }).catch(() => {})
  const t = one(await check.innerText().catch(() => ''))
  ok("이미 쓰는 번호: '이미 해피워크를 쓰는 회사예요 … 기존 회사에 합류 →' (가입 누르기 전에)", (await state()) === 'taken' && t.startsWith('이미 해피워크를 쓰는 회사예요') && t.endsWith('기존 회사에 합류 →'), t)
  ok('회사 이름은 알려 주지 않음', !t.includes('주식회사 테스트'))
  ok('칸은 빨간 안내 (aria-invalid · data-taken)', (await biz.getAttribute('aria-invalid')) === 'true' && (await biz.getAttribute('data-taken')) === '')
  const fit = await check.evaluate((el) => ({ w: Math.round(el.getBoundingClientRect().width), link: Math.round(el.querySelector('[data-biz-join]')?.getBoundingClientRect().height ?? 0) }))
  ok('360px 옆으로 안 밀림 · 합류 링크는 한 줄', (await noSide(p)) && fit.link > 0 && fit.link < 30, JSON.stringify(fit))
  if (SHOTS) {
    const bx = await biz.locator('xpath=..').boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/start-biz-taken.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(200, bx.height + 24) } }).catch(() => {})
  }

  // ── 3. 새 번호: '✓ 새로 시작할 수 있어요'
  await type(FREE)
  await p.waitForFunction(() => document.querySelector('#business_no-check')?.getAttribute('data-biz-check') === 'free', null, { timeout: 8000 }).catch(() => {})
  ok("새 번호: '✓ 올바른 번호예요 · 새로 시작할 수 있어요'", (await state()) === 'free' && one(await check.innerText()) === '✓ 올바른 번호예요 · 새로 시작할 수 있어요' && (await biz.getAttribute('data-taken')) === null)
  if (SHOTS) {
    const bx = await biz.locator('xpath=..').boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/start-biz-free.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(200, bx.height + 24) } }).catch(() => {})
  }

  // ── 4. 틀린 번호는 확인하러 가지 않음 (안내만)
  await type(BAD)
  await p.waitForTimeout(600)
  ok("틀린 번호: '번호를 다시 확인해 주세요' (이미 쓰는지 묻지 않음)", (await state()) === 'bad' && one(await check.innerText()).startsWith('번호를 다시 확인해 주세요'))

  // ── 5. 가운데를 고쳐도 커서가 끝으로 튀지 않음
  await type('12345')
  ok("'12345' → '123-45'", (await biz.inputValue()) === '123-45')
  await biz.evaluate((el) => el.setSelectionRange(1, 1))
  await p.keyboard.type('9')
  const caret = await biz.evaluate((el) => ({ v: el.value, at: el.selectionStart }))
  ok("1 뒤에 9를 끼우면 '192-34-5' · 커서는 9 바로 뒤 (끝으로 안 튐)", caret.v === '192-34-5' && caret.at === 2, JSON.stringify(caret))

  // ── 6. 붙여 넣기: 줄표·공백 섞인 번호도 그대로 3-2-5
  await biz.fill('')
  await biz.focus()
  await p.keyboard.insertText('105 87 12345')
  ok("'105 87 12345' 붙여 넣기 → '105-87-12345'", (await biz.inputValue()) === '105-87-12345', await biz.inputValue())

  // ── 7. '기존 회사에 합류 →' 누르면 합류 탭
  await p.waitForFunction(() => document.querySelector('#business_no-check')?.getAttribute('data-biz-check') === 'taken', null, { timeout: 8000 }).catch(() => {})
  await p.locator('[data-biz-join]').click()
  await p.waitForURL((u) => new URL(u).searchParams.get('tab') === 'join', { timeout: 10000 }).catch(() => {})
  ok("'기존 회사에 합류 →' → 합류 탭 (회사 코드 칸)", new URL(p.url()).searchParams.get('tab') === 'join' && (await p.locator('#code').count()) === 1)

  // ── 8. 회사 설정의 사업자등록번호 칸도 줄표
  const ac = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ac.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ac.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  const sb = a.locator('#business_no')
  await sb.fill('')
  await sb.pressSequentially(TAKEN, { delay: 20 })
  await a.waitForTimeout(500)
  // 묶음 244부터 회사 설정도 '다른 회사가 쓰는지' 확인 — 이 번호는 우리 회사 번호라 괜찮음
  await a.waitForFunction(() => document.querySelector('#business_no-check')?.getAttribute('data-biz-check') === 'free', null, { timeout: 8000 }).catch(() => {})
  ok("회사 설정: '105-87-12345' 줄표 · 우리 회사 번호면 '✓ 올바른 사업자등록번호예요'", (await sb.inputValue()) === '105-87-12345' && (await a.locator('#business_no-check').getAttribute('data-biz-check')) === 'free' && one(await a.locator('#business_no-check').innerText()) === '✓ 올바른 사업자등록번호예요')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
