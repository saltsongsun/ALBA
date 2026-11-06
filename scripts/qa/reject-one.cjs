// 지원자 한 명을 '미선발'로 정하면 (공고 지원자 탭·대시보드): 두 번 눌러야 처리 · 그 근무자에게만 '이번엔 함께하지 못해요' 알림
// node scripts/qa/reject-one.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const X = { uid: '44444444-0000-4000-8000-000000000041', app: '55555555-0000-4000-8000-000000000041', name: '박지훈', phone: '01012140001' }
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const NOTE = '🙏 이번엔 함께하지 못해요'
;(async () => {
  const user = { id: X.uid, name: X.name, phone: X.phone, birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true }
  await rest('users', 'POST', user)
  await rest('applications', 'POST', { id: X.app, job_id: J, user_id: X.uid, status: 'applied', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, created_at: new Date().toISOString(), user })
  const notes = async (uid) => (await rest('messages')).filter((m) => m.thread_user_id === uid && m.body.startsWith(NOTE))
  const statusOf = async (id) => (await rest(`applications?id=eq.${id}`))[0]?.status

  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const card = () => p.locator('.sm\\:hidden .card', { hasText: X.name })

  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await p.waitForLoadState('networkidle')
  await card().getByRole('button', { name: '미선발', exact: true }).click()
  ok('첫 누름: 알림 보낼지 확인', await see(p, '미선발 알림 보낼까요?'))
  await p.waitForTimeout(600)
  ok('첫 누름만으로는 그대로', (await statusOf(X.app)) === 'applied')
  await card().getByRole('button', { name: '미선발 알림 보낼까요?' }).click()
  await p.waitForTimeout(1500)
  await p.waitForLoadState('networkidle')
  ok('미선발로 바뀜', (await statusOf(X.app)) === 'rejected')
  const n1 = await notes(X.uid)
  ok('그 근무자 문의함에 결과 안내 1건', n1.length === 1, String(n1.length))
  ok('안내에 공고 이름', n1[0]?.body.includes('경상남도 생활체육대축전'))
  ok('한 명 정리는 "모집 마감" 문구 없이', !n1[0]?.body.includes('모집이 마감돼'))
  ok('다른 대기자는 그대로 · 알림 없음', (await statusOf((await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]?.id)) === 'applied' && (await notes(AP)).length === 0)

  // 대기로 되돌려도 알림이 더 가지 않음
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await p.waitForLoadState('networkidle')
  await p.getByText('미선발·취소').first().click().catch(() => {})
  await card().getByRole('button', { name: '대기로', exact: true }).click()
  await p.waitForTimeout(1500)
  ok('대기로 되돌림', (await statusOf(X.app)) === 'applied')
  ok('되돌릴 때는 알림 없음', (await notes(X.uid)).length === 1)

  // 대시보드의 '확정 대기 지원자'에서도 두 번 눌러야 미선발 + 알림
  await p.goto(`${D}/admin`)
  await p.waitForLoadState('networkidle')
  const dash = () => p.locator('div.card', { hasText: '김지원' }).filter({ has: p.getByRole('button', { name: /미선발/ }) }).last()
  await dash().getByRole('button', { name: '미선발', exact: true }).click()
  ok('대시보드: 첫 누름은 확인만', await see(p, '미선발 알림?'))
  await p.waitForTimeout(600)
  const apApp = (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]
  ok('대시보드: 첫 누름만으로는 그대로', apApp?.status === 'applied')
  await dash().getByRole('button', { name: '미선발 알림?' }).click()
  await p.waitForTimeout(1500)
  ok('대시보드: 미선발 + 알림', (await statusOf(apApp.id)) === 'rejected' && (await notes(AP)).length === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
