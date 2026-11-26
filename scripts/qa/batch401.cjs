// 묶음 401 (정기 개선 2026-11-26 15:35 KST)
// 기능 · 관리자 홈 '오늘 진행 행사' 미출근 전화 칩: 오늘 '늦어요'를 보낸 사람은 '· HH:MM 도착', 현장 위치 확인을 요청한 사람은 '· 현장'
//   · 아무 말 없는 사람(전화할 사람)이 앞에 · 어제 보낸 '늦어요'는 안 셈
//   · '근무 시작 버튼 보내기' 확인 숫자 = 실제로 받는 사람 (늦어요·현장 확인 요청을 보낸 사람은 빠짐 — 서버와 같은 기준)
//   · 그런 사람만 남으면 보내기 줄을 숨김
// 디자인 · 근무자 상세 성실도: '근무 n일 · 지각 n · 노쇼 n' 칩 하나 (칩 여섯 개가 세 줄로 쌓이지 않게 · 있는 것만 색) · 레벨 칩은 맨 앞 그대로
// node scripts/qa/batch401.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000401${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)

;(async () => {
  const today = kday(0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _b, ...jl } = job
  const [w] = await rest(`users?id=eq.${W}`)
  const people = {}
  const person = async (n, name) => {
    people[U(n)] = { ...w, id: U(n), name, phone: `010401000${String(n).padStart(2, '0')}`, attendance: [], ratings: [] }
    await rest('users', 'POST', people[U(n)])
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: U(n), company_id: C1, status: 'approved', available_dates: null, created_at: new Date().toISOString(), job: jl, user: { ...people[U(n)] } })
  }
  const say = (n, body, ago = 600e3) => rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: U(n), sender_id: U(n), from_admin: false, company_id: C1, job_id: J, body, created_at: new Date(Date.now() - ago).toISOString(), read_at: null })
  // 다른 확정자는 오늘 출근 기록을 넣어 이 테스트 사람만 미출근으로
  for (const a of await rest(`applications?job_id=eq.${J}`)) {
    if (a.status !== 'approved' || a.user_id === W) continue
    if (!(await rest(`attendance?job_id=eq.${J}&user_id=eq.${a.user_id}&work_date=eq.${today}`)).length)
      await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: a.user_id, company_id: C1, work_date: today, clock_in: new Date(Date.now() - 3600e3).toISOString(), clock_out: null, paid: false })
  }
  await person(1, '말없음401') // 아무 말 없음 → 전화할 사람
  await person(2, '늦어요401') // 오늘 늦어요 (10:20 도착)
  await person(3, '현장401') // 오늘 현장 위치 확인 요청
  await person(4, '어제늦음401') // 어제 보낸 늦어요 → 안 셈
  await say(2, `🕒 지각 알림\n${jl.title} · 약 20분 늦어요 (도착 예정 10:20)`)
  await say(3, `📍 출근 확인 요청\n${jl.title} · 현장인데 위치 확인이 안 돼요 (약 80m)`)
  await say(4, `🕒 지각 알림\n${jl.title} · 약 10분 늦어요 (도착 예정 09:10)`, 26 * 3600e3)

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
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const card = a.locator(`#today-${J}`)
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const chips = card.locator('[data-absent-call] a[href^="tel:"]')
  const list = await chips.evaluateAll((els) => els.map((e) => ({ t: e.innerText.replace(/\s+/g, ' ').trim(), told: e.getAttribute('data-absent-told') })))
  const names = list.map((c) => c.t)

  // ── 1. 전화 칩: 말 없는 사람 먼저 · 늦어요 'HH:MM 도착' ──
  const firstTold = list.findIndex((c) => c.told)
  ok('아무 말 없는 사람이 앞에 (말없음 · 어제늦음 먼저)', list.length === 3 && firstTold === 2 && names.slice(0, 2).every((t) => /말없음401|어제늦음401/.test(t)), JSON.stringify(names))
  const lateChip = list.find((c) => c.t.includes('늦어요401'))
  ok("늦어요 보낸 사람: '늦어요401 · 10:20 도착'", !!lateChip && lateChip.t.endsWith('늦어요401 · 10:20 도착') && lateChip.told === 'late', JSON.stringify(lateChip))
  ok("어제 보낸 늦어요는 안 셈 (표시 없음)", list.some((c) => c.t.endsWith('어제늦음401') && !c.told))
  ok("넷째 사람은 '외 1명 →'", one(await card.locator('[data-absent-call]').innerText().catch(() => '')).includes('외 1명'))
  ok('칩 한 줄 · 360px 옆으로 안 밀림', (await chips.evaluateAll((els) => els.every((e) => e.getClientRects().length === 1))) && (await noSide(a)))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/today-told.png` }).catch(() => {})

  // ── 2. 보내기: 확인 숫자 = 실제로 받는 사람 (늦어요·현장은 빠짐) ──
  const btn = card.locator('[data-absent-nudge] button')
  await btn.click()
  ok("한 번 누르면 '2명에게 보낼까요?' (말없음 · 어제늦음)", one(await btn.innerText().catch(() => '')) === '2명에게 보낼까요?', one(await btn.innerText().catch(() => '')))
  await btn.click()
  await a.waitForURL((u) => u.pathname === '/admin' && u.searchParams.get('from') === 'today', { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  const sent = (await rest(`messages?job_id=eq.${J}`)).filter((m) => m.from_admin && (m.body ?? '').startsWith('⏰ 출근 확인'))
  const to = new Set(sent.map((m) => m.thread_user_id))
  ok('받은 사람 = 말없음 · 어제늦음 (늦어요·현장은 빠짐)', to.has(U(1)) && to.has(U(4)) && !to.has(U(2)) && !to.has(U(3)), JSON.stringify([...to]))

  // ── 3. 말 없는 사람이 출근하면: 남은 두 사람 '도착'·'현장' · 보내기 줄 숨김 ──
  for (const n of [1, 4]) await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: U(n), company_id: C1, work_date: today, clock_in: new Date().toISOString(), clock_out: null, paid: false })
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const left = await card.locator('[data-absent-call] a[href^="tel:"]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
  ok("남은 두 사람: '늦어요401 · 10:20 도착' · '현장401 · 현장'", left.length === 2 && left.some((t) => t.endsWith('늦어요401 · 10:20 도착')) && left.some((t) => t.endsWith('현장401 · 현장')), JSON.stringify(left))
  ok('보낼 사람이 없으면 보내기 줄 숨김', (await card.locator('[data-absent-nudge]').count()) === 0)
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/today-told-only.png` }).catch(() => {})

  // ── 4. 근무자 상세: 성실도 칩 하나 ──
  await a.goto(`${D}/admin/workers/${W}`, { waitUntil: 'networkidle' })
  const rel = a.locator('[data-worker-rel]')
  await rel.waitFor({ timeout: 15000 }).catch(() => {})
  const rec = one(await rel.locator('[data-worker-record]').innerText().catch(() => ''))
  ok("'근무 n일 · 지각 n · 노쇼 n' 칩 하나", /^근무 \d+일 · 지각 \d+ · 노쇼 \d+( · 귀가 조치 \d+)?$/.test(rec), rec)
  ok("따로 떨어진 '지각 n회'·'노쇼 n회' 칩 없음", !/지각 \d+회|노쇼 \d+회/.test(one(await rel.innerText().catch(() => ''))))
  ok('성실도 칩은 한 줄', (await rel.locator('[data-worker-record]').evaluate((el) => el.getClientRects().length).catch(() => 0)) === 1)
  ok('근무자 화면 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await rel.locator('xpath=..').screenshot({ path: `${SHOTS}/worker-record.png` }).catch(() => {})

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
