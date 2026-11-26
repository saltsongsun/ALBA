// 묶음 406 (정기 개선 2026-11-27 01:36 KST)
// · 회사 간 자료 분리 점검 (지난 점검 batch395 뒤에 더한 기능들):
//   - 대시보드 '오늘 진행 행사' 미출근 전화 칩 '· HH:MM 도착' · 다른 회사 칩 '미출근 n'
//   - 근무자 상세 '오늘 근무' 줄 · 문의 대화 머리 '오늘 근무' 줄
//   - 근무자 명단 '계좌 미등록 › / 요청함 ›' · 근무자 상세 'M/D 요청함' (그 회사가 보낸 요청만)
//   다른 회사(격리상사406)의 미출근·늦어요·계좌 요청이 우리 회사(C1) 화면에 섞이지 않음
//   두 회사를 맡은 관리자(M)에게는 칩에 회사 이름과 숫자만 · 그 회사를 고르면 그때 자세히 (검사가 헛돌지 않게 대조)
// node scripts/qa/batch406.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000406'
const N = 'aaaaaaaa-0000-4000-8000-000000040601' // 우리 회사(C1)만 맡은 관리자
const M = 'aaaaaaaa-0000-4000-8000-000000040602' // C1 관리자 + 격리상사406 대표
const U = '44444444-0000-4000-8000-000000040605' // 격리상사406 근무자 (오늘 미출근 · 늦어요 알림)
const J2 = 'cccccccc-0000-4000-8000-000000040601'
const MARK = ['격리행사406', '격리근무자406']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const leaks = (t, extra = []) => [...MARK, ...extra].filter((m) => (t ?? '').includes(m))

