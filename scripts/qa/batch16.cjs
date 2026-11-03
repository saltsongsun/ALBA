// 묶음 16: 커뮤니티 글·댓글에 '🤝 동료'(서로 동료 맺은 사람만) · '함께 일한 사람'에 받은 요청 수
// node scripts/qa/batch16.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const X = '88888888-0000-4000-8000-000000000081'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  await rest('users', 'POST', { id: X, name: 'x', phone: '01011110081', pin_hash: 's1:x:y', nickname: '야간조장', created_at: '2026-01-01T00:00:00Z' })
  const [p1] = await rest('community_posts', 'POST', { author_id: AP, category: 'tip', title: '동료가 쓴 글', body: '내용이에요', hidden_at: null })
  await rest('community_posts', 'POST', { author_id: X, category: 'free', title: '모르는 사람 글', body: '내용이에요', hidden_at: null })
  await rest('community_comments', 'POST', [{ post_id: p1.id, author_id: AP, body: '동료 댓글', hidden_at: null }, { post_id: p1.id, author_id: X, body: '남 댓글', hidden_at: null }])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  await w.goto(`${D}/community`)
  ok('동료 맺기 전: 동료 표시 없음 · 요청 없음', (await w.locator('[data-pal-badge]').count()) === 0 && (await w.locator('[data-request-badge]').count()) === 0)
  // 새벽스태프 → 나에게 요청, 야간조장도 요청
  await rest('coworker_links', 'POST', [{ from_id: AP, to_id: W }, { from_id: X, to_id: W }])
  await w.reload()
  ok("받은 요청 2: '👋 요청 2'", /요청\s*2/.test(await w.locator('[data-request-badge]').innerText().catch(() => '')))
  ok('한쪽 요청만으로는 동료 표시 없음', (await w.locator('[data-pal-badge]').count()) === 0)
  // 내가 새벽스태프 요청 수락 → 동료
  await rest('coworker_links', 'POST', { from_id: W, to_id: AP })
  await w.reload()
  ok('수락 뒤 요청 1', /요청\s*1/.test(await w.locator('[data-request-badge]').innerText().catch(() => '')))
  const card = w.locator('[data-post]', { hasText: '동료가 쓴 글' })
  ok("동료가 쓴 글에 '🤝 동료'", (await card.locator('[data-pal-badge]').count()) === 1 && (await w.locator('[data-post]', { hasText: '모르는 사람 글' }).locator('[data-pal-badge]').count()) === 0)
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await w.goto(`${D}/community/${p1.id}`)
  await w.locator('[data-comments]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('글쓴이 옆 🤝 동료', (await w.locator('[data-post-detail] [data-pal-badge]').count()) === 1)
  const cm = w.locator('[data-comment]')
  ok('동료 댓글에만 🤝 동료', (await cm.filter({ hasText: '동료 댓글' }).locator('[data-pal-badge]').count()) === 1 && (await cm.filter({ hasText: '남 댓글' }).locator('[data-pal-badge]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
