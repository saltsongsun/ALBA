// 묶음 78: 가장 많이 쓰는 화면(홈) 개선 — 인사이트: 비회원은 거의 홈에서 바로 나감
// · 로그인 전: 짧은 소개(높이 200px 아래) → 공고 카드가 첫 화면 위쪽에 · 목록 끝에 가입 안내(3단계 · 1분 가입하기 · 로그인 · 전문가·회사 안내)
// · 홈 공고 카드·거르기·가입 버튼을 누르면 행동 기록에 이름이 남음 (앞으로 인사이트에서 효과 확인)
// · 로그인한 근무자: 소개·가입 안내 없음 · 회사 공고 모음(/?co=): 가입 뒤 그 회사로 돌아오게 · 360px
// node scripts/qa/batch78.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 로그인 전 홈 ──
  const g = await pg(null)
  await g.goto(`${D}/`)
  const intro = g.locator('[data-home-intro]')
  await intro.waitFor({ timeout: 10000 }).catch(() => {})
  const introH = (await intro.boundingBox())?.height ?? 999
  ok('짧은 소개 (높이 200px 아래) · 간편 가입 버튼', introH < 200 && (await intro.getByRole('link', { name: '간편 가입' }).isVisible()), `${Math.round(introH)}px`)
  const card = g.locator('a[href^="/jobs/"]').first()
  const cardTop = (await card.boundingBox())?.y ?? 9999
  ok('첫 공고 카드가 첫 화면 위쪽에 (330px 위)', cardTop < 330, `${Math.round(cardTop)}px`)
  const lines = await intro.locator('p span').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  ok('소개 설명은 두 줄로 딱 나뉨 (어색한 줄바꿈 없음)', lines.length === 2 && lines.every((h) => h < 24), JSON.stringify(lines))
  const join = g.locator('[data-home-join]')
  ok('목록 끝 가입 안내: 3단계', (await join.locator('[data-home-steps] li').count()) === 3)
  ok("'1분 가입하기' → 알바 가입", (await join.getByRole('link', { name: '1분 가입하기' }).getAttribute('href')) === '/signup?type=worker')
  ok('전문가·회사 안내는 아래로', (await join.locator('a[href="/pro"]').count()) === 1 && (await join.locator('a[href="/start"]').count()) === 1 && (await intro.locator('a[href="/pro"], a[href="/start"]').count()) === 0)
  ok('360px: 옆으로 안 밀림 (홈)', await g.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 누름 기록: 거르기 칩 · 공고 카드
  await g.locator('[data-chip-row] a', { hasText: '오늘·내일' }).click()
  await g.waitForURL(/when=soon/, { timeout: 8000 }).catch(() => {})
  await g.locator('a[href^="/jobs/"]').first().click()
  await g.waitForURL(/\/jobs\//, { timeout: 8000 }).catch(() => {})
  await g.waitForTimeout(800)
  const labels = (await rest('usage_events')).filter((e) => e.kind === 'click').map((e) => e.label)
  ok("행동 기록: '홈 거르기: 오늘·내일' · '홈 공고 카드(비회원)'", labels.includes('홈 거르기: 오늘·내일') && labels.includes('홈 공고 카드(비회원)'), JSON.stringify(labels))

  // ── 2. 로그인한 근무자 ──
  const w = await pg(W)
  await w.goto(`${D}/`)
  await w.locator('#jobs').waitFor({ timeout: 10000 }).catch(() => {})
  ok('근무자: 소개·가입 안내 없음', (await w.locator('[data-home-intro]').count()) === 0 && (await w.locator('[data-home-join]').count()) === 0)
  await w.locator('a[href^="/jobs/"]').first().click()
  await w.waitForURL(/\/jobs\//, { timeout: 8000 }).catch(() => {})
  await w.waitForTimeout(800)
  ok("근무자 공고 카드 기록: '홈 공고 카드'", (await rest('usage_events')).some((e) => e.kind === 'click' && e.label === '홈 공고 카드' && e.role === 'worker'))

  // ── 3. 회사 공고 모음 링크 (로그인 전) ──
  await g.goto(`${D}/?co=${CO}`)
  await g.locator('[data-home-join]').waitFor({ timeout: 10000 }).catch(() => {})
  const href = await g.locator('[data-home-join]').getByRole('link', { name: '1분 가입하기' }).getAttribute('href').catch(() => '')
  ok('회사 링크: 가입 뒤 그 회사 공고로 · 전문가·회사 안내는 없음', href === `/signup?type=worker&next=${encodeURIComponent(`/?co=${CO}`)}` && (await g.locator('[data-home-join] a[href="/pro"]').count()) === 0, href)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
