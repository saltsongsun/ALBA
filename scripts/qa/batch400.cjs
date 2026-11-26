// 묶음 400 (정기 개선 2026-11-26 11:35 KST)
// 기능 · 여러 회사를 맡은 관리자 홈: 다른 회사 칩에 '미출근 n' (그 회사 오늘 행사가 시작했는데 아직 안 온 확정자 · 그 회사 자료만)
//   · 오늘 일하는 날이 아닌 사람 · 이미 온 사람 · 아직 확정 전(대기) · 끝난 행사는 안 셈 · 소속이 아닌 회사는 칩 자체가 없음
//   · 칩을 눌러 회사를 바꾸면 '확인할 일' 맨 위에 '미출근 · 공고' 줄 → 누르면 같은 화면 오늘 행사 카드로 (전화 칩이 거기)
// 디자인 · 할 일 줄 '↓' (같은 화면 아래로) · 도착한 카드 테두리 한 번 (0.3초 · 움직임 줄이기면 없음) · 칩 깜빡임 점 (움직임 줄이기면 점만) · 360px 옆으로 안 밀림
// node scripts/qa/batch400.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000040002', C3 = '99999999-0000-4000-8000-000000040003'
const A2 = 'aaaaaaaa-0000-4000-8000-000000040002'
const J2 = 'cccccccc-0000-4000-8000-000000040002', J3 = 'cccccccc-0000-4000-8000-000000040003', J4 = 'cccccccc-0000-4000-8000-000000040004'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000400${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)

