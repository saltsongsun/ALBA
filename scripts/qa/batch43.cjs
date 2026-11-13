// 묶음 43: 사업자등록번호 — 쓰는 대로 맞는 번호인지 바로 (끝자리 검증 숫자, 국세청 계산법)
//          · 회사로 시작하기: 숫자만 · 'n/10자리' → '✓ 올바른 사업자등록번호예요' / 틀리면 '번호를 다시 확인해 주세요' + 노란 테두리
//          · 회사 설정: 줄표 써도 됨 · 틀린 번호는 노란 테두리(저장은 막지 않음) · 고치면 사라짐
//          · 비밀번호 칸 안내 글자('숫자 6자리')는 띄우지 않음 (입력한 숫자만 넓게) · 360px
// node scripts/qa/batch43.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const state = (p) => p.locator('input[name=business_no]').getAttribute('data-biz')
  const note = (p) => p.locator('#business_no-check').innerText()
  const amber = (p) => p.locator('input[name=business_no]').evaluate((el) => el.hasAttribute('data-missing'))

  // ── 1. 회사로 시작하기 ──
  const g = await pg(null)
  await g.goto(`${D}/start`)
  const bn = g.locator('input[name=business_no]')
  await bn.waitFor({ timeout: 10000 }).catch(() => {})
  ok('처음엔 안내 문구', (await note(g)).includes('사업자등록증의 번호예요'))
  await bn.pressSequentially('22081')
  ok("쓰는 중: '5/10자리'", (await note(g)) === '5/10자리' && (await state(g)) === 'typing')
  await bn.pressSequentially('-62517')
  // 묶음 243부터: 사업자등록증처럼 3-2-5 줄표가 저절로 (쳐 넣은 줄표는 겹치지 않음)
  ok("3-2-5 줄표로 '220-81-62517'", (await bn.inputValue()) === '220-81-62517', await bn.inputValue())
  // 줄표 넣은 번호를 붙여 넣어도 잘리지 않음
  await bn.fill('220-81-62517')
  ok("줄표 넣은 번호를 붙여 넣어도 그대로 10자리 (안 잘림)", (await bn.inputValue()) === '220-81-62517' && (await state(g)) === 'ok', await bn.inputValue())
  // 회사로 시작하기는 이미 쓰는 회사인지도 바로 확인 (묶음 243) → '✓ 올바른 번호예요 · 새로 시작할 수 있어요'
  await g.waitForFunction(() => document.querySelector('#business_no-check')?.getAttribute('data-biz-check') === 'free', null, { timeout: 8000 }).catch(() => {})
  ok("맞는 번호: '✓ 올바른 번호예요 · 새로 시작할 수 있어요' · 테두리 없음", (await note(g)).includes('✓ 올바른 번호예요') && (await state(g)) === 'ok' && !(await amber(g)), await note(g))
  await bn.fill('')
  await bn.pressSequentially('1234567890')
  ok("틀린 번호: '번호를 다시 확인해 주세요' + 노란 테두리", (await note(g)).includes('번호를 다시 확인해 주세요') && (await state(g)) === 'bad' && (await amber(g)))
  // 비밀번호 칸: 안내 글자는 보통 간격, 입력한 숫자만 넓게
  const pin = g.locator('input[name=pin]')
  const ph = await pin.evaluate((el) => getComputedStyle(el, '::placeholder').letterSpacing)
  ok("비밀번호 안내 '숫자 6자리'는 띄우지 않음", ph === 'normal' || ph === '0px', ph)
  ok('360px: 옆으로 안 밀림 (회사로 시작하기)', await g.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 회사 설정 (가짜 회사 번호 123-45-67890은 끝자리가 맞지 않음) ──
  const a = await pg(A)
  await a.goto(`${D}/admin/settings`)
  const sb = a.locator('input[name=business_no]')
  await sb.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  ok('저장된 번호가 틀리면 처음부터 노란 테두리 + 안내', (await state(a)) === 'bad' && (await amber(a)) && (await note(a)).includes('번호를 다시 확인해 주세요'), await note(a))
  await sb.fill('220-81-62517')
  ok('줄표 넣어 고치면 ✓ · 테두리 사라짐', (await state(a)) === 'ok' && !(await amber(a)) && (await sb.inputValue()) === '220-81-62517')
  ok('360px: 옆으로 안 밀림 (회사 설정)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
