// 묶음 163 (정기 개선 2026-11-09 14:35)
// · 마지막 날 근무까지 끝난 행사는 대시보드 '인원이 모자라요'에서 빠짐 (밤에 '진행 중인데 인원이 모자라요 · 대기 1명 확정하러 가기'가 남던 것)
// · 출퇴근 탭: 그날 근무가 끝났으면 'n명 부족 · 이날 가능한 대기자 →' 안 띄움 (날짜 칩의 빨간 점도)
// · 행사 종료하기 아래 안내: 미출근이 있으면 '모두 퇴근했어요' 대신 '미출근 n명은 기록 없이 끝나요 · 누르면 정산으로 넘어가요'
// node scripts/qa/batch163.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 확정 1명/모집 5명 (부족) · 근무자는 출근 안 함 (미출근 1)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const kst = new Date(Date.now() + 9 * 3600e3)
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  const shortBanner = () => a.getByText(/명 부족/).count()

  // ── 1. 오늘(마지막 날) 근무 00:00~00:30이 끝남
  if (mins < 35) console.log('SKIP  00:35 전이라 끝난 행사 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:30:00' })
    await a.goto(`${D}/admin`)
    await a.locator('#pending, [data-dash-stats]').first().waitFor({ timeout: 15000 }).catch(() => {})
    ok("끝난 행사: 대시보드 '인원이 모자라요' 없음", (await a.locator('[data-shortage]').count()) === 0)
    await a.goto(`${D}/admin/jobs/${J}?tab=att`)
    await a.locator('[data-job-counts]').first().waitFor({ timeout: 15000 }).catch(() => {})
    ok("끝난 날: 출퇴근 탭 'n명 부족 · 대기자 →' 없음", (await shortBanner()) === 0)
    const hint = a.locator('[data-job-end-hint]')
    ok("행사 종료하기 아래 '미출근 1명은 기록 없이 끝나요 · 누르면 정산으로 넘어가요'", (await hint.innerText().catch(() => '')) === '미출근 1명은 기록 없이 끝나요 · 누르면 정산으로 넘어가요', await hint.innerText().catch(() => ''))
    ok('안내 한 줄 · 360px 옆으로 안 밀림', (await hint.evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
    if (SHOTS) await a.locator('[data-job-end-hint]').locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/end-hint.png` }).catch(() => {})
  }

  // ── 2. 아직 근무 시간 안 (끝 23:59) → 예전처럼 부족 알림
  if (mins >= 23 * 60 + 58) console.log('SKIP  23:58 넘어 근무 시간 안 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
    await a.goto(`${D}/admin`)
    await a.locator('[data-shortage]').waitFor({ timeout: 15000 }).catch(() => {})
    ok("근무 시간 안: 대시보드 '인원이 모자라요' 그대로", (await a.locator('[data-shortage]').count()) === 1)
    await a.goto(`${D}/admin/jobs/${J}?tab=att`)
    await a.getByText(/명 부족/).first().waitFor({ timeout: 15000 }).catch(() => {})
    ok("근무 시간 안: 출퇴근 탭 '4명 부족' 그대로", (await shortBanner()) > 0)
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
