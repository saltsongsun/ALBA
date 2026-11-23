// 묶음 366 (정기 개선 2026-11-23 22:35 KST)
// · 회사 간 자료 분리 점검 (지난 점검 batch350 뒤에 더한 기능들):
//   - 대시보드 '일했는데 서명 안 함' · 다른 회사 칩 '서명 안 함 n'(일한 사람 포함) · '관리자 신청 n'
//   - 공고 서류 탭 '· 일함 n' · 서류 메뉴(근무 시작 뒤 서명 안 한 줄) · 주간 근무 목록 · 회사 설정 관리자 목록
//   - 명세서·증명서·명단 인쇄 · 근무자 '서명할 서류' 카드
//   한 회사만 맡은 관리자(N)에게는 다른 회사(격리상사366)의 공고·근무자·서류·관리자·신청자가 어디에도 안 보임
//   두 회사를 맡은 관리자(M)에게는 칩에 회사 이름과 숫자만 · 그 회사를 고르면 그때 자세히 (검사가 헛돌지 않게 대조)
// node scripts/qa/batch366.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000366'
const N = 'aaaaaaaa-0000-4000-8000-000000036601' // 우리 회사(C1)만 맡은 관리자
const M = 'aaaaaaaa-0000-4000-8000-000000036602' // C1 관리자 + 격리상사366 대표
const K = 'aaaaaaaa-0000-4000-8000-000000036603' // 격리상사366 관리자 (설정 관리자 목록에 보일 사람)
const R = '44444444-0000-4000-8000-000000036604' // 격리상사366에 관리자 신청한 사람
const U = '44444444-0000-4000-8000-000000036605' // 격리상사366 근무자
const J2 = 'cccccccc-0000-4000-8000-000000036601'
const DOC2 = 'dddddddd-0000-4000-8000-000000036601'
const MARK = ['격리행사366', '격리근무자366', '격리서류366', '격리관리자366', '격리신청자366']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const leaks = (t, extra = []) => [...MARK, ...extra].filter((m) => (t ?? '').includes(m))

