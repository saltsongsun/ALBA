// 묶음 103: 정기 개선 — 시작 전엔 '미출근'이 아니라 '출근 전' (출퇴근 탭 · 대시보드)
// · 출퇴근 탭: 오늘 시작 시각 전에는 숫자 칸 '출근 전'(회색) · 사람 줄 '출근 전' · '미출근 n명 문자/앱 알림' 없음 (공고 화면 큰 버튼과 같게)
// · 시작 시각이 지나면 '미출근'(빨강) · '미출근 n명 문자' 다시
// · 대시보드 오늘 행사 카드: 시작 전엔 '근무 중 0명' 대신 'HH:MM 시작' + 아래 '시작까지 n시간 n분'
// node scripts/qa/batch103.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kstNow = new Date(Date.now() + 9 * 3600e3)
const today = kstNow.toISOString().slice(0, 10)
const hour = kstNow.getUTCHours()
const pad = (n) => String(n).padStart(2, '0')

;(async () => {
  // 준비: 오늘 늦게 시작하는 행사 · 확정 1명(근무자) 아직 출근 안 함
  const late = hour < 22
  const startText = late ? `${pad(hour + 1)}:00` : '00:00'
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: `${startText}:00`, end_time: '23:59:00', status: 'closed' })
  await fetch(`${MD}/rest/v1/attendance?job_id=eq.${J}`, { method: 'DELETE' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const att = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`); await a.locator('main').waitFor(); await a.waitForTimeout(700) }

  if (late) {
    // ── 1. 시작 전: 출근 전 ──
    await att()
    const main = await a.locator('main').innerText()
    ok("출퇴근 탭 시작 전: '출근 전' (미출근 아님)", main.includes('출근 전') && !main.includes('미출근'), main.match(/.{0,8}(미출근|출근 전).{0,8}/g)?.join(' | '))
    ok("시작 전: '미출근 n명 문자·앱 알림' 없음 (전체 문자는 그대로)", (await a.getByText(/미출근 \d+명 (문자|앱 알림)/).count()) === 0 && (await a.getByText(/전체 \d+명 문자/).count()) >= 1)
    // ── 2. 대시보드 카드 ──
    await a.goto(`${D}/admin`)
    const before = a.locator('[data-today-before]').first()
    await before.waitFor({ timeout: 10000 }).catch(() => {})
    ok(`대시보드 오늘 행사: '${startText} 시작' + 아래 '시작까지 …' (근무 중 0명 대신)`, new RegExp(`^${startText} 시작\\s*시작까지 (\\d+시간( \\d+분)?|\\d+분)$`).test((await before.innerText().catch(() => '')).trim()), await before.innerText().catch(() => ''))
    ok("'확정 n명 · 모집 n명' 한 줄", await a.locator('[data-today-job]').first().getByText(/확정 \d+명 · 모집 \d+명/).evaluate((el) => el.getBoundingClientRect().height < 24))
    ok('360px: 옆으로 안 밀림 (대시보드)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  } else ok('(밤 10시 이후라 시작 전 확인은 건너뜀)', true)

  // ── 3. 시작 시각이 지나면 미출근 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00' })
  await att()
  const main2 = await a.locator('main').innerText()
  ok("시작 뒤: '미출근' + '미출근 1명 문자'", main2.includes('미출근') && (await a.getByText(/미출근 1명 문자/).count()) >= 1)
  await a.goto(`${D}/admin`)
  await a.locator('[data-today-job]').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("시작 뒤 대시보드: '근무 중 0명' (시작 전 표시 없음)", (await a.locator('[data-today-before]').count()) === 0 && (await a.locator('[data-today-job]').first().innerText()).includes('근무 중'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
