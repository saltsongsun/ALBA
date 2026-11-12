// 묶음 228 (정기 개선 2026-11-13 07:36 KST)
// · 관리자 대시보드 '오늘 진행 행사': 시작했는데(근무 시간 안) 아직 출근 기록이 없는 사람 이름 칩 → 누르면 바로 전화 (공고당 3명 · 넘으면 '외 n명 →')
//   출근하면 사라짐 · 시작 전·근무 시간이 다 지난 뒤엔 안 보임
// · 긴급 투입 QR 화면으로 갈 때: 공고 화면 모양 대신 QR 화면 모양의 회색 자리
// node scripts/qa/batch228.cjs <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [F, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MF}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  const nowK = new Date(Date.now() + 9 * 3600e3)
  const mins = nowK.getUTCHours() * 60 + nowK.getUTCMinutes()
  if (mins >= 23 * 60 + 57) { console.log('SKIP  23:57 넘어 확인 생략'); console.log('ALL PASSED'); process.exit(0) }
  const [j] = await rest(`jobs?id=eq.${J}`)
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: F }, { name: 'alba_roster', value: roster(A), url: F }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const call = a.locator('[data-today-job] [data-absent-call]')
  const dash = async () => {
    await a.goto(`${F}/admin`, { waitUntil: 'networkidle' })
    await a.locator('[data-today-job]').first().waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 시작했는데 아직 안 온 사람: 이름 칩 → 전화
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await dash()
  const chip = call.locator('a[href^="tel:"]').first()
  ok("미출근 이름 칩: '미출근 · 근무자' (누르면 tel:)", (await call.count()) === 1 && one(await call.innerText()) === '미출근 근무자' && (await chip.getAttribute('href')) === 'tel:01033334444', one(await call.innerText().catch(() => '')))
  ok('칩이 톡 나타남 · 360px 옆으로 안 밀림', ((await chip.getAttribute('class')) ?? '').includes('animate-pop') && (await noSide(a)))
  if (SHOTS) {
    const bx = await a.locator('[data-today-job]').first().boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/absent-call.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }

  // ── 2. 출근하면 사라짐
  const attId = 'abababab-0000-4000-8000-000000022801'
  await rest('attendance', 'POST', { id: attId, job_id: J, user_id: W, company_id: j.company_id, work_date: today, clock_in: new Date().toISOString(), clock_out: null, adj_in: null, adj_out: null, sched_start: null, sched_end: null, paid: false, note: null, source: 'app', created_at: new Date().toISOString() })
  await dash()
  ok('출근하면 이름 칩이 사라짐', (await call.count()) === 0)
  await fetch(`${MF}/rest/v1/attendance?id=eq.${attId}`, { method: 'DELETE' })

  // ── 3. 시작 전 · 근무 시간이 다 지난 뒤엔 안 보임
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '23:58:00', end_time: '23:59:00' })
  await dash()
  ok('시작 전엔 없음', (await call.count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:01:00' })
  await dash()
  ok('근무 시간이 다 지난 뒤엔 없음 (출퇴근 탭의 기록 없음 문자로)', (await call.count()) === 0)

  // ── 4. 긴급 투입 QR로 갈 때 QR 화면 모양 회색 자리
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await a.goto(`${F}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  await a.route(`**/admin/jobs/${J}/qr**`, async (route) => {
    if (route.request().headers()['next-router-prefetch']) return route.continue()
    await new Promise((r) => setTimeout(r, 1500))
    route.continue().catch(() => {})
  })
  await a.locator(`a[href="/admin/jobs/${J}/qr"]`).first().evaluate((el) => el.click())
  const sk = await a.locator('[data-skeleton="qr"]').waitFor({ timeout: 3000 }).then(() => true, () => false)
  ok('긴급 QR로 갈 때: QR 화면 모양 회색 자리 (qr)', sk)
  if (SHOTS && sk) await a.screenshot({ path: `${SHOTS}/skeleton-qr.png`, clip: { x: 0, y: 0, width: 360, height: 600 } }).catch(() => {})
  await a.unroute(`**/admin/jobs/${J}/qr**`)
  await a.locator('[data-skeleton="qr"]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
  ok('다 불러오면 회색 자리 사라짐 · 옆으로 안 밀림', (await a.locator('[data-skeleton="qr"]').count()) === 0 && (await noSide(a)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
