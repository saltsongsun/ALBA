// 묶음 371 (정기 개선 2026-11-24 05:35 KST)
// · 여러 회사를 맡은 관리자: 지금 보는 회사가 아닌 회사의 '공고 고치기' · '긴급 투입 QR' · '외주 업체' · '서류 서식' 주소를 열면
//   '찾는 화면이 없어요' 대신 '다른 회사 ○○예요 · △△ 화면에서 열기' → 누르면 회사를 바꾸고 그 화면을 바로 엶
//   (전엔 공고·단체방·문의·견적 요청만 — 띄워 둔 QR 화면이나 즐겨찾기한 주소가 회사를 바꾼 뒤 '없는 화면'이 되던 것)
//   · 그 회사를 맡지 않은 관리자에게는 예전처럼 없는 화면 (회사 이름도 안 보임)
//   · 바꿔서 여는 주소는 그 회사 것일 때만 (다른 회사 업체 주소를 끼워 넣어도 안 열림)
// · 긴급 투입 QR 화면 '오늘 QR로 합류한 사람': 새로 합류하면 숫자가 톡 · 새 줄만 살짝 올라옴(있던 줄은 그대로)
//   · 상태가 바뀐 배지만 톡 (서명 대기 → 출근 전 → 근무 중) · 빈 칸은 '아직 없어요 · 찍으면 여기에 바로 떠요' · 움직임 줄이기면 바로
// node scripts/qa/batch371.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000371'
const M = 'aaaaaaaa-0000-4000-8000-000000037101' // 두 회사 관리자
const N = 'aaaaaaaa-0000-4000-8000-000000037102' // 첫 회사만
const J2 = 'cccccccc-0000-4000-8000-000000037101'
const V1 = '77777777-0000-4000-8000-000000037101', V2 = '77777777-0000-4000-8000-000000037102'
const T2 = 'eeeeeeee-0000-4000-8000-000000037101'
const X = 'bbbbbbbb-0000-4000-8000-000000037101', Y = 'bbbbbbbb-0000-4000-8000-000000037102'
const CO2 = '바꿔열기371'
const MEMO = '긴급 투입(QR)'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), nowIso = new Date().toISOString(), today = kday(now)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [w] = await rest(`users?id=eq.${W}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job
  // 오늘 하루 종일 진행 중인 공고 (QR이 켜지게) · 두 번째 회사와 그 회사 공고·업체·서식
  const span = { start_date: kday(now - 864e5), end_date: kday(now + 864e5), start_time: '00:00:00', end_time: '23:59:00', status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', span)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: CO2, join_code: 'SW371', seal_image: null, created_at: nowIso })
  await rest('jobs', 'POST', { ...jl, ...span, id: J2, company_id: C2, company: { company_name: CO2 }, title: '두번째 회사 무대371', applications: [], attendance: [], required_docs: [], created_at: nowIso })
  const vbase = { category: '음향', contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, user_id: null, created_at: nowIso }
  await rest('vendors', 'POST', { ...vbase, id: V1, company_id: C1, name: '첫회사업체371', phone: '01037101001' })
  await rest('vendors', 'POST', { ...vbase, id: V2, company_id: C2, name: '두번째업체371', phone: '01037101002' })
  await rest('doc_templates', 'POST', { id: T2, company_id: C2, kind: 'pledge', title: '두번째 회사 서약서371', body: '# 서약서\n\n{{근로자명}}', is_default: false, active: true, created_at: nowIso, updated_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자371', phone: '01037100001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자371', phone: '01037100002', is_super: false })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const card = (p) => p.locator('[data-other-company-job]')
  const openBtn = (p) => card(p).locator('button[type=submit]')

  // ── 1. 두 회사 관리자 (첫 회사 화면): 네 가지 주소 → 바꿔서 열기
  const cases = [
    { path: `/admin/jobs/${J2}/edit`, title: '다른 회사 공고예요', secret: '두번째 회사 무대371', after: async (p) => (await p.locator('input[name=title]').inputValue().catch(() => '')) === '두번째 회사 무대371' },
    { path: `/admin/jobs/${J2}/qr`, title: '다른 회사 공고예요', secret: '두번째 회사 무대371', after: async (p) => one(await p.locator('.print-sheet [data-qr-company]').textContent().catch(() => '')).includes(CO2) && one(await p.locator('.print-sheet h1').textContent().catch(() => '')) === '두번째 회사 무대371' },
    { path: `/admin/vendors/${V2}`, title: '다른 회사 외주 업체예요', secret: '두번째업체371', back: ['/admin/vendors?tab=list', '지금 회사 업체 목록으로'], after: async (p) => (await p.locator('main').innerText().catch(() => '')).includes('두번째업체371') },
    { path: `/admin/docs/${T2}`, title: '다른 회사 서식이에요', secret: '두번째 회사 서약서371', back: ['/admin/docs?tab=tpl', '지금 회사 서식 목록으로'], after: async (p) => one(await p.locator('main h1').first().textContent().catch(() => '')) === '두번째 회사 서약서371' },
  ]
  for (const c of cases) {
    const m = await pg(M, C1)
    await m.goto(`${D}${c.path}`, { waitUntil: 'networkidle' })
    await card(m).waitFor({ timeout: 15000 }).catch(() => {})
    const h = one(await card(m).locator('h1').textContent().catch(() => ''))
    ok(`${c.path.split('/').slice(2, 3)[0]}${c.path.endsWith('edit') ? ' 고치기' : c.path.endsWith('qr') ? ' QR' : ''}: 없는 화면 대신 '${c.title}'`, h === c.title && (await m.getByText('찾는 화면이 없어요').count()) === 0, h)
    ok(`  · '지금은 주식회사 테스트 화면이에요' · '${CO2} 화면에서 열기' · 내용은 아직 안 보임`, one(await m.locator('[data-other-company-now]').innerText().catch(() => '')) === '지금은 주식회사 테스트 화면이에요' && one(await openBtn(m).innerText().catch(() => '')) === `${CO2} 화면에서 열기` && !(await m.locator('main').innerText().catch(() => '')).includes(c.secret))
    if (c.back) {
      const bl = card(m).locator(`a[href="${c.back[0]}"]`)
      ok(`  · 돌아가기 '${c.back[1]}'`, one(await bl.textContent().catch(() => '')) === c.back[1])
    }
    ok('  · 360px 옆으로 안 밀림', await noSide(m))
    if (SHOTS && c.path.endsWith('qr')) await m.screenshot({ path: `${SHOTS}/other-qr.png` }).catch(() => {})
    // 주소는 그대로라 카드가 사라질 때(회사를 바꾸고 다시 그림)까지 기다림
    await openBtn(m).click()
    await card(m).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    await m.waitForLoadState('networkidle').catch(() => {})
    ok(`  · 누르면 ${CO2}로 바꾸고 그 화면 그대로 (${c.path})`, new URL(m.url()).pathname === c.path && (await c.after(m)), m.url())
    await m.context().close()
  }

  // ── 2. 첫 회사만 맡은 관리자: 예전처럼 없는 화면 (회사 이름·내용 안 보임)
  for (const c of cases) {
    const n = await pg(N, C1)
    await n.goto(`${D}${c.path}`, { waitUntil: 'networkidle' })
    const t = await n.locator('body').innerText().catch(() => '')
    ok(`맡지 않은 회사: ${c.path} → 없는 화면 · '${CO2}'·내용 안 보임`, (await card(n).count()) === 0 && t.includes('찾는 화면이 없어요') && !t.includes(CO2) && !t.includes(c.secret))
    await n.context().close()
  }

  // ── 3. 바꿔서 여는 주소를 다른 회사 것으로 끼워 넣어도 그 화면은 안 열림
  {
    const m = await pg(M, C1)
    await m.goto(`${D}/admin/vendors/${V2}`, { waitUntil: 'networkidle' })
    await card(m).locator('input[name=open]').evaluate((el, v) => { el.value = `/admin/vendors/${v}` }, V1)
    await Promise.all([m.waitForURL((u) => !u.pathname.startsWith(`/admin/vendors/${V2}`), { timeout: 15000 }).catch(() => {}), openBtn(m).click()])
    await m.waitForLoadState('networkidle').catch(() => {})
    ok('끼워 넣은 첫 회사 업체 주소로는 안 감 (회사만 바뀌고 홈으로)', new URL(m.url()).pathname === '/admin' && !(await m.locator('main').innerText().catch(() => '')).includes('첫회사업체371'), m.url())
    await m.context().close()
  }

  // ── 4. QR 화면 '오늘 QR로 합류한 사람'
  const a1 = await pg(A, C1)
  await a1.goto(`${D}/admin/jobs/${J}/qr`, { waitUntil: 'networkidle' })
  const head = a1.locator('[data-qr-joined-count]')
  ok("빈 칸: '아직 없어요 · 찍으면 여기에 바로 떠요' (한 줄)", one(await a1.locator('[data-qr-joined-empty]').textContent().catch(() => '')) === '아직 없어요 · 찍으면 여기에 바로 떠요' && (await a1.locator('[data-qr-joined-empty]').evaluate((el) => el.getBoundingClientRect().height < 26).catch(() => false)))
  ok("제목 '오늘 QR로 합류한 사람 0명'", one(await head.textContent().catch(() => '')) === '오늘 QR로 합류한 사람 0명', one(await head.textContent().catch(() => '')))
  // 한 사람이 QR로 합류 (서명할 서류 1건 남음)
  const joinApp = (id, uid, at) => rest('applications', 'POST', { id, job_id: J, user_id: uid, user: { name: uid === X ? '큐알합류371' : '두번째합류371' }, company_id: C1, status: 'approved', admin_memo: MEMO, decided_at: at, created_at: at, applied_dates: [today], position: null, held_at: null })
  await rest('users', 'POST', { ...w, id: X, name: '큐알합류371', phone: '01037102001', created_at: nowIso })
  await rest('users', 'POST', { ...w, id: Y, name: '두번째합류371', phone: '01037102002', created_at: nowIso })
  await joinApp('11111111-0000-4000-8000-000000037101', X, new Date(now - 5 * 60e3).toISOString())
  await rest('signed_docs', 'POST', { id: 'dddddddd-0000-4000-8000-000000037101', company_id: C1, job_id: J, user_id: X, template_id: null, title: '근로계약서', status: 'pending', created_at: nowIso })
  await a1.goto(`${D}/admin/jobs/${J}/qr`, { waitUntil: 'networkidle' })
  const rowX = a1.locator(`[data-qr-joined="${X}"]`)
  ok("합류 1명: 줄 '큐알합류371' · '서명 대기 1건'", (await rowX.count()) === 1 && (await rowX.innerText().catch(() => '')).includes('큐알합류371') && one(await rowX.locator('[data-qr-state]').textContent().catch(() => '')) === '서명 대기 1건' && one(await head.textContent()) === '오늘 QR로 합류한 사람 1명', one(await rowX.textContent().catch(() => '')))
  const rowAnim = await rowX.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration]).catch(() => [])
  ok('새 줄은 0.25초 살짝 올라옴', JSON.stringify(rowAnim) === '["rise","0.25s"]', JSON.stringify(rowAnim))
  ok('한 줄 (이름 · 합류 시각 · 상태)', await rowX.evaluate((el) => el.getBoundingClientRect().height < 48))
  // 표시: 있던 줄 · 배지에 표를 달아 두고, 자동 새로 고침 뒤에 같은 것인지 봄
  await rowX.evaluate((el) => { el.__mark = 1; el.querySelector('[data-qr-state]').__mark = 1 })
  // 그 사람이 서명하고 출근 · 다른 사람이 새로 합류
  await rest(`signed_docs?id=eq.dddddddd-0000-4000-8000-000000037101`, 'PATCH', { status: 'signed', signed_at: nowIso })
  await rest('attendance', 'POST', { id: 'ffffffff-0000-4000-8000-000000037101', company_id: C1, job_id: J, user_id: X, work_date: today, clock_in: nowIso, clock_out: null, adj_in: null, adj_out: null, sched_start: null, sched_end: null, created_at: nowIso })
  await joinApp('11111111-0000-4000-8000-000000037102', Y, nowIso)
  // 10초마다 자동 새로 고침
  await a1.locator(`[data-qr-joined="${Y}"]`).waitFor({ timeout: 25000 }).catch(() => {})
  await a1.waitForTimeout(400)
  const st = await rowX.evaluate((el) => ({ row: el.__mark === 1, badge: el.querySelector('[data-qr-state]').__mark === 1, text: el.querySelector('[data-qr-state]').textContent })).catch(() => ({}))
  ok("자동 새로 고침: 숫자 '2명'으로 톡", one(await head.textContent().catch(() => '')) === '오늘 QR로 합류한 사람 2명' && (await head.locator('[data-value="2"]').evaluate((el) => el.classList.contains('animate-bump')).catch(() => false)), one(await head.textContent().catch(() => '')))
  ok("있던 줄은 그대로 (다시 안 올라옴) · 배지만 새로 '근무 중'", st.row === true && st.badge === false && st.text === '근무 중', JSON.stringify(st))
  const badgeAnim = await rowX.locator('[data-qr-state]').evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration]).catch(() => [])
  ok('바뀐 배지는 0.25초 톡', JSON.stringify(badgeAnim) === '["pop","0.25s"]', JSON.stringify(badgeAnim))
  ok("새로 합류한 사람 줄 · '서류 없음 → 출근 전'", one(await a1.locator(`[data-qr-joined="${Y}"] [data-qr-state]`).textContent().catch(() => '')) === '출근 전')
  ok('360px 옆으로 안 밀림 (QR)', await noSide(a1))
  // 자동 갱신 글자에 시각이 붙어 길어져도 제목은 한 줄
  ok("제목 '오늘 QR로 합류한 사람 n명'은 한 줄 (자동 갱신 글자가 길어도)", await head.evaluate((el) => el.getBoundingClientRect().height < 30))
  if (SHOTS) {
    const sec = a1.locator('section', { has: head })
    await sec.scrollIntoViewIfNeeded().catch(() => {})
    await a1.waitForTimeout(400)
    await sec.screenshot({ path: `${SHOTS}/qr-joined.png` }).catch(() => {})
  }
  // 움직임 줄이기
  const r = await pg(A, C1, { reducedMotion: 'reduce' })
  await r.goto(`${D}/admin/jobs/${J}/qr`, { waitUntil: 'networkidle' })
  const rd = await r.locator(`[data-qr-joined="${X}"]`).evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
