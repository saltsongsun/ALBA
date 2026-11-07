// 묶음 110 (사용자 요청 2026-11-07 "추가 근로 시 주휴수당 지급을 해야 하는 인원은 관리자에게만 띄워줘")
// 다음 주: 공고1 월 9~18시(8시간) · 공고2 화 9~18시 · 공고3 수 9~18시 (모두 근로소득 알바)
//  · 확정이: 공고1 확정 + 공고2 대기 → 공고2를 확정하면 16시간 → '확정하면 주휴 대상 · 8시간→16시간 · 약 33,024원'
//  · 여유: 공고2 대기만 (8시간) → 표시 없음 · 이미: 공고1·3 확정(16시간) + 공고2 대기 → '이미 주휴 대상 주'
//  · 지원자 탭 위 요약 · 확정 누르면 '주휴 대상이 돼요 · 확정?' 한 번 더 · 대시보드 확정 대기 카드 · 주간 화면 '확정하면 주휴 대상이 되는 지원자'
//  · 근무자 화면(공고·내 근무)에는 주휴 이야기가 안 보임
// node scripts/qa/batch110.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C = '99999999-0000-4000-8000-000000000099'
const UX = 'bbbbbbbb-0000-4000-8000-000000000ab1', UY = 'bbbbbbbb-0000-4000-8000-000000000ab2', UZ = 'bbbbbbbb-0000-4000-8000-000000000ab3'
const J1 = 'cccccccc-0000-4000-8000-000000000ac1', J2 = 'cccccccc-0000-4000-8000-000000000ac2', J3 = 'cccccccc-0000-4000-8000-000000000ac3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const weekStart = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7))
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const NEXT = addDays(weekStart(today), 7)
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

