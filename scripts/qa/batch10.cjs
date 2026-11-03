// 묶음 10: 아래 탭 '커뮤니티' 새 글 점(남이 쓴 새 글이 있을 때, 보면 꺼짐) · 최고 관리자 메뉴 '커뮤니티 관리' 처리할 신고 수
// node scripts/qa/batch10.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const post = (author, title, at = new Date()) => rest('community_posts', 'POST', { author_id: author, category: 'free', title, body: '내용이에요', hidden_at: null, created_at: at.toISOString() }).then((r) => r[0])

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const dot = () => w.locator('nav[data-bottom-nav] [data-community-dot]').count()

  // ── 1. 커뮤니티 새 글 점 ──
  await post(W, '내가 쓴 글', new Date(Date.now() - 60_000))
  await w.goto(`${D}/me`)
  ok('내 글만 있으면 점 없음', (await dot()) === 0)
  await post(AP, '남이 쓴 새 글')
  await w.reload()
  ok('남이 새 글을 쓰면 커뮤니티 탭에 빨간 점', (await dot()) === 1)
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.locator('nav[data-bottom-nav] a[href="/community"]').click()
  await w.waitForURL(/\/community/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-post-list]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('커뮤니티를 보면 점 사라짐', (await dot()) === 0)
  await w.locator('nav[data-bottom-nav] a[href="/me"]').click()
  await w.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 8000 }).catch(() => {})
  ok('다른 탭으로 가도 다시 안 생김', (await dot()) === 0)
  await w.reload()
  ok('새로 고쳐도 안 생김 (본 시각 기억)', (await dot()) === 0)
  await w.waitForTimeout(1100)
  await post(AP, '또 다른 새 글', new Date(Date.now() + 1000))
  await w.reload()
  ok('그 뒤 또 새 글이면 다시 점', (await dot()) === 1)

  // ── 2. 최고 관리자: 처리할 신고 수 ──
  const actx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await actx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const ad = await actx.newPage()
  ad.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await ad.goto(`${D}/admin`)
  ok('신고 없으면 숫자 없음', (await ad.locator('[data-report-badge]').count()) === 0)
  const p2 = (await rest('community_posts')).find((p) => p.title === '남이 쓴 새 글')
  await rest('community_reports', 'POST', [
    { target_type: 'post', target_id: p2.id, reporter_id: W, reason: '광고·도배', resolved_at: null },
    { target_type: 'post', target_id: p2.id, reporter_id: A, reason: '욕설·비하', resolved_at: null },
  ])
  await ad.reload()
  const badge = ad.locator('[data-report-badge]')
  ok("메뉴 '커뮤니티 관리' 옆 신고 2", (await badge.count()) === 1 && (await badge.innerText()).trim() === '2')
  await rest(`community_reports?target_id=eq.${p2.id}`, 'PATCH', { resolved_at: new Date().toISOString() })
  await ad.reload()
  ok('처리하면 숫자 사라짐', (await ad.locator('[data-report-badge]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
