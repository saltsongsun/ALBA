// 묶음 299 (정기 개선 2026-11-18 09:36 KST)
// · 관리자 홈 '급여 지급 전 · 공고' 할 일: 근무자에게 약속한 정산일을 작은 줄로 (마지막으로 알린 '💰 정산 예정일' · 알린 적 없으면 공고의 지급일 글자로 짐작)
//   정산일이 오늘이거나 지났으면 빨강('정산일 M/D 지남' · '오늘이 정산일이에요') · 정산일이 이른 것부터 · 알린 날짜의 연도는 알린 날 기준(12월에 '1/5'로 알리면 다음 해)
// · 정산 탭 '정산 예정일 알리기' 칸: 알린 정산일이 지났는데 지급 전인 사람이 있으면 '정산일 M/D 지남 · n명 지급 전' 한 줄 (깜빡이는 점)
// node scripts/qa/batch299.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const J2 = 'cccccccc-0000-4000-8000-000000029901', J3 = 'cccccccc-0000-4000-8000-000000029902'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 전에 끝난 행사 둘 (근무자 W가 일함 · 지급 전)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const mkJob = (id, title, pay_day) => rest('jobs', 'POST', { ...jb, id, title, status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(J2, '가을 축제 주차 안내', null)
  await mkJob(J3, '겨울 박람회 안내', null)
  const att = (id, job) => rest('attendance', 'POST', { id, job_id: job, user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, created_at: new Date().toISOString() })
  await att('eeeeeeee-0000-4000-8000-000000029901', J2)
  await att('eeeeeeee-0000-4000-8000-000000029902', J3)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const home = async () => {
    await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await a.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  }
  const row = (job) => a.locator(`[data-todo="unpaid-${job}"]`)
  const sub = async (job) => one(await row(job).locator('span.text-xs.text-mute').textContent({ timeout: 3000 }).catch(() => ''))
  const tone = async (job) => (await row(job).locator('b').getAttribute('class').catch(() => '')) ?? ''

  // ── 1. 지급일도 알림도 없으면: 작은 줄 없이 그대로
  await home()
  ok("지급일·알림이 없으면 '급여 지급 전 · 공고'만 (작은 줄 없음 · 주황)", (await row(J2).count()) === 1 && (await row(J2).locator('span.text-xs.text-mute').count()) === 0 && (await tone(J2)).includes('text-amber-700'))

  // ── 2. 공고의 지급일 글자로 짐작 ('익월 10일' → 다음 달 10일)
  const [y, m] = kday(-3).split('-').map(Number)
  const next10 = m === 12 ? `${y + 1}-01-10` : `${y}-${String(m + 1).padStart(2, '0')}-10`
  await rest(`jobs?id=eq.${J2}`, 'PATCH', { pay_day: '익월 10일' })
  await home()
  ok(`지급일 '익월 10일' → '정산일 ${md(next10)}' (아직이면 주황)`, (await sub(J2)) === `정산일 ${md(next10)}` && (await tone(J2)).includes('text-amber-700'), await sub(J2))

  // ── 3. 알린 정산일이 어제였으면: 빨강 '지남' · 맨 위로
  const yesterday = kday(-1)
  await rest('messages', 'POST', { id: 2990001, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J2, body: `💰 정산 예정일 안내\n가을 축제 주차 안내 · 정산 예정일: ${md(yesterday)}`, read_at: null, created_at: `${kday(-2)}T10:00:00+09:00` })
  await home()
  ok(`알린 정산일이 지났으면 '정산일 ${md(yesterday)} 지남' · 빨강`, (await sub(J2)) === `정산일 ${md(yesterday)} 지남` && (await tone(J2)).includes('text-rose-600'), await sub(J2))
  // 12월에 '1/5'로 알리면 다음 해 1월 5일 (지난 날로 치지 않음)
  await rest('messages', 'POST', { id: 2990002, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J3, body: `💰 정산 예정일 안내\n겨울 박람회 안내 · 정산 예정일: 1/5(화)까지`, read_at: null, created_at: `${y}-12-28T10:00:00+09:00` })
  await home()
  ok("12/28에 '1/5까지'로 알렸으면 다음 해 1/5 (아직 · 주황)", (await sub(J3)).startsWith('정산일 1/5(') && (await tone(J3)).includes('text-amber-700'), await sub(J3))
  ok('정산일이 지난 공고가 먼저', await a.evaluate(([j2, j3]) => { const all = [...document.querySelectorAll('[data-todo^="unpaid-"]')].map((e) => e.getAttribute('data-todo')); return all.indexOf(`unpaid-${j2}`) < all.indexOf(`unpaid-${j3}`) }, [J2, J3]))
  ok('360px 옆으로 안 밀림 (관리자 홈)', await noSide(a))
  if (SHOTS) await row(J2).locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/unpaid-payday.png` }).catch(() => {})

  // ── 4. 오늘이 정산일
  await rest('messages', 'POST', { id: 2990003, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J2, body: `💰 정산 예정일 안내\n가을 축제 주차 안내 · 정산 예정일: ${md(kday(0))}`, read_at: null, created_at: `${kday(0)}T08:00:00+09:00` })
  await home()
  ok("가장 최근에 알린 날이 오늘이면 '오늘이 정산일이에요' · 빨강", (await sub(J2)) === '오늘이 정산일이에요' && (await tone(J2)).includes('text-rose-600'), await sub(J2))

  // ── 5. 정산 탭: 알린 정산일이 지났으면 그 칸에 한 줄
  await rest(`messages?id=eq.2990003`, 'DELETE')
  await a.goto(`${D}/admin/jobs/${J2}?tab=pay`, { waitUntil: 'networkidle' })
  const due = a.locator('[data-payday-due]')
  await due.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`정산 탭: '정산일 ${md(yesterday)} 지남 · 1명 지급 전' (한 줄)`, one(await due.textContent().catch(() => '')) === `정산일 ${md(yesterday)} 지남 · 1명 지급 전` && (await due.getAttribute('data-payday-due')) === 'over' && (await due.evaluate((el) => el.getBoundingClientRect().height < 44)))
  ok('360px 옆으로 안 밀림 (정산 탭)', await noSide(a))
  if (SHOTS) await a.locator('[data-payday]').screenshot({ path: `${SHOTS}/pay-tab-due.png` }).catch(() => {})

  // ── 6. 지급 완료하면 할 일에서 빠짐
  await rest(`attendance?id=eq.eeeeeeee-0000-4000-8000-000000029901`, 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await home()
  ok('지급 완료하면 할 일에서 빠짐', (await row(J2).count()) === 0 && (await row(J3).count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
