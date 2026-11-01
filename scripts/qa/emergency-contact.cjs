// 출퇴근 탭: 근무자가 넣어 둔 비상연락처로 바로 전화 (시작 시각이 지났는데 미출근이면 눈에 띄게)
// node scripts/qa/emergency-contact.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
;(async () => {
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`, 'PATCH', { status: 'approved', available_dates: null })
  await rest(`users?id=eq.${AP}`, 'PATCH', { emergency_phone: '01099998888' })
  await rest(`users?id=eq.${WK}`, 'PATCH', { emergency_phone: '01055556666' })
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const row = (name) => p.locator('div.card', { hasText: name }).filter({ has: p.locator('a[href^="/admin/workers/"]') })
  const link = (name) => row(name).getByRole('link', { name: /비상연락처에 전화/ })
  await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  await p.waitForLoadState('networkidle')
  ok('미출근자: 비상연락처 전화', (await link('김지원').getAttribute('href').catch(() => null)) === 'tel:01099998888')
  ok('미출근(시작 지남)이면 눈에 띄게', ((await link('김지원').getAttribute('class').catch(() => '')) ?? '').includes('bg-rose-50'))
  ok('근무 중인 사람도 비상연락처 (평소 색)', ((await link('근무자').getAttribute('class').catch(() => '')) ?? '').includes('bg-bg'))
  await rest(`users?id=eq.${AP}`, 'PATCH', { emergency_phone: null })
  await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  await p.waitForLoadState('networkidle')
  ok('비상연락처가 없으면 버튼 없음', (await link('김지원').count()) === 0 && (await row('김지원').count()) > 0)
  // 근무자에게는 보이지 않음 (관리자 화면만)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
