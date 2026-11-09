// 묶음 151 (정기 개선 2026-11-09 01:35)
// · 내 근무 '오늘의 근무' 카드: 서명할 서류가 남았을 때 '서류 n건에 서명하면 근무를 시작할 수 있어요 · 서명 ›'을 누르면 바로 그 서류 서명 화면
//   (예전엔 '위의 서류…' 글만 있어 위로 올라가 찾아야 했음) · 누르면 살짝 눌림 · 360px 한 덩어리
// node scripts/qa/batch151.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', DOC = 'dddddddd-0000-4000-8000-000000000004'
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
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
  // 출근 전 상태로 (가짜 DB의 근무자는 이미 근무 중 · 근무 중이면 '근무 종료'가 먼저 — batch154)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await w.goto(`${D}/me`)
  const note = w.locator('[data-sign-before-start]')
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  const t = (await note.innerText().catch(() => '')).replace(/\n/g, ' ')
  ok("'서류 1건에 서명하면 근무를 시작할 수 있어요 · 서명 ›'", t.includes('서류 1건에 서명하면 근무를 시작할 수 있어요') && t.includes('서명 ›') && !t.includes('위의 서류'), t)
  ok('그 서류로 가는 링크', (await note.getAttribute('href')) === `/docs/${DOC}`)
  ok("'서명 ›'은 한 줄 · 360px 옆으로 안 밀림", (await note.locator('span').last().evaluate((el) => el.getBoundingClientRect().height < 26)) && (await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  ok('누르면 살짝 눌림 (active:scale)', ((await note.getAttribute('class')) ?? '').includes('active:scale'))
  await Promise.all([w.waitForURL(/\/docs\//, { timeout: 15000 }).catch(() => {}), note.click()])
  ok('누르면 바로 서명 화면', new URL(w.url()).pathname === `/docs/${DOC}`, w.url())
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
