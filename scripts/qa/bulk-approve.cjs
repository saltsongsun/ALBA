// 지원자 탭: 여러 명 골라 한 번에 확정 (인원 초과·연소자면 그 내용으로 한 번 더 확인)
// node scripts/qa/bulk-approve.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const extra = [
  { uid: '44444444-0000-4000-8000-000000000021', app: '55555555-0000-4000-8000-000000000021', name: '박지훈', phone: '01012120001' },
  { uid: '44444444-0000-4000-8000-000000000022', app: '55555555-0000-4000-8000-000000000022', name: '최수아', phone: '01012120002' },
]
;(async () => {
  // (오후 6시 뒤에 돌려도 '끝난 행사 · 확정?' 확인에 걸리지 않게 공고 날짜를 내일로)
  const tmr = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr })
  // 지원자 2명 더 (모두 대기)
  for (const e of extra) {
    const user = { id: e.uid, name: e.name, phone: e.phone, birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true }
    await rest('users', 'POST', user)
    await rest('applications', 'POST', { id: e.app, job_id: J, user_id: e.uid, status: 'applied', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, created_at: new Date().toISOString(), user })
  }
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const box = (name) => p.locator('.sm\\:hidden .card', { hasText: name }).locator(`input[name=app]`)

  // 인원 넉넉: 둘 골라 확정
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('대기 지원자마다 고르는 칸', (await box('박지훈').count()) === 1 && (await box('최수아').count()) === 1 && (await box('김지원').count()) === 1)
  ok('아무도 안 고르면 확정 바 없음', !(await see(p, '명 골랐어요', 800)))
  await box('박지훈').check()
  await box('최수아').check()
  ok("고르면 아래에 확정 바", await see(p, /명 골랐어요/))
  await p.getByRole('button', { name: '선택 2명 확정' }).click()
  ok('두 번 눌러야 확정', await see(p, '2명 확정할까요?'))
  await p.getByRole('button', { name: '2명 확정할까요?' }).click()
  ok('확정 안내', await see(p, '2명을 확정했어요. 근무자에게 알렸어요.', 15000))
  const apps = await rest(`applications?job_id=eq.${J}`)
  const st = (uid) => apps.find((a) => a.user_id === uid)?.status
  ok('고른 사람만 확정', st(extra[0].uid) === 'approved' && st(extra[1].uid) === 'approved' && st(AP) === 'applied', apps.map((a) => a.status).join(','))
  const msgs = await rest(`messages?thread_user_id=eq.${extra[0].uid}`)
  ok('확정 안내가 문의함에', msgs.some((m) => m.body.startsWith('✅ 근무가 확정됐어요')))

  // 인원이 넘으면 그 내용으로 확인 (모집 3명, 확정 3명 + 1)
  await rest(`applications?id=eq.${extra[1].app}`, 'PATCH', { status: 'applied' })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { headcount: 2 })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await box('김지원').check()
  await box('최수아').check()
  await p.getByRole('button', { name: '선택 2명 확정' }).click()
  ok('인원 초과면 그 내용으로 확인', await see(p, '모집 2명 → 4명 · 확정?'))
  await p.getByRole('button', { name: '선택 해제' }).click()
  ok('선택 해제하면 바 사라짐', !(await see(p, '명 골랐어요', 800)))

  // 연소자(밤·7시간 넘는 공고)면 그 내용으로 확인
  await rest(`users?id=eq.${AP}`, 'PATCH', { birth_date: `${new Date().getUTCFullYear() - 16}-01-15` })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await box('김지원').check()
  await p.getByRole('button', { name: '선택 1명 확정' }).click()
  ok('연소자 포함이면 그 내용으로 확인 (휴대폰 한 줄에 들어가게 짧게)', await see(p, '연소자 1명 · 확정?'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
