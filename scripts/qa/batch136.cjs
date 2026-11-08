// 묶음 136 (정기 개선 2026-11-08 08:35)
// · 근무자 문의 목록: 회사 문의(🏢)·고객센터(🎧) 칸도 단체방처럼 선 아이콘 (이모지 대신 · 다른 화면과 같은 모양)
// node scripts/qa/batch136.cjs <default 앱> <default 가짜> <shots>
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
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await w.goto(`${D}/me/chat`)
  const list = w.locator('[data-chat-list]')
  await list.waitFor({ timeout: 15000 }).catch(() => {})
  const rows = await list.locator('[data-chat-row]').evaluateAll((els) => els.map((e) => ({ kind: e.dataset.chatRow, svg: !!e.querySelector('span[aria-hidden] svg'), emoji: /[🏢🎧]/u.test(e.textContent ?? '') })))
  const company = rows.filter((r) => r.kind !== 'room')
  ok('회사 문의 칸: 선 아이콘(svg) · 이모지 없음', company.length >= 1 && company.every((r) => r.svg && !r.emoji), JSON.stringify(rows))
  ok('단체방 칸은 그대로 선 아이콘', rows.filter((r) => r.kind === 'room').every((r) => r.svg))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await list.screenshot({ path: `${SHOTS}/inbox-icons.png` }).catch(() => {})
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
