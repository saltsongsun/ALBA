// 묶음 389 (정기 개선 2026-11-25 15:35 KST)
// 공고 목록: 남은 날이 모두 확정으로 다 찼는데 대기자가 남은 모집 중 공고 → '✓ 다 참' 배지 (대기 n명 앞 · 톡)
// · 여러 날 행사는 날짜별로 (지원자 탭 '✓ 인원 다 참'과 같은 기준) — 하루만 찬 공고는 배지 없음
// · 다 찬 공고는 사람 막대가 초록 · 대기자가 없으면 배지 없이 막대만 초록
// · 누르면 지원자 탭: '🙏 대기 n명 미선발 알림'이 먼저 · PC 표 '대기' 칸에도 같은 배지 · 360px 옆으로 안 밀림
// node scripts/qa/batch389.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-000000038902', J3 = 'cccccccc-0000-4000-8000-000000038903', J4 = 'cccccccc-0000-4000-8000-000000038904'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const d2 = kst(2), d3 = kst(3)
  const [j0] = await rest(`jobs?id=eq.${J}`)
  // J: 하루 행사 · 1명 모집 · 확정 1 + 대기 1 → 다 참 + 대기
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d2, end_date: d2, status: 'open', headcount: 1, applications: [{ status: 'approved', available_dates: null }, { status: 'applied', available_dates: null }] })
  const base = { ...j0, start_date: d2, end_date: d3, status: 'open', headcount: 1, created_at: new Date().toISOString() }
  // J2: 이틀 행사 · 첫날만 1명 확정 · 대기 1 → 둘째 날이 비어서 다 안 참
  await rest('jobs', 'POST', { ...base, id: J2, title: '이틀 행사 한쪽만389', applications: [{ status: 'approved', available_dates: [d2] }, { status: 'applied', available_dates: null }] })
  // J3: 이틀 행사 · 날마다 1명씩 확정 · 대기 1 → 다 참 + 대기
  await rest('jobs', 'POST', { ...base, id: J3, title: '이틀 행사 다 참389', applications: [{ status: 'approved', available_dates: [d2] }, { status: 'approved', available_dates: [d3] }, { status: 'applied', available_dates: null }] })
  // J4: 하루 행사 · 다 참 · 대기 없음 → 배지 없이 막대만 초록
  await rest('jobs', 'POST', { ...base, id: J4, end_date: d2, title: '대기 없는 다 참389', applications: [{ status: 'approved', available_dates: null }] })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' })
  const card = (id) => a.locator(`div.lg\\:hidden a[href="/admin/jobs/${id}"]`)
  await card(J).waitFor({ timeout: 15000 }).catch(() => {})
  const green = (id) => card(id).evaluate((el) => el.querySelectorAll('[data-filled] .bg-emerald-500, [role=img] .bg-emerald-500').length > 0).catch(() => false)
  const badge = card(J).locator('[data-job-full]')
  ok("하루 행사 다 참 + 대기 1명: '✓ 다 참' 배지 (대기 1명 앞 · 톡)", one(await badge.innerText().catch(() => '')) === '✓ 다 참' && ((await badge.getAttribute('class')) ?? '').includes('animate-pop') && (await badge.evaluate((el) => { const w = [...el.parentElement.children].find((c) => /^대기 \d+명$/.test(c.textContent.trim())); return !!w && !!(el.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) }).catch(() => false)))
  ok('다 찬 공고는 사람 막대가 초록', await green(J))
  ok('이틀 행사인데 첫날만 참: 배지 없음 · 막대 초록 아님', (await card(J2).locator('[data-job-full]').count()) === 0 && !(await green(J2)) && (await card(J2).count()) === 1)
  ok('이틀 행사 날마다 다 참 + 대기: 배지 있음 · 막대 초록', (await card(J3).locator('[data-job-full]').count()) === 1 && (await green(J3)))
  ok('대기자가 없으면 배지 없이 막대만 초록', (await card(J4).locator('[data-job-full]').count()) === 0 && (await green(J4)) && (await card(J4).count()) === 1)
  ok('360px 옆으로 안 밀림 (공고 목록)', await noSide(a))
  if (SHOTS) {
    await card(J).scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(400)
    const bx = await card(J).boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/jobs-full.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(bx.height + 16, 420) } }).catch(() => {})
  }
  // 누르면 지원자 탭 (근무 날이 아니라 기본 탭) → 미선발 알림이 먼저
  await Promise.all([a.waitForURL(new RegExp(`/admin/jobs/${J}`), { timeout: 30000 }).catch(() => {}), card(J).click()])
  await a.locator('[data-apps-head]').waitFor({ timeout: 15000 }).catch(() => {})
  const settle = a.locator('[data-settle-first] button')
  ok("들어가면 지원자 탭 '🙏 대기 1명 미선발 알림' 파란 버튼이 먼저", one(await settle.innerText().catch(() => '')) === '🙏 대기 1명 미선발 알림' && ((await settle.getAttribute('class')) ?? '').includes('btn-primary'))

  // PC 표: '대기' 칸에도 같은 배지
  const pc = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' })
  await pc.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p2 = await pc.newPage()
  p2.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p2.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' })
  const row = (id) => p2.locator('table tbody tr', { has: p2.locator(`a[href="/admin/jobs/${id}"]`) })
  ok("PC 표 '대기' 칸: 다 찬 공고만 '✓ 다 참'", (await row(J).locator('[data-job-full]').count()) === 1 && (await row(J3).locator('[data-job-full]').count()) === 1 && (await row(J2).locator('[data-job-full]').count()) === 0 && (await row(J4).locator('[data-job-full]').count()) === 0)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
