// 묶음 300 (정기 개선 2026-11-18 11:36 KST)
// · 여러 회사를 맡은 관리자 홈 '다른 회사에 확인할 일': 그 회사에서 약속한 정산일이 오늘이거나 지났는데 지급 전인 근무자 수 '정산일 지남 n'
//   (회사를 바꿔 보지 않아도 다른 회사의 급여 약속을 놓치지 않게 · 우리 회사 할 일에는 섞이지 않음)
// · 정산 탭: 모두 지급하면 체크가 그려지며 '모두 지급했어요' 한 줄
// node scripts/qa/batch300.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const J2 = 'cccccccc-0000-4000-8000-000000030001', J4 = 'cccccccc-0000-4000-8000-000000030002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 관리자 A가 두 회사를 맡음 (지금 회사는 C1) · C2의 끝난 행사 J4에서 W가 일함 (지급 전)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C2, user_id: A, role: 'owner', created_at: '2026-10-15T00:00:00Z' })
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, company: _c, ...jb } = base
  const mkJob = (id, company, title) => rest('jobs', 'POST', { ...jb, id, company_id: company, company: { company_name: company === C2 ? '둘째회사' : '주식회사 테스트' }, title, status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(J4, C2, '둘째회사 가을 행사')
  await mkJob(J2, C1, '우리 회사 끝난 행사')
  const att = (id, job, paid) => rest('attendance', 'POST', { id, job_id: job, user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid, paid_at: paid ? new Date().toISOString() : null, created_at: new Date().toISOString() })
  await att('eeeeeeee-0000-4000-8000-000000030002', J4, false)
  await att('eeeeeeee-0000-4000-8000-000000030001', J2, true)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const home = async () => {
    await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await a.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  }
  const chip = () => a.locator('[data-other-companies] form', { hasText: '둘째회사' })

  // ── 1. 정산일을 알 수 없으면(지급일·알림 없음): '정산일 지남' 없음
  await home()
  ok('지금 회사는 우리 회사', one(await a.locator('header').first().textContent()).includes('주식회사 테스트'))
  ok("정산일을 모르면 '정산일 지남' 없음", (await a.locator('[data-other-paylate]').count()) === 0)

  // ── 2. 그 회사에서 알린 정산일이 어제 → '정산일 지남 1'
  await rest('messages', 'POST', { id: 3000001, thread_user_id: W, sender_id: A, from_admin: true, company_id: C2, job_id: J4, body: `💰 정산 예정일 안내\n둘째회사 가을 행사 · 정산 예정일: ${md(kday(-1))}`, read_at: null, created_at: `${kday(-2)}T10:00:00+09:00` })
  await home()
  const late = chip().locator('[data-other-paylate]')
  await late.waitFor({ timeout: 15000 }).catch(() => {})
  ok("다른 회사 칩에 '정산일 지남 1' (빨강)", one(await late.textContent().catch(() => '')) === '정산일 지남 1' && (await late.locator('b').getAttribute('class')).includes('text-rose-600'))
  ok("머리말 '다른 회사에 확인할 일'", one(await a.locator('[data-other-companies] > span').first().textContent()).endsWith('다른 회사에 확인할 일'))
  ok('우리 회사 할 일에는 다른 회사 공고가 섞이지 않음', (await a.locator(`[data-todo="unpaid-${J4}"]`).count()) === 0)
  ok('360px 옆으로 안 밀림 (관리자 홈)', await noSide(a))
  if (SHOTS) await a.locator('[data-other-companies]').screenshot({ path: `${SHOTS}/other-paylate.png` }).catch(() => {})

  // ── 3. 그 회사에서 지급 완료하면 사라짐
  await rest('attendance?id=eq.eeeeeeee-0000-4000-8000-000000030002', 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await home()
  ok("지급 완료하면 '정산일 지남' 없음", (await a.locator('[data-other-paylate]').count()) === 0)

  // ── 4. 정산 탭: 모두 지급했으면 체크와 함께 한 줄
  await a.goto(`${D}/admin/jobs/${J2}?tab=pay`, { waitUntil: 'networkidle' })
  const done = a.locator('[data-all-paid]')
  await done.waitFor({ timeout: 15000 }).catch(() => {})
  ok("모두 지급하면 '모두 지급했어요' (체크 그림)", one(await done.textContent().catch(() => '')) === '모두 지급했어요' && (await done.locator('path.check-draw').count()) === 1)
  ok('360px 옆으로 안 밀림 (정산 탭)', await noSide(a))
  if (SHOTS) await a.locator('[data-pay-summary]').evaluate((el) => el.scrollIntoView({ block: 'center' })).then(() => a.waitForTimeout(600)).then(() => a.locator('[data-pay-summary]').screenshot({ path: `${SHOTS}/all-paid.png` })).catch(() => {})
  await rest('attendance?id=eq.eeeeeeee-0000-4000-8000-000000030001', 'PATCH', { paid: false, paid_at: null })
  await a.goto(`${D}/admin/jobs/${J2}?tab=pay`, { waitUntil: 'networkidle' })
  await a.locator('[data-pay-summary]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('지급 전인 사람이 남으면 그 줄 없음', (await a.locator('[data-all-paid]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
