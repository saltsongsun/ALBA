// 묶음 84: 대시보드 '확정 대기 지원자'에서 확정·미선발을 누르면 위쪽에 결과 안내 — 카드만 사라지고 아무 말이 없던 것
// · 확정: '김지원님 확정 · 알림을 보냈어요' · 미선발(두 번 누름): '○○님 미선발 · 알림을 보냈어요' (휴대폰 한 줄)
// · 주소에는 안내(m=)가 남지 않음(새로 고침해도 다시 안 뜸) · 공고 화면의 확정·미선발은 그대로 (그 화면에 머묾) · 360px
// node scripts/qa/batch84.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const AP_APP = '11111111-0000-4000-8000-000000000012'
const X = { uid: '44444444-0000-4000-8000-0000000000e4', app: '55555555-0000-4000-8000-0000000000e4', name: '최미선', phone: '01012140084' }
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const flash = p.locator('[role=status]').filter({ hasText: '알림을 보냈어요' })

  // ── 1. 확정 ── (오후 6시 뒤에 돌려도 '끝난 행사 · 확정?' 확인에 걸리지 않게 공고 날짜를 내일로)
  const tmr = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr })
  await p.goto(`${D}/admin`)
  const card = (name) => p.locator('div.card', { hasText: name }).filter({ has: p.getByRole('button', { name: /미선발/ }) }).first()
  await card('김지원').waitFor({ timeout: 10000 }).catch(() => {})
  await card('김지원').getByRole('button', { name: '확정', exact: true }).click()
  await flash.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("확정 → '김지원님 확정 · 알림을 보냈어요'", (await flash.first().innerText().catch(() => '')).includes('김지원님 확정 · 알림을 보냈어요'))
  ok('안내는 한 줄 (360px)', (await flash.first().evaluate((el) => el.querySelector('span').getClientRects().length).catch(() => 0)) === 1)
  ok('확정 저장', (await rest(`applications?id=eq.${AP_APP}`))[0]?.status === 'approved')
  ok('대시보드에 머묾 · 주소에 안내가 남지 않음', new URL(p.url()).pathname === '/admin' && !new URL(p.url()).searchParams.has('m'), p.url())
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 미선발 (두 번 누름) ──
  const user = { id: X.uid, name: X.name, phone: X.phone, birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true }
  await rest('users', 'POST', user)
  const [job] = await rest(`jobs?id=eq.${J}`)
  // (가짜 DB는 묶어 읽기를 저장된 값으로 돌려줌 → 대시보드가 읽는 회사·공고·사람을 함께 넣음)
  await rest('applications', 'POST', {
    id: X.app, job_id: J, user_id: X.uid, company_id: job.company_id, status: 'applied', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null,
    created_at: new Date().toISOString(), user, job: { id: J, title: job.title, end_date: job.end_date },
  })
  await p.goto(`${D}/admin`)
  await card(X.name).waitFor({ timeout: 10000 }).catch(() => {})
  await card(X.name).getByRole('button', { name: '미선발', exact: true }).click()
  await card(X.name).getByRole('button', { name: '미선발 알림?' }).click() // (대시보드는 확정·보류·미선발 세 칸이라 짧게)
  await p.locator('[role=status]', { hasText: '미선발 · 알림' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok(`미선발 → '${X.name}님 미선발 · 알림을 보냈어요'`, (await p.locator('[role=status]', { hasText: '미선발 · 알림' }).innerText().catch(() => '')).includes(`${X.name}님 미선발 · 알림을 보냈어요`))
  ok('미선발 저장', (await rest(`applications?id=eq.${X.app}`))[0]?.status === 'rejected')
  await p.reload()
  await p.locator('main').waitFor()
  await p.waitForTimeout(600)
  ok('새로 고침하면 안내는 다시 안 뜸', (await p.locator('[role=status]', { hasText: '알림을 보냈어요' }).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
