// 묶음 304 (정기 개선 2026-11-18 19:35 KST)
// · 관리자 근무자 상세 '근무 이력': 행사마다 지급 상태 한 줄 — '✓ 지급완료'(체크 그림) · '정산일 M/D 지남'(빨강 · 문의했으면 💬) · '정산 M/D' · '지급 전'
//   (전화로 '돈 언제 들어와요?' 물을 때 바로 답하게) · 지금 근무 중이면 숨 쉬는 초록 점
// · 회사 간 자료 분리: 정산일·급여 문의는 그 회사 문의함 글만 읽음 (다른 회사가 같은 사람에게 보낸 안내로 바뀌지 않음) ·
//   다른 회사 관리자에게는 그 회사 행사만
// node scripts/qa/batch304.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000304a2'
const J2 = 'cccccccc-0000-4000-8000-000000030401', J4 = 'cccccccc-0000-4000-8000-000000030402'
const ATT2 = 'eeeeeeee-0000-4000-8000-000000030401'
const ASK = '정산일이 지났는데 급여가 아직 안 들어왔어요. 확인 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 둘째 회사 C2 + 그 회사 관리자 A2 (다른 사람)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '둘째관리자', phone: '01030403040', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-15T00:00:00Z' })
  // W가 우리 회사 J2, 둘째회사 J4에서 일함 (둘 다 지급 전)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, company: _c, ...jb } = base
  const mkJob = (id, company, title) => rest('jobs', 'POST', { ...jb, id, company_id: company, company: { company_name: company === C2 ? '둘째회사' : '주식회사 테스트' }, title, status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(J2, C1, '가을 축제 주차 안내')
  await mkJob(J4, C2, '둘째회사 겨울 행사')
  const jobOf = async (id) => (await rest(`jobs?id=eq.${id}`))[0]
  for (const [job, n] of [[J2, 1], [J4, 2]]) {
    const full = await jobOf(job)
    await rest('applications', 'POST', { id: `11111111-0000-4000-8000-00000003040${n}`, job_id: job, user_id: W, status: 'approved', available_dates: null, position: null, contract_received_at: null, message: '', admin_memo: null, decided_at: new Date().toISOString(), created_at: `${kday(-8)}T10:00:00+09:00`, job: full })
    await rest('attendance', 'POST', { id: `eeeeeeee-0000-4000-8000-00000003040${n}`, job_id: job, job: full, user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, confirmed: true, created_at: new Date().toISOString() })
  }
  const msg = (id, company, job, body, fromAdmin, at) => rest('messages', 'POST', { id, thread_user_id: W, sender_id: fromAdmin ? A : W, from_admin: fromAdmin, company_id: company, job_id: job, body, read_at: null, created_at: at })
  // 우리 회사: J2 정산일 어제 · W가 급여 문의
  await msg(3040001, C1, J2, `💰 정산 예정일 안내\n가을 축제 주차 안내 · 정산 예정일: ${md(kday(-1))}`, true, `${kday(-2)}T19:00:00+09:00`)
  await msg(3040002, C1, J2, ASK, false, new Date(Date.now() - 600e3).toISOString())
  // 둘째회사: J4 정산일도 어제 · 근무자는 둘째회사엔 묻지 않음 (글의 회사는 공고의 회사로 정해짐 — 실제 DB 트리거와 같음)
  await msg(3040003, C2, J4, `💰 정산 예정일 안내\n둘째회사 겨울 행사 · 정산 예정일: ${md(kday(-1))}`, true, `${kday(-2)}T19:00:00+09:00`)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const open = async (p) => { await p.goto(`${D}/admin/workers/${W}`, { waitUntil: 'networkidle' }); await p.locator('[data-work-history]').waitFor({ timeout: 15000 }).catch(() => {}) }
  const row = (p, job) => p.locator(`[data-work-history] li`, { has: p.locator(`a[href="/admin/jobs/${job}?tab=pay"]`) })
  const state = async (p, job) => ({ kind: await row(p, job).locator('[data-pay-state]').getAttribute('data-pay-state').catch(() => null), text: one(await row(p, job).locator('[data-pay-state]').textContent().catch(() => '')) })

  // ── 1. 우리 회사 관리자: 지급 전 · 정산일 지남 · 이 회사로 온 급여 문의 💬
  await open(a)
  const s1 = await state(a, J2)
  ok(`지난 정산일: '정산일 ${md(kday(-1))} 지남 · 💬' (빨강 · 이 회사 안내 기준)`, s1.kind === 'over' && s1.text === `정산일 ${md(kday(-1))} 지남 · 💬`, JSON.stringify(s1))
  ok('둘째회사 행사는 목록에 없음', (await row(a, J4).count()) === 0 && !one(await a.locator('[data-work-history]').textContent()).includes('둘째회사'))
  const live = row(a, J).locator('[data-live]')
  // (정기 개선 2026-11-20 21:35: 끝날 시각(18:00)이 지났는데 종료를 안 눌렀으면 '근무 중' 대신 '종료 넣기 →' — batch329)
  const pastEnd = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16) >= '18:00'
  if (pastEnd) {
    const over = row(a, J).locator('[data-live-over]')
    ok("오늘 근무 · 18:00 지남: 숨 쉬는 주황 점 + '종료 넣기 →'", (await over.count()) === 1 && (await over.locator('.animate-ping').count()) === 1 && one(await over.textContent()) === '종료 넣기 →' && (await live.count()) === 0)
  } else ok('오늘 근무 중: 숨 쉬는 초록 점 + 근무 중', (await live.count()) === 1 && (await live.locator('.animate-ping').count()) === 1 && one(await live.textContent()) === '근무 중')
  ok('한 줄 (360px · 옆으로 안 밀림)', (await row(a, J2).locator('[data-pay-state]').evaluate((el) => el.getBoundingClientRect().height < 20)) && (await noSide(a)))
  if (SHOTS) await a.locator('[data-work-history]').evaluate((el) => el.scrollIntoView({ block: 'center' })).then(() => a.waitForTimeout(400)).then(() => a.locator('[data-work-history]').screenshot({ path: `${SHOTS}/worker-history-pay.png` })).catch(() => {})

  // ── 2. 둘째회사 관리자: 그 회사 행사만 · 우리 회사로 온 급여 문의(💬)는 안 보임
  const a2 = await mk(A2)
  await open(a2)
  const s2 = await state(a2, J4)
  ok(`둘째회사 화면: '정산일 ${md(kday(-1))} 지남' (💬 없음 — 그 회사엔 묻지 않음)`, s2.kind === 'over' && s2.text === `정산일 ${md(kday(-1))} 지남`, JSON.stringify(s2))
  ok('둘째회사 화면엔 우리 회사 행사 없음', (await row(a2, J2).count()) === 0 && !one(await a2.locator('[data-work-history]').textContent().catch(() => '')).includes('가을 축제'))

  // ── 3. 정산일을 다시 알리면(나흘 뒤): '정산 M/D' (주황)
  await msg(3040005, C1, J2, `💰 정산 예정일 안내\n가을 축제 주차 안내 · 정산 예정일: ${md(kday(4))}`, true, new Date(Date.now() - 60e3).toISOString())
  await open(a)
  const s25 = await state(a, J2)
  ok(`다시 알린 날이 아직이면 '정산 ${md(kday(4))}' (주황)`, s25.kind === 'due' && s25.text === `정산 ${md(kday(4))}`, JSON.stringify(s25))

  // ── 4. 지급하면 '✓ 지급완료' (체크가 그려짐)
  await rest(`attendance?id=eq.${ATT2}`, 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await open(a)
  const s3 = await state(a, J2)
  ok("지급하면 '지급완료' + 그려지는 체크 (초록)", s3.kind === 'paid' && s3.text === '지급완료' && (await row(a, J2).locator('[data-pay-state] path.check-draw').count()) === 1)
  if (SHOTS) await row(a, J2).screenshot({ path: `${SHOTS}/worker-history-paid.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
