// 묶음 18: 내 정보 별명 칸 '내 커뮤니티 활동'(쓴 글·단 댓글·받은 좋아요, 숫자 올라감) · 커뮤니티 글 '공유하기'(링크 복사)
// node scripts/qa/batch18.cjs <default 앱> <default 가짜>
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
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: D })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); delete navigator.share } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 내 커뮤니티 활동 ──
  await w.goto(`${D}/me/profile`)
  ok('활동 없으면 표시 없음', (await w.locator('[data-my-activity]').count()) === 0)
  const [mine] = await rest('community_posts', 'POST', { author_id: W, category: 'tip', title: '주차 꿀팁', body: '공영 주차장 5천원', hidden_at: null })
  const [other] = await rest('community_posts', 'POST', { author_id: AP, category: 'free', title: '수고했어요', body: '다들 고생', hidden_at: null })
  await rest('community_likes', 'POST', [{ post_id: mine.id, user_id: AP }])
  await rest('community_comments', 'POST', [{ post_id: other.id, author_id: W, body: '고생하셨어요', hidden_at: null }, { post_id: other.id, author_id: W, body: '또 봐요', hidden_at: null }])
  await w.goto(`${D}/me/profile`)
  const box = w.locator('[data-my-activity]')
  await box.waitFor({ timeout: 8000 }).catch(() => {})
  await w.waitForTimeout(1500) // 숫자 올라가는 움직임이 끝난 뒤
  const nums = (await box.locator('dd').allInnerTexts()).map((t) => t.trim())
  ok('쓴 글 1 · 단 댓글 2 · 받은 좋아요 1', nums.join(',') === '1,2,1', nums.join(','))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 글 공유하기 ──
  await w.goto(`${D}/community/${mine.id}`)
  await w.waitForLoadState('networkidle').catch(() => {})
  const share = w.locator('[data-post-detail]').getByRole('button', { name: '공유하기' })
  ok('글에 공유하기 버튼', (await share.count()) === 1)
  await share.click()
  ok('링크 복사됨 안내', await w.locator('[data-post-detail]').getByText('링크 복사됨').waitFor({ timeout: 3000 }).then(() => true, () => false))
  const clip = await w.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok('복사된 내용에 글 주소', clip.includes(`/community/${mine.id}`) && clip.includes('주차 꿀팁'), clip.slice(0, 120))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
