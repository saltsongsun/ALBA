// 묶음 45: 계좌번호 — 쓰는 대로 몇 자리인지 (숫자만 셈 · 10~16자리면 '✓ 계좌번호 n자리', 모자라면 안내, 넘치면 '너무 길어요')
//          · 가입 화면 '급여 받을 계좌'도 칸마다 이름표(은행·계좌번호·예금주·주소) · 내 정보 계좌 칸도 같은 안내 · 360px
// node scripts/qa/batch45.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, bank_name: null })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const hint = (p) => p.locator('[data-account-digits]')

  // ── 1. 가입 화면 ──
  const g = await pg(null)
  await g.goto(`${D}/signup?type=worker`)
  const acc = g.locator('#bank_account')
  await acc.waitFor({ timeout: 10000 }).catch(() => {})
  const labels = await g.locator('label[for=bank_name], label[for=bank_account], label[for=account_holder], label[for=address]').allInnerTexts()
  ok('가입: 은행·계좌번호·예금주·주소 이름표', ['은행', '계좌번호', '예금주', '주소'].every((t) => labels.some((l) => l.includes(t))), labels.join(' / '))
  ok("처음엔 '계좌번호는 숫자 10~16자리예요'", (await g.getByText('계좌번호는 숫자 10~16자리예요').count()) > 0)
  await acc.pressSequentially('12345')
  ok("5자리: '5자리 · 계좌번호는 숫자 10~16자리예요'", (await hint(g).getAttribute('data-account-digits')) === 'bad' && (await hint(g).innerText()).startsWith('5자리'))
  await acc.pressSequentially('-6789012')
  ok("줄표는 빼고 셈 → '✓ 계좌번호 12자리'", (await hint(g).getAttribute('data-account-digits')) === 'ok' && (await hint(g).innerText()) === '✓ 계좌번호 12자리')
  await acc.pressSequentially('34567')
  ok("17자리: '너무 길어요'", (await hint(g).getAttribute('data-account-digits')) === 'bad' && (await hint(g).innerText()).includes('너무 길어요'))
  ok('360px: 옆으로 안 밀림 (가입)', await g.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 내 정보 ──
  const w = await pg(W)
  await w.goto(`${D}/me/profile`)
  const pacc = w.locator('#account #bank_account')
  await pacc.waitFor({ timeout: 10000 }).catch(() => {})
  ok("내 정보: 비어 있으면 '계좌번호는 숫자 10~16자리 · 본인 명의…'", (await w.getByText('계좌번호는 숫자 10~16자리 · 본인 명의 계좌가 가장 빨라요').count()) > 0)
  await pacc.pressSequentially('110123456789')
  ok("내 정보: '✓ 계좌번호 12자리'", (await hint(w).innerText().catch(() => '')) === '✓ 계좌번호 12자리')
  ok('360px: 옆으로 안 밀림 (내 정보)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
