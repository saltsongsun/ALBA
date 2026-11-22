// 묶음 350 (정기 개선 2026-11-22 14:35 KST)
// · 회사 간 자료 분리 점검 (최근에 더한 기능들): 한 회사만 맡은 관리자에게 다른 회사의 공고·서류·문의·'일정 바뀜'이 새지 않는지
//   - 대시보드 · 문의함(다른 회사 새 문의 줄 포함) · 서류 메뉴('일정 바뀜') · 공고 목록 · 신고 자료 · 주간 · 다른 회사 공고의 서류 탭 · 문의 대화 · 단체방
//   - 내려받기: 모든 대화 저장 · 한 사람 대화 저장 · 서류 PDF(다른 회사 서류 번호를 직접 넣어도) · 신고 CSV
//   - 같은 자료가 그 회사를 맡은 관리자에게는 보이는지(검사가 헛돌지 않게) 함께 확인
// · 디자인: '대화 저장' 4곳 선 아이콘 · 명단 잠금 선 아이콘 · 열림 줄 아래 남은 시간 막대 (30초마다 0.3초에 걸쳐 줄어듦 · 움직임 줄이기면 바로)
// node scripts/qa/batch350.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000351'
const N = 'aaaaaaaa-0000-4000-8000-000000000351'
const U = '44444444-0000-4000-8000-000000035101'
const J2 = 'cccccccc-0000-4000-8000-000000035101'
const DOC2 = 'dddddddd-0000-4000-8000-000000035101'
const MARK = ['격리상사350', '격리행사350', '격리서류350', '격리문의350', '격리근무자350']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const leaks = (t) => MARK.filter((m) => (t ?? '').includes(m))

