// 묶음 25: 화면 전환 (CSS만 — 화면 캡처(View Transition) 없이 가볍게, 휴대폰에서 끊기지 않게)
// · 처음 열 때는 움직이지 않음 · 아래 탭으로 다른 화면: 'tab'(살짝 떠오름) · 공고·글 열기: 'forward'(오른쪽에서) · ← 돌아가기: 'back'(왼쪽에서)
// · 같은 화면 거르기(칩)는 다시 움직이지 않음 · 머리글·아래 탭은 움직이는 칸 밖이라 그대로 · 화면 캡처는 한 번도 안 함 · 움직임 줄이기 설정이면 0초
// · 불러오던 회색 자리 → 실제 내용은 내용이 살짝 나타남 · 문의 탭은 목록 모양 회색 자리 · 탭을 누른 순간 탭 표시부터 옮겨 감
// · 스크롤·탭 이동 프레임: CPU 4배 느리게 해도 스크롤은 끊김 없음
// node scripts/qa/batch25.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

// 브라우저 화면 캡처 전환(startViewTransition)이 불리면 셈 — 이제는 한 번도 없어야 함
const spy = () => {
  window.__vt = 0
  const orig = document.startViewTransition?.bind(document)
  if (orig) document.startViewTransition = (arg) => { window.__vt++; return orig(arg) }
}

