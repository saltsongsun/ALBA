// 묶음 391 (정기 개선 2026-11-25 17:35 KST)
// 관리자 홈 '진행·예정 공고' 카드: 공고 목록과 같은 기준(lib/fullness · 지원자 탭 '✓ 인원 다 참'과 같음)
// · 남은 날이 모두 확정으로 다 찬 공고는 사람 막대가 초록
// · 모집 중인데 대기자가 남으면 '✓ 다 참 · 대기 n명' (톡) — 마감한 공고·대기 없는 공고·하루만 찬 이틀 행사는 배지 없음
// · 누르면 지원자 탭 '미선발 알림'이 먼저 · 360px 옆으로 안 밀림 · 카드 한 줄 그대로
// node scripts/qa/batch391.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-000000039102', J3 = 'cccccccc-0000-4000-8000-000000039103', J4 = 'cccccccc-0000-4000-8000-000000039104', J5 = 'cccccccc-0000-4000-8000-000000039105'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const d2 = kst(2), d3 = kst(3)
  const [j0] = await rest(`jobs?id=eq.${J}`)
  // J: 하루 행사 · 1명 모집 · 확정 1 + 대기 1 → 다 참 + 대기 1명 (지원자 탭이 읽는 실제 지원과 같은 수)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d2, end_date: d2, status: 'open', headcount: 1, applications: [{ status: 'approved', available_dates: null }, { status: 'applied', available_dates: null }] })
  const base = { ...j0, start_date: d2, end_date: d3, status: 'open', headcount: 1, created_at: new Date().toISOString() }
  // J2: 이틀 행사 · 첫날만 확정 · 대기 1 → 다 안 참
  await rest('jobs', 'POST', { ...base, id: J2, title: '이틀 한쪽만391', applications: [{ status: 'approved', available_dates: [d2] }, { status: 'applied', available_dates: null }] })
  // J3: 이틀 행사 · 날마다 확정 · 대기 1 → 다 참 + 대기 1명
  await rest('jobs', 'POST', { ...base, id: J3, title: '이틀 다 참391', applications: [{ status: 'approved', available_dates: [d2] }, { status: 'approved', available_dates: [d3] }, { status: 'applied', available_dates: null }] })
  // J4: 하루 행사 · 다 참 · 대기 없음 → 배지 없이 막대만 초록
  await rest('jobs', 'POST', { ...base, id: J4, end_date: d2, title: '대기 없음391', applications: [{ status: 'approved', available_dates: null }] })
  // J5: 마감한 공고 · 다 참 + 대기 1 → 배지 없음 ('모집마감' 그대로) · 막대 초록
  await rest('jobs', 'POST', { ...base, id: J5, end_date: d2, status: 'closed', title: '마감 다 참391', applications: [{ status: 'approved', available_dates: null }, { status: 'applied', available_dates: null }] })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const card = (id) => a.locator(`[data-dash-active] a[href="/admin/jobs/${id}"]`)
  await card(J).waitFor({ timeout: 15000 }).catch(() => {})
  const green = (id) => card(id).evaluate((el) => el.querySelectorAll('[role=img] .bg-emerald-500').length > 0).catch(() => false)
  const badge = card(J).locator('[data-dash-full]')
  ok("하루 행사 다 참 + 대기 1명: '✓ 다 참 · 대기 1명' (톡) · 막대 초록", one(await badge.innerText().catch(() => '')) === '✓ 다 참 · 대기 1명' && ((await badge.getAttribute('class')) ?? '').includes('animate-pop') && (await green(J)), one(await card(J).innerText().catch(() => '')))
  ok('이틀 행사 첫날만 참: 배지 없음 · 막대 초록 아님', (await card(J2).count()) === 1 && (await card(J2).locator('[data-dash-full]').count()) === 0 && !(await green(J2)))
  ok("이틀 행사 날마다 다 참 + 대기 1명: '✓ 다 참 · 대기 1명' · 막대 초록", one(await card(J3).locator('[data-dash-full]').innerText().catch(() => '')) === '✓ 다 참 · 대기 1명' && (await green(J3)))
  ok('대기 없는 다 찬 공고: 배지 없이 막대만 초록', (await card(J4).count()) === 1 && (await card(J4).locator('[data-dash-full]').count()) === 0 && (await green(J4)))
  ok("마감한 공고: '모집마감' 그대로 · 다 참 배지 없음 · 막대 초록", one(await card(J5).innerText().catch(() => '')).includes('모집마감') && (await card(J5).locator('[data-dash-full]').count()) === 0 && (await green(J5)))
  const line = await card(J).locator('p.mt-1').evaluate((el) => el.getBoundingClientRect().height).catch(() => 99)
  ok("360px 옆으로 안 밀림 · '확정 1/1명 ✓ 다 참 · 대기 1명' 한 줄", (await noSide(a)) && line < 30, String(line))
  if (SHOTS) {
    await card(J).scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(400)
    const bx = await card(J).boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/dash-full.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(bx.height + 16, 300) } }).catch(() => {})
  }
  await Promise.all([a.waitForURL(new RegExp(`/admin/jobs/${J}`), { timeout: 30000 }).catch(() => {}), card(J).click()])
  await a.locator('[data-apps-head]').waitFor({ timeout: 15000 }).catch(() => {})
  const settle = a.locator('[data-settle-first] button')
  ok("누르면 지원자 탭 '🙏 대기 1명 미선발 알림' 파란 버튼이 먼저", one(await settle.innerText().catch(() => '')) === '🙏 대기 1명 미선발 알림' && ((await settle.getAttribute('class')) ?? '').includes('btn-primary'))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