;(async () => {
  const d2 = kstDay(Date.now() - 2 * 864e5), d1 = kstDay(Date.now() - 864e5)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job
  const [doc0] = await rest('signed_docs?id=eq.dddddddd-0000-4000-8000-000000000004')
  const [att0] = (await rest('attendance?limit=1')) ?? []
  const { id: _ai, company_id: _ac, ...attBase } = att0 ?? {}

  // 다른 회사(격리상사366): 그제~어제 행사 · 근무자는 어제 일했는데 서류 서명 전 · 관리자 1명 · 관리자 신청 1건
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사366', join_code: 'ISO366', seal_image: null, created_at: ago(5) })
  const admin = (id, name, phone) => rest('users', 'POST', { ...a, id, name, phone, is_super: false })
  await admin(N, '한회사관리자366', '01036600001')
  await admin(M, '두회사관리자366', '01036600002')
  await admin(K, '격리관리자366', '01036600003')
  await rest('users', 'POST', { id: R, name: '격리신청자366', phone: '01036600004', role: 'worker', active: true, careers: [], photo_at: null, created_at: ago(30) })
  await rest('users', 'POST', { id: U, name: '격리근무자366', phone: '01036600005', birth_date: '1995-05-05', role: 'worker', active: true, careers: [], photo_at: null, created_at: ago(300) })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C1, user_id: M, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'owner', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C2, user_id: K, role: 'admin', created_at: ago(2) })
  await rest('company_join_requests', 'POST', { company_id: C2, user_id: R, created_at: ago(1) })
  // 가짜 DB의 공고 행은 회사 이름을 붙여 들고 있음 → 복사한 공고에는 그 회사 이름으로
  const j2 = { ...jl, id: J2, company_id: C2, company: { company_name: '격리상사366' }, title: '격리행사366', start_date: d2, end_date: d1, start_time: '09:00:00', end_time: '18:00:00', status: 'closed', contract_method: 'app', created_at: ago(100) }
  await rest('jobs', 'POST', { ...j2, applications: [], attendance: [] })
  await rest('applications', 'POST', { id: 'ffffffff-0000-4000-8000-000000036601', job_id: J2, user_id: U, company_id: C2, status: 'approved', available_dates: null, position: null, message: null, held_at: null, contract_received_at: null, created_at: ago(90), job: j2, user: { id: U, name: '격리근무자366', phone: '01036600005' } })
  await rest('signed_docs', 'POST', { ...doc0, id: DOC2, company_id: C2, job_id: J2, user_id: U, title: '격리서류366', status: 'pending', signed_at: null, signature: null, created_at: ago(80), job: j2, worker: { name: '격리근무자366', phone: '01036600005', birth_date: '1995-05-05', address: '서울' } })
  await rest('attendance', 'POST', { ...attBase, id: 'eeeeeeee-0000-4000-8000-000000036601', company_id: C2, job_id: J2, user_id: U, work_date: d1, clock_in: `${d1}T00:05:00Z`, clock_out: `${d1}T09:00:00Z`, adj_in: null, adj_out: null, paid: false })

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

  // ── 0. 대조 (검사가 헛돌지 않게): 격리상사366을 고른 대표(M)에게는 같은 자료가 보임
  const m2 = await pg(M, C2)
  const mDash2 = await body(m2, '/admin')
  ok("대조: 그 회사 대시보드에 '일했는데 서명 안 함 · 격리행사366'", mDash2.includes('일했는데 서명 안 함 · 격리행사366'), mDash2.includes('격리행사366') ? 'title only' : 'none')
  const mDocs2 = await body(m2, `/admin/jobs/${J2}?tab=docs`)
  ok("대조: 그 회사 공고 서류 탭에 '격리근무자366' + '· 일함 1'", mDocs2.includes('격리근무자366') && (await m2.locator('[data-unsigned-worked]').innerText().catch(() => '')).includes('일함 1'))
  const mSet2 = await body(m2, '/admin/settings')
  ok("대조: 그 회사 설정 관리자 목록에 '격리관리자366'", mSet2.includes('격리관리자366'))

  // ── 1. 두 회사를 맡은 관리자가 우리 회사(C1)를 보고 있을 때: 칩에는 회사 이름·숫자만, 자세한 자료는 없음
  const m1 = await pg(M, C1)
  const mDash1 = await body(m1, '/admin')
  const chip = m1.locator('[data-other-unsigned]').first()
  ok("두 회사 관리자: 다른 회사 칩 '서명 안 함 1' (일한 사람 포함 · 숫자만)", (await chip.count()) === 1 && /서명 안 함 1/.test(await chip.innerText().catch(() => '')), await chip.innerText().catch(() => ''))
  ok("두 회사 관리자: 다른 회사 칩 '관리자 신청 1' (대표인 회사)", /관리자 신청 1/.test(mDash1), '')
  ok('두 회사 관리자: 우리 회사 화면에 다른 회사 공고·근무자·서류·신청자 이름 없음', leaks(mDash1).length === 0, leaks(mDash1).join(','))
  for (const path of ['/admin/docs', '/admin/weekly', '/admin/settings', `/admin/jobs/${J}?tab=docs`]) {
    const t = await body(m1, path)
    ok(`두 회사 관리자 · 우리 회사 화면 새지 않음: ${path}`, leaks(t).length === 0, leaks(t).join(','))
  }

  // ── 2. 우리 회사만 맡은 관리자(N): 다른 회사 이름·칩·자료 모두 없음
  const n = await pg(N, C1)
  const nDash = await body(n, '/admin')
  ok("한 회사 관리자 대시보드: 다른 회사 칩 없음 · '격리상사366' 없음", (await n.locator('[data-other-unsigned]').count()) === 0 && !nDash.includes('격리상사366') && leaks(nDash).length === 0, leaks(nDash, ['격리상사366']).join(','))
  // 다른 회사를 고르는 쿠키를 넣어도 우리 회사 화면 (맡지 않은 회사는 못 고름)
  const nForce = await pg(N, C2)
  const nForceDash = await body(nForce, '/admin')
  ok('맡지 않은 회사를 쿠키로 골라도 그 회사 자료 없음', leaks(nForceDash).length === 0 && !nForceDash.includes('일했는데 서명 안 함 · 격리'), leaks(nForceDash).join(','))
  const pages = ['/admin/docs', '/admin/docs?f=pending', '/admin/weekly', '/admin/settings', '/admin/reports', `/admin/jobs/${J2}?tab=docs`, `/admin/jobs/${J2}?tab=att`, `/admin/jobs/${J2}?tab=pay`, `/admin/workers/${U}`, `/print/payslip/${J2}/${U}`, `/print/cert/${J2}/${U}`, `/print/roster/${J2}`, `/print/payslip/${J2}`, `/docs/${DOC2}`]
  for (const path of pages) {
    const t = await body(n, path)
    // 근무자 상세는 해피워크 전체 회원 화면이라 이름은 원래 보일 수 있음 → 이름 빼고 봄
    const found = leaks(t, ['격리상사366']).filter((x) => !(path.startsWith('/admin/workers') && x === '격리근무자366'))
    ok(`한 회사 관리자 새지 않음: ${path}`, found.length === 0, found.join(','))
  }
  ok("한 회사 관리자: 공고 서류 탭 '· 일함' 표시 없음 (다른 회사 공고)", (await (async () => { await n.goto(`${D}/admin/jobs/${J2}?tab=docs`, { waitUntil: 'networkidle' }).catch(() => {}); return n.locator('[data-unsigned-worked], [data-doc-worked]').count() })()) === 0)

  // ── 3. 근무자 쪽: 상관없는 근무자(W)의 '서명할 서류'에 다른 회사 서류 없음 · 그 근무자(U)에게는 보임(대조)
  const w = await pg(W)
  const wMe = await body(w, '/me')
  ok("상관없는 근무자 '내 근무'에 다른 회사 서류 없음", leaks(wMe, ['격리상사366']).length === 0, leaks(wMe, ['격리상사366']).join(','))
  const u = await pg(U)
  await u.goto(`${D}/me`, { waitUntil: 'networkidle' }).catch(() => {})
  const uRow = u.locator(`[data-sign-card] a[href="/docs/${DOC2}"]`)
  ok("대조: 그 근무자 '서명할 서류'에 '근무 끝남 · 격리상사366 · 격리행사366'", (await uRow.count()) === 1 && /^근무 끝남 · 격리상사366/.test((await uRow.locator('span.block').nth(1).innerText().catch(() => '')).replace(/\s+/g, ' ').trim()), (await uRow.innerText().catch(() => '')).replace(/\s+/g, ' '))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
