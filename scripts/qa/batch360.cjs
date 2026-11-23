// 묶음 360 (정기 개선 2026-11-23 10:35 KST · 주간 근무·주휴: 숫자에서 내역으로 바로 + 주 바꾸기 움직임)
// · '예상 인건비' 칸을 누르면 아래 '공고별' 목록으로, '주휴수당 · n명' 칸을 누르면 '근무자별' 목록으로 (내려간 칸 테두리가 한 번 퍼짐)
//   - 두 칸은 눌리는 카드(누름 반응) · 제목 끝에 '›' · 숫자·계산은 그대로
// · 주를 바꾸면 날짜가 톡(0.25초) · 숫자 칸이 살짝 올라옴(0.25초) · 움직임 줄이기면 바로 (정산·신고자료 달 바꾸기와 같은 움직임)
// node scripts/qa/batch360.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }
  const anim = (loc) => loc.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])

  const a = await mk(A)
  await go(a, '/admin/weekly')
  const tiles = a.locator('[data-weekly-tiles]')
  await tiles.waitFor({ timeout: 15000 }).catch(() => {})
  const labor = a.locator('[data-weekly-tile="labor"]'), holi = a.locator('[data-weekly-tile="holiday"]')

  // ── 1. 숫자 칸: 눌리는 카드 + 목록으로 가는 주소
  ok("'예상 인건비 ›' → 공고별 목록", (await labor.getAttribute('href')) === '#weekly-jobs' && one(await labor.locator('p').first().innerText()) === '예상 인건비 ›', one(await labor.innerText()))
  ok("'주휴수당 · n명 ›' → 근무자별 목록", (await holi.getAttribute('href')) === '#weekly-people' && /^주휴수당 · \d+명 ›$/.test(one(await holi.locator('p').first().innerText())), one(await holi.innerText()))
  ok('숫자는 그대로 (…원)', one(await labor.locator('p').nth(1).innerText()).endsWith('원') && one(await holi.locator('p').nth(1).innerText()).endsWith('원'))
  ok('누름 반응 있는 카드 (눌렀을 때 줄어듦)', (await labor.evaluate((el) => getComputedStyle(el).transitionDuration)) !== '0s')
  ok('두 칸 한 줄 · 같은 높이', await tiles.evaluate((el) => { const [x, y] = el.children; const r1 = x.getBoundingClientRect(), r2 = y.getBoundingClientRect(); return Math.abs(r1.top - r2.top) < 1 && Math.abs(r1.height - r2.height) < 1 }))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/weekly-top.png` })

  // 주휴 칸 → 근무자별 목록 (테두리 한 번 퍼짐)
  await holi.click()
  await a.waitForTimeout(500)
  ok('주휴 칸을 누르면 근무자별 목록으로', new URL(a.url()).hash === '#weekly-people')
  const people = a.locator('#weekly-people')
  ok('근무자별 목록 테두리가 한 번 퍼짐', (await people.evaluate((el) => getComputedStyle(el).animationName)) === 'flash-ring')
  ok('근무자별 목록이 화면 안에 보임', await people.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 100 }))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/weekly-people.png` })
  // 인건비 칸 → 공고별 목록
  await a.evaluate(() => scrollTo(0, 0))
  await labor.click()
  await a.waitForTimeout(500)
  ok('인건비 칸을 누르면 공고별 목록으로', new URL(a.url()).hash === '#weekly-jobs' && (await a.locator('#weekly-jobs').evaluate((el) => getComputedStyle(el).animationName)) === 'flash-ring')

  // ── 2. 주 바꾸기 움직임
  await go(a, '/admin/weekly')
  const range = a.locator('[data-week-range]')
  ok('날짜 톡 0.25초', JSON.stringify(await anim(range)) === '["pop","0.25s"]', JSON.stringify(await anim(range)))
  ok('숫자 칸 올라옴 0.25초', JSON.stringify(await anim(a.locator('[data-weekly-tiles]'))) === '["rise","0.25s"]', JSON.stringify(await anim(a.locator('[data-weekly-tiles]'))))
  const before = one(await range.innerText())
  await Promise.all([a.waitForURL((u) => u.searchParams.has('w'), { timeout: 15000 }).catch(() => {}), a.locator('[data-week-next]').click()])
  await a.waitForLoadState('networkidle')
  await a.waitForTimeout(400)
  const after = one(await a.locator('[data-week-range]').innerText())
  ok('다음 주로 바뀜 (날짜 다시 톡)', before !== after && after.startsWith('이번 주로') && (await anim(a.locator('[data-week-range]')))[0] === 'pop', `${before} → ${after}`)
  ok('다음 주에도 숫자 칸 → 목록 주소 그대로', (await a.locator('[data-weekly-tile="holiday"]').getAttribute('href')) === '#weekly-people')

  // ── 3. 움직임 줄이기: 바로
  const rm = await mk(A, { reducedMotion: 'reduce' })
  await go(rm, '/admin/weekly#weekly-people')
  const [r1, r2, r3] = await rm.evaluate(() => ['[data-week-range]', '[data-weekly-tiles]', '#weekly-people'].map((s) => parseFloat(getComputedStyle(document.querySelector(s)).animationDuration) || 0))
  ok('움직임 줄이기: 톡·올라옴·퍼짐 없이 바로', r1 < 0.05 && r2 < 0.05 && r3 < 0.05, `${r1} ${r2} ${r3}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
