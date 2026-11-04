// 묶음 25: 화면 전환 애니메이션 (React ViewTransition)
// · 아래 탭으로 다른 화면: 전환이 일어남 · 공고·글 열기: 'nav-forward'(오른쪽에서) · ← 돌아가기: 'nav-back'(왼쪽에서)
// · 같은 화면 거르기(칩)는 움직이지 않음 · 전환 중에도 머리글·아래 탭은 그대로 · 움직임 줄이기 설정이면 0초
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

// 브라우저가 화면 전환을 시작할 때마다 기록 (종류·움직인 부분)
const spy = () => {
  window.__vt = []
  const orig = document.startViewTransition?.bind(document)
  if (!orig) return
  document.startViewTransition = (arg) => {
    const rec = { types: (arg && arg.types) || [], pseudo: [] }
    window.__vt.push(rec)
    const t = orig(arg)
    t.ready.then(() => { rec.pseudo = document.getAnimations().map((a) => `${a.effect?.pseudoElement ?? ''}|${a.animationName ?? ''}|${a.effect?.getTiming().duration}`) }).catch(() => {})
    return t
  }
}

;(async () => {
  const [post] = await rest('community_posts', 'POST', { author_id: AP, category: 'tip', title: '전환 확인 글', body: '셔틀은 20분마다', hidden_at: null, created_at: new Date().toISOString() })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addInitScript(spy)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const vts = (p) => p.evaluate(() => window.__vt)
  const settle = (p) => p.waitForTimeout(900)

  const w = await pg(W)
  ok('이 브라우저는 화면 전환 지원', await w.evaluate(() => typeof document.startViewTransition === 'function'))

  // ── 1. 아래 탭: 다른 화면으로 → 떠오르며 바뀜 ──
  await w.goto(`${D}/`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.locator('nav[data-bottom-nav] a[href="/community"]').click()
  await w.waitForURL(/\/community/, { timeout: 8000 }).catch(() => {})
  await settle(w)
  let v = await vts(w)
  ok('아래 탭 → 화면 전환 일어남', v.length >= 1, JSON.stringify(v))
  ok('새 화면은 떠오르는 모양(vt-rise), 머리글·탭은 그대로(root 움직임 없음)', v.some((r) => r.pseudo.some((x) => x.includes('::view-transition-new') && x.includes('vt-rise'))) && !v.some((r) => r.pseudo.some((x) => x.startsWith('::view-transition-new(root)') && !x.includes('|0'))), JSON.stringify(v.map((r) => r.pseudo)))
  ok('전환 뒤 화면 정상', (await w.locator('[data-post-list]').count()) === 1)

  // ── 2. 글 열기 → 오른쪽에서 / ← 돌아가기 → 왼쪽에서 ──
  await w.evaluate(() => (window.__vt = []))
  await w.locator(`[data-post][href="/community/${post.id}"]`).click()
  await w.waitForURL(new RegExp(post.id), { timeout: 8000 }).catch(() => {})
  await settle(w)
  v = await vts(w)
  ok('글 열기: nav-forward 전환', v.some((r) => r.types.includes('nav-forward')), JSON.stringify(v.map((r) => r.types)))
  ok('글 열기: 옆으로 밀리는 모양(vt-slide)', v.some((r) => r.pseudo.some((x) => x.includes('vt-slide'))), JSON.stringify(v.map((r) => r.pseudo)))
  await w.evaluate(() => (window.__vt = []))
  await w.getByRole('link', { name: /^← / }).first().click()
  await w.waitForURL(/\/community\?c=tip/, { timeout: 8000 }).catch(() => {})
  await settle(w)
  v = await vts(w)
  ok('← 돌아가기: nav-back 전환', v.some((r) => r.types.includes('nav-back')), JSON.stringify(v.map((r) => r.types)))

  // ── 3. 공고 카드 → 오른쪽에서 ──
  await w.goto(`${D}/`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.evaluate(() => (window.__vt = []))
  await w.locator(`a.card-link[href="/jobs/${J}"]`).first().click()
  await w.waitForURL(/\/jobs\//, { timeout: 8000 }).catch(() => {})
  await settle(w)
  v = await vts(w)
  ok('공고 열기: nav-forward 전환', v.some((r) => r.types.includes('nav-forward')))

  // ── 4. 같은 화면 거르기 칩: 움직이지 않음 ──
  await w.goto(`${D}/`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.evaluate(() => (window.__vt = []))
  await w.getByRole('link', { name: '이번 주말' }).first().click()
  await w.waitForURL(/when=/, { timeout: 8000 }).catch(() => {})
  await settle(w)
  v = await vts(w)
  ok('거르기 칩: 화면이 움직이지 않음', v.every((r) => !r.pseudo.some((x) => /vt-(rise|slide|fade)/.test(x))), JSON.stringify(v))

  // ── 5. 전환 중에도 누르기 됨 (덮개가 누르기를 막지 않음) ──
  ok('전환 덮개는 누르기를 막지 않음', await w.evaluate(() => { const s = document.createElement('style'); document.head.append(s); const r = [...document.styleSheets].flatMap((x) => { try { return [...x.cssRules] } catch { return [] } }).some((r) => r.selectorText === '::view-transition' && r.style.pointerEvents === 'none'); s.remove(); return r }))

  // ── 6. 움직임 줄이기 ──
  const rm = await pg(W, { reducedMotion: 'reduce' })
  await rm.goto(`${D}/`)
  await rm.waitForLoadState('networkidle').catch(() => {})
  await rm.locator('nav[data-bottom-nav] a[href="/community"]').click()
  await rm.waitForURL(/\/community/, { timeout: 8000 }).catch(() => {})
  await settle(rm)
  v = await vts(rm)
  ok('움직임 줄이기: 전환 시간 0초', v.every((r) => r.pseudo.filter((x) => x.includes('vt-')).every((x) => x.endsWith('|0'))), JSON.stringify(v.map((r) => r.pseudo)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
