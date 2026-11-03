// 묶음 7: 커뮤니티 '🔥 인기'(최근 2주, 좋아요·댓글 많은 순, 1~3위 표시) · 댓글 '↩ 답글'(@별명 자동 입력·강조·답글 알림)
// node scripts/qa/batch7.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString()

;(async () => {
  await rest(`users?id=eq.${W}`, 'PATCH', { nickname: '주차왕' })
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  const [hot, quiet, old, warm] = await rest('community_posts', 'POST', [
    { author_id: W, category: 'tip', title: '셔틀버스 꿀팁', body: '정문 셔틀은 20분마다 와요', hidden_at: null, created_at: ago(5) },
    { author_id: AP, category: 'free', title: '조용한 글', body: '아무 반응 없는 글', hidden_at: null, created_at: ago(1) },
    { author_id: AP, category: 'tip', title: '오래된 인기 글', body: '3주 전 글', hidden_at: null, created_at: ago(24 * 21) },
    { author_id: AP, category: 'question', title: '복장 질문', body: '검은 바지 괜찮나요?', hidden_at: null, created_at: ago(3) },
  ])
  await rest('community_likes', 'POST', [{ post_id: hot.id, user_id: AP }, { post_id: hot.id, user_id: A }, { post_id: old.id, user_id: W }, { post_id: warm.id, user_id: W }])
  await rest('community_comments', 'POST', [{ post_id: hot.id, author_id: AP, body: '좋은 정보 감사해요!', hidden_at: null }, { post_id: old.id, author_id: W, body: '옛날 글', hidden_at: null }])

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 🔥 인기 ──
  const w = await pg(W)
  await w.goto(`${D}/community`)
  await w.locator('[data-community-tabs] a', { hasText: '인기' }).click()
  await w.waitForURL(/c=hot/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-post-list]').waitFor({ timeout: 10000 }).catch(() => {})
  const cards = await w.locator('[data-post]').allInnerTexts()
  ok('인기: 반응 있는 최근 글만 (2개)', cards.length === 2 && !cards.some((t) => t.includes('조용한 글') || t.includes('오래된 인기 글')), cards.map((t) => t.split('\n')[0]).join(' / '))
  ok('좋아요·댓글 많은 글이 1위', cards[0]?.includes('셔틀버스 꿀팁') && cards[0]?.includes('🔥 1위') && cards[1]?.includes('🔥 2위'))
  ok('인기 칩 켜짐', (await w.locator('[data-community-tabs] a[aria-current=page]').innerText()).includes('인기'))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. ↩ 답글 ──
  await w.goto(`${D}/community/${hot.id}`)
  await w.waitForLoadState('networkidle').catch(() => {})
  ok('남의 댓글에 답글 버튼', (await w.locator('[data-comment] [data-reply]').count()) === 1)
  await w.locator('[data-reply]').click()
  const box = w.locator('[data-comment-form] textarea')
  ok('답글: @별명 자동 입력 + 칸에 커서', (await box.inputValue()) === '@새벽스태프 ' && (await box.evaluate((el) => el === document.activeElement)))
  await w.locator('[data-reply]').click()
  ok('두 번 눌러도 한 번만', (await box.inputValue()) === '@새벽스태프 ')
  await box.pressSequentially('저도 셔틀 탔어요')
  await w.getByRole('button', { name: '댓글 달기' }).click()
  await w.locator('[data-comment] b', { hasText: '@새벽스태프' }).waitFor({ timeout: 8000 }).catch(() => {})
  ok('답글 앞 @별명 강조', (await w.locator('[data-comment] b', { hasText: '@새벽스태프' }).count()) === 1)
  ok('내 댓글에는 답글 버튼 없음', (await w.locator('[data-comment]').nth(1).locator('[data-reply]').count()) === 0)
  const ev = await rest('rate_events')
  ok('답글 받은 사람에게 알림 보냄', ev.some((e) => e.bucket === `community-reply:${hot.id}:${AP}`))

  // 관리자는 답글 버튼 없음
  const ad = await pg(A)
  await ad.goto(`${D}/community/${hot.id}`)
  await ad.locator('[data-comments]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('관리자(읽기만): 답글 버튼 없음', (await ad.locator('[data-reply]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
