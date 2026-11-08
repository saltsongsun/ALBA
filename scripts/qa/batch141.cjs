// 묶음 141 (정기 개선 2026-11-08 13:35)
// · 문의 채팅 위 설명: 첫 문의(대화 없음)일 때만 '궁금한 점을 남기면 ○○에서 확인하고 답장해 드려요'
//   대화가 이어지는 중이면 '○○과의 대화' 한 줄 (받침에 따라 와/과) — 화면을 덜 차지하게
// node scripts/qa/batch141.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const [co] = await rest(`companies?id=eq.${C}`)
  const name = co?.company_name ?? '주식회사 테스트'
  const last = name.charCodeAt(name.length - 1)
  const wa = last >= 0xac00 && last <= 0xd7a3 ? ((last - 0xac00) % 28 ? '과' : '와') : '와(과)'
  // 대화가 있는 회사 (가짜 데이터: 근무자 문의 + 담당자 답장)
  await w.goto(`${D}/me/chat?co=${C}`)
  const intro = w.locator('[data-chat-intro]')
  await intro.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`대화 중: '${name}${wa}의 대화' 한 줄 (긴 설명 없음)`, (await intro.innerText()) === `${name}${wa}의 대화`, await intro.innerText())
  ok('한 줄로 (두 줄로 꺾이지 않음)', await intro.evaluate((el) => el.getBoundingClientRect().height < 26))
  if (SHOTS) await w.locator('main').screenshot({ path: `${SHOTS}/chat-intro.png`, clip: undefined }).catch(() => {})
  // 대화를 모두 지우면 (첫 문의) 설명 그대로
  await rest(`messages?thread_user_id=eq.${W}`, 'DELETE')
  await w.goto(`${D}/me/chat?co=${C}`)
  await intro.waitFor({ timeout: 15000 }).catch(() => {})
  ok("첫 문의: '궁금한 점을 남기면 … 확인하고 답장해 드려요'", (await intro.innerText()).includes('확인하고 답장해 드려요'), await intro.innerText())
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
