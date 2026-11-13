// 묶음 245 (정기 개선 2026-11-14 07:36 KST)
// · 기존 회사에 합류: 회사 코드 8자리를 다 넣으면 어느 회사인지 바로 ('✓ ○○에 합류 신청해요' / '코드에 맞는 회사가 없어요')
//   초대 링크(?code=)로 오면 열자마자 확인 · 잘못 친 코드로 내 정보까지 다 쓰고 나서야 막히지 않게
// · 디자인: 가입 화면(아르바이트·전문가·회사·합류)의 휴대폰 칸도 로그인처럼 11자리를 다 치면 ✓ + 비밀번호 칸으로
// node scripts/qa/batch245.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  await rest(`companies?id=eq.${C1}`, 'PATCH', { join_code: 'HAPPYWRK' })

  const b = await chromium.launch()
  const errs = []
  const page = async () => {
    const p = await (await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })).newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const focused = (p) => p.evaluate(() => document.activeElement?.id)

  // ── 1. 회사 코드: 다 넣으면 어느 회사인지
  const g = await page()
  await g.goto(`${D}/start?tab=join`, { waitUntil: 'networkidle' })
  const code = g.locator('#code')
  const check = g.locator('#code-check')
  await code.waitFor({ timeout: 15000 }).catch(() => {})
  await code.pressSequentially('happ', { delay: 25 })
  ok("4자리까지는 안내 그대로 ('대표 관리자의 회사 설정 화면에 있어요.')", (await check.getAttribute('data-join-check')) === 'idle' && one(await check.innerText()) === '대표 관리자의 회사 설정 화면에 있어요.')
  await code.pressSequentially('ywrk', { delay: 25 })
  await g.waitForFunction(() => document.querySelector('#code-check')?.getAttribute('data-join-check') === 'found', null, { timeout: 8000 }).catch(() => {})
  // innerText는 칸칸(flex)마다 줄을 바꿔 세므로 글자 그대로(textContent)로 비교 · 보이는 모습은 캡처로 확인
  const said = (p) => p.locator('#code-check').evaluate((el) => el.textContent.replace(/\s+/g, ' ').trim())
  ok("8자리 → 'HAPP-YWRK' · '✓ 주식회사 테스트에 합류 신청해요'", (await code.inputValue()) === 'HAPP-YWRK' && (await said(g)) === '✓ 주식회사 테스트에 합류 신청해요', await said(g))
  const fit = await check.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), rows: el.querySelector('[data-join-company]')?.getClientRects().length }))
  ok('회사 이름 줄은 한 줄 (긴 이름은 …로)', fit.h < 26, JSON.stringify(fit))
  if (SHOTS) {
    const bx = await code.locator('xpath=..').boundingBox()
    if (bx) await g.screenshot({ path: `${SHOTS}/join-code-found.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(170, bx.height + 24) } }).catch(() => {})
  }
  // 한 글자 틀리면
  await g.keyboard.press('Backspace')
  await g.keyboard.type('z')
  await g.waitForFunction(() => document.querySelector('#code-check')?.getAttribute('data-join-check') === 'none', null, { timeout: 8000 }).catch(() => {})
  ok("틀린 코드: '코드에 맞는 회사가 없어요 · 대표 관리자에게 다시 확인해 주세요' (노란 테두리)",
    one(await check.innerText()) === '코드에 맞는 회사가 없어요 · 대표 관리자에게 다시 확인해 주세요' && (await code.getAttribute('aria-invalid')) === 'true' && (await code.getAttribute('data-missing')) === '')
  if (SHOTS) {
    const bx = await code.locator('xpath=..').boundingBox()
    if (bx) await g.screenshot({ path: `${SHOTS}/join-code-none.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(170, bx.height + 24) } }).catch(() => {})
  }
  // 지우면 원래 안내로
  await code.fill('')
  await code.pressSequentially('HAP', { delay: 20 })
  ok('지우고 다시 쓰는 중이면 원래 안내로', (await check.getAttribute('data-join-check')) === 'idle' && (await code.getAttribute('aria-invalid')) === null)

  // 합류 화면의 휴대폰 칸
  const ph = g.locator('#phone')
  await ph.click()
  await ph.pressSequentially('01087654321', { delay: 20 })
  await g.waitForTimeout(200)
  ok('합류 화면 휴대폰 칸: 11자리 → ✓ · 비밀번호 칸으로', (await g.locator('[data-phone-check]').count()) === 1 && (await focused(g)) === 'pin', await focused(g))
  ok('360px 옆으로 안 밀림 (합류)', await noSide(g))

  // ── 2. 초대 링크로 오면 열자마자 확인
  const g2 = await page()
  await g2.goto(`${D}/start?tab=join&code=HAPP-YWRK`, { waitUntil: 'networkidle' })
  await g2.waitForFunction(() => document.querySelector('#code-check')?.getAttribute('data-join-check') === 'found', null, { timeout: 8000 }).catch(() => {})
  ok("초대 링크(?code=)로 열면 바로 '✓ 주식회사 테스트에 합류 신청해요'", (await said(g2)) === '✓ 주식회사 테스트에 합류 신청해요', await said(g2))

  // ── 3. 아르바이트 가입 화면의 휴대폰 칸
  const w = await page()
  await w.goto(`${D}/signup?type=worker`, { waitUntil: 'networkidle' })
  const wp = w.locator('#phone')
  await wp.waitFor({ timeout: 15000 }).catch(() => {})
  await wp.click()
  await wp.pressSequentially('0109876543', { delay: 20 })
  ok('가입: 10자리까지는 ✓ 없음', (await w.locator('[data-phone-check]').count()) === 0 && (await focused(w)) === 'phone')
  await wp.pressSequentially('2', { delay: 20 })
  await w.waitForTimeout(200)
  ok("가입: 11자리 → '010-9876-5432' · ✓ · 비밀번호 칸으로", (await wp.inputValue()) === '010-9876-5432' && (await w.locator('[data-phone-check]').count()) === 1 && (await focused(w)) === 'pin', await focused(w))
  if (SHOTS) {
    await wp.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await w.waitForTimeout(300)
    const bx = await wp.locator('xpath=../..').boundingBox()
    if (bx) await w.screenshot({ path: `${SHOTS}/signup-phone-check.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: 200 } }).catch(() => {})
  }
  ok('360px 옆으로 안 밀림 (가입)', await noSide(w))

  // ── 4. 회사로 시작하기의 휴대폰 칸
  const c = await page()
  await c.goto(`${D}/start`, { waitUntil: 'networkidle' })
  const cp = c.locator('#phone')
  await cp.waitFor({ timeout: 15000 }).catch(() => {})
  await cp.click()
  await cp.pressSequentially('01055556677', { delay: 20 })
  await c.waitForTimeout(200)
  ok('회사로 시작하기 휴대폰 칸: 11자리 → ✓ · 비밀번호 칸으로', (await c.locator('[data-phone-check]').count()) === 1 && (await focused(c)) === 'pin')

  // ── 5. 로그인: 가입 화면에서 넘어온 번호를 채울 때도 ✓
  const lc = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await lc.addInitScript(() => { try { if (location.pathname === '/login') sessionStorage.setItem('login-phone', '010-3333-4444') } catch {} })
  const l = await lc.newPage()
  l.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await l.goto(`${D}/login`, { waitUntil: 'networkidle' })
  await l.waitForTimeout(300)
  ok("로그인: 채워 준 번호에도 ✓ · '✓ 가입된 번호를 채웠어요' · 비밀번호 칸에 커서", (await l.locator('#phone').inputValue()) === '010-3333-4444' && (await l.locator('[data-phone-check]').count()) === 1 && (await l.locator('body').innerText()).includes('가입된 번호를 채웠어요') && (await focused(l)) === 'pin')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
