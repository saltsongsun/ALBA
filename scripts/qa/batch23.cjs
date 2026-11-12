// 묶음 23 (디자인 새로 고침): 떠 있는 유리 아래 탭 · 누른 탭 표시가 미끄러지듯 옮겨 감 · 오늘 근무 그라데이션 카드 · 겹침·옆 밀림 없음
// node scripts/qa/batch23.cjs <default 앱> <default 가짜>
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
  for (let i = 0; i < 10; i++) await rest('community_posts', 'POST', { author_id: AP, category: 'free', title: `디자인 확인 글 ${i + 1}`, body: '내용 '.repeat(30), hidden_at: null, created_at: new Date(Date.now() - i * 60_000).toISOString() })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const bar = () => p.locator('nav[data-bottom-nav] > div').boundingBox()
  const indicatorX = () => p.locator('[data-tab-indicator]').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)

  // ── 1. 떠 있는 유리 탭 ──
  await p.goto(`${D}/`)
  await p.locator('[data-today-hero]').waitFor({ timeout: 10000 }).catch(() => {})
  const box = await bar()
  ok('아래 탭이 화면 가장자리에서 떠 있음 (아래·양옆 여백)', !!box && box.y + box.height <= 740 - 8 && box.x >= 8 && box.x + box.width <= 360 - 8, JSON.stringify(box))
  const look = await p.locator('nav[data-bottom-nav] > div').evaluate((el) => { const s = getComputedStyle(el); return { blur: s.backdropFilter || s.webkitBackdropFilter, radius: parseFloat(s.borderTopLeftRadius) } })
  ok('유리 효과 (뒤가 흐리게) + 둥근 모서리', /blur/.test(look.blur) && look.radius >= 20, JSON.stringify(look))
  ok('첫 탭에 표시', Math.abs(await indicatorX()) < 1)

  // ── 2. 오늘 근무 그라데이션 카드 ──
  const hero = p.locator('[data-today-hero]')
  ok('오늘 근무 카드: 그라데이션 + 출퇴근·서명 버튼', (await hero.count()) === 1 && /gradient/.test(await hero.evaluate((el) => getComputedStyle(el).backgroundImage)) && /출퇴근 →|서명 →|종료 →/.test(await hero.innerText()))
  ok('글자가 하얀색 (그라데이션 위에서 잘 보임)', (await hero.evaluate((el) => getComputedStyle(el).color)) === 'rgb(255, 255, 255)')

  // ── 3. 다른 탭을 누르면 표시가 옮겨 감 ──
  await p.locator('nav[data-bottom-nav] a[href="/community"]').click()
  await p.waitForURL(/\/community/, { timeout: 8000 }).catch(() => {})
  await p.waitForTimeout(700)
  const w = (await p.locator('[data-tab-indicator]').boundingBox())?.width ?? 0
  const x = await indicatorX()
  ok('커뮤니티(3번째)로 표시가 옮겨 감', w > 0 && Math.abs(x - 2 * w) < 2, `x=${x} w=${w}`)
  ok('커뮤니티 탭 켜짐', (await p.locator('nav[data-bottom-nav] a[aria-current=page]').getAttribute('href')) === '/community')

  // ── 4. 맨 위로 버튼·글이 탭에 가리지 않음 ──
  await p.locator('[data-post-list]').waitFor({ timeout: 10000 }).catch(() => {})
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await p.locator('[data-scroll-top]').waitFor({ timeout: 4000 }).catch(() => {})
  const nb = await bar(), st = await p.locator('[data-scroll-top]').boundingBox()
  ok('맨 위로 버튼이 탭 위에', !!nb && !!st && st.y + st.height <= nb.y, JSON.stringify({ st, nb }))
  const last = await p.locator('[data-post]').last().boundingBox()
  ok('맨 아래 글이 탭에 가리지 않음', !!last && last.y + last.height <= nb.y, JSON.stringify(last))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 5. 내 근무 ──
  await p.locator('nav[data-bottom-nav] a[href="/me"]').click()
  await p.waitForURL(/\/me$/, { timeout: 8000 }).catch(() => {})
  await p.waitForTimeout(700)
  ok('내 근무(2번째)로 표시', Math.abs((await indicatorX()) - w) < 2)
  ok('내 근무 360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
