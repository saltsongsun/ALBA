// 묶음 39: 회사 간 자료 분리 점검 (새로 생긴 화면까지) — 두 번째 회사 관리자가 관리자 화면을 모두 돌아봐도
//          첫 회사의 공고·근무자·외주 업체·서류 서식·단체방·서류·정산/명단 내려받기가 보이지 않음 · 주소를 직접 넣어도 막힘
//          (기존 companies.cjs는 공고·근무자·문의·설정을 봄 — 여기서는 외주·서류 서식·신고·커뮤니티·내려받기·단체방·서류 화면)
// node scripts/qa/batch39.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', J2 = 'cccccccc-0000-4000-8000-0000000000c2'
const DOC = 'dddddddd-0000-4000-8000-000000000004'
const V1 = 'eeeeeeee-0000-4000-8000-0000000000f1', T1 = 'eeeeeeee-0000-4000-8000-0000000000f2'
const C2_NAME = '두번째컴퍼니', J2_TITLE = '두번째 회사 무대 스태프'
// 첫 회사에만 있는 표시 (두 번째 회사 화면 어디에도 나오면 안 됨)
const SECRETS = ['경상남도 생활체육대축전 행사장 안내 스태프', '일번음향상사', '010-7171-7272', '일번회사 전용 서약서', '일번회사 단체방 비밀 공지', '주식회사 테스트', '010-3333-4444', '01033334444']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 두 번째 회사 · 그 회사 대표 관리자(최고 관리자 아님) · 그 회사 공고
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: C2_NAME, seal_image: null, contact_phone: '01099990000', created_at: '2026-10-15T00:00:00Z' })
  const [admin1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...admin1, id: A2, name: '이회사관리', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: C2_NAME }, title: J2_TITLE, applications: [], required_docs: [] })
  // 첫 회사에만 있는 자료: 외주 업체 · 서류 서식 · 단체방 글
  await rest('vendors', 'POST', { id: V1, company_id: C1, name: '일번음향상사', category: '음향', contact_name: '김음향', phone: '010-7171-7272', email: null, business_no: null, account_holder: null, memo: null, bank_name: null, bank_account_enc: null, active: true, created_at: new Date().toISOString() })
  await rest('doc_templates', 'POST', { id: T1, company_id: C1, kind: 'pledge', title: '일번회사 전용 서약서', body: '# 일번회사 전용 서약서\n\n{{근로자명}}', is_default: false, active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  await rest('job_chat', 'POST', { job_id: J, company_id: C1, sender_id: A, from_admin: true, body: '일번회사 단체방 비밀 공지', pinned_at: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('install-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A2), url: D }, { name: 'alba_roster', value: roster(A2), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const leaks = (text) => SECRETS.filter((s) => text.includes(s))
  const look = async (path) => {
    await p.goto(`${D}${path}`)
    await p.waitForLoadState('networkidle').catch(() => {})
    await p.waitForTimeout(300)
    return { text: await p.locator('body').innerText().catch(() => ''), path: new URL(p.url()).pathname }
  }

  // ── 1. 두 번째 회사 관리자: 목록 화면을 모두 돌아봐도 첫 회사 자료 없음 ──
  const lists = ['/admin', '/admin/jobs', '/admin/workers', '/admin/chat', '/admin/vendors', '/admin/docs', '/admin/reports', '/admin/community', '/admin/settings']
  // (가입 회원 명단은 모든 회사 공용이라 근무자 연락처는 /admin/workers에 나올 수 있음 — 회사 기록은 회사별로 거름: companies.cjs)
  const MEMBER = ['010-3333-4444', '01033334444']
  for (const path of lists) {
    const { text } = await look(path)
    const l = leaks(text).filter((x) => path !== '/admin/workers' || !MEMBER.includes(x))
    ok(`${path}: 첫 회사 자료 없음`, l.length === 0, l.join(', '))
  }
  const own = await look('/admin/jobs')
  ok('자기 회사 공고는 보임 (확인용)', own.text.includes(J2_TITLE))

  // ── 2. 첫 회사 자료 주소를 직접 넣어도 막힘 ──
  const direct = [
    [`/admin/vendors/${V1}`, '외주 업체'],
    [`/admin/docs/${T1}`, '서류 서식'],
    [`/admin/chat/room/${J}`, '단체방'],
    [`/admin/jobs/${J}?tab=pay`, '공고 정산 탭'],
    [`/admin/jobs/${J}?tab=att`, '공고 출퇴근 탭'],
    [`/admin/jobs/${J}?tab=docs`, '공고 서류 탭'],
    [`/docs/${DOC}`, '근무자 서류'],
  ]
  for (const [path, label] of direct) {
    const { text } = await look(path)
    const l = leaks(text)
    ok(`첫 회사 ${label} 주소: 막힘 (자료 안 보임)`, l.length === 0 && (text.includes('찾는 화면이 없어요') || text.includes('찾을 수 없')), l.join(', ') || text.slice(0, 80).replace(/\s+/g, ' '))
  }

  // ── 3. 내려받기: 첫 회사 것은 막히고, 자기 회사 것에는 첫 회사 자료 없음 ──
  const dl = async (path) => {
    const r = await ctx.request.get(`${D}${path}`, { maxRedirects: 0 })
    return { status: r.status(), text: await r.text().catch(() => '') }
  }
  const s1 = await dl(`/admin/export/settlement?job=${J}`)
  ok('첫 회사 공고 정산표 내려받기: 막힘', s1.status === 404 && leaks(s1.text).length === 0, `${s1.status}`)
  const s2 = await dl(`/admin/chat/room/${J}/export`)
  ok('첫 회사 단체방 대화 저장: 막힘', s2.status >= 400 && leaks(s2.text).length === 0, `${s2.status}`)
  const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7)
  for (const kind of ['workers', 'daily-income', 'business-income', 'employment']) {
    const r = await dl(`/admin/export/${kind}?month=${month}`)
    ok(`자기 회사 ${kind} 내려받기에 첫 회사 자료 없음`, leaks(r.text).length === 0, `${r.status} ${leaks(r.text).join(', ')}`)
  }
  const ce = await dl('/admin/chat/export')
  ok('자기 회사 문의 전체 저장에 첫 회사 자료 없음', leaks(ce.text).length === 0, `${ce.status} ${leaks(ce.text).join(', ')}`)

  // ── 4. 새 회사 빈 화면 안내: 업체가 없으면 견적 양식 대신 '업체부터 등록' · 정산 화면 문구 해요체 ──
  const fresh = await look('/admin/vendors')
  const first = p.locator('[data-vendor-first]')
  ok("업체가 없으면 '견적을 받으려면 업체부터 등록해요' (견적 양식 없음)", (await first.count()) === 1 && fresh.text.includes('견적을 받으려면 업체부터 등록해요') && (await p.locator('textarea, select').count()) === 0)
  ok('360px: 옆으로 안 밀림 (외주 업체)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await first.getByRole('link', { name: '업체 등록하러 가기' }).click()
  await p.waitForURL(/tab=list/, { timeout: 8000 }).catch(() => {})
  await p.locator('input[name=name]').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok("'업체 등록하러 가기' → 업체 탭, 등록 칸이 바로 열려 있음", new URL(p.url()).searchParams.get('tab') === 'list' && (await p.locator('input[name=name]').first().isVisible().catch(() => false)))
  const rep = await look('/admin/reports')
  ok("정산·신고자료: '이 달의 근무 기록이 없어요' (해요체)", rep.text.includes('이 달의 근무 기록이 없어요') && !rep.text.includes('없습니다.'), rep.text.match(/이 달의[^\n]*/)?.[0] ?? '')
  // 업체가 있는 회사(첫 회사)는 그대로 견적 양식
  const a1 = await ctx.browser().newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await a1.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p1 = await a1.newPage()
  await p1.goto(`${D}/admin/vendors`)
  await p1.waitForLoadState('networkidle').catch(() => {})
  ok('업체가 있으면 그대로 견적 요청 양식', (await p1.locator('[data-vendor-first]').count()) === 0 && (await p1.getByText('새 견적 요청').count()) > 0)
  await a1.close()
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
