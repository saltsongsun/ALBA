// 묶음 6: 관리자 대시보드 '⭐ 근무자 후기' · 내 근무 '○일 일, 어땠나요? 후기 쓰기' 안내 · 글 두 번 톡 = 좋아요(하트 떠오름)
// node scripts/qa/batch6.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
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

  // ── 1. 내 근무: 퇴근까지 한 공고 → 후기 쓰기 안내 ──
  const w = await pg(W)
  await w.goto(`${D}/me`)
  ok('아직 일하는 중이면 후기 안내 없음', (await w.locator('[data-review-nudge]').count()) === 0)
  await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { clock_out: new Date().toISOString() })
  await w.goto(`${D}/me`)
  const nudge = w.locator('[data-review-nudge]')
  ok('퇴근 뒤: ⭐ 어땠나요? 후기 쓰기', (await nudge.count()) === 1 && (await nudge.innerText()).includes('어땠나요') && (await nudge.getAttribute('href')) === `/me/review/${J}`)
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await rest('company_reviews', 'POST', { company_id: CO, job_id: J, author_id: W, rating: 4, body: '담당자분이 친절했고 쉬는 시간도 잘 지켜졌어요', hidden_at: null })
  await w.goto(`${D}/me`)
  ok('후기를 쓰면 안내 사라짐', (await w.locator('[data-review-nudge]').count()) === 0)

  // ── 2. 관리자 대시보드: 근무자 후기 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin`)
  const card = ad.locator('[data-admin-reviews]')
  ok('대시보드: ⭐ 근무자 후기 4.0 + 최근 후기', (await card.count()) === 1 && (await card.innerText()).includes('4.0') && (await card.innerText()).includes('친절했고'), await card.innerText().catch(() => ''))
  ok('후기에 실명 없음', !(await card.innerText()).includes('근무자 ·'))
  ok('누르면 우리 회사 후기 화면', (await card.getAttribute('href')) === `/community/company/${CO}`)

  // ── 3. 글 두 번 톡 = 좋아요 ──
  const [post] = await rest('community_posts', 'POST', { author_id: AP, category: 'tip', title: '셔틀버스 시간표 공유', body: '정문 앞 셔틀은 20분마다 와요.\n막차는 밤 10시예요.', hidden_at: null, created_at: new Date().toISOString() })
  await w.goto(`${D}/community/${post.id}`)
  await w.waitForLoadState('networkidle').catch(() => {})
  const body = w.locator('[data-double-tap]')
  await body.dblclick()
  ok('두 번 톡: 하트가 떠오름', await w.locator('[data-heart]').first().waitFor({ timeout: 2000 }).then(() => true, () => false))
  await w.waitForFunction(() => document.querySelector('[data-like]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).catch(() => {})
  await w.waitForTimeout(800)
  ok('좋아요 눌림 (1)', (await w.locator('[data-like]').getAttribute('aria-pressed')) === 'true' && /좋아요\s*1/.test(await w.locator('[data-like]').innerText()))
  await w.locator('[data-heart]').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
  ok('하트는 잠깐 뒤 사라짐', (await w.locator('[data-heart]').count()) === 0)
  await body.dblclick()
  await w.waitForTimeout(1200)
  ok('또 두 번 톡: 좋아요 취소되지 않음', (await w.locator('[data-like]').getAttribute('aria-pressed')) === 'true' && (await rest(`community_likes?post_id=eq.${post.id}`)).length === 1)
  await body.click()
  await w.waitForTimeout(500)
  ok('한 번 톡은 아무 일 없음', (await rest(`community_likes?post_id=eq.${post.id}`)).length === 1)

  await ad.goto(`${D}/community/${post.id}`)
  await ad.waitForLoadState('networkidle').catch(() => {})
  await ad.locator('[data-double-tap]').dblclick()
  await ad.waitForTimeout(800)
  // 관리자도 커뮤니티에 좋아요를 누를 수 있음 (batch73) → 두 번 톡하면 좋아요가 하나 더
  ok('관리자: 두 번 톡하면 좋아요', (await rest(`community_likes?post_id=eq.${post.id}`)).length === 2)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
