// 여러 날 행사에서 내 근무일이 아닌 날: 근무 시작을 접어 두고 다음 근무일 안내 · 예정된 근무에 내 근무일 표시
// node scripts/qa/off-day.cjs <fresh 앱> <fresh 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [F, MF] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const [d0, d1, d2] = [day(0), day(1), day(2)]
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})` }
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MF}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(WK), url: F }, { name: 'alba_roster', value: roster(WK), url: F }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const startBtn = () => p.getByRole('button', { name: '근무 시작', exact: true })

  // 3일 행사 중 오늘은 뺀 날 (내일·모레만 근무)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d0, end_date: d2, start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${WK}`, 'PATCH', { available_dates: [d1, d2] })
  await p.goto(`${F}/me`)
  ok('오늘은 내 근무일이 아니에요', await see(p, '오늘은 내 근무일이 아니에요'))
  ok('다음 근무일 안내', await see(p, `다음 근무일은 ${fmt(d1)}이에요.`))
  ok('근무 시작은 접혀 있음', !(await startBtn().isVisible()))
  ok('늦어요 알림도 없음', !(await see(p, '늦을 것 같아요', 800)))
  await p.getByText('담당자가 오늘 나와 달라고 했나요?').click()
  ok('펼치면 근무 시작 가능', await startBtn().waitFor({ timeout: 5000 }).then(() => true, () => false), await p.locator('details', { hasText: '나와 달라고' }).evaluate((d) => `open=${d.open}`).catch((e) => e.message))

  // 모든 날 근무: 평소처럼 바로 근무 시작
  await rest(`applications?job_id=eq.${J}&user_id=eq.${WK}`, 'PATCH', { available_dates: null })
  await p.goto(`${F}/me`)
  ok('근무일이면 근무 시작 바로 보임', (await startBtn().waitFor({ timeout: 8000 }).then(() => true, () => false)) && !(await see(p, '오늘은 내 근무일이 아니에요', 800)))

  // 내일 시작하는 행사에서 모레만 근무: 예정 카드에 D-2와 내 근무일
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d1, end_date: d2 })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${WK}`, 'PATCH', { available_dates: [d2] })
  await p.goto(`${F}/me`)
  ok('다음 근무: 첫 근무일 기준 D-2', await see(p, 'D-2'))
  ok('내 근무일 표시 (달력 아이콘 + 날짜)', await see(p, `내 근무일 ${fmt(d2)}`))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
