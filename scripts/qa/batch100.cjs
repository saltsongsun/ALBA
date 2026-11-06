// 묶음 100: 정기 개선 — 내 정보 '이름·번호 바꾸기'를 바로 문의로
// · 내 정보: 휴대폰 번호·주민번호를 두 줄로 (한 줄에 이어 쓰면 '·'만 줄 끝에 남아 꺾임)
// · '…담당자에게 요청해 주세요. 문의하기 →' → 문의: 회사가 여럿이면 '이름·번호를 바꿔 달라고 할 회사를 골라 주세요' (고른 회사로 이어짐)
// · 대화 화면 첫 빠른 답장 '이름·주민번호·휴대폰 번호를 바꾸고 싶어요.' (누르면 입력 칸에)
// node scripts/qa/batch100.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 내 정보: 번호 두 줄 + 문의하기 ──
  await p.goto(`${D}/me/profile`)
  const ids = p.locator('[data-profile-ids] > span')
  await ids.first().waitFor({ timeout: 10000 }).catch(() => {})
  const lines = await ids.evaluateAll((els) => els.map((e) => ({ t: e.innerText, h: Math.round(e.getBoundingClientRect().height) })))
  ok('번호 두 줄 (각 한 줄 · "·" 없음)', lines.length === 2 && lines.every((l) => l.h < 26 && !l.t.includes('·')) && lines[0].t.startsWith('010'), JSON.stringify(lines))
  const ask = p.locator('[data-ask-info]')
  ok("'…담당자에게 요청해 주세요. 문의하기 →'", (await ask.getAttribute('href')) === '/me/chat?ask=info')
  ok('360px: 옆으로 안 밀림 (내 정보)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 문의: 회사 고르기 안내 → 고른 회사로 이어짐 ──
  await ask.click()
  await p.waitForURL(/\/me\/chat\?ask=info/, { timeout: 10000 }).catch(() => {})
  const hint = p.locator('[data-ask-hint]')
  await hint.waitFor({ timeout: 8000 }).catch(() => {})
  ok("대화가 여럿이면 '이름·번호를 바꿔 달라고 할 회사를 골라 주세요'", (await hint.innerText().catch(() => '')).includes('회사를 골라 주세요'))
  const coRow = p.locator('a[data-chat-row=company]').first()
  ok('회사 줄을 누르면 문의 이어짐 (&ask=info)', ((await coRow.getAttribute('href')) ?? '').endsWith('&ask=info'))
  await coRow.click()
  await p.waitForURL(/co=.*ask=info/, { timeout: 10000 }).catch(() => {})
  const chips = p.locator('[data-quick-replies] button')
  await chips.first().waitFor({ timeout: 8000 }).catch(() => {})
  ok("첫 빠른 답장 '이름·주민번호·휴대폰 번호를 바꾸고 싶어요.'", (await chips.first().innerText().catch(() => '')) === '이름·주민번호·휴대폰 번호를 바꾸고 싶어요.')
  await chips.first().click()
  ok('누르면 입력 칸에', (await p.locator('textarea').first().inputValue()) === '이름·주민번호·휴대폰 번호를 바꾸고 싶어요.')
  ok('360px: 옆으로 안 밀림 (문의)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
