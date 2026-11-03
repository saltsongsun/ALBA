// 지원자 탭: 모집이 끝났는데 남은 대기 지원자를 한 번에 미선발로 정리하고 '이번엔 함께하지 못해요' 알림
// node scripts/qa/reject-waiting.cjs <default 앱> <default 가짜>
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
  { uid: '44444444-0000-4000-8000-000000000031', app: '55555555-0000-4000-8000-000000000031', name: '박지훈', phone: '01012130001' },
  { uid: '44444444-0000-4000-8000-000000000032', app: '55555555-0000-4000-8000-000000000032', name: '최수아', phone: '01012130002' },
]
;(async () => {
  // 대기 지원자 2명 더 (김지원 포함 대기 3명)
  for (const e of extra) {
    const user = { id: e.uid, name: e.name, phone: e.phone, birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true }
    await rest('users', 'POST', user)
    await rest('applications', 'POST', { id: e.app, job_id: J, user_id: e.uid, status: 'applied', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, created_at: new Date().toISOString(), user })
  }
  const before = await rest(`applications?job_id=eq.${J}`)
  const approvedBefore = before.filter((a) => a.status === 'approved').map((a) => a.id).sort()
  const waitingIds = before.filter((a) => a.status === 'applied').map((a) => a.user_id)
  ok('준비: 대기 3명 · 확정 1명 이상', waitingIds.length === 3 && approvedBefore.length >= 1, `${waitingIds.length}/${approvedBefore.length}`)

  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const btn = () => p.getByRole('button', { name: /미선발 알림/ })

  // 모집 중 · 인원 남음: 버튼 없음 (실수로 정리하지 않게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { headcount: 10, status: 'open' })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await p.waitForLoadState('networkidle')
  ok('모집 중·인원 남음: 미선발 알림 버튼 없음', (await btn().count()) === 0)

  // 모집 마감: 버튼 보임
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'closed' })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('모집 마감: 대기 3명 미선발 알림 버튼', await see(p, '🙏 대기 3명 미선발 알림'))

  // 모집 중이어도 인원이 다 차면 버튼 보임
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'open', headcount: approvedBefore.length })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('인원 다 참: 버튼 보임', await see(p, '🙏 대기 3명 미선발 알림'))

  // 두 번 눌러야 처리
  await btn().first().click()
  ok('첫 누름: 한 번 더 확인', await see(p, '대기 3명 미선발 · 알림 보낼까요?'))
  await p.waitForTimeout(600)
  ok('첫 누름만으로는 그대로', (await rest(`applications?job_id=eq.${J}`)).filter((a) => a.status === 'applied').length === 3)
  await p.getByRole('button', { name: '대기 3명 미선발 · 알림 보낼까요?' }).click()
  ok('처리 안내', await see(p, '대기 3명을 미선발로 정리하고 3명에게 알렸어요.', 15000))

  const after = await rest(`applications?job_id=eq.${J}`)
  ok('대기자 모두 미선발', waitingIds.every((u) => after.find((a) => a.user_id === u)?.status === 'rejected'), after.map((a) => a.status).join(','))
  ok('확정자는 그대로', JSON.stringify(after.filter((a) => a.status === 'approved').map((a) => a.id).sort()) === JSON.stringify(approvedBefore))
  const msgs = await rest('messages')
  const got = (u) => msgs.filter((m) => m.thread_user_id === u && m.body.startsWith('🙏 이번엔 함께하지 못해요'))
  ok('대기자마다 문의함에 결과 안내', waitingIds.every((u) => got(u).length === 1))
  ok('안내에 공고 이름', got(AP)[0]?.body.includes('경상남도 생활체육대축전'))
  const approvedUsers = after.filter((a) => a.status === 'approved').map((a) => a.user_id)
  ok('확정자에게는 안 감', approvedUsers.every((u) => got(u).length === 0))
  ok('처리 뒤 버튼 사라짐', (await btn().count()) === 0)

  // 근무자 화면: 결과가 보임
  const w = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await w.addCookies([{ name: 'alba_session', value: cookie(AP), url: D }, { name: 'alba_roster', value: roster(AP), url: D }])
  const wp = await w.newPage()
  wp.on('pageerror', (e) => errs.push(e.message))
  await wp.goto(`${D}/jobs/${J}`)
  ok('근무자: 공고에서 결과 보임', await see(wp, '이번에는 함께하지 못하게 됐어요.'))
  await wp.goto(`${D}/me`)
  await wp.waitForLoadState('networkidle')
  ok('근무자: 확정 대기 목록에서 빠짐', !(await see(wp, '확정 대기', 800)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