;(async () => {
  const today = kday(0), tomorrow = kday(1), yesterday = kday(-1)
  // 우리 회사(C1) 오늘 행사: 하루 종일 진행 중 · 확정됐는데 안 온 사람 1명
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _b, ...jl } = job
  const [w] = await rest(`users?id=eq.${W}`)
  const people = {}
  const person = async (n, name) => {
    people[U(n)] = { ...w, id: U(n), name, phone: `010400000${String(n).padStart(2, '0')}`, attendance: [], ratings: [] }
    await rest('users', 'POST', people[U(n)])
  }
  const approve = (uid, jid, cid, jobRow, dates = null, status = 'approved') =>
    rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: uid, company_id: cid, status, available_dates: dates, created_at: new Date().toISOString(), job: jobRow, user: { ...people[uid] } })
  await person(5, '안온사람400')
  await approve(U(5), J, C1, jl)

  // 다른 회사 C2 (이 관리자 소속) · C3 (소속 아님)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째회사400', verified: true, seal_image: null, created_at: new Date(Date.now() + 1000).toISOString() })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '남의회사400', verified: true, seal_image: null, created_at: new Date(Date.now() + 2000).toISOString() })
  const mkJob = async (id, cid, title, patch = {}) => {
    const row = { ...jl, id, company_id: cid, title, status: 'open', start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00', created_at: new Date().toISOString(), ...patch }
    await rest('jobs', 'POST', { ...row, applications: [], attendance: [] })
    return row
  }
  const j2 = await mkJob(J2, C2, '둘째행사400')
  const j3 = await mkJob(J3, C2, '어제끝남400', { start_date: yesterday, end_date: yesterday })
  const j4 = await mkJob(J4, C3, '남의행사400')
  for (const [n, name] of [[6, '둘째안옴400'], [7, '내일만400'], [8, '이미옴400'], [9, '대기중400'], [10, '어제사람400'], [11, '남의사람400']]) await person(n, name)
  await approve(U(6), J2, C2, j2) // 셈
  await approve(U(7), J2, C2, j2, [tomorrow]) // 오늘 일하는 날이 아님
  await approve(U(8), J2, C2, j2) // 이미 옴
  await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: J2, user_id: U(8), company_id: C2, work_date: today, clock_in: new Date(Date.now() - 3600e3).toISOString(), clock_out: null, paid: false })
  await approve(U(9), J2, C2, j2, null, 'applied') // 아직 확정 전 (대기)
  await approve(U(10), J3, C2, j3) // 끝난 행사
  await approve(U(11), J4, C3, j4) // 소속이 아닌 회사

  // 두 회사를 맡은 관리자 (최고 관리자 아님)
  const [ua] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...ua, id: A2, name: '두회사관리400', phone: '01040000001', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: A2, role: 'owner', created_at: new Date(Date.now() - 30 * 864e5).toISOString() })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'manager', created_at: new Date(Date.now() - 30 * 864e5).toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { company, reducedMotion } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...(reducedMotion ? { reducedMotion } : {}) })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 다른 회사 칩: '미출근 1' (그 회사 자료만) ──
  const a = await mk(A2, { company: C1 })
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const row = a.locator('[data-other-companies]')
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  const c2chip = row.locator('form', { has: a.locator(`input[name="company"][value="${C2}"]`) })
  const absent = c2chip.locator('[data-other-absent]')
  ok("다른 회사 칩 '미출근 1' (내일만·이미 옴·대기·끝난 행사는 안 셈)", one(await absent.innerText().catch(() => '')) === '미출근 1', one(await c2chip.innerText().catch(() => '')))
  ok("머리말 '다른 회사에 확인할 일'", one(await row.innerText().catch(() => '')).includes('다른 회사에 확인할 일'))
  ok('소속이 아닌 회사는 칩이 없음', (await row.locator(`input[name="company"][value="${C3}"]`).count()) === 0)
  ok("'미출근'이 있으면 '오늘 행사 n'은 줄임 (회사 이름 자리) · 회사 이름이 다 보임", (await c2chip.locator('[data-other-today]').count()) === 0 && (await c2chip.locator('button > span').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false)))
  ok('칩 글자 한 줄 · 깜빡임 점', (await absent.evaluate((el) => el.getClientRects().length).catch(() => 0)) === 1 && (await absent.locator('.animate-ping').count()) === 1)
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await row.screenshot({ path: `${SHOTS}/other-absent.png` }).catch(() => {})

  // ── 2. 지금 회사: '확인할 일' 맨 위 쪽 '미출근 · 공고' → 오늘 행사 카드 ──
  const todo = a.locator(`[data-todo="absent-${J}"]`)
  const tt = one(await todo.innerText().catch(() => ''))
  ok("할 일 줄 '미출근 · 공고 n명 ↓'", tt.startsWith(`미출근 · ${jl.title}`) && /\d+명 ↓$/.test(tt), tt)
  ok('같은 화면 아래 카드로 (#today-공고)', (await todo.locator('a').first().getAttribute('href')) === `#today-${J}`)
  if (SHOTS) await a.locator('[data-todo]').first().locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/todo-absent.png` }).catch(() => {})
  await todo.locator('a').first().click()
  await a.waitForTimeout(120)
  const card = a.locator(`#today-${J}`)
  const st = await card.evaluate((el) => ({ an: getComputedStyle(el).animationName, top: el.getBoundingClientRect().top, target: el.matches(':target') })).catch(() => ({}))
  ok('누르면 그 카드가 화면에 · 테두리가 한 번 (flash-ring)', a.url().endsWith(`#today-${J}`) && st.target && st.top >= 0 && st.top < 740 && String(st.an).includes('flash-ring'), JSON.stringify(st))
  ok('카드에 안 온 사람 전화 칩', (await card.locator('[data-absent-call]').innerText().catch(() => '')).includes('안온사람400'))

  // ── 3. 움직임 줄이기: 점만 · 카드 테두리 움직임 없음 ──
  const rm = await mk(A2, { company: C1, reducedMotion: 'reduce' })
  await rm.goto(`${D}/admin#today-${J}`, { waitUntil: 'networkidle' })
  const rmPing = await rm.locator(`[data-other-companies] [data-other-absent] .animate-ping`).evaluate((el) => getComputedStyle(el).display).catch(() => '')
  const rmAn = await rm.locator(`#today-${J}`).evaluate((el) => getComputedStyle(el).animationName).catch(() => '')
  ok('움직임 줄이기: 깜빡임 숨김 · 카드 테두리 움직임 없음', rmPing === 'none' && rmAn === 'none', `${rmPing} / ${rmAn}`)

  // ── 4. 칩을 누르면 그 회사로 · 맨 위에 '미출근 · 둘째행사400 1명' ──
  await c2chip.locator('button').click()
  await a.waitForURL((u) => u.pathname === '/admin' && u.searchParams.has('m'), { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  const t2 = a.locator(`[data-todo="absent-${J2}"]`)
  await t2.waitFor({ timeout: 10000 }).catch(() => {})
  ok("회사를 바꾸면 '미출근 · 둘째행사400 1명 ↓'", one(await t2.innerText().catch(() => '')) === '미출근 · 둘째행사400 1명 ↓', one(await t2.innerText().catch(() => '')))
  ok('그 회사 오늘 카드에 안 온 사람만 (내일만·이미 옴은 없음)', await a.locator(`#today-${J2} [data-absent-call]`).innerText().then((s) => s.includes('둘째안옴400') && !s.includes('내일만400') && !s.includes('이미옴400') && !s.includes('대기중400')).catch(() => false))
  ok('끝난 행사·남의 회사 공고는 할 일에 없음', (await a.locator(`[data-todo="absent-${J3}"], [data-todo="absent-${J4}"]`).count()) === 0)
  // 지금 회사 C2에서 보면 C1 칩에 '미출근' (우리 회사 C1의 안 온 사람)
  const c1chip = a.locator('[data-other-companies] form', { has: a.locator(`input[name="company"][value="${C1}"]`) })
  ok("바꾼 뒤 C1 칩에도 '미출근' (지금 회사는 칩에 없음)", /^미출근 \d+$/.test(one(await c1chip.locator('[data-other-absent]').innerText().catch(() => ''))) && (await a.locator(`[data-other-companies] input[value="${C2}"]`).count()) === 0)
  ok('바꾼 뒤도 360px 옆으로 안 밀림', await noSide(a))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
