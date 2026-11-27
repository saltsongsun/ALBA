// 묶음 420 (정기 개선 2026-11-28 03:36 KST)
// 회사 간 자료 분리 점검 · 최근 근무시간 변경 기능 (답 현황 · 다시 알리기 · 근무자 답하기 · 홈 할 일)
//   · 다른 회사 관리자가 서버에 직접 보낸 '다시 알리기'(우리 공고) → 거절 · 우리 근무자에게 아무것도 안 감
//   · 다른 회사 관리자가 우리 변경 요청을 '현장 동의 받음'으로 → 그대로 '대기'
//   · 다른 근무자가 남의 변경 요청에 '네, 계속할게요' → 그대로 '대기'
//   · 대조: 그 회사 관리자는 자기 공고에 다시 알리기가 됨 (그 회사 문의함으로 · 그 회사 근무자에게만)
//   · 홈 할 일 · 출퇴근 탭 · 근무자 '내 근무'에 다른 회사 공고·사람이 섞이지 않음
// 디자인 · 외주 업체 한 곳을 여는 동안 그 화면 모양 (업체 카드 · 정보 수정 · 대금 지급 · 견적 이력 — 예전: 공통 카드 네 개) · 360px 옆 스크롤 없음
// node scripts/qa/batch420.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createHmac } = crypto
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000420'
const M = '42000000-0000-4000-8000-000000000001', Z = '42000000-0000-4000-8000-000000000002'
const J2 = 'cccccccc-0000-4000-8000-000000042001'
const WCH = '42000000-0000-4000-8000-0000000000c1', ZCH = '42000000-0000-4000-8000-0000000000c2'
const V1 = '42000000-0000-4000-8000-0000000000f1'
const HEAD = '⏰ 근무시간 변경 · 답을 기다려요'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args) =>
  p.evaluate(
    async ({ id, args }) => {
      const body = new FormData()
      body.append('0', JSON.stringify(args))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.text()
    },
    { id: idOf(file, name), args },
  )
const status = async (id) => (await rest(`shift_changes?id=eq.${id}`))?.[0]?.status
const asks = async (uid) => ((await rest(`messages?thread_user_id=eq.${uid}`)) ?? []).filter((m) => (m.body ?? '').startsWith(HEAD))

