// 묶음 303 (정기 개선 2026-11-18 17:35 KST)
// · 내 근무 홈 '근무 내역 · 급여' 카드에도 '지난 근무'와 같은 정산일 한 줄 (같은 계산 · 같은 모양):
//   아직이면 '💰 정산 예정 M/D' + 남은 날 'D-n'(그날이면 '오늘') · 지났으면 빨강 '정산일 M/D 지남 · 문의 →' · 물어본 뒤 '✓ 물어봄 ›'
// · 지급 끝난 카드: 회색 '지급완료' → 체크가 그려지는 초록 '✓ 지급완료' (지난 근무 배지도 같게) · 정산일 줄 없음
// node scripts/qa/batch303.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const J2 = 'cccccccc-0000-4000-8000-000000030301', J3 = 'cccccccc-0000-4000-8000-000000030302'
const ATT3 = 'eeeeeeee-0000-4000-8000-000000030302'
const ASK = '정산일이 지났는데 급여가 아직 안 들어왔어요. 확인 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 끝난 행사 둘 (W가 확정돼 일함 · 지급 전): J2는 어제가 정산일이라고 알림, J3는 닷새 뒤라고 알림
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const mkJob = (id, title, day) => rest('jobs', 'POST', { ...jb, id, title, status: 'closed', start_date: kday(day), end_date: kday(day), pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(J2, '가을 축제 주차 안내', -2)
  await mkJob(J3, '겨울 박람회 안내', -3)
  const jobOf = async (id) => (await rest(`jobs?id=eq.${id}`))[0]
  for (const [job, day, n] of [[J2, -2, 1], [J3, -3, 2]]) {
    const full = await jobOf(job)
    await rest('applications', 'POST', { id: `11111111-0000-4000-8000-00000003030${n}`, job_id: job, user_id: W, status: 'approved', available_dates: null, position: null, contract_received_at: null, message: '', admin_memo: null, decided_at: new Date().toISOString(), created_at: `${kday(day - 5)}T10:00:00+09:00`, job: full })
    await rest('attendance', 'POST', { id: `eeeeeeee-0000-4000-8000-00000003030${n}`, job_id: job, job: full, user_id: W, work_date: kday(day), clock_in: `${kday(day)}T09:00:00+09:00`, clock_out: `${kday(day)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, confirmed: true, created_at: new Date().toISOString() })
  }
  const told = (id, job, title, day, at) => rest('messages', 'POST', { id, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: job, body: `💰 정산 예정일 안내\n${title} · 정산 예정일: ${md(day)}`, read_at: null, created_at: at })
  await told(3030001, J2, '가을 축제 주차 안내', kday(-1), `${kday(-2)}T19:00:00+09:00`)
  await told(3030002, J3, '겨울 박람회 안내', kday(5), `${kday(-2)}T19:00:00+09:00`)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const me = async () => { await w.goto(`${D}/me`, { waitUntil: 'networkidle' }); await w.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }
  const card = (job) => w.locator(`main [data-history-job="${job}"]`).first()
  const line = (job) => card(job).locator('[data-payday-line]')

  // ── 1. 내 근무 홈: 지난 정산일은 빨강 '문의 →' · 아직이면 '정산 예정 M/D' + 'D-5'
  await me()
  await card(J3).waitFor({ timeout: 15000 }).catch(() => {})
  const over = line(J2)
  ok(`지난 정산일: '💰 정산일 ${md(kday(-1))} 지남 · 문의 →' → 그 공고로 문의`, (await over.getAttribute('data-payday-line').catch(() => null)) === 'over' && one(await over.textContent()) === `💰 정산일 ${md(kday(-1))} 지남 · 문의 →` && (await over.getAttribute('href')) === `/me/chat?job=${J2}&ask=paylate`)
  const soon = line(J3)
  ok(`아직: '💰 정산 예정 ${md(kday(5))}' + 'D-5'`, one(await soon.textContent().catch(() => '')) === `💰 정산 예정 ${md(kday(5))}D-5` && (await soon.locator('[data-payday-left]').getAttribute('data-payday-left')) === '5', one(await soon.textContent().catch(() => '')))
  ok('정산일 줄은 한 줄', await soon.evaluate((el) => el.getBoundingClientRect().height < 22) && await over.evaluate((el) => el.getBoundingClientRect().height < 22))
  ok('오늘 근무 중인 공고 카드엔 정산일 줄 없음', (await w.locator(`main [data-history-job="${J}"] [data-payday-line]`).count()) === 0)
  ok('지급 전 카드는 그대로 회색 \'실수령 예상\'', one(await card(J3).locator('.text-right p').last().textContent()) === '실수령 예상')
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
  if (SHOTS) await card(J2).locator('xpath=..').evaluate((el) => el.scrollIntoView({ block: 'center' })).then(() => w.waitForTimeout(400)).then(() => card(J2).locator('xpath=..').screenshot({ path: `${SHOTS}/me-paydays.png` })).catch(() => {})

  // '지난 근무'도 같은 줄 (같은 계산)
  await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  ok("지난 근무도 같은 말 ('D-5' · '문의 →')", one(await w.locator(`[data-history-job="${J3}"] [data-payday-line]`).textContent().catch(() => '')) === `💰 정산 예정 ${md(kday(5))}D-5` && (await w.locator(`[data-history-job="${J2}"] [data-payday-line="over"]`).count()) === 1)

  // ── 2. 그날이면 '오늘'
  await told(3030003, J3, '겨울 박람회 안내', kday(0), new Date(Date.now() - 60e3).toISOString())
  await me()
  const today = line(J3).locator('[data-payday-left]')
  ok(`정산일이 오늘이면 '💰 정산 예정 ${md(kday(0))}' + '오늘'`, (await today.getAttribute('data-payday-left').catch(() => null)) === '0' && one(await today.textContent()) === '오늘')

  // ── 3. 물어본 뒤엔 '✓ 물어봄 ›' (그 회사 문의함)
  await rest('messages', 'POST', { id: 3030004, thread_user_id: W, sender_id: W, from_admin: false, company_id: C1, job_id: J2, body: ASK, read_at: null, created_at: new Date().toISOString() })
  await me()
  const asked = line(J2)
  ok("물어본 뒤 '… 지남 · ✓ 물어봄 ›' → 그 회사 문의함", (await asked.getAttribute('data-payday-line').catch(() => null)) === 'asked' && one(await asked.textContent()) === `💰 정산일 ${md(kday(-1))} 지남 · ✓ 물어봄 ›` && (await asked.getAttribute('href')) === `/me/chat?co=${C1}`)

  // ── 4. 지급 끝: 체크가 그려지는 초록 '지급완료' · 정산일 줄 없음
  await rest(`attendance?id=eq.${ATT3}`, 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await me()
  const done = card(J3).locator('[data-paid-done]')
  await done.waitFor({ timeout: 15000 }).catch(() => {})
  ok("지급 끝: '지급완료' + 그려지는 체크 (초록)", one(await done.textContent().catch(() => '')) === '지급완료' && (await done.locator('path.check-draw').count()) === 1 && (await done.getAttribute('class')).includes('text-emerald-700'))
  ok('지급 끝난 카드엔 정산일 줄 없음', (await line(J3).count()) === 0)
  await w.waitForTimeout(700)
  ok('체크가 다 그려짐 (선이 보임)', await done.locator('path').evaluate((p) => getComputedStyle(p).strokeDashoffset === '0px' || getComputedStyle(p).strokeDashoffset === '0'))
  if (SHOTS) await card(J3).screenshot({ path: `${SHOTS}/me-paid.png` }).catch(() => {})
  await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  ok("지난 근무 배지도 체크 + '지급완료'", one(await w.locator(`[data-history-job="${J3}"] [data-paid-done]`).textContent().catch(() => '')) === '지급완료' && (await w.locator(`[data-history-job="${J3}"] [data-paid-done] path.check-draw`).count()) === 1)
  ok('360px 옆으로 안 밀림 (지난 근무)', await noSide(w))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