;(async () => {
  const tmr = kstDay(Date.now() + 864e5)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job
  const [doc0] = await rest(`signed_docs?status=eq.signed&user_id=eq.${W}`)
  // 다른 회사(격리상사350) + 그 회사 공고·근무자·서명한 서류·서명 뒤 일정 변경·문의
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사350', seal_image: null, created_at: ago(1) })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자350', phone: '01035100001', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: ago(1) })
  await rest('users', 'POST', { id: U, name: '격리근무자350', phone: '01035100002', birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true, created_at: ago(300) })
  await rest('jobs', 'POST', { ...jl, id: J2, company_id: C2, title: '격리행사350', start_date: tmr, end_date: tmr, status: 'open', applications: [], attendance: [], created_at: ago(200) })
  const j2 = { id: J2, title: '격리행사350', start_date: tmr, end_date: tmr, start_time: '09:00:00', end_time: '18:00:00' }
  await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J2, user_id: U, company_id: C2, status: 'approved', available_dates: null, position: null, message: null, contract_received_at: null, created_at: ago(100), job: j2, user: { id: U, name: '격리근무자350', phone: '01035100002' } })
  await rest('signed_docs', 'POST', { ...doc0, id: DOC2, company_id: C2, job_id: J2, user_id: U, title: '격리서류350', job: j2, signed_at: ago(48), created_at: ago(49), worker: { name: '격리근무자350', phone: '01035100002', birth_date: '1995-05-05', address: '서울' } })
  await rest('messages', 'POST', { id: 351001, thread_user_id: U, sender_id: A, from_admin: true, company_id: C2, job_id: J2, body: '🔔 일정 변경\n격리행사350의 내용이 바뀌었어요.\n시간: 09:00~18:00 → 10:00~19:00\n못 오게 되면 앱에서 담당자에게 알려 주세요.', read_at: null, created_at: ago(2), job: { id: J2, title: '격리행사350' }, sender: { name: '관리자' }, user: { id: U, name: '격리근무자350', phone: '01035100002', photo_at: null, member_type: 'worker' } })
  await rest('messages', 'POST', { id: 351002, thread_user_id: U, sender_id: U, from_admin: false, company_id: C2, job_id: null, body: '격리문의350 언제 시작하나요?', read_at: null, created_at: ago(1), user: { id: U, name: '격리근무자350', phone: '01035100002', photo_at: null, member_type: 'worker' } })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
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
  const fetchText = async (p, path) => {
    const r = await p.request.get(`${D}${path}`).catch(() => null)
    if (!r) return { status: 0, text: '', disp: '' }
    const buf = await r.body().catch(() => Buffer.from(''))
    return { status: r.status(), text: buf.toString('utf8'), disp: r.headers()['content-disposition'] ?? '' }
  }

  // ── 0. 검사가 헛돌지 않게: 그 회사를 볼 때(최고 관리자 · 격리상사350)는 같은 자료가 보임
  const s = await pg(A, C2)
  const sDocs = await body(s, '/admin/docs')
  const sStale = await s.locator('[data-docs-job-stale], [data-doc-row-stale]').count()
  const sInbox = await body(s, '/admin/chat')
  const sJobs = await body(s, '/admin/jobs')
  ok('대조: 그 회사 화면에선 서류·문의·공고가 보임', sDocs.includes('격리서류350') && sInbox.includes('격리문의350') && sJobs.includes('격리행사350'), `${sDocs.includes('격리서류350')} ${sInbox.includes('격리문의350')} ${sJobs.includes('격리행사350')}`)
  ok("대조: 그 회사 서류 메뉴엔 '일정 바뀜'", sStale >= 1, String(sStale))
  const sPdf = await fetchText(s, `/admin/docs/pdf?id=${DOC2}`)
  ok('대조: 그 회사 서류는 PDF로 받아짐', sPdf.status === 200 && /pdf/i.test(sPdf.disp + sPdf.text.slice(0, 8)), `${sPdf.status} ${sPdf.disp.slice(0, 60)}`)

  // ── 1. 한 회사만 맡은 관리자: 화면 어디에도 다른 회사 자료가 없음
  const n = await pg(N, C1)
  const pages = ['/admin', '/admin/chat', '/admin/chat?unread=1', '/admin/docs', '/admin/jobs', '/admin/jobs?tab=past', '/admin/reports', '/admin/weekly', '/admin/workers', `/admin/workers/${U}`, `/admin/jobs/${J2}?tab=docs`, `/admin/jobs/${J2}?tab=att`, `/admin/jobs/${J2}?tab=pay`, `/admin/chat/${U}`, `/admin/chat/room/${J2}`, '/admin/settings']
  for (const path of pages) {
    const t = await body(n, path)
    // 근무자 명단(해피워크 전체 회원)에는 회원 이름이 원래 보일 수 있어서 이름은 빼고 봄
    const found = leaks(t).filter((m) => !(path.startsWith('/admin/workers') && m === '격리근무자350'))
    ok(`새지 않음: ${path}`, found.length === 0, found.join(','))
  }
  // 문의함 '다른 회사 새 문의' 줄도 없음 (맡지 않은 회사)
  await n.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' }).catch(() => {})
  ok("문의함 '다른 회사 새 문의' 줄 없음", (await n.locator('[data-inbox-others]').count()) === 0)
  // 문의 대화 화면 '다른 회사로 온 새 문의' 줄 없음
  await n.goto(`${D}/admin/chat/${U}`, { waitUntil: 'networkidle' }).catch(() => {})
  ok("대화 화면 '다른 회사로 온 새 문의' 줄 없음", (await n.locator('[data-thread-other]').count()) === 0)

  // ── 2. 내려받기도 새지 않음
  const dl = [
    ['/admin/chat/export', '모든 대화 저장'],
    [`/admin/chat/${U}/export`, '한 사람 대화 저장'],
    [`/admin/chat/room/${J2}/export`, '단체방 대화 저장'],
    [`/admin/docs/pdf?id=${DOC2}`, '서류 PDF (다른 회사 서류 번호를 직접 넣음)'],
    [`/admin/export/settlement?job=${J2}`, '정산 CSV (다른 회사 공고)'],
    ['/admin/export/workers', '근무자 CSV'],
    ['/admin/export/daily-income', '일용근로 신고 CSV'],
  ]
  for (const [path, label] of dl) {
    const r = await fetchText(n, path)
    const found = leaks(r.text + r.disp)
    ok(`내려받기 새지 않음: ${label}`, found.length === 0 && !(path.includes('/docs/pdf') && r.status === 200), `${r.status} ${found.join(',')}`)
  }

  // ── 3. 근무자 쪽: 그 회사와 상관없는 근무자에게 그 회사 서류·문의가 안 보임
  const w = await pg(W)
  for (const path of [`/docs/${DOC2}`, `/me/chat?co=${C2}`, '/me', '/me/history']) {
    const t = await body(w, path)
    ok(`근무자 화면 새지 않음: ${path}`, leaks(t).filter((m) => m !== '격리상사350' || path !== `/me/chat?co=${C2}`).length === 0 && !t.includes('격리서류350') && !t.includes('격리문의350'), leaks(t).join(','))
  }

  // ── 4. 디자인: '대화 저장' 선 아이콘 · 명단 잠금 선 아이콘 · 남은 시간 막대
  const sa = await pg(A, C1)
  await sa.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' }).catch(() => {})
  const ex = sa.locator('[data-chat-export]')
  ok("관리자 대화 '대화 저장' 선 아이콘 (이모지 없음)", (await ex.count()) === 1 && (await ex.locator('svg').count()) === 1 && one(await ex.innerText()) === '대화 저장', one(await ex.innerText().catch(() => '')))
  await sa.goto(`${D}/admin/chat/room/${J}`, { waitUntil: 'networkidle' }).catch(() => {})
  ok("단체방 '대화 저장' 선 아이콘", (await sa.locator('[data-chat-export] svg').count()) === 1 && !(await sa.locator('body').innerText()).includes('⬇️'))
  await w.goto(`${D}/me/chat/room/${J}`, { waitUntil: 'networkidle' }).catch(() => {})
  ok("근무자 단체방 '대화 저장' 선 아이콘", (await w.locator('[data-chat-export] svg').count()) === 1)
  // 명단 잠금 화면 (잠금 쿠키 없음)
  const lockCtx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await lockCtx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const lp = await lockCtx.newPage()
  await lp.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' }).catch(() => {})
  const li = lp.locator('[data-roster-lock-icon]')
  ok('명단 잠금 화면: 선 아이콘 (🔒 없음)', (await li.locator('svg').count()) === 1 && !(await lp.locator('[data-roster-lock]').innerText()).includes('🔒'))
  if (SHOTS) await lp.screenshot({ path: `${SHOTS}/roster-lock.png` }).catch(() => {})
  await lockCtx.close()
  // 열림 줄: 남은 10분 중 5분 → 막대 절반쯤 · 선 아이콘
  const half = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await half.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A, 300), url: D }])
  const hp = await half.newPage()
  await hp.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' }).catch(() => {})
  const bar = hp.locator('[data-roster-time-bar]')
  const ratio = await bar.evaluate((el) => el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width).catch(() => -1)
  const openTxt = one(await hp.locator('[data-roster-open]').innerText().catch(() => ''))
  ok("열림 줄: '명단 열림 · 5분 뒤 잠김' 선 아이콘 · 막대 절반쯤", /^명단 열림 · 5분 뒤 잠김/.test(openTxt) && !openTxt.includes('🔓') && (await hp.locator('[data-roster-open] svg').count()) === 1 && ratio > 0.4 && ratio < 0.6, `${openTxt} | ${ratio.toFixed(2)}`)
  const tr = await bar.evaluate((el) => getComputedStyle(el).transitionDuration).catch(() => '')
  ok('막대는 0.3초에 걸쳐 줄어듦', tr === '0.3s', tr)
  const barBox = await hp.locator('[data-roster-open]').boundingBox().catch(() => null)
  ok('열림 줄 한 줄 · 360px 옆으로 안 밀림', !!barBox && barBox.height <= 48 && (await hp.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)), JSON.stringify(barBox))
  if (SHOTS) await hp.screenshot({ path: `${SHOTS}/roster-open.png` }).catch(() => {})
  await half.close()
  const rm = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: 'reduce' })
  await rm.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A, 300), url: D }])
  const rp = await rm.newPage()
  await rp.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' }).catch(() => {})
  const rtr = await rp.locator('[data-roster-time-bar]').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 막대가 바로 바뀜', rtr < 0.05, String(rtr))
  await rm.close()

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
