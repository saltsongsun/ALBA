// 묶음 248 (정기 개선 2026-11-14 13:35 KST)
// · 출퇴근 탭: 명단 줄에 '· 지각 n' — 누르면 지각한 사람만 (줄마다 붙는 '지각 n분' 배지와 같은 기준: 시작보다 5분 넘게 늦음) · 한 번 더 누르면 전체
// · 새 회사 시작: 환영 한 줄을 짧게 ('아래 순서대로 하나씩 하면 돼요' — 할 일은 바로 아래 '해피워크 시작하기'에 있으니 같은 안내 두 번 없이)
//   회사 이름 받침에 맞게 '로/으로' (한빛산업으로 · 새봄이벤트로)
// node scripts/qa/batch248.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003', AP_APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const at = (day, hm) => new Date(`${day}T${hm}:00+09:00`).toISOString()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const today = kst(0)
  // 09:00 시작 · 근무자는 09:20 출근(지각 20분) · 김지원은 08:58 출근(제시간)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '09:00:00', end_time: '18:00:00' })
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', available_dates: null, position: 'B게이트' })
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { work_date: today, clock_in: at(today, '09:20'), clock_out: null })
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000002480a1', job_id: J, user_id: AP, work_date: today, clock_in: at(today, '08:58'), clock_out: null, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, note: null, source: 'app', confirmed: false, paid: false, ot_minutes: 0, ot_status: null, ot_by: null, sched_start: null, sched_end: null })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const base = `${D}/admin/jobs/${J}?tab=att&date=${today}`
  const late = a.locator('[data-att-stat=late]')
  const rows = () => a.locator('[data-att-row]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getAttribute('data-att-row')))

  // ── 1. 명단 줄 '· 지각 1'
  await a.goto(base, { waitUntil: 'networkidle' })
  await late.waitFor({ timeout: 15000 }).catch(() => {})
  ok("명단 줄에 '· 지각 1' (2명 중 근무자만 늦음)", one(await late.innerText().catch(() => '')) === '· 지각 1', one(await late.innerText().catch(() => '')))
  ok('처음엔 2명 다 보임', (await rows()).length === 2, JSON.stringify(await rows()))
  ok("근무자 줄에 '지각 20분' 배지 (같은 기준)", one(await a.locator(`[data-att-row="${W}"]`).innerText()).includes('지각 20분'))
  ok('명단 줄은 한 줄 (360px)', await a.locator('[data-att-stat=late]').evaluate((el) => el.parentElement.getClientRects().length === 1 && el.getClientRects().length === 1))
  if (SHOTS) {
    await late.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    const bx = await a.locator('[data-att-stat=working]').locator('xpath=ancestor::div[contains(@class,"card")][1]').boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/att-late-link.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(260, bx.height + 16) } }).catch(() => {})
  }

  // ── 2. 누르면 지각한 사람만
  await late.click()
  await a.waitForURL((u) => new URL(u).searchParams.get('st') === 'late', { timeout: 10000 }).catch(() => {})
  await a.locator('[data-att-stat-on=late]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('누르면 지각한 근무자만 (1명)', JSON.stringify(await rows()) === JSON.stringify([W]), JSON.stringify(await rows()))
  ok("'지각 1명만 보는 중 · 전체 보기'", one(await a.locator('[data-att-stat-on=late]').innerText().catch(() => '')) === '지각 1명만 보는 중 전체 보기', one(await a.locator('[data-att-stat-on=late]').innerText().catch(() => '')))
  ok('누른 링크는 켜진 모양 (aria-current)', (await late.getAttribute('aria-current')) === 'true')
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await a.waitForTimeout(300)
    await a.locator('[data-att-stat-on=late]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await a.evaluate(() => scrollBy(0, -170))
    await a.waitForTimeout(300)
    await a.screenshot({ path: `${SHOTS}/att-late-only.png` }).catch(() => {})
  }
  // 한 번 더 누르면 전체
  await late.click()
  await a.waitForURL((u) => !new URL(u).searchParams.get('st'), { timeout: 10000 }).catch(() => {})
  await a.waitForTimeout(500)
  ok('한 번 더 누르면 전체 (2명)', (await rows()).length === 2 && (await a.locator('[data-att-stat-on]').count()) === 0)

  // ── 3. 5분 안쪽이면 지각 아님 → 링크 없음
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { clock_in: at(today, '09:04') })
  await a.goto(base, { waitUntil: 'networkidle' })
  await a.locator('[data-att-stat=working]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("모두 5분 안에 왔으면 '지각' 링크 없음", (await late.count()) === 0)

  // ── 4. 새 회사 시작: 환영 한 줄 (받침에 맞게 '으로')
  const n = await (await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })).newPage()
  n.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await n.goto(`${D}/start`, { waitUntil: 'networkidle' })
  await n.fill('#company_name', '한빛산업')
  await n.fill('#business_no', '2208162517')
  await n.fill('#ceo_name', '김대표')
  await n.fill('#name', '박담당')
  await n.fill('#phone', '01024800001')
  await n.fill('#pin', '482917')
  await n.fill('#pin2', '482917')
  await n.check('input[name="agree_privacy"]')
  await n.click('button[type="submit"]:has-text("회사로 시작하기")')
  await n.waitForURL((u) => new URL(u).pathname === '/admin', { timeout: 20000 }).catch(() => {})
  await n.locator('[data-start-steps]').waitFor({ timeout: 15000 }).catch(() => {})
  const body = one(await n.locator('main').innerText().catch(() => ''))
  ok("환영: '한빛산업으로 시작했어요! 아래 순서대로 하나씩 하면 돼요.'", body.includes('한빛산업으로 시작했어요! 아래 순서대로 하나씩 하면 돼요.'), body.slice(0, 120))
  ok("같은 안내 두 번 없음 ('주소·직인을 채우고 첫 공고를 올려 보세요' 없음) · 바로 아래 '해피워크 시작하기'", !body.includes('주소·직인을 채우고') && (await n.locator('[data-start-steps]').count()) === 1)
  ok('360px 옆으로 안 밀림 (새 회사 첫 화면)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/newco-welcome.png`, clip: { x: 0, y: 0, width: 360, height: 640 } }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