;(async () => {
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const [w1] = await rest(`users?id=eq.${W}`)
  const base = { ...j1, applications: [], required_docs: [], pay_type: 'hourly', hourly_wage: 10320, tax_type: 'daily', employment_insurance: true, premium_enabled: false, allowance: 0, break_mode: 'auto', round_unit: 1, early_clamp: false, status: 'open', audience: 'worker', start_time: '09:00:00', end_time: '18:00:00', headcount: 5 }
  const jobs = [
    { ...base, id: J1, title: '월요일 무대 설치', start_date: NEXT, end_date: NEXT },
    { ...base, id: J2, title: '화요일 행사 안내', start_date: addDays(NEXT, 1), end_date: addDays(NEXT, 1) },
    { ...base, id: J3, title: '수요일 철수', start_date: addDays(NEXT, 2), end_date: addDays(NEXT, 2) },
  ]
  for (const j of jobs) await rest('jobs', 'POST', j)
  const lite = (j) => { const x = { ...j }; delete x.applications; return x }
  const people = new Map()
  for (const [id, name, phone] of [[UX, '확정이', '01066660001'], [UY, '여유', '01066660002'], [UZ, '이미', '01066660003']]) {
    const u = { ...w1, id, name, phone, attendance: [], ratings: [], photo_at: '2026-10-29T00:00:00Z' }
    people.set(id, u)
    await rest('users', 'POST', u)
  }
  let n = 0
  const app = (uid, job, status) => {
    const u = { ...people.get(uid) }
    delete u.attendance
    delete u.ratings
    return rest('applications', 'POST', { id: `11111111-0000-4000-8000-000000000a${String(++n).padStart(2, '0')}`, company_id: C, job_id: job.id, user_id: uid, status, available_dates: null, held_at: null, message: null, position: null, created_at: new Date(Date.now() - n * 60e3).toISOString(), job: lite(job), user: u })
  }
  await app(UX, jobs[0], 'approved'); await app(UX, jobs[1], 'applied')
  await app(UY, jobs[1], 'applied')
  await app(UZ, jobs[0], 'approved'); await app(UZ, jobs[2], 'approved'); await app(UZ, jobs[1], 'applied')

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const ap = await pg(A)

  // ── 1. 지원자 탭 ──
  await ap.goto(`${D}/admin/jobs/${J2}?tab=apps`)
  const sum = ap.locator('[data-weekly-impact-summary]')
  await sum.waitFor({ timeout: 15000 }).catch(() => {})
  const st = await sum.innerText().catch(() => '')
  ok("요약 한 줄: '확정하면 주휴 대상 1명 · 약 33,024원'", st.includes('확정하면 주휴 대상 1명 · 약 33,024원') && (await sum.evaluate((el) => el.getBoundingClientRect().height < 56)), st.replace(/\n/g, ' | '))
  const card = (name) => ap.locator('.card', { has: ap.getByRole('link', { name, exact: true }) }).first()
  const xl = card('확정이').locator('[data-weekly-impact]')
  const xb = await xl.innerText().catch(() => '')
  ok("확정이: '확정하면 주휴 대상 · 약 33,024원' (시간 변화는 눌러 보기·title)", xb === '확정하면 주휴 대상 · 약 33,024원' && ((await xl.getAttribute('title')) ?? '').includes('8시간 → 16시간'), xb)
  ok('여유(8시간): 표시 없음', (await card('여유').locator('[data-weekly-impact]').count()) === 0)
  const zl = card('이미').locator('[data-weekly-impact]')
  const zb = await zl.innerText().catch(() => '')
  ok("이미(이미 16시간): '이미 주휴 대상 주' (title 16시간 → 24시간)", zb === '이미 주휴 대상 주' && ((await zl.getAttribute('title')) ?? '').includes('16시간 → 24시간'), zb)
  ok('360px: 지원자 탭 옆으로 안 밀림', await wide(ap))
  if (SHOTS) await card('확정이').screenshot({ path: `${SHOTS}/apps-card.png` }).catch(() => {})

  // ── 2. 대시보드 확정 대기 · 주간 화면 ──
  await ap.goto(`${D}/admin`)
  await ap.locator('#pending').waitFor({ timeout: 15000 }).catch(() => {})
  const dash = ap.locator('#pending .card', { hasText: '확정이' }).first()
  ok("대시보드 확정 대기 카드: '확정하면 주휴 대상'", (await dash.locator('[data-weekly-impact]').innerText().catch(() => '')).includes('확정하면 주휴 대상'))
  ok("대시보드: 여유·이미는 표시 없음 (새로 생기는 사람만)", (await ap.locator('#pending .card', { hasText: '여유' }).first().locator('[data-weekly-impact]').count()) === 0)
  await ap.goto(`${D}/admin/weekly?w=${NEXT}`)
  const ex = ap.locator('[data-weekly-extra]')
  await ex.waitFor({ timeout: 15000 }).catch(() => {})
  const exT = await ex.innerText().catch(() => '')
  ok("주간 화면: '확정하면 주휴 대상 1명' · 확정이 · 화요일 행사 안내 · 8시간→16시간 · 33,024원", exT.includes('확정하면 주휴 대상 1명') && exT.includes('확정이') && exT.includes('화요일 행사 안내 · 8시간→16시간') && exT.includes('33,024원'), exT.replace(/\n/g, ' | '))
  ok('360px: 주간 화면 옆으로 안 밀림', await wide(ap))
  if (SHOTS) await ex.screenshot({ path: `${SHOTS}/weekly-extra.png` }).catch(() => {})

  // ── 3. 확정할 때 한 번 더 ──
  await ap.goto(`${D}/admin/jobs/${J2}?tab=apps`)
  await ap.locator('[data-weekly-impact-summary]').waitFor({ timeout: 15000 }).catch(() => {})
  const btn = await card('확정이').getByRole('button', { name: '확정', exact: true }).elementHandle()
  await btn.click()
  await ap.waitForTimeout(300)
  const armed = await btn.innerText()
  const before = (await rest(`applications?job_id=eq.${J2}`)).find((a) => a.user_id === UX)
  ok("첫 누름: '주휴 대상이 돼요 · 확정?' (아직 대기)", armed === '주휴 대상이 돼요 · 확정?' && before.status === 'applied', armed)
  await btn.click()
  await ap.waitForTimeout(2500)
  const after = (await rest(`applications?job_id=eq.${J2}`)).find((a) => a.user_id === UX)
  ok('두 번째 누름에 확정', after.status === 'approved')

  // ── 4. 근무자에게는 안 보임 ──
  const wp = await pg(UX)
  await wp.goto(`${D}/jobs/${J2}`)
  await wp.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무자 공고 화면에 '주휴' 없음", !(await wp.locator('main').innerText()).includes('주휴'))
  await wp.goto(`${D}/me`)
  await wp.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무자 내 근무 화면에 '주휴' 없음", !(await wp.locator('main').innerText()).includes('주휴'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
