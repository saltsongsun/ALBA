// 급여 지급 빠뜨리지 않게: 끝난 행사인데 아직 '지급 완료'로 처리하지 않은 근무자
// · 대시보드 '확인할 일'에 "급여 지급 전 · 공고" (누르면 정산 탭) · 지난 공고 목록에 "💰 미지급 n명"
// · 지급 완료로 바꾸면 사라짐 · 아직 진행 중인 행사는 표시하지 않음
// node scripts/qa/unpaid-reminder.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const att = (await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`))[0]
  // 근무를 마쳤고(종료 기록 있음) 아직 지급 전
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: new Date().toISOString(), paid: false })

  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  // 오늘 진행 중인 행사: 아직 표시 안 함
  await p.goto(`${D}/admin`)
  await p.waitForLoadState('networkidle')
  ok('진행 중인 행사는 급여 지급 전 표시 없음', !(await see(p, '급여 지급 전', 800)))

  // 행사가 끝남 (이틀 전)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day(-2), end_date: day(-2) })
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: day(-2) })
  await p.goto(`${D}/admin`)
  await p.waitForLoadState('networkidle')
  ok('대시보드: 급여 지급 전 · 공고', await see(p, `급여 지급 전 · ${TITLE}`))
  const link = p.getByRole('link', { name: new RegExp(`급여 지급 전 · ${TITLE}`) }).first()
  ok('누르면 그 공고 정산 탭으로', ((await link.getAttribute('href')) ?? '').endsWith(`/admin/jobs/${J}?tab=pay`), await link.getAttribute('href'))
  ok('인원 1명', ((await link.textContent()) ?? '').includes('1'))

  await p.goto(`${D}/admin/jobs?tab=past`)
  await p.waitForLoadState('networkidle')
  ok('지난 공고: 💰 미지급 1명', await see(p, '💰 미지급 1명'))

  // 지급 완료로 바꾸면 사라짐
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await p.goto(`${D}/admin`)
  await p.waitForLoadState('networkidle')
  ok('지급 완료 뒤: 대시보드에서 사라짐', !(await see(p, '급여 지급 전', 800)))
  await p.goto(`${D}/admin/jobs?tab=past`)
  await p.waitForLoadState('networkidle')
  ok('지급 완료 뒤: 지난 공고 표시 사라짐', !(await see(p, '미지급', 800)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
