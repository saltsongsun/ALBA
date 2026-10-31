// 여러 날 행사: 날짜별 확정 인원 · 모자란 날 알림 · 그날 가능한 대기자로 채우기 · 날짜별 인원 초과 확인
// node scripts/qa/day-staffing.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const [d0, d1, d2] = [day(0), day(1), day(2)]
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})` }
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  // 3일 행사 · 날마다 1명. 확정자(근무자)는 둘째 날을 뺐고, 지원자(김지원)는 둘째 날만 가능
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d0, end_date: d2, headcount: 1 })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${WK}`, 'PATCH', { available_dates: [d0, d2] })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`, 'PATCH', { available_dates: [d1], status: 'applied' })
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  // 출퇴근 탭: 첫날은 다 참, 둘째 날은 1명 부족
  await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${d0}`)
  ok('다 찬 날: 부족 알림 없음', (await see(p, '근무 중')) && !(await see(p, '명 부족', 1000)))
  await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${d1}`)
  ok('모자란 날: 확정 0/1 · 1명 부족', await see(p, /확정 0\/1명 · 1명 부족/))
  ok('이날 가능한 대기자 안내', await see(p, '이날 가능한 대기자 1명 →'))
  await p.getByText('이날 가능한 대기자 1명 →').click()
  await p.waitForURL(new RegExp(`tab=apps&day=${d1}`)).then(() => ok('누르면 그날 가능한 지원자 화면', true), () => ok('누르면 그날 가능한 지원자 화면', false, p.url()))

  // 지원자 탭: 날짜별 확정 인원, 그날 가능한 사람만
  ok('날짜별 인원 (첫날 1/1)', await see(p, '확정 1/1'))
  ok('그날만 보는 중 안내', await see(p, `${fmt(d1)}에 근무할 수 있는 사람만 보는 중`))
  const card = (name) => p.locator('.sm\\:hidden .card', { hasText: name })
  ok('그날 가능한 지원자만 (김지원 O, 근무자 X)', (await card('김지원').count()) === 1 && (await card('근무자').count()) === 0)
  // 둘째 날은 비어 있으므로 바로 확정 (인원 초과 확인 없음)
  await card('김지원').getByRole('button', { name: '확정', exact: true }).click()
  await p.waitForTimeout(1500)
  let ap = (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]
  ok('빈 날 지원자는 한 번에 확정', ap.status === 'approved', ap.status)
  await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${d1}`)
  ok('채운 뒤: 부족 알림 사라짐', (await see(p, '근무 중')) && !(await see(p, '명 부족', 1000)))

  // 이미 다 찬 날에만 가능한 지원자: 확정하면 넘친다고 한 번 더 확인
  await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`, 'PATCH', { available_dates: [d0], status: 'applied' })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await card('김지원').getByRole('button', { name: '확정', exact: true }).click()
  ok('다 찬 날 지원자: 날짜와 함께 확인', await see(p, `${fmt(d0)} 다 참 · 확정?`))
  ap = (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]
  ok('첫 누름엔 확정 안 됨', ap.status === 'applied', ap.status)

  // 하루짜리 공고: 날짜별 칸 없음, 확인 문구는 예전 그대로
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d0, end_date: d0 })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${WK}`, 'PATCH', { available_dates: null })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('하루짜리: 날짜별 칸 없음', (await see(p, '지원순')) && !(await see(p, /확정 \d\/\d$/, 800)))
  await card('김지원').getByRole('button', { name: '확정', exact: true }).click()
  ok('하루짜리: 인원 다 찼어요 확인', await see(p, '인원 다 찼어요 · 확정?'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
