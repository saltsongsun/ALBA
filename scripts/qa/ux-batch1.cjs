// UI/UX 묶음 1: 화면 모양 그대로의 '불러오는 중' · 설치한 앱에서 당겨서 새로 고침 · 공고 장소 '주소 복사' · 360px
// node scripts/qa/ux-batch1.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const latency = (ms) => fetch(`${MD}/__latency?ms=${ms}`).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async ({ standalone = false } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: D })
    await ctx.addInitScript((sa) => {
      try { sessionStorage.setItem('photo-prompt-later', '1') } catch {}
      // 홈 화면에 설치한 앱으로 연 것처럼
      if (sa) {
        const mm = window.matchMedia.bind(window)
        window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q))
      }
    }, standalone)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }, { name: 'alba_roster', value: roster(W), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return { ctx, p }
  }
  // 손가락으로 화면을 아래로 끌기 (중간에 멈춰 상태를 볼 수 있게)
  const drag = async (p, cdp, from, to, { release = true, during } = {}) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: from }] })
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: from + ((to - from) * i) / 8 }] })
      await p.waitForTimeout(16)
    }
    if (during) await during()
    if (release) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  // ── 1. 설치한 앱: 맨 위에서 당기면 새로 고침 ──
  {
    const { ctx, p } = await pg({ standalone: true })
    const cdp = await ctx.newCDPSession(p)
    await p.goto(`${D}/me`)
    await p.locator('h2', { hasText: '오늘의 근무' }).waitFor({ timeout: 10000 }).catch(() => {})
    let mid = null
    let rsc = 0
    p.on('request', (r) => { if (r.headers()['rsc'] === '1') rsc++ })
    await drag(p, cdp, 160, 460, {
      during: async () => {
        mid = await p.locator('[data-ptr]').getAttribute('data-ptr').catch(() => null)
      },
    })
    ok('당기는 동안: 병아리 표시 → 놓으면 새로 고침 준비', mid === 'ready', String(mid))
    const phase = await p.locator('[data-ptr]').getAttribute('data-ptr').catch(() => null)
    ok('놓으면: 새로 고치는 중', phase === 'refreshing', String(phase))
    await p.locator('[data-ptr]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
    ok('새 내용을 서버에서 다시 받아 옴', rsc >= 1, `${rsc}번`)
    ok('끝나면 표시 사라짐', (await p.locator('[data-ptr]').count()) === 0)

    // 조금만 당기면 새로 고치지 않음
    rsc = 0
    await drag(p, cdp, 160, 230)
    await p.waitForTimeout(600)
    ok('조금만 당기면 새로 고치지 않음', rsc === 0 && (await p.locator('[data-ptr]').count()) === 0, `${rsc}번`)

    // 스크롤을 내린 상태에서는 당겨도 아무 일 없음 (평소 스크롤 그대로)
    await p.evaluate(() => window.scrollTo(0, 300))
    await p.waitForTimeout(200)
    await drag(p, cdp, 160, 460, { release: false, during: async () => { mid = await p.locator('[data-ptr]').count() } })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    ok('아래로 스크롤한 상태에서는 표시 안 함', mid === 0)
    await ctx.close()
  }

  // ── 2. 일반 브라우저: 브라우저의 당겨서 새로 고침이 있으므로 우리 것은 안 뜸 ──
  {
    const { ctx, p } = await pg()
    const cdp = await ctx.newCDPSession(p)
    await p.goto(`${D}/me`)
    await p.locator('h2', { hasText: '오늘의 근무' }).waitFor({ timeout: 10000 }).catch(() => {})
    let mid = -1
    await drag(p, cdp, 160, 460, { during: async () => { mid = await p.locator('[data-ptr]').count() } })
    ok('브라우저에서는 안 뜸 (브라우저 기능과 겹치지 않게)', mid === 0)
    await ctx.close()
  }

  // ── 3. 불러오는 동안 화면 모양 그대로 (느린 서버 흉내) ──
  {
    const { ctx, p } = await pg()
    p.setDefaultTimeout(30000)
    await p.goto(`${D}/`)
    await p.locator('a.card-link[href^="/jobs/"]').first().waitFor({ timeout: 10000 }).catch(() => {})
    // 링크 미리 받기(불러오는 중 화면 포함)가 끝난 뒤 서버를 느리게
    await p.waitForLoadState('networkidle').catch(() => {})
    await p.waitForTimeout(1500)
    await latency(400)
    try {
      await p.locator('a.card-link[href^="/jobs/"]').last().click()
      ok('공고를 누르면 바로 공고 화면 모양', await p.locator('[data-skeleton=job]').waitFor({ timeout: 800 }).then(() => true, () => false))
      await p.waitForURL(/\/jobs\//, { timeout: 30000 }).catch(() => {})
      await p.locator('[data-skeleton=job]').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
      await p.locator('[data-company-line]').waitFor({ timeout: 30000 }).catch(() => {})
      ok('다 불러오면 실제 공고로 바뀜', (await p.locator('[data-company-line]').count()) === 1)
      await p.locator('nav[data-bottom-nav] a[href="/me/chat"]').click()
      ok('문의를 누르면 바로 말풍선 모양', await p.locator('[data-skeleton=chat]').waitFor({ timeout: 800 }).then(() => true, () => false))
      await p.locator('textarea[name=body], [data-chat-list]').first().waitFor({ timeout: 30000 }).catch(() => {})
      await latency(5)
      await p.waitForLoadState('networkidle').catch(() => {})
      await p.waitForTimeout(1500)
      await latency(400)
      await p.locator('nav[data-bottom-nav] a[href="/"]').click()
      // 방금(30초 안) 본 화면이면 휴대폰에 둔 것을 곧바로, 아니면 공고 카드 모양부터 (어느 쪽이든 기다림 없이 바로)
      const quick = await Promise.any([
        p.locator('[data-skeleton=jobs]').waitFor({ timeout: 800 }).then(() => 'skeleton'),
        p.locator('a.card-link[href^="/jobs/"]').first().waitFor({ timeout: 800 }).then(() => 'cached'),
      ]).catch(() => null)
      ok('알바 찾기를 누르면 바로 (공고 카드 모양 또는 방금 본 화면)', !!quick, String(quick))
      await p.locator('[data-skeleton=jobs]').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
    } finally {
      await latency(5)
    }

    // ── 4. 공고 장소: 주소 복사 ──
    await p.goto(`${D}/jobs/${J}`)
    const btn = p.getByRole('button', { name: '주소 복사' })
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    ok('지도 아래 주소 복사 버튼', (await btn.count()) === 1)
    await btn.click()
    ok('누르면 복사됨 ✓', await p.getByText('복사됨 ✓').first().waitFor({ timeout: 3000 }).then(() => true, () => false))
    ok('주소가 복사됨', (await p.evaluate(() => navigator.clipboard.readText())) === '서울 중구')
    ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
    await ctx.close()
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
