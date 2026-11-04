// 묶음 42: 서류 서명 — 서명 없이 '서명하고 제출하기'를 누르면 서버까지 가지 않고 바로 서명란으로(빨간 테두리·흔들림·'손가락으로 여기에 서명해 주세요')
//          · 서명하면 빨간 표시가 사라짐 · 서류를 모두 서명하면 내 근무에서 축하(체크가 그려짐) · 360px
// node scripts/qa/batch42.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const [d0] = await rest(`signed_docs?id=eq.${DOC}`)
  ok('준비: 서명할 서류 (pending)', d0?.status === 'pending', d0?.status)
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  let posts = 0
  p.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts++ })
  await p.goto(`${D}/docs/${DOC}`)
  await p.locator('#sign').waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForLoadState('networkidle').catch(() => {})

  // ── 1. 서명 없이 제출 ──
  await p.locator('input[name=agree]').check()
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  await p.waitForTimeout(700)
  const pad = p.locator('[data-sign-pad]')
  ok('서버로 보내지 않음 (바로 막음)', posts === 0 && new URL(p.url()).pathname === `/docs/${DOC}`, `posts=${posts}`)
  ok("서명란: 빨간 테두리 + '손가락으로 여기에 서명해 주세요'", (await pad.getAttribute('data-invalid')) === '' && (await pad.innerText()).includes('손가락으로 여기에 서명해 주세요'))
  // (Tailwind 색은 lab()으로 계산되므로 클래스로 확인 + 기본 테두리와 다른 색인지)
  const border = await pad.locator('canvas').evaluate((el) => ({ cls: el.className.includes('border-rose-400'), c: getComputedStyle(el).borderTopColor }))
  ok('테두리 색 (rose)', border.cls && !/^rgb\(2[23]\d, 2[23]\d, 2[34]\d\)$/.test(border.c), JSON.stringify(border))
  ok('서명란이 화면 안으로 옮겨짐', await pad.locator('canvas').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 서명하면 빨간 표시가 사라짐 ──
  const box = await pad.locator('canvas').boundingBox()
  await p.mouse.move(box.x + 30, box.y + 90)
  await p.mouse.down()
  for (let i = 1; i <= 12; i++) await p.mouse.move(box.x + 30 + i * 18, box.y + 90 + (i % 2 ? -25 : 25))
  await p.mouse.up()
  ok("서명하면 빨간 표시 사라지고 '서명됨 ✓'", (await pad.getAttribute('data-invalid')) === null && (await pad.innerText()).includes('서명됨'))

  // ── 3. 제출 → 모두 마치면 내 근무에서 축하 ──
  await p.evaluate(() => { window.__party = 0; new MutationObserver(() => { if (document.querySelector('[data-celebrate]')) window.__party = 1 }).observe(document.body, { childList: true, subtree: true }) })
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  await p.waitForURL((u) => u.pathname === '/me', { timeout: 15000 }).catch(() => {})
  await p.getByText('서류 서명을 모두 마쳤어요').first().waitFor({ timeout: 8000 }).catch(() => {})
  const party = await p.evaluate(() => window.__party === 1 || !!document.querySelector('[data-celebrate]'))
  ok("'서류 서명을 모두 마쳤어요' + 축하(체크가 그려짐)", party && (await p.getByText('서류 서명을 모두 마쳤어요').count()) > 0, p.url())
  ok('서명 저장됨', (await rest(`signed_docs?id=eq.${DOC}`))[0]?.status === 'signed')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