;(async () => {
  const today = kstDay(Date.now())
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [w] = await rest(`users?id=eq.${W}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job

  // 다른 회사(격리상사406): 오늘 0시부터 하루 종일 행사 · 확정자 U는 출근 기록 없이 '늦어요(10:20 도착)'를 보냄
  //   · 우리 회사 근무자 W도 그 회사에 지원(대기)했고, 그 회사만 W에게 '계좌 등록 요청'을 보냄
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사406', join_code: 'ISO406', seal_image: null, created_at: ago(5) })
  const admin = (id, name, phone) => rest('users', 'POST', { ...a, id, name, phone, is_super: false })
  await admin(N, '한회사관리자406', '01040600001')
  await admin(M, '두회사관리자406', '01040600002')
  await rest('users', 'POST', { ...w, id: U, name: '격리근무자406', phone: '01040600005', birth_date: '1995-05-05', role: 'worker', active: true, careers: [], photo_at: null, created_at: ago(300), attendance: [], ratings: [] })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C1, user_id: M, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'owner', created_at: ago(5) })
  const j2 = { ...jl, id: J2, company_id: C2, company: { company_name: '격리상사406' }, title: '격리행사406', start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00', status: 'open', created_at: ago(100) }
  await rest('jobs', 'POST', { ...j2, applications: [], attendance: [] })
  await rest('applications', 'POST', { id: 'ffffffff-0000-4000-8000-000000040601', job_id: J2, user_id: U, company_id: C2, status: 'approved', available_dates: null, position: null, message: null, held_at: null, contract_received_at: null, created_at: ago(90), job: j2, user: { id: U, name: '격리근무자406', phone: '01040600005' } })
  await rest('applications', 'POST', { id: 'ffffffff-0000-4000-8000-000000040602', job_id: J2, user_id: W, company_id: C2, status: 'pending', available_dates: null, position: null, message: null, held_at: null, contract_received_at: null, created_at: ago(80), job: j2, user: { id: W, name: w.name, phone: w.phone } })
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: U, sender_id: U, from_admin: false, company_id: C2, job_id: J2, body: '🕒 지각 알림\n격리행사406 · 약 20분 늦어요 (도착 예정 10:20)', created_at: new Date(Date.now() - 600e3).toISOString(), read_at: null })
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: W, sender_id: M, from_admin: true, company_id: C2, job_id: J2, body: '💳 계좌 등록 요청\n급여 받을 계좌를 등록해 주세요.', created_at: ago(1), read_at: null })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid, 600), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const body = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
    await p.waitForTimeout(150)
    return p.locator('body').innerText().catch(() => '')
  }
  // 명단에서 W 줄의 계좌 표시 ('요청함 ›' / '미등록 ›')
  const rosterAccount = async (p) => {
    await p.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' }).catch(() => {})
    const l = p.locator(`a[href="/admin/workers/${W}#account-ask"]`).first()
    return (await l.count()) ? one(await l.innerText()) : null
  }

  // ── 0. 대조 (검사가 헛돌지 않게): 격리상사406을 고른 대표(M)에게는 그 회사 자료가 보임
  const m2 = await pg(M, C2)
  await body(m2, '/admin')
  const call2 = m2.locator('[data-absent-call]').filter({ hasText: '격리근무자406' })
  ok("대조: 그 회사 대시보드 미출근 칩 '격리근무자406 · 10:20 도착'", (await call2.count()) === 1 && one(await call2.innerText().catch(() => '')).includes('격리근무자406 · 10:20 도착'), one(await call2.innerText().catch(() => '')))
  await body(m2, `/admin/workers/${U}`)
  ok("대조: 그 회사 근무자 상세 '오늘 근무' 줄 (미출근 · 10:20 도착)", /미출근.*10:20 도착/.test(one(await m2.locator('[data-worker-today]').innerText().catch(() => ''))), one(await m2.locator('[data-worker-today]').innerText().catch(() => '')))
  await body(m2, `/admin/chat/${U}`)
  ok("대조: 그 회사 문의 대화 머리 '오늘 근무' 줄 (10:20 도착)", one(await m2.locator('[data-chat-work]').innerText().catch(() => '')).includes('10:20 도착'), one(await m2.locator('[data-chat-work]').innerText().catch(() => '')))
  ok("대조: 그 회사 명단에서 W는 '요청함 ›' (그 회사가 요청함)", (await rosterAccount(m2)) === '요청함 ›', String(await rosterAccount(m2)))
  await body(m2, `/admin/workers/${W}`)
  ok("대조: 그 회사 근무자 상세 W '요청함'", (await m2.locator('[data-account-asked]').count()) === 1)

  // ── 1. 두 회사를 맡은 관리자가 우리 회사(C1)를 보고 있을 때: 칩에는 회사 이름·숫자만
  const m1 = await pg(M, C1)
  const mDash1 = await body(m1, '/admin')
  const chip = m1.locator('[data-other-absent]').first()
  ok("두 회사 관리자: 다른 회사 칩 '미출근 1' (숫자만)", (await chip.count()) === 1 && one(await chip.innerText().catch(() => '')) === '미출근 1', one(await chip.innerText().catch(() => '')))
  ok('두 회사 관리자: 우리 회사 대시보드에 다른 회사 공고·근무자 이름 없음 (미출근 전화 칩 포함)', leaks(mDash1).length === 0 && (await m1.locator('[data-absent-call]').filter({ hasText: '격리' }).count()) === 0, leaks(mDash1).join(','))
  ok("두 회사 관리자 · 우리 회사 명단: W는 '미등록 ›' (다른 회사 요청은 안 셈)", (await rosterAccount(m1)) === '미등록 ›', String(await rosterAccount(m1)))
  await body(m1, `/admin/workers/${W}`)
  ok("두 회사 관리자 · 우리 회사 근무자 상세 W: '요청함' 없음 (요청 버튼 그대로)", (await m1.locator('[data-account-ask]').count()) === 1 && (await m1.locator('[data-account-asked]').count()) === 0)
  for (const path of [`/admin/workers/${U}`, `/admin/chat/${U}`, '/admin/chat', '/admin/workers']) {
    const t = await body(m1, path)
    const found = leaks(t).filter((x) => !(path.startsWith('/admin/workers') && x === '격리근무자406'))
    ok(`두 회사 관리자 · 우리 회사 화면 새지 않음: ${path}`, found.length === 0 && (await m1.locator('[data-worker-today], [data-chat-work]').count()) === 0, found.join(','))
  }

  // ── 2. 우리 회사만 맡은 관리자(N): 다른 회사 이름·칩·자료 모두 없음 (다른 회사 쿠키를 넣어도)
  for (const [label, co] of [['한 회사 관리자', C1], ['맡지 않은 회사를 쿠키로 고른 한 회사 관리자', C2]]) {
    const n = await pg(N, co)
    const dash = await body(n, '/admin')
    ok(`${label} 대시보드: 다른 회사 칩·이름·미출근 없음`, (await n.locator('[data-other-absent]').count()) === 0 && leaks(dash, ['격리상사406']).length === 0, leaks(dash, ['격리상사406']).join(','))
    ok(`${label} 명단: W는 '미등록 ›'`, (await rosterAccount(n)) === '미등록 ›', String(await rosterAccount(n)))
    for (const path of [`/admin/workers/${U}`, `/admin/chat/${U}`, `/admin/workers/${W}`, `/admin/jobs/${J2}?tab=att`]) {
      const t = await body(n, path)
      // 근무자 상세는 해피워크 전체 회원 화면이라 이름은 원래 보일 수 있음 → 이름 빼고 봄
      const found = leaks(t, ['격리상사406']).filter((x) => !(path.startsWith('/admin/workers') && x === '격리근무자406'))
      // W는 우리 회사(C1) 근무자라 '오늘 근무' 줄은 원래 보임 (우리 회사 공고) → 그 줄에 다른 회사 것이 없는지만 · 계좌 '요청함'은 없어야 함
      const own = path === `/admin/workers/${W}`
      const today = one(await n.locator('[data-worker-today]').innerText().catch(() => ''))
      const extra = own ? (await n.locator('[data-account-asked]').count()) + (/격리/.test(today) ? 1 : 0) : await n.locator('[data-worker-today], [data-chat-work], [data-account-asked]').count()
      ok(`${label} 새지 않음: ${path}`, found.length === 0 && extra === 0, [...found, own ? today : ''].filter(Boolean).join(','))
    }
  }

  // ── 3. 근무자 쪽: W '내 근무'의 계좌 줄은 요청한 회사 이름만 (자기 자료 · 대조)
  const wp = await pg(W)
  const wMe = await body(wp, '/me')
  ok("근무자 W: '격리상사406에서 기다려요' (요청한 회사만)", wMe.includes('격리상사406에서 기다려요'), (wMe.match(/.{0,12}에서 기다려요/) ?? [''])[0])
  ok('근무자 W: 다른 근무자(격리근무자406) 이름 없음', !wMe.includes('격리근무자406'))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