;(async () => {
  const [post] = await rest('community_posts', 'POST', { author_id: AP, category: 'tip', title: '전환 확인 글', body: '셔틀은 20분마다', hidden_at: null, created_at: new Date().toISOString() })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
    await ctx.addInitScript(spy)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return { ctx, p }
  }
  const dir = (p) => p.locator('.page-in').first().getAttribute('data-dir')
  const anim = (p) => p.locator('.page-in').first().evaluate((el) => getComputedStyle(el).animationName)
  const settle = (p) => p.waitForTimeout(500)

  const { ctx, p: w } = await pg(W)
  await w.goto(`${D}/`)
  await w.waitForLoadState('networkidle').catch(() => {})
  ok('처음 열 때는 움직이지 않음 (none)', (await dir(w)) === 'none')

  // ── 1. 아래 탭: 다른 화면 → 살짝 떠오름 ──
  await w.locator('nav[data-bottom-nav] a[href="/community"]').click()
  await w.waitForURL(/\/community/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-post-list]').waitFor({ timeout: 8000 }).catch(() => {})
  ok("아래 탭 → 'tab' (pt-rise)", (await dir(w)) === 'tab' && (await anim(w)) === 'pt-rise', `${await dir(w)} ${await anim(w)}`)
  ok('머리글·아래 탭은 움직이는 칸 밖', await w.evaluate(() => !document.querySelector('.page-in')?.closest('header') && !document.querySelector('.page-in [data-bottom-nav]') && !document.querySelector('.page-in [data-app-header]')))

  // ── 2. 글 열기 → 오른쪽에서 / ← 돌아가기 → 왼쪽에서 ──
  await settle(w)
  await w.locator(`[data-post][href="/community/${post.id}"]`).click()
  await w.waitForURL(new RegExp(post.id), { timeout: 8000 }).catch(() => {})
  await w.locator('[data-post-detail]').waitFor({ timeout: 8000 }).catch(() => {})
  ok("글 열기 → 'forward' (오른쪽에서)", (await dir(w)) === 'forward' && (await anim(w)) === 'pt-slide')
  await settle(w)
  await w.getByRole('link', { name: /^← / }).first().click()
  await w.waitForURL(/\/community\?c=tip/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-post-list]').waitFor({ timeout: 8000 }).catch(() => {})
  ok("← 돌아가기 → 'back' (왼쪽에서)", (await dir(w)) === 'back')

  // ── 3. 공고 카드 → 오른쪽에서 · 아래 탭 '알바 찾기'로 돌아오면 'tab' ──
  await w.goto(`${D}/`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.locator(`a.card-link[href="/jobs/${J}"]`).first().click()
  await w.waitForURL(/\/jobs\//, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-company-line]').waitFor({ timeout: 8000 }).catch(() => {})
  ok("공고 열기 → 'forward'", (await dir(w)) === 'forward')
  await settle(w)
  await w.locator('nav[data-bottom-nav] a[href="/"]').click()
  await w.waitForURL((u) => new URL(u).pathname === '/', { timeout: 8000 }).catch(() => {})
  await w.waitForTimeout(300)
  ok("공고에서 아래 탭 '알바 찾기' → 'back'이 아니라 'tab'", (await dir(w)) === 'tab', await dir(w))

  // ── 4. 같은 화면 거르기 칩: 다시 움직이지 않음 (같은 칸 그대로) ──
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.evaluate(() => { document.querySelector('.page-in').__same = 1 })
  await w.getByRole('link', { name: '이번 주말' }).first().click()
  await w.waitForURL(/when=/, { timeout: 8000 }).catch(() => {})
  await settle(w)
  ok('거르기 칩: 화면 칸이 그대로 (다시 움직이지 않음)', await w.evaluate(() => document.querySelector('.page-in')?.__same === 1))

  // ── 5. 문의 탭: 목록 모양 회색 자리 → 내용이 살짝 나타남 ──
  await fetch(`${MD}/__latency?ms=250`)
  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.evaluate(() => { window.__skel = []; new MutationObserver(() => { const s = document.querySelector('[data-skeleton]'); if (s) window.__skel.push(s.getAttribute('data-skeleton')) }).observe(document.body, { subtree: true, childList: true }) })
  await w.locator('nav[data-bottom-nav] a[href="/me/chat"]').click()
  await w.locator('[data-chat-list]').waitFor({ timeout: 15000 }).catch(() => {})
  const skel = await w.evaluate(() => [...new Set(window.__skel)])
  ok('문의 탭: 목록 모양 회색 자리(inbox)', skel.includes('inbox') && !skel.includes('chat'), JSON.stringify(skel))
  ok('회색 자리 대신 들어온 내용은 살짝 나타남 (pt-fade)', (await w.locator('.page-in > *').first().evaluate((el) => getComputedStyle(el).animationName)) === 'pt-fade')
  await fetch(`${MD}/__latency?ms=5`)

  // ── 6. 탭을 누른 순간 표시부터 옮겨 감 ──
  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await fetch(`${MD}/__latency?ms=600`)
  const mid = await w.evaluate(async () => {
    const ind = () => document.querySelector('[data-tab-indicator]').getAttribute('style')
    const before = ind()
    document.querySelector('nav[data-bottom-nav] a[href="/community"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await Promise.resolve()
    await Promise.resolve()
    return { before, style: ind(), path: location.pathname, current: document.querySelector('nav[data-bottom-nav] [aria-current=page]')?.getAttribute('href') }
  })
  ok('누른 순간 탭 표시가 커뮤니티로 (화면은 아직)', mid.path === '/me' && mid.style !== mid.before && mid.style.includes('translateX(200%)'), JSON.stringify(mid))
  ok('읽어 주기(aria-current)는 실제 화면 기준', mid.current === '/me', mid.current)
  await w.waitForURL(/\/community/, { timeout: 15000 }).catch(() => {})
  await fetch(`${MD}/__latency?ms=5`)
  ok('화면 캡처 전환(View Transition)은 한 번도 안 함', (await w.evaluate(() => window.__vt)) === 0)

  // ── 7. CPU 4배 느리게 해도 스크롤 끊김 없음 ──
  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle').catch(() => {})
  const cdp = await ctx.newCDPSession(w)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await w.evaluate(() => { window.__f = []; let last = 0; const t = (x) => { if (last) window.__f.push(x - last); last = x; if (window.__f.length < 400) requestAnimationFrame(t) }; requestAnimationFrame(t) })
  await cdp.send('Input.synthesizeScrollGesture', { x: 180, y: 500, yDistance: -1200, speed: 1600, gestureSourceType: 'touch' })
  const frames = await w.evaluate(() => window.__f)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const long = frames.filter((x) => x > 34).length
  ok('스크롤: 긴 프레임(>34ms) 거의 없음', frames.length > 20 && long <= 2, `${long}/${frames.length}`)

  // ── 8. 움직임 줄이기 ──
  const { p: rm } = await pg(W, { reducedMotion: 'reduce' })
  await rm.goto(`${D}/`)
  await rm.waitForLoadState('networkidle').catch(() => {})
  await rm.locator('nav[data-bottom-nav] a[href="/community"]').click()
  await rm.waitForURL(/\/community/, { timeout: 8000 }).catch(() => {})
  await rm.locator('[data-post-list]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('움직임 줄이기: 전환 시간 0초', (await rm.locator('.page-in').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration))) < 0.01)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
