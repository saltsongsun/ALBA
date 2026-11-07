// 묶음 127 (정기 개선 2026-11-07 22:35 · 이용 기록: 가입 화면 계좌번호 칸을 여러 번 누름)
// · 계좌번호 칸에 '카카오뱅크 3333-01-1234567'처럼 은행 이름이 섞인 글을 붙여 넣으면 → 계좌번호만 넣고 은행 칸은 알아서 고름 (은행 칸이 잠깐 반짝임)
// · 예금주 이름 속 '하나'·'우리'는 은행으로 고르지 않음 · 숫자만 붙여 넣으면 그대로 (가로채지 않음)
// · 내 정보 · 가입 화면 둘 다
// node scripts/qa/batch127.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  // 붙여 넣기 흉내 (진짜 클립보드 대신 paste 이벤트) · 기본 동작(글자 넣기)은 일어나지 않으므로 가로채지 않으면 값이 그대로
  const paste = (p, text) => p.locator('#bank_account').evaluate((el, t) => { el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }, text)
  const state = (p) => p.evaluate(() => ({ bank: document.querySelector('#bank_name')?.value, acct: document.querySelector('#bank_account')?.value, flash: document.querySelector('#bank_name')?.hasAttribute('data-flash'), digits: document.querySelector('[data-account-digits]')?.getAttribute('data-account-digits') }))

  // ── 1. 내 정보 ──
  const w = await pg(W)
  await w.goto(`${D}/me/profile`)
  await w.locator('#bank_account').waitFor({ timeout: 15000 })
  await w.locator('#bank_account').fill('')
  await w.locator('#bank_name').selectOption('')
  await paste(w, '카카오뱅크 3333-01-1234567')
  await w.waitForTimeout(200)
  let s = await state(w)
  ok("내 정보: '카카오뱅크 3333-01-1234567' → 은행 카카오뱅크 · 계좌 3333-01-1234567 · 은행 칸 반짝 · 자리수 ✓", s.bank === '카카오뱅크' && s.acct === '3333-01-1234567' && s.flash && s.digits === 'ok', JSON.stringify(s))
  ok('360px: 옆으로 안 밀림 (내 정보)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await w.locator('#bank_name').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  if (SHOTS) await w.locator('#bank_name').locator('xpath=ancestor::div[contains(@class,"grid")][1]').screenshot({ path: `${SHOTS}/paste-bank.png` }).catch(() => {})
  await paste(w, '김하나 110-123-456789')
  await w.waitForTimeout(200)
  s = await state(w)
  ok("예금주 '김하나'는 은행으로 안 고름 (은행은 그대로 · 계좌만)", s.bank === '카카오뱅크' && s.acct === '110-123-456789', JSON.stringify(s))
  await w.locator('#bank_account').fill('')
  await paste(w, '3333011234567')
  await w.waitForTimeout(200)
  s = await state(w)
  ok('숫자만 붙여 넣으면 가로채지 않음', s.acct === '' && s.bank === '카카오뱅크', JSON.stringify(s))

  // ── 2. 가입 화면 ──
  const g = await pg(null)
  await g.goto(`${D}/signup?type=worker`)
  await g.locator('#bank_account').waitFor({ timeout: 15000 }).catch(() => {})
  if (await g.locator('#bank_account').count()) {
    await paste(g, '국민 123456-01-123456 홍길동')
    await g.waitForTimeout(200)
    s = await state(g)
    ok("가입: '국민 123456-01-123456 홍길동' → KB국민은행 · 123456-01-123456", s.bank === 'KB국민은행' && s.acct === '123456-01-123456', JSON.stringify(s))
    ok('360px: 옆으로 안 밀림 (가입)', await g.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  } else ok('가입: 계좌번호 칸', false, '칸을 못 찾음')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
