// 묶음 19: 커뮤니티 대량 열람 막기(한 시간에 글 300개 넘게 열면 잠시 멈춤) · 글을 여는 동안 글 모양 '불러오는 중'
// node scripts/qa/batch19.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const [post] = await rest('community_posts', 'POST', { author_id: AP, category: 'free', title: '평범한 글', body: '내용이에요', hidden_at: null })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 글 모양 '불러오는 중' ──
  await w.goto(`${D}/community`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await fetch(`${MD}/__latency?ms=900`)
  await w.locator(`[data-post]`).first().click()
  ok('글을 누르면 바로 글 모양 불러오는 중', await w.locator('[data-skeleton=post]').waitFor({ timeout: 4000 }).then(() => true, () => false))
  await fetch(`${MD}/__latency?ms=5`)
  await w.locator('[data-post-detail]').waitFor({ timeout: 20000 }).catch(() => {})
  ok('다 불러오면 글', (await w.locator('[data-post-detail]').count()) === 1)

  // ── 2. 대량 열람 막기 ──
  ok('보통은 글이 열림', (await w.locator('[data-read-limit]').count()) === 0)
  const now = new Date().toISOString()
  await rest('rate_events', 'POST', Array.from({ length: 300 }, () => ({ bucket: `community-read:${W}`, created_at: now })))
  await w.goto(`${D}/community/${post.id}`)
  ok('한 시간에 300개 넘게 열면 잠시 멈춤', await w.locator('[data-read-limit]').waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('그때는 글 내용이 안 보임', (await w.locator('[data-post-detail]').count()) === 0)
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
