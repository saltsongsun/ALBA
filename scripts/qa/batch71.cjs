// 묶음 71: 대시보드 '확정 대기 지원자' — 5명까지 바로 보이고 나머지는 '나머지 N명 더보기'로 접어 둠
// · 제목 옆에 전체 인원 · 휴대폰 카드 · 넓은 화면 표 모두 · 5명 이하이면 '더보기' 없음
// node scripts/qa/batch71.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (desktop = false) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const ad = await pg()
  const cards = (p) => p.locator('#pending > div.sm\\:hidden > .card')

  // ── 1. 1명뿐이면 '더보기' 없음 ──
  await ad.goto(`${D}/admin`)
  await ad.locator('#pending').waitFor({ timeout: 10000 }).catch(() => {})
  ok('대기 1명: 카드 1개 · 더보기 없음', (await cards(ad).count()) === 1 && (await ad.locator('[data-pending-more]').count()) === 0)

  // ── 2. 7명 → 5명 + '나머지 2명 더보기' ──
  const [base] = (await rest('applications')).filter((a) => a.status === 'applied')
  for (let i = 1; i <= 6; i++) {
    const id = `11111111-0000-4000-8000-0000000071${String(i).padStart(2, '0')}`
    const uid = `bbbbbbbb-0000-4000-8000-0000000071${String(i).padStart(2, '0')}`
    await rest('applications', 'POST', { ...base, id, user_id: uid, created_at: new Date(Date.now() - i * 60e3).toISOString(), user: { ...base.user, id: uid, name: `대기자${i}`, phone: `0107100000${i}` } })
  }
  await ad.goto(`${D}/admin`)
  await ad.locator('[data-pending-more]').waitFor({ state: 'attached', timeout: 10000 }).catch(() => {})
  ok("제목 옆 전체 인원 '7'", (await ad.locator('#pending h2').innerText()).replace(/\s+/g, '').endsWith('7'), await ad.locator('#pending h2').innerText())
  ok('휴대폰: 처음엔 카드 5개만', (await cards(ad).count()) === 5)
  const sum = ad.locator('[data-pending-more] summary')
  ok("'나머지 2명 더보기'", (await sum.innerText()).includes('나머지 2명 더보기'), await sum.innerText())
  ok('접힌 2명은 아직 안 보임', !(await ad.locator('[data-pending-more] > div.sm\\:hidden > .card').first().isVisible()))
  await sum.click()
  await ad.waitForTimeout(300)
  ok("누르면 나머지 2명이 보이고 '접기'", (await ad.locator('[data-pending-more] > div.sm\\:hidden > .card').count()) === 2 && (await ad.locator('[data-pending-more] > div.sm\\:hidden > .card').first().isVisible()) && (await sum.innerText()).includes('접기'))
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 넓은 화면 표도 5줄 + 더보기 ──
  const wide = await pg(true)
  await wide.goto(`${D}/admin`)
  await wide.locator('#pending table').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('넓은 화면: 첫 표 5줄', (await wide.locator('#pending > div.card table tbody tr').count()) === 5)
  ok('넓은 화면: 더보기 안 표 2줄', (await wide.locator('[data-pending-more] table tbody tr').count()) === 2)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
