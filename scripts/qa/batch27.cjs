// 묶음 27: 어두운 화면 (베타) — 내 정보·회사 설정에서 켜고 끔 · 다시 열어도 유지(깜빡임 없이) · 서류(인쇄 화면)는 늘 밝게
// node scripts/qa/batch27.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
// 밝기 (0 어두움 ~ 255 밝음)
const lum = (rgb) => { const m = /(\d+), (\d+), (\d+)/.exec(rgb); return m ? 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3] : -1 }

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
  const bodyBg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const cardBg = (p) => p.evaluate(() => getComputedStyle(document.querySelector('main .card')).backgroundColor)

  // ── 1. 기본은 밝은 화면 ──
  const w = await pg(W)
  await w.goto(`${D}/me/profile`)
  await w.locator('[data-theme-toggle]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('처음엔 밝은 화면', (await w.evaluate(() => document.documentElement.dataset.theme)) === undefined && lum(await bodyBg(w)) > 200)

  // ── 2. 켜기 ──
  await w.locator('[data-theme-toggle]').click()
  ok('켜면 어두운 화면', (await w.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await w.locator('[data-theme-toggle]').getAttribute('aria-checked')) === 'true')
  ok('바탕·카드가 어둡고 글자는 밝음', lum(await bodyBg(w)) < 40 && lum(await cardBg(w)) < 50 && lum(await w.evaluate(() => getComputedStyle(document.querySelector('main h1, main h2')).color)) > 180, `${await bodyBg(w)} ${await cardBg(w)}`)

  // 다른 화면 · 다시 열어도 유지 (그리기 전에 적용)
  for (const path of ['/', '/me', '/community', '/me/chat', '/me/history']) {
    await w.goto(`${D}${path}`)
    const early = await w.evaluate(() => document.documentElement.dataset.theme)
    await w.waitForLoadState('networkidle').catch(() => {})
    const card = await w.evaluate(() => { const c = document.querySelector('main .card'); return c ? getComputedStyle(c).backgroundColor : '' })
    ok(`${path}: 어두운 화면 유지`, early === 'dark' && lum(await bodyBg(w)) < 40 && (!card || lum(card) < 60), `${await bodyBg(w)} card=${card}`)
    ok(`${path}: 360px 옆으로 안 밀림`, await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  }
  // 아래 탭도 어두운 유리
  ok('아래 탭 어두운 유리', lum(await w.locator('nav[data-bottom-nav] > div').evaluate((el) => getComputedStyle(el).backgroundColor)) < 60)

  // ── 3. 서류는 늘 밝게 ──
  const [doc] = (await rest(`signed_docs?user_id=eq.${W}`)).filter((d) => d.status === 'signed')
  if (doc) {
    await w.goto(`${D}/docs/${doc.id}`)
    await w.locator('.print-sheet').first().waitFor({ timeout: 10000 }).catch(() => {})
    const sheet = await w.locator('.print-sheet').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
    ok('서류 화면은 밝게 (종이처럼)', lum(await bodyBg(w)) > 200 && (sheet === '' || lum(sheet) > 200), `${await bodyBg(w)} ${sheet}`)
  } else ok('서류 화면은 밝게 (서명한 서류 없음 · 건너뜀)', true)

  // ── 4. 끄기 ──
  await w.goto(`${D}/me/profile`)
  await w.locator('[data-theme-toggle]').click()
  ok('끄면 밝은 화면', (await w.evaluate(() => document.documentElement.dataset.theme)) === undefined && lum(await bodyBg(w)) > 200)
  await w.reload()
  ok('다시 열어도 밝은 화면', (await w.evaluate(() => document.documentElement.dataset.theme)) === undefined)

  // ── 5. 관리자: 회사 설정에도 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/settings`)
  ok('관리자 회사 설정에 어두운 화면 켜기', (await ad.locator('[data-theme-toggle]').count()) === 1)
  await ad.locator('[data-theme-toggle]').click()
  await ad.goto(`${D}/admin`)
  await ad.waitForLoadState('networkidle').catch(() => {})
  ok('관리자 대시보드도 어둡게', lum(await bodyBg(ad)) < 40 && lum(await cardBg(ad)) < 60)
  ok('관리자 아래 탭 어두운 유리', lum(await ad.locator('[data-admin-tabbar] > div').evaluate((el) => getComputedStyle(el).backgroundColor)) < 60)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
