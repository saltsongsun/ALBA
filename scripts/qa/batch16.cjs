// 묶음 16: 커뮤니티 글·댓글에 '🤝 동료' — 그 사람이 나에게 지원 공고를 보여 주기로 한 경우만 (한쪽으로만 · 요청·배지 없음)
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
  ok('아무도 고르기 전: 동료 표시 없음 · 요청 배지 없음', (await w.locator('[data-pal-badge]').count()) === 0 && (await w.locator('[data-request-badge]').count()) === 0)
  // 내가 야간조장에게 보여 줘도(내 쪽 선택) 야간조장 글엔 표시 없음 — 남의 정보는 그 사람이 골라야만
  await rest('coworker_links', 'POST', { from_id: W, to_id: X })
  await w.reload()
  ok('내가 보여 준 사람의 글: 표시 없음 (그 사람이 나를 고르지 않았으니)', (await w.locator('[data-pal-badge]').count()) === 0)
  // 새벽스태프가 나에게 보여 주기로 함 → 새벽스태프 글에 '🤝 동료'
  await rest('coworker_links', 'POST', { from_id: AP, to_id: W })
  await w.reload()
  ok('요청 배지는 없음 (요청·수락이 없는 방식)', (await w.locator('[data-request-badge]').count()) === 0)
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
