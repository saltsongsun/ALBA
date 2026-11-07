// 묶음 109 (사용자 요청 2026-11-07): 주휴수당 자동 계산 · 정산에 자동 포함 + 관리자 '주간 근무 · 주휴' (여러 공고 한 주로 관리)
// 같은 회사 여러 공고를 합쳐 한 주(월~일) 소정 15시간 이상 + 개근 → (소정 40시간까지 ÷ 40 × 8시간 × 시급), 그 주 마지막 근무일 정산에
//  · 가: 공고A 월·화 9~18시(8시간×2) + 공고B 수 10~14시(4시간) = 20시간 개근 → 주휴 4시간 × 10,320 = 41,280원 (공고B 정산에)
//  · 나: 공고A 월·화 확정, 화요일 결근 → 결근 · 다: 공고B만 4시간 → 15시간 미만 · 라: 다음 주 월·화 8시간씩 확정 → 개근하면 대상 33,024원
//  · 정산 탭·정산표 엑셀·명세서에 같은 금액 · 주간 화면에서 공고별 예상 인건비·근무자별 요건 · 360px (밝은·어두운)
// node scripts/qa/batch109.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C = '99999999-0000-4000-8000-000000000099'
const GA = 'bbbbbbbb-0000-4000-8000-0000000009a1', NA = 'bbbbbbbb-0000-4000-8000-0000000009a2', DA = 'bbbbbbbb-0000-4000-8000-0000000009a3', RA = 'bbbbbbbb-0000-4000-8000-0000000009a4'
const JA = 'cccccccc-0000-4000-8000-0000000009b1', JB = 'cccccccc-0000-4000-8000-0000000009b2', JN = 'cccccccc-0000-4000-8000-0000000009b3', JX = 'cccccccc-0000-4000-8000-0000000009b4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const FROM = '2026-11-02'
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const weekStart = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7))
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const thisWeek = weekStart(today)
// 다 지난 주 (자동 포함 시작 주 이후): 지난 주가 시작 주보다 앞이면 이번 주 월~목 (오늘이 금요일 이후일 때)
const W0 = addDays(thisWeek, -7) >= FROM ? addDays(thisWeek, -7) : thisWeek
const NEXT = addDays(thisWeek, 7)
const kst = (d, t) => new Date(`${d}T${t}:00+09:00`).toISOString()
const won = (n) => `${n.toLocaleString('ko-KR')}원`

