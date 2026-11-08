// 묶음 129 (정기 개선 2026-11-08 00:35)
// · 전화번호 칸(공고 현장 담당자 · 회사 대표번호 · 담당자 휴대폰 · 외주 업체 · 근무자 비상연락처)이 쓰는 대로 '-'를 넣음
//   (휴대폰 010-1234-5678 · 서울 02-1234-5678 · 지역 055-123-4567 · 대표번호 1588-1234) · 가입 화면 번호 칸과 같게
// · 저장된 번호도 같은 모양으로 보여 줌 · '내선' 같은 다른 글자가 섞이면 그대로 둠
// node scripts/qa/batch129.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  // 한 글자씩 쳐서 (휴대폰 키보드처럼) 칸에 보이는 값
  const type = async (loc, digits) => {
    await loc.evaluate((el) => { el.closest('details')?.setAttribute('open', ''); el.scrollIntoView({ block: 'center' }) })
    await loc.fill('')
    await loc.pressSequentially(digits, { delay: 15 })
    return loc.inputValue()
  }

  // ── 1. 회사 설정: 대표번호(서울) · 담당자 휴대폰 · 저장된 값도 같은 모양 ──
  const a = await pg(A)
  await a.goto(`${D}/admin/settings`)
  const cp = a.locator('input[name=company_phone]')
  await cp.waitFor({ timeout: 15000 }).catch(() => {})
  ok("저장된 번호도 '-' 모양으로 (02-1234-5678 · 010-1234-5678)", (await cp.inputValue()) === '02-1234-5678' && (await a.locator('input[name=contact_phone]').inputValue()) === '010-1234-5678', `${await cp.inputValue()} / ${await a.locator('input[name=contact_phone]').inputValue()}`)
  ok("회사 대표번호: '0551234567' → 055-123-4567", (await type(cp, '0551234567')) === '055-123-4567')
  ok("대표번호 '15881234' → 1588-1234", (await type(cp, '15881234')) === '1588-1234')
  ok("담당자 휴대폰: '01098765432' → 010-9876-5432", (await type(a.locator('input[name=contact_phone]'), '01098765432')) === '010-9876-5432')
  await cp.fill('02-123-4567 (내선 3)')
  await cp.press('End')
  await cp.pressSequentially('1', { delay: 15 })
  ok("'내선' 같은 글자가 있으면 건드리지 않음", (await cp.inputValue()) === '02-123-4567 (내선 3)1', await cp.inputValue())
  ok('360px: 옆으로 안 밀림 (회사 설정)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 공고 만들기: 현장 담당자 연락처 ──
  await a.goto(`${D}/admin/jobs/new`)
  const mp = a.locator('input[name=manager_phone]')
  await mp.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  ok("공고: 현장 담당자 '01055556666' → 010-5555-6666", (await type(mp, '01055556666')) === '010-5555-6666')
  await mp.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  if (SHOTS) await mp.locator('xpath=ancestor::div[1]').screenshot({ path: `${SHOTS}/manager-phone.png` }).catch(() => {})

  // ── 3. 외주 업체 · 근무자 비상연락처 ──
  await a.goto(`${D}/admin/vendors?tab=list`)
  const vp = a.locator('form', { hasText: '외주사 등록' }).locator('input[name=phone]')
  await vp.waitFor({ timeout: 15000 }).catch(() => {})
  ok("외주 업체: '0212345678' → 02-1234-5678", (await type(vp, '0212345678')) === '02-1234-5678')
  const w = await pg(W)
  await w.goto(`${D}/me/profile`)
  const ep = w.locator('#emergency_phone')
  await ep.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무자 비상연락처: '01033334444' → 010-3333-4444", (await type(ep, '01033334444')) === '010-3333-4444')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
