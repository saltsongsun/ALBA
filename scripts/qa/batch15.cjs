// 묶음 15: 내 근무 '💬 내 글에 새 댓글이 달렸어요'(본 뒤엔 사라짐) · 댓글 달면 그 댓글로 이동해 반짝
// node scripts/qa/batch15.cjs <default 앱> <default 가짜>
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
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 내 글에 새 댓글 ──
  const [mine] = await rest('community_posts', 'POST', { author_id: W, category: 'question', title: '셔틀 시간 아시는 분', body: '정문 셔틀 몇 분 간격이에요?', hidden_at: null, created_at: new Date(Date.now() - 3600_000).toISOString() })
  await w.goto(`${D}/me`)
  ok('댓글 없으면 안내 없음', (await w.locator('[data-new-comments]').count()) === 0)
  await rest('community_comments', 'POST', [
    { post_id: mine.id, author_id: AP, body: '20분 간격이에요', hidden_at: null },
    { post_id: mine.id, author_id: W, body: '감사해요!', hidden_at: null },
  ])
  await w.reload()
  const card = w.locator('[data-new-comments]')
  ok('💬 내 글에 새 댓글 1 (내 댓글 빼고)', (await card.count()) === 1 && (await card.innerText()).includes('셔틀 시간 아시는 분') && /\b1\b/.test(await card.innerText()), await card.innerText().catch(() => ''))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await card.click()
  await w.waitForURL(new RegExp(`/community/${mine.id}`), { timeout: 8000 }).catch(() => {})
  await w.locator('[data-comments]').waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForTimeout(500)
  await w.goto(`${D}/me`)
  ok('글을 본 뒤엔 안내 사라짐', (await w.locator('[data-new-comments]').count()) === 0)

  // ── 2. 댓글 달면 그 댓글로 이동해 반짝 ──
  const [other] = await rest('community_posts', 'POST', { author_id: AP, category: 'free', title: '오늘 다들 수고하셨어요', body: '비 와서 힘들었죠', hidden_at: null })
  for (let i = 0; i < 6; i++) await rest('community_comments', 'POST', { post_id: other.id, author_id: AP, body: `앞선 댓글 ${i + 1}\n줄\n줄`, hidden_at: null })
  await w.goto(`${D}/community/${other.id}`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.locator('[data-comment-form] textarea').fill('수고 많으셨어요!')
  await w.getByRole('button', { name: '댓글 달기' }).click()
  const added = w.locator('[data-comment][data-just-added="1"]')
  ok('방금 단 댓글이 반짝', await added.waitFor({ timeout: 6000 }).then(() => true, () => false))
  ok('그 댓글이 내 댓글', (await added.innerText().catch(() => '')).includes('수고 많으셨어요'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
