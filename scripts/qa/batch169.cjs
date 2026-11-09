// 묶음 169 (정기 개선 2026-11-10 05:35 KST)
// · 예금주가 본인 이름과 다르면 바로 아래 두 줄 '예금주가 본인 이름과 달라요 / 다른 사람 계좌면 지급이 늦어질 수 있어요'
//   (내 정보 · 알바 가입) · 띄어쓰기 무시 · 비우면 안 보임 · 전문가·업체 가입은 상호 계좌도 써서 안 봄
// · 계좌번호: 모자라다가 맞는 자리(10~16)가 되는 순간 '✓ 계좌번호 n자리'가 한 번 톡 (숫자마다는 아님)
// node scripts/qa/batch169.cjs <default 앱> <default 가짜> <shots>
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
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const twoLines = (loc) => loc.evaluate((el) => [...el.children].length === 2 && [...el.children].every((c) => c.getBoundingClientRect().height < 20)).catch(() => false)

  // ── 1. 내 정보 (이름 '근무자')
  const w = await pg(W)
  await w.goto(`${D}/me/profile`)
  const holder = w.locator('#account_holder')
  await holder.waitFor({ timeout: 15000 }).catch(() => {})
  const hint = w.locator('[data-holder-diff]')
  ok('처음(예금주 = 본인 이름 또는 빈칸): 안내 없음', (await hint.count()) === 0, await holder.inputValue())
  await holder.fill('김엄마')
  await hint.waitFor({ timeout: 3000 }).catch(() => {})
  ok("다른 이름 '김엄마': '예금주가 본인 이름과 달라요 / 다른 사람 계좌면 지급이 늦어질 수 있어요'", ((await hint.innerText().catch(() => '')) ?? '').replace(/\n/g, ' / ') === '예금주가 본인 이름과 달라요 / 다른 사람 계좌면 지급이 늦어질 수 있어요', await hint.innerText().catch(() => ''))
  ok('두 줄 각각 한 줄 · 360px 옆으로 안 밀림', (await twoLines(hint)) && (await wide(w)))
  if (SHOTS) await w.locator('#profile-form').screenshot({ path: `${SHOTS}/holder-diff.png` }).catch(() => {})
  await holder.fill('근 무자')
  ok("띄어쓰기만 다르면('근 무자') 안내 없음", (await hint.count()) === 0)
  await holder.fill('')
  ok('비우면(본인 이름으로 저장) 안내 없음', (await hint.count()) === 0)

  // ── 2. 알바 가입: 위에 쓴 이름과 비교
  const g = await pg(null)
  await g.goto(`${D}/signup?type=worker`)
  const gName = g.locator('input[name=name]').first()
  await gName.waitFor({ timeout: 15000 }).catch(() => {})
  await gName.fill('홍길동')
  await g.locator('#account_holder').fill('홍길순')
  const gh = g.locator('[data-holder-diff]')
  ok('가입: 이름 홍길동 · 예금주 홍길순 → 안내', await gh.waitFor({ timeout: 3000 }).then(() => true, () => false))
  await gName.fill('홍길순')
  ok('가입: 이름을 홍길순으로 고치면 안내 사라짐', (await gh.count()) === 0)
  // 전문가 가입: 상호 계좌도 쓰니 안 봄
  await g.goto(`${D}/signup?type=expert`)
  await g.locator('input[name=name]').first().waitFor({ timeout: 15000 }).catch(() => {})
  await g.locator('input[name=name]').first().fill('홍길동')
  await g.locator('#account_holder').fill('길동사운드')
  await g.waitForTimeout(300)
  ok('전문가 가입: 예금주가 상호여도 안내 없음', (await g.locator('[data-holder-diff]').count()) === 0)

  // ── 3. 계좌번호: 맞는 자리가 되는 순간 ✓ 한 번 톡
  await w.goto(`${D}/me/profile`)
  const acct = w.locator('#bank_account')
  await acct.waitFor({ timeout: 15000 }).catch(() => {})
  const dg = w.locator('[data-account-digits]')
  await acct.fill('123456789')
  ok("9자리: '9자리 · 계좌번호는 숫자 10~16자리예요' (톡 없음)", (await dg.getAttribute('data-account-digits').catch(() => '')) === 'bad' && !(await dg.getAttribute('class')).includes('animate-pop'))
  await acct.pressSequentially('0')
  const popped = await dg.evaluate((el) => el.classList.contains('animate-pop') && getComputedStyle(el).animationName === 'pop').catch(() => false)
  ok("10자리가 되는 순간 '✓ 계좌번호 10자리'가 톡", (await dg.innerText()) === '✓ 계좌번호 10자리' && popped, await dg.innerText())
  await acct.pressSequentially('1')
  ok('11자리: ✓ 그대로 · 다시 톡 하지 않음 (숫자마다는 아님)', (await dg.innerText()) === '✓ 계좌번호 11자리' && !(await dg.getAttribute('class')).includes('animate-pop'))
  await acct.press('Backspace')
  await acct.press('Backspace')
  await acct.pressSequentially('7')
  ok('9자리로 줄였다가 다시 10자리면 다시 톡', await dg.evaluate((el) => el.classList.contains('animate-pop')).catch(() => false))
  ok('360px 옆으로 안 밀림', await wide(w))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
