// 여러 회사: 회사끼리 자료가 섞이지 않는지 + 최고 관리자 회사 관리 + 근무자 계정 공용
// node scripts/qa/companies.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const APPLICANT = '33333333-0000-4000-8000-000000000011', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', J2 = 'cccccccc-0000-4000-8000-0000000000c2'
const C1_NAME = '주식회사 테스트', C2_NAME = '두번째컴퍼니'
const J_TITLE = '경상남도 생활체육대축전 행사장 안내 스태프', J2_TITLE = '두번째 회사 무대 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const status = (p, url) => p.goto(url).then((r) => r.status())
// 관리자 화면은 로딩 화면부터 보내므로(200) 내용으로 확인: '찾는 화면이 없어요' + 회사1 자료 없음
const blocked = async (p, url, secret = J_TITLE) => {
  await p.goto(url)
  return (await see(p, '찾는 화면이 없어요')) && !(await see(p, secret, 800))
}
const errs = []
;(async () => {
  // 두 번째 회사 · 그 회사 관리자(최고 관리자 아님) · 그 회사 공고
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: C2_NAME, seal_image: null, contact_phone: '01099990000', created_at: '2026-10-15T00:00:00Z' })
  const [admin1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...admin1, id: A2, name: '이회사관리', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  // 가입만 하고 아직 어디에도 지원 안 한 회원
  const [wRow] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...wRow, id: 'bbbbbbbb-0000-4000-8000-0000000000b9', name: '새내기회원', phone: '01012121212', attendance: [], ratings: [] })
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: C2_NAME }, title: J2_TITLE, applications: [], required_docs: [] })

  const b = await chromium.launch()
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a2 = await pg(A2), a = await pg(A), w = await pg(W)

  // ── 1. 다른 회사 관리자는 기본 회사 자료를 못 봄 ──
  await a2.goto(`${D}/admin`)
  ok('회사2 관리자: 화면 위 회사 이름', await see(a2, C2_NAME))
  ok('회사2 대시보드: 회사1 공고 안 보임', !(await see(a2, J_TITLE, 1500)))
  ok('회사2 대시보드: 회사2 공고 보임', await see(a2, J2_TITLE))
  await a2.goto(`${D}/admin/jobs`)
  ok('회사2 공고 목록: 회사1 공고 없음', !(await see(a2, J_TITLE, 1500)) && (await see(a2, J2_TITLE)))
  ok('회사2 → 회사1 공고 주소 막힘', await blocked(a2, `${D}/admin/jobs/${J}`))
  ok('회사2 → 회사1 공고 수정 화면 막힘', await blocked(a2, `${D}/admin/jobs/${J}/edit`))
  ok('회사2 → 회사1 출퇴근 QR 막힘', await blocked(a2, `${D}/admin/jobs/${J}/qr`))
  // 가입 회원은 모든 회사 공용: 화면은 열리지만 회사1 기록·민감 정보는 안 보임
  await a2.goto(`${D}/admin/workers/${W}`)
  ok('회사2 → 회사1 근무자: 회원 화면은 열림', await see(a2, '아직 우리 회사에 지원한 적 없는 회원이에요'))
  ok('회사2 → 회사1 근무자: 회사1 공고·계좌·주민번호 안 보임', !(await see(a2, J_TITLE, 1000)) && (await a2.locator('dt', { hasText: /^(주민등록번호|계좌|주소)$/ }).count()) === 0)
  ok('회사2 → 회사1 근무자: 사진 바꾸기 없음 (보기만)', !(await see(a2, '사진 올리기', 800)))
  // 서류 화면도 2026-11-12부터 불러오는 모양을 먼저 보내므로(200) 위 관리자 화면들처럼 내용으로 확인: '찾는 화면이 없어요' + 서류 내용 없음
  ok('회사2 → 회사1 서명 서류 막힘', await blocked(a2, `${D}/docs/${DOC_SIGNED}`, '서약서'))
  ok('회사2 → 회사1 임금명세서 막힘', (await status(a2, `${D}/print/payslip/${J}/${W}`)) === 404)
  ok('회사2 → 회사1 한 번에 인쇄 막힘', (await status(a2, `${D}/print/payslip/${J}`)) === 404)
  ok('회사2 관리자도 가입 회원 사진은 봄 (공용)', (await a2.request.get(`${D}/photo/${APPLICANT}`)).status() === 200)
  ok('회사1 관리자는 사진 봄', (await a.request.get(`${D}/photo/${APPLICANT}`)).status() === 200)
  await a2.goto(`${D}/admin/workers`)
  await a2.waitForLoadState('networkidle')
  ok('회사2 근무자 목록: 가입 회원 전체가 보임', (await a2.locator('a[href^="/admin/workers/"]', { hasText: '김지원' }).count()) > 0)
  await a2.goto(`${D}/admin/workers?f=mine`)
  ok('회사2 근무자 목록: 우리 회사 지원자만 보면 아직 없음', !(await see(a2, '김지원', 1000)))
  await a2.goto(`${D}/admin/chat`)
  ok('회사2 문의함: 회사1 문의 안 보임', !(await see(a2, '내일 집결 장소가 어디인가요?', 1500)))
  ok('회사2 → 회사1 문의 대화 막힘', await blocked(a2, `${D}/admin/chat/${W}`, '촉석문 앞 운영본부 천막입니다.'))
  ok('회사2 메뉴: 회사 관리 없음 (최고 관리자 아님)', (await a2.locator('nav a[href="/admin/companies"]').count()) === 0)
  await a2.goto(`${D}/admin/companies`).catch(() => {})
  await a2.waitForURL((u) => !u.pathname.includes('/admin/companies'), { timeout: 8000 }).catch(() => {})
  ok('회사2 → 회사 관리 주소 막힘', !a2.url().includes('/admin/companies') && !(await see(a2, '새 회사 만들기', 800)))
  const exp = await a2.request.get(`${D}/admin/export/settlement?job=${J}`)
  ok('회사2 → 회사1 정산표 내려받기 막힘', exp.status() === 404)

  // 가입만 한 회원도 근무자 목록에 (지원 전이라도)
  await a.goto(`${D}/admin/workers`)
  ok('회사1 근무자 목록: 지원 안 한 가입 회원도 보임', await see(a, '새내기회원'))
  await a.goto(`${D}/admin`)
  ok('대시보드 가입 근무자 수: 가입 회원 전체', await see(a, '가입 근무자'))

  // ── 2. 회사 설정은 회사마다 ──
  await a2.goto(`${D}/admin/settings`)
  await a2.locator('input[name=company_name]').fill('두번째컴퍼니 주식회사')
  await a2.getByRole('button', { name: /저장/ }).first().click()
  await see(a2, '저장했습니다.')
  const [c1after, c2after] = await Promise.all([rest(`companies?id=eq.${C1}`), rest(`companies?id=eq.${C2}`)])
  ok('회사2 설정 저장 → 회사2만 바뀜', c2after[0].company_name === '두번째컴퍼니 주식회사' && c1after[0].company_name === C1_NAME, `${c1after[0].company_name} / ${c2after[0].company_name}`)

  // ── 3. 근무자: 한 계정으로 두 회사 공고 ──
  await w.goto(`${D}/`)
  ok('근무자 홈: 두 회사 공고 모두', (await see(w, J_TITLE)) && (await see(w, J2_TITLE)))
  ok('공고 카드에 회사 이름', await see(w, `🏢 두번째컴퍼니 주식회사`, 3000).then((x) => x || see(w, `🏢 ${C2_NAME}`, 1000)))
  await w.goto(`${D}/jobs/${J2}`)
  ok('공고 화면: 회사 이름', await see(w, /🏢 두번째컴퍼니/))
  // 회사2 공고에 지원 (mock은 지원 행을 실제로 넣음)
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000a9', job_id: J2, user_id: W, status: 'applied', available_dates: null, message: null, created_at: new Date().toISOString(), job: { ...j1, id: J2, company_id: C2, title: J2_TITLE }, user: { id: W, name: '근무자', phone: '01033334444', birth_date: '1990-01-01', photo_at: null } })
  const [app2] = await rest(`applications?id=eq.11111111-0000-4000-8000-0000000000a9`)
  ok('지원 행의 회사 = 공고의 회사 (트리거)', app2.company_id === C2, app2.company_id)

  // ── 4. 지원한 뒤에는 회사2가 그 근무자를 봄, 하지만 회사1 기록은 안 보임 ──
  await a2.goto(`${D}/admin/workers/${W}`)
  ok('회사2: 지원한 근무자 정보 열림', await a2.locator('main').getByText('근무자').first().waitFor({ timeout: 6000 }).then(() => true, () => false))
  ok('회사2 근무자 화면: 회사1 공고 이름 없음', !(await see(a2, J_TITLE, 1500)))
  ok('회사2 근무자 화면: 회사1 평가 메모 없음', !(await see(a2, '시간 약속 잘 지킴', 1000)))

  // ── 5. 문의함은 회사마다 ──
  // 대화 목록에 두 회사 문의가 따로 (회사를 고르면 그 회사 대화)
  await w.goto(`${D}/me/chat`)
  await w.locator('[data-chat-list]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('근무자 문의: 대화 목록에 두 회사', (await w.locator('[data-chat-list] a[data-chat-row=company]').count()) === 2 && (await w.locator(`[data-chat-list] a[href="/me/chat?co=${C2}"]`).count()) === 1)
  await w.goto(`${D}/me/chat?co=${C2}`)
  ok('회사2 문의함엔 회사1 대화 없음', !(await see(w, '촉석문 앞 운영본부 천막입니다.', 1500)))
  await w.locator('textarea[name=body]').fill('두번째 회사에 묻습니다')
  await w.getByRole('button', { name: /보내기|보내/ }).last().click()
  ok('회사2로 문의 보냄', await see(w, '두번째 회사에 묻습니다'))
  const sent = (await rest('messages?thread_user_id=eq.' + W)).find((m) => m.body === '두번째 회사에 묻습니다')
  ok('문의 행의 회사 = 회사2', sent?.company_id === C2, sent?.company_id)
  // (가짜 DB는 새 행에 근무자 정보를 붙여 주지 않아 목록 대신 대화 화면으로 확인)
  await a2.goto(`${D}/admin/chat/${W}`)
  ok('회사2 관리자 대화에 도착', await see(a2, '두번째 회사에 묻습니다'))
  ok('회사2 대화엔 회사1 메시지 없음', !(await see(a2, '촉석문 앞 운영본부 천막입니다.', 1000)))
  await a.goto(`${D}/admin/chat/${W}`)
  ok('회사1 관리자 대화에는 없음', !(await see(a, '두번째 회사에 묻습니다', 1500)))

  // ── 6. 최고 관리자: 회사 고르기 · 회사 관리 · 관리자 초대 ──
  await a.goto(`${D}/admin`)
  const sel = a.locator('select[name=company]')
  ok('최고 관리자: 회사 고르기', (await sel.count()) === 1 && (await sel.locator('option').count()) >= 2)
  await sel.selectOption(C2)
  await a.waitForURL(/\/admin/)
  ok('회사2로 바꾸면 회사2 공고', await see(a, J2_TITLE))
  ok('회사2 화면에선 회사1 공고 안 보임', !(await see(a, J_TITLE, 1500)))
  await sel.selectOption(C1).catch(() => {})
  await a.goto(`${D}/admin/companies`)
  await a.screenshot({ path: '/tmp/claude-0/-home-user-ALBA/4655ffcd-11e1-5e8c-82ce-a6a6a0fa99c7/scratchpad/companies-page.png', fullPage: true })
  ok('회사 관리 화면', (await a.getByRole('heading', { name: '회사 관리' }).count()) === 1 && (await a.getByRole('heading', { name: new RegExp(C1_NAME) }).count()) === 1)
  ok('회사 관리: 관리자 이름', await see(a, '이회사관리'))
  await a.locator('input[name=company_name]').last().fill('세번째컴퍼니')
  await a.getByRole('button', { name: '회사 만들기' }).click()
  ok('회사 만들기', await see(a, '세번째컴퍼니을(를) 만들었어요'))
  const c3 = (await rest('companies')).find((c) => c.company_name === '세번째컴퍼니')
  const tpls = c3 ? await rest(`doc_templates?company_id=eq.${c3.id}`) : []
  ok('새 회사에 기본 서식', tpls.length >= 1, String(tpls.length))
  const card = a.locator('section', { hasText: '세번째컴퍼니' }).first()
  await card.locator('input[name=phone]').fill('010-4545-6767')
  await card.locator('input[name=name]').fill('새관리자')
  await card.getByRole('button', { name: '관리자 초대' }).click()
  ok('처음 번호 → 관리자 계정 + 임시 비밀번호', await see(a, /임시 비밀번호 \d{6}/))
  const pin = ((await a.getByText(/임시 비밀번호 \d{6}/).first().textContent()) || '').match(/임시 비밀번호 (\d{6})/)?.[1]
  const newAdmin = (await rest('users?phone=eq.01045456767'))[0]
  const mem = newAdmin ? await rest(`company_members?user_id=eq.${newAdmin.id}`) : []
  ok('새 관리자는 세번째 회사 소속', newAdmin?.role === 'admin' && mem.length === 1 && mem[0].company_id === c3?.id)
  // 새 관리자로 로그인 → 세번째 회사 화면
  const n = await pg(null)
  await n.goto(`${D}/login`)
  await n.locator('input[name=phone]').fill('01045456767')
  await n.locator('input[name=pin]').fill(pin || '')
  await n.getByRole('button', { name: /로그인/ }).click()
  await n.waitForURL(/\/admin/, { timeout: 10000 }).catch(() => {})
  ok('새 관리자 로그인 → 세번째 회사', await see(n, '세번째컴퍼니'))
  ok('새 관리자: 다른 회사 공고 안 보임', !(await see(n, J_TITLE, 1000)) && !(await see(n, J2_TITLE, 1000)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
  process.exit(fails ? 1 : 0)
})()