;(async () => {
  const y = kday(-1), tm = kday(1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y, end_date: kday(2), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a1] = await rest(`users?id=eq.${A}`)
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const { applications: _a, attendance: _t, ...jl } = job
  // 격리상사420: 대표 M · 공고 J2 · 확정자 Z
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사420', join_code: 'ISO420', seal_image: null, company_address: null, created_at: ago(5) })
  await rest('users', 'POST', { ...a1, id: M, name: '격리관리자420', phone: '01042000001', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'owner', created_at: ago(5) })
  const zU = { ...w1, id: Z, name: '제트격리420', phone: '01042000002', created_at: ago(300), photo_at: ago(300), attendance: [], ratings: [] }
  await rest('users', 'POST', zU)
  const j2 = { ...jl, id: J2, company_id: C2, company: { company_name: '격리상사420' }, title: '격리행사420', start_date: y, end_date: kday(2), start_time: '09:00:00', end_time: '18:00:00', status: 'open', created_at: ago(2) }
  await rest('jobs', 'POST', { ...j2, applications: [], attendance: [] })
  await rest('applications', 'POST', { ...wApp, id: 'ffffffff-0000-4000-8000-000000042001', job_id: J2, company_id: C2, user_id: Z, user: zU, job: j2, position: null, available_dates: null })
  const chg = (o) => rest('shift_changes', 'POST', { work_date: tm, status: 'pending', start_time: '09:00:00', end_time: '19:00:00', prev_start: '09:00:00', prev_end: '18:00:00', reason: null, answered_at: null, answered_by: null, answer_ip: null, created_at: ago(1), ...o })
  await chg({ id: WCH, job_id: J, company_id: C1, user_id: W, requested_by: A })
  await chg({ id: ZCH, job_id: J2, company_id: C2, user_id: Z, requested_by: M })

  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid, company = null) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 다른 회사 관리자 M이 서버에 직접: 우리 공고 J에 다시 알리기 → 거절 · W에게 아무것도 안 감
  const m = await ctxOf(M, C2)
  await m.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok('서버 동작 이름을 찾음 (remindShiftAnswer · answerShiftByAdmin · answerShift)', !!idOf('admin', 'remindShiftAnswer') && !!idOf('admin', 'answerShiftByAdmin') && !!idOf('worker', 'answerShift'))
  const r1 = await call(m, 'admin', 'remindShiftAnswer', [J, tm, null])
  ok("다른 회사 관리자의 '다시 알리기'(우리 공고) → '공고를 찾을 수 없습니다.'", r1.includes('공고를 찾을 수 없습니다'), r1.slice(-120))
  ok('우리 근무자 W에게 아무것도 안 감', (await asks(W)).length === 0)
  // ── 2. 다른 회사 관리자가 우리 요청을 '현장 동의 받음'으로 → 그대로
  await call(m, 'admin', 'answerShiftByAdmin', [WCH]).catch(() => '')
  ok("다른 회사 관리자의 '현장 동의 받음'(우리 요청) → 그대로 대기", (await status(WCH)) === 'pending')
  ok('기록에도 안 남음 (shift.agree_onsite 없음)', !((await rest('audit_logs')) ?? []).some((l) => l.action === 'shift.agree_onsite'))
  // ── 3. 다른 근무자 Z가 W의 요청에 '네, 계속할게요' → 그대로
  const z = await ctxOf(Z)
  await z.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await call(z, 'worker', 'answerShift', [WCH, 'agree']).catch(() => '')
  ok("남의 변경 요청에 '네, 계속할게요' → 그대로 대기", (await status(WCH)) === 'pending')
  // ── 4. 대조: M은 자기 공고 J2에 다시 알리기가 됨 → Z에게만 · 그 회사 문의함
  const r2 = await call(m, 'admin', 'remindShiftAnswer', [J2, tm, null])
  const zAsk = await asks(Z)
  ok("대조: 자기 공고 J2 다시 알리기 → '1명에게 다시 알렸어요.' · Z에게 격리상사420 문의함으로", r2.includes('1명에게 다시 알렸어요') && zAsk.length === 1 && zAsk[0].company_id === C2 && zAsk[0].job_id === J2, r2.slice(-80))
  ok('그래도 우리 근무자 W에게는 안 감', (await asks(W)).length === 0)

  // ── 5. 화면: 우리 관리자 A의 홈 할 일·출퇴근 탭에 다른 회사 것 없음
  const a = await ctxOf(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const shiftTodos = await a.locator('a[href*="shift=1"]').evaluateAll((els) => els.map((e) => [e.getAttribute('href'), e.textContent.replace(/\s+/g, ' ').trim()]))
  ok("홈 '근무시간 변경 답 기다림'은 우리 공고 J만 (격리행사420 없음)", shiftTodos.length === 1 && shiftTodos[0][0].includes(J) && !shiftTodos[0][1].includes('격리행사420'), JSON.stringify(shiftTodos))
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${tm}&shift=1`, { waitUntil: 'networkidle' })
  await a.waitForTimeout(450)
  const names = one(await a.locator('[data-shift-waiting]').innerText().catch(() => ''))
  ok('우리 출퇴근 탭 답 대기: 우리 근무자만 (제트 없음)', names.includes(w1.name) && !names.includes('제트격리420'), names)
  await a.goto(`${D}/admin/jobs/${J2}?tab=att&date=${tm}`, { waitUntil: 'networkidle' })
  ok('다른 회사 공고 J2 출퇴근 탭 → 열리지 않음 (제트·답 현황 없음)', (await a.locator('[data-shift-answers]').count()) === 0 && !(await a.locator('main').innerText()).includes('제트격리420'))
  // ── 6. 근무자: W는 자기 요청만 · Z는 자기 요청만 (회사 이름도 각자)
  const w = await ctxOf(W)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const wt = one(await w.locator('#shift-ask').innerText().catch(() => ''))
  ok("W '근무시간이 바뀌었어요': 주식회사 테스트만 (격리상사420·격리행사420 없음)", wt.includes('주식회사 테스트') && !wt.includes('격리상사420') && !wt.includes('격리행사420'), wt.slice(0, 100))
  await z.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const zt = one(await z.locator('#shift-ask').innerText().catch(() => ''))
  ok("Z '근무시간이 바뀌었어요': 격리상사420 + '담당자가 답을 기다려요' (우리 회사·공고 없음)", zt.includes('🏢 격리상사420') && zt.includes('담당자가 답을 기다려요') && !zt.includes('주식회사 테스트') && !zt.includes(jl.title), zt.slice(0, 120))

  // ── 7. 디자인: 외주 업체 한 곳을 여는 동안 그 화면 모양
  const base = { company_id: C1, user_id: null, category: '음향', contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(48) }
  await rest('vendors', 'POST', { ...base, id: V1, name: '한빛음향420', phone: '01042000009' })
  await rest('vendor_payments', 'POST', { company_id: C1, job_id: null, quote_id: null, vat_included: true, paid_at: null, memo: null, created_at: ago(24), id: crypto.randomUUID(), vendor_id: V1, title: '무대 음향', amount: 1500000, due_date: tm, invoice_at: null })
  await a.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  await a.evaluate((v) => window.next?.router?.prefetch(`/admin/vendors/${v}`), V1)
  await a.waitForTimeout(800)
  const slow = async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch']) await new Promise((res) => setTimeout(res, 1500))
    await route.continue().catch(() => {})
  }
  await a.route(`**/admin/vendors/${V1}**`, slow)
  await a.evaluate((v) => window.next?.router?.push(`/admin/vendors/${v}`), V1)
  const sk = a.locator('[data-skeleton="vendor"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('여는 동안 업체 화면 모양 (업체 카드 · 정보 수정 · 대금 지급 · 견적 이력 = 카드 넷)', shown && (await sk.locator('.card').count()) === 4, `shown=${shown}`)
  ok('360px 옆으로 안 밀림 (불러오는 중)', await noSide(a))
  if (SHOTS && shown) await a.screenshot({ path: `${SHOTS}/420-vendor-skeleton.png` })
  await a.getByRole('heading', { name: '한빛음향420' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('다 열리면 실제 화면 (불러오기 모양은 사라짐)', (await a.getByRole('heading', { name: '한빛음향420' }).count()) === 1 && (await sk.count()) === 0)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/420-vendor-loaded.png` })
  await a.unroute(`**/admin/vendors/${V1}**`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch420: ${fails} FAIL` : '== batch420: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