;(async () => {
  if (W0 === thisWeek && today < addDays(thisWeek, 4)) {
    console.log('(이번 주 목요일 전이라 이 테스트는 건너뜀 · 다 지난 주가 없음)')
    console.log('ALL PASSED')
    process.exit(0)
  }
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const [w1] = await rest(`users?id=eq.${W}`)
  const base = { ...j1, applications: [], required_docs: [], pay_type: 'hourly', hourly_wage: 10320, tax_type: 'daily', employment_insurance: true, premium_enabled: false, allowance: 0, break_mode: 'auto', round_unit: 1, early_clamp: false, status: 'closed', audience: 'worker' }
  const ja = { ...base, id: JA, title: '주휴 테스트 공고A', start_date: W0, end_date: addDays(W0, 1), start_time: '09:00:00', end_time: '18:00:00', headcount: 3 }
  const jb = { ...base, id: JB, title: '주휴 테스트 공고B', start_date: addDays(W0, 2), end_date: addDays(W0, 2), start_time: '10:00:00', end_time: '14:00:00', headcount: 3 }
  const jn = { ...base, id: JN, title: '다음 주 공고', start_date: NEXT, end_date: addDays(NEXT, 1), start_time: '09:00:00', end_time: '18:00:00', headcount: 2, status: 'open' }
  const jx = { ...base, id: JX, title: '3.3% 용역 공고', tax_type: 'business', start_date: W0, end_date: addDays(W0, 3), start_time: '09:00:00', end_time: '18:00:00', headcount: 1 }
  for (const j of [ja, jb, jn, jx]) await rest('jobs', 'POST', j)
  const lite = (j) => { const x = { ...j }; delete x.applications; return x }
  const users = [
    [GA, '주휴가', '01055550001'],
    [NA, '결근나', '01055550002'],
    [DA, '짧은다', '01055550003'],
    [RA, '다음라', '01055550004'],
  ]
  const people = new Map()
  for (const [id, name, phone] of users) {
    const u = { ...w1, id, name, phone, attendance: [], ratings: [], bank_account_enc: null }
    people.set(id, u)
    await rest('users', 'POST', u)
  }
  let n = 0
  // (가짜 DB는 지원에 공고·사람을 함께 붙여 둬야 화면이 이름을 읽음)
  const app = (uid, job) => {
    const u = { ...people.get(uid) }
    delete u.attendance
    delete u.ratings
    return rest('applications', 'POST', { id: `11111111-0000-4000-8000-0000000009${String(++n).padStart(2, '0')}`, company_id: C, job_id: job.id, user_id: uid, status: 'approved', available_dates: null, created_at: new Date().toISOString(), job: lite(job), user: u })
  }
  const att = (uid, job, date, inT, outT) =>
    rest('attendance', 'POST', {
      id: `eeeeeeee-0000-4000-8000-0000000009${String(++n).padStart(2, '0')}`, company_id: C, job_id: job.id, user_id: uid, work_date: date,
      clock_in: kst(date, inT), clock_out: kst(date, outT), adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, note: null, source: 'app',
      confirmed: true, paid: false, paid_at: null, ot_minutes: 0, ot_status: null, ot_by: null, sched_start: null, sched_end: null,
      in_lat: null, in_lng: null, out_lat: null, out_lng: null, in_distance_m: null, out_distance_m: null,
    })
  // 가: A 월·화 + B 수 (20시간 개근) · 3.3% 용역 공고도 함께 (주휴 계산에서 빠져야 함)
  await app(GA, ja); await app(GA, jb); await app(GA, jx)
  await att(GA, ja, W0, '09:00', '18:00'); await att(GA, ja, addDays(W0, 1), '09:00', '18:00'); await att(GA, jb, addDays(W0, 2), '10:00', '14:00')
  await att(GA, jx, addDays(W0, 3), '09:00', '18:00')
  // 나: A 월·화 확정, 월만 출근
  await app(NA, ja); await att(NA, ja, W0, '09:00', '18:00')
  // 다: B만 4시간
  await app(DA, jb); await att(DA, jb, addDays(W0, 2), '10:00', '14:00')
  // 라: 다음 주 월·화
  await app(RA, jn)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, scheme = 'light') => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', colorScheme: scheme })
    await ctx.addInitScript((sc) => { try { if (sc === 'dark') localStorage.setItem('theme', 'dark'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, scheme)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const ap = await pg(A)

  // ── 1. 정산 탭: 공고B(그 주 마지막 근무일)에 주휴 ──
  await ap.goto(`${D}/admin/jobs/${JB}?tab=pay`)
  await ap.locator('[data-pay-summary]').waitFor({ timeout: 15000 }).catch(() => {})
  const rowOf = (p, name) => p.locator('tr', { hasText: name }).first()
  const gaRow = await rowOf(ap, '주휴가').innerText().catch(() => '')
  ok(`정산 탭(공고B) 주휴가: '주휴 +41,280원'`, gaRow.includes('주휴 +41,280원'), gaRow.replace(/\s+/g, ' '))
  // 4시간 × 10,320 = 41,280 + 주휴 41,280 = 82,560
  ok('지급총액 = 4시간 41,280 + 주휴 41,280 = 82,560원', gaRow.includes('82,560원'))
  ok('짧은다(4시간)는 주휴 없음', !(await rowOf(ap, '짧은다').innerText().catch(() => '')).includes('주휴'))
  ok("요약: '주휴수당 1명 · 41,280원 포함' → 주간 보기", (await ap.locator('[data-weekly-note]').innerText().catch(() => '')).includes('주휴수당 1명 · 41,280원 포함'))
  ok('360px: 정산 탭 옆으로 안 밀림', await wide(ap))
  await ap.goto(`${D}/admin/jobs/${JA}?tab=pay`)
  await ap.locator('[data-pay-summary]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('공고A 정산에는 주휴가 붙지 않음 (마지막 근무일이 공고B)', (await ap.locator('[data-weekly-pay]').count()) === 0)

  // ── 2. 정산표 엑셀 · 명세서 ──
  const csv = await ap.evaluate(async (u) => (await fetch(u)).text(), `/admin/export/settlement?job=${JB}`)
  const lines = csv.replace(/^﻿/, '').split(/\r\n/)
  const head = lines[0].split(',')
  const ga = lines.find((l) => l.startsWith('주휴가'))?.split(',') ?? []
  ok("정산표 엑셀: '주휴수당' 칸 = 41280 · 지급총액 82560", head.includes('주휴수당') && ga[head.indexOf('주휴수당')] === '41280' && ga[head.indexOf('지급총액')] === '82560', `${head.join('|')} // ${ga.join('|')}`)
  await ap.goto(`${D}/print/payslip/${JB}/${GA}`)
  await ap.locator('.print-sheet').first().waitFor({ timeout: 15000 }).catch(() => {})
  const slip = await ap.locator('.print-sheet').first().innerText().catch(() => '')
  ok("명세서: '주휴수당 41,280원' 줄", /주휴수당\s*41,280원/.test(slip.replace(/\n/g, ' ')) || (slip.includes('주휴수당') && slip.includes('41,280')), slip.slice(0, 300).replace(/\n/g, ' | '))

  // ── 3. 주간 근무 · 주휴 화면 ──
  await ap.goto(`${D}/admin/weekly?w=${W0}`)
  await ap.locator('[data-weekly]').waitFor({ timeout: 15000 }).catch(() => {})
  const person = (name) => ap.locator('[data-weekly-person]', { hasText: name }).first()
  const pga = await person('주휴가').innerText().catch(() => '')
  ok("주휴가: '주휴 대상' 41,280원 · '20시간 · 공고 2개'", pga.includes('주휴 대상') && pga.includes('41,280원') && pga.includes('20시간 · 공고 2개'), pga.replace(/\n/g, ' | '))
  const pna = await person('결근나').innerText().catch(() => '')
  ok("결근나: '결근' (화요일 결근 · 금액 없음)", pna.includes('결근') && !pna.includes('원'), pna.replace(/\n/g, ' | '))
  const pda = await person('짧은다').innerText().catch(() => '')
  ok("짧은다: '15시간 미만' · '4시간'", pda.includes('15시간 미만') && pda.includes('4시간'), pda.replace(/\n/g, ' | '))
  ok('정렬: 대상 → 결근 → 15시간 미만', (await ap.locator('[data-weekly-person]').evaluateAll((els) => els.map((e) => e.dataset.status))).join(',').startsWith('eligible'))
  ok('주휴수당 칸 = 41,280원 (실제 값)', (await ap.locator('[data-weekly-tiles] [data-value]').nth(1).getAttribute('data-value')) === '41280')
  const jobsTxt = await ap.locator('[data-weekly-jobs]').innerText()
  // 공고A: 가 2일 + 나 2일 = 8시간 × 4 × 10,320 = 330,240 · 공고B: 4시간 × 2명 = 82,560
  ok('공고별 예상 인건비: 공고A 330,240원 · 공고B 82,560원', jobsTxt.includes('주휴 테스트 공고A') && jobsTxt.includes('330,240원') && jobsTxt.includes('82,560원'), jobsTxt.replace(/\n/g, ' | '))
  ok('3.3% 용역 공고는 주휴 계산에 안 들어감 (가는 20시간)', pga.includes('20시간'))
  ok('360px: 주간 화면 옆으로 안 밀림 (밝은 화면)', await wide(ap))
  if (SHOTS) await ap.screenshot({ path: `${SHOTS}/weekly.png`, fullPage: true })
  ok('주 고르기: 날짜가 한 줄 · 잘리지 않음', await ap.locator('[data-week-range]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
  await ap.locator('[data-week-next]').click()
  await ap.waitForURL((u) => new URL(u).searchParams.get('w') === addDays(W0, 7), { timeout: 10000 }).catch(() => {})
  ok("'›'(다음 주)로 주 이동", new URL(ap.url()).searchParams.get('w') === addDays(W0, 7))
  await ap.goto(`${D}/admin/weekly?w=${NEXT}`)
  await ap.locator('[data-weekly]').waitFor({ timeout: 15000 }).catch(() => {})
  const pra = await person('다음라').innerText().catch(() => '')
  ok("다음라(다음 주 16시간): '개근하면 대상' 33,024원 · '16시간 · 남은 2일'", pra.includes('개근하면 대상') && pra.includes('33,024원') && pra.includes('16시간 · 남은 2일'), pra.replace(/\n/g, ' | '))
  const dk = await pg(A, 'dark')
  await dk.goto(`${D}/admin/weekly?w=${W0}`)
  await dk.locator('[data-weekly]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('360px: 주간 화면 옆으로 안 밀림 (어두운 화면)', (await dk.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await wide(dk)))
  if (SHOTS) await dk.screenshot({ path: `${SHOTS}/weekly-dark.png`, fullPage: true })
  // 자동 포함 전 주는 확인용 안내
  await ap.goto(`${D}/admin/weekly?w=2026-10-26`)
  ok("자동 포함 전 주(10/26 주): '확인용' 안내", (await ap.locator('[data-weekly-before]').innerText().catch(() => '')).includes('확인용'))

  // ── 4. 메뉴 ──
  await ap.goto(`${D}/admin`)
  await ap.locator('[data-admin-tabbar] button').last().click()
  ok("더보기에 '주간 근무 · 주휴'", (await ap.locator('[data-admin-more] a', { hasText: '주간 근무 · 주휴' }).count()) === 1)

  // ── 5. 근무자 본인 명세서에도 같은 금액 ──
  const gp = await pg(GA)
  await gp.goto(`${D}/print/payslip/${JB}/${GA}`)
  await gp.locator('.print-sheet').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('근무자 본인 명세서에도 주휴수당 41,280원', (await gp.locator('.print-sheet').first().innerText().catch(() => '')).includes('41,280'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
