// 묶음 225 (정기 개선 2026-11-13 02:41 KST)
// · 출퇴근 탭: 그날 근무 시간이 다 지났으면(지난 날 · 오늘 종료 시각 뒤) 출근 기록 없는 사람에게
//   '미출근 n명 문자(도착하면 근무 시작을 눌러 주세요)' 대신 '기록 없음 n명 문자(근무하셨다면 알려 주세요)' · '근무 시작 버튼' 보내기는 숨김
//   — 이미 끝난 근무에 '근무 시작'을 누르라고 보내지 않게 · 근무 중인 날은 전과 같음
// · 근무자 한 사람 화면으로 갈 때: 일반 카드 대신 그 화면 모양의 회색 자리 (사진·이름·정보 줄·접힌 칸)
// node scripts/qa/batch225.cjs <fresh 앱> <fresh 가짜> <shots>
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
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: F }, { name: 'alba_roster', value: roster(A), url: F }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async () => {
    await a.goto(`${F}/admin/jobs/${J}?tab=att&date=${today}`, { waitUntil: 'networkidle' })
    await a.getByText('전체 1명 문자').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const absentSms = a.locator('a[href^="sms:"]', { hasText: /명 문자/ }).filter({ hasNotText: '전체' })

  // ── 1. 근무 중인 날 (0시~23:59): 전과 같음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await open()
  ok("근무 중: '미출근 1명 문자' (파란 칩 · 도착하면 근무 시작)", one(await absentSms.first().innerText().catch(() => '')) === '미출근 1명 문자' && ((await absentSms.first().getAttribute('class')) ?? '').includes('chip-primary') && decodeURIComponent((await absentSms.first().getAttribute('href')) ?? '').includes("'근무 시작'을 눌러 주세요"))
  ok("근무 중: '미출근 1명 · 근무 시작 버튼' 있음", (await a.getByRole('button', { name: '미출근 1명 · 근무 시작 버튼' }).count()) === 1)

  // ── 2. 그날 근무 시간이 다 지남 (0시~0시 1분)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '00:01:00' })
  await open()
  const t = one(await absentSms.first().innerText().catch(() => ''))
  const href = decodeURIComponent((await absentSms.first().getAttribute('href')) ?? '')
  ok("근무 끝: '기록 없음 1명 문자' (회색 칩)", t === '기록 없음 1명 문자' && !((await absentSms.first().getAttribute('class')) ?? '').includes('chip-primary'), t)
  ok("문자 내용: '… 근무의 출퇴근 기록이 없어요. 근무하셨다면 이 문자로 알려 주세요.'", href.includes('근무의 출퇴근 기록이 없어요. 근무하셨다면 이 문자로 알려 주세요.') && !href.includes("'근무 시작'을 눌러"), href.slice(0, 120))
  ok("근무 끝: '근무 시작 버튼' 보내기 없음", (await a.getByRole('button', { name: /근무 시작 버튼/ }).count()) === 0)
  ok('360px 옆으로 안 밀림 (출퇴근 탭)', await noSide(a))
  if (SHOTS) {
    await absentSms.first().scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(300)
    const bx = await absentSms.first().locator('xpath=..').boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/no-record.png`, clip: { x: 0, y: Math.max(0, bx.y - 120), width: 360, height: 200 } }).catch(() => {})
  }
  // ── 3. 지난 날도 같은 기준
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(-1), end_date: today, end_time: '23:59:00' })
  await a.goto(`${F}/admin/jobs/${J}?tab=att&date=${kst(-1)}`, { waitUntil: 'networkidle' })
  await a.getByText(/전체 \d+명 문자/).first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("지난 날(어제): '기록 없음 n명 문자' · 근무 시작 버튼 없음", /^기록 없음 \d+명 문자$/.test(one(await absentSms.first().innerText().catch(() => ''))) && (await a.getByRole('button', { name: /근무 시작 버튼/ }).count()) === 0, one(await absentSms.first().innerText().catch(() => '')))

  // ── 4. 근무자 한 사람 화면으로 갈 때 그 화면 모양의 회색 자리
  await a.goto(`${F}/admin/workers`, { waitUntil: 'networkidle' })
  await a.route(`**/admin/workers/${W}**`, async (route) => {
    if (route.request().headers()['next-router-prefetch']) return route.continue()
    await new Promise((r) => setTimeout(r, 1500))
    route.continue().catch(() => {})
  })
  await a.locator(`a[href="/admin/workers/${W}"]`).first().evaluate((el) => el.click())
  const sk = await a.locator('[data-skeleton="worker"]').waitFor({ timeout: 3000 }).then(() => true, () => false)
  ok('근무자 한 사람으로 갈 때: 그 화면 모양 회색 자리 (worker)', sk)
  if (SHOTS && sk) await a.screenshot({ path: `${SHOTS}/skeleton-worker.png`, clip: { x: 0, y: 0, width: 360, height: 560 } }).catch(() => {})
  await a.unroute(`**/admin/workers/${W}**`)
  await a.waitForURL((u) => new URL(u).pathname === `/admin/workers/${W}`, { timeout: 15000 }).catch(() => {})
  await a.locator('[data-skeleton="worker"]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
  ok('다 불러오면 회색 자리 사라짐 · 옆으로 안 밀림', (await a.locator('[data-skeleton="worker"]').count()) === 0 && (await noSide(a)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
