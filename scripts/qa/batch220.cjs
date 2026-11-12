// 묶음 220 (정기 개선 2026-11-12 18:35 KST)
// · 근무자 단체방 위: 근무 정보 한 줄 '날짜 09:00 ~ 18:00 · 장소' + 집결 + [길찾기] [담당 전화] (현장 담당 번호가 없으면 회사 문의 번호)
//   — 방에서 '몇 시까지예요? 어디로 가요?'를 묻지 않게 · 끝난 행사는 전처럼 '같은 근무 단체방'만
// · 대화 화면: 위로 올려 지난 대화를 읽는 중에 새 글이 오면 끌어내리지 않고 '새 메시지 n개 ↓' (누르면 맨 아래로 · 사라짐)
//   맨 아래에 있을 때는 전처럼 새 글을 따라 내려감
// · 여러 회사를 맡은 관리자: 회사 고르기 목록에도 '결과 안 알림 n' (끝난 행사 대기 지원자 · 대시보드와 같은 수)
// node scripts/qa/batch220.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000220'
const JC2 = 'cccccccc-0000-4000-8000-0000000c2200', U2 = '44444444-0000-4000-8000-000000022001', AU2 = '55555555-0000-4000-8000-000000022001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '09:00:00', end_time: '18:00:00', location_name: '광장', meeting_point: '정문 앞 8시 50분', manager_phone: '01055556666' })
  // 단체방에 지난 대화 40개 (화면이 위아래로 길게)
  const base = Date.now() - 3600e3
  for (let i = 0; i < 40; i++) await rest('job_chat', 'POST', { id: `77777777-0000-4000-8000-0000000220${String(i).padStart(2, '0')}`, job_id: J, sender_id: A, from_admin: true, body: `안내 ${i + 1} · 오늘 행사 준비 사항을 확인해 주세요`, pinned_at: null, created_at: new Date(base + i * 1000).toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 단체방 위 근무 정보
  const w = await mk(W)
  await w.goto(`${D}/me/chat/room/${J}`, { waitUntil: 'networkidle' })
  const facts = w.locator('[data-room-facts]')
  await facts.waitFor({ timeout: 15000 }).catch(() => {})
  const ft = one(await facts.innerText().catch(() => ''))
  ok("근무 정보 한 줄: '날짜 09:00 ~ 18:00 · 광장'", ft.endsWith('09:00 ~ 18:00 · 광장') && (await facts.evaluate((el) => el.getBoundingClientRect().height < 24)), ft)
  ok("집결 '집결 정문 앞 8시 50분'", one(await w.locator('[data-room-meeting]').innerText().catch(() => '')) === '집결 정문 앞 8시 50분')
  const tools = w.locator('[data-room-tools]')
  ok("[길찾기] [담당 전화 → 현장 담당 번호]", (await tools.locator('a', { hasText: '길찾기' }).count()) === 1 && (await tools.locator('a[href="tel:01055556666"]').count()) === 1)
  ok('360px 옆으로 안 밀림 (단체방)', await noSide(w))
  if (SHOTS) {
    await w.evaluate(() => window.scrollTo(0, 0))
    await w.waitForTimeout(300)
    await w.screenshot({ path: `${SHOTS}/room-facts.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})
  }
  // 현장 담당 번호가 없으면 회사 문의 번호
  await rest(`jobs?id=eq.${J}`, 'PATCH', { manager_phone: null })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const coPhone = (c1.contact_phone || c1.company_phone || '').replace(/\D/g, '')
  await w.goto(`${D}/me/chat/room/${J}`, { waitUntil: 'networkidle' })
  await tools.waitFor({ timeout: 15000 }).catch(() => {})
  ok('현장 담당 번호가 없으면 회사 문의 번호로 전화', coPhone.length > 0 && (await tools.locator(`a[href="tel:${coPhone}"]`).count()) === 1, coPhone)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { manager_phone: '01055556666' })

  // ── 2. 지난 대화를 읽는 중에 새 글: 끌어내리지 않고 '새 메시지 n개 ↓'
  await w.goto(`${D}/me/chat/room/${J}`, { waitUntil: 'networkidle' })
  await w.waitForTimeout(800)
  const gap = () => w.evaluate(() => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight))
  ok('처음 열면 맨 아래', (await gap()) < 120, String(await gap()))
  await w.evaluate(() => window.scrollTo(0, 0))
  await w.waitForTimeout(300)
  await rest('job_chat', 'POST', { id: '77777777-0000-4000-8000-000000022099', job_id: J, sender_id: A, from_admin: true, body: '방금 온 새 안내예요', pinned_at: null, created_at: new Date().toISOString() })
  // 새로 받기: 가짜 DB는 정렬을 안 해서 5초마다의 '바뀐 것 있나' 확인이 새 글을 못 알아챔 → 앱으로 돌아왔을 때처럼 바로 새로 받게 함 (운영 DB는 정렬함)
  const refresh = () => w.evaluate(() => { document.activeElement?.blur?.(); document.dispatchEvent(new Event('visibilitychange')) })
  await refresh()
  const pill = w.locator('[data-new-below]')
  const shown = await pill.waitFor({ timeout: 15000 }).then(() => true, () => false)
  const y = await w.evaluate(() => window.scrollY)
  ok("위에서 읽는 중엔 그대로 (끌어내리지 않음) · '새 메시지 1개 ↓'", shown && y < 50 && one(await pill.innerText().catch(() => '')) === '새 메시지 1개 ↓', `y=${y} ${one(await pill.innerText().catch(() => ''))}`)
  ok('알림 단추는 화면 안 · 아래 입력 칸 위', await pill.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8 && r.bottom < innerHeight - 60 }))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/new-below.png`, clip: { x: 0, y: 380, width: 360, height: 360 } }).catch(() => {})
  await pill.click()
  await w.waitForTimeout(900)
  ok('누르면 맨 아래로 · 새 글이 보임 · 단추 사라짐', (await gap()) < 120 && (await pill.count()) === 0 && (await w.getByText('방금 온 새 안내예요').isVisible()))
  // 맨 아래에 있으면 전처럼 따라 내려감
  await rest('job_chat', 'POST', { id: '77777777-0000-4000-8000-000000022098', job_id: J, sender_id: A, from_admin: true, body: '하나 더 온 안내예요', pinned_at: null, created_at: new Date().toISOString() })
  await refresh()
  await w.getByText('하나 더 온 안내예요').waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForTimeout(500)
  ok('맨 아래에 있을 때는 새 글을 따라 내려감 (단추 없음)', (await gap()) < 120 && (await pill.count()) === 0, String(await gap()))

  // ── 3. 끝난 행사: 근무 정보 줄 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(-1), end_date: kst(-1) })
  await w.goto(`${D}/me/chat/room/${J}`, { waitUntil: 'networkidle' })
  await w.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("끝난 행사는 근무 정보 없이 '같은 근무 단체방'", (await facts.count()) === 0 && (await w.locator('main').innerText()).includes('같은 근무 단체방'))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today })

  // ── 4. 회사 고르기 목록: 다른 회사의 '결과 안 알림 1'
  const nowIso = new Date().toISOString()
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '주말행사팀', seal_image: null, created_at: nowIso })
  const jc2 = { ...j1, id: JC2, company_id: C2, company: { company_name: '주말행사팀' }, title: '지난 토요일 마라톤 안내', start_date: kst(-2), end_date: kst(-2), status: 'closed', applications: [{ status: 'applied' }], created_at: nowIso }
  await rest('jobs', 'POST', jc2)
  const u2 = { id: U2, name: '박대기', phone: '01022000001', birth_date: '1998-03-03', photo_at: null, careers: [], role: 'worker', active: true }
  await rest('users', 'POST', u2)
  await rest('applications', 'POST', { id: AU2, job_id: JC2, user_id: U2, company_id: C2, status: 'applied', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, held_at: null, created_at: nowIso, user: u2, job: jc2 })
  const a = await mk(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const opt = one(await a.locator(`header select[name=company] option[value="${C2}"]`).innerText().catch(() => ''))
  ok("회사 고르기 목록: '주말행사팀 · 결과 안 알림 1'", opt === '주말행사팀 · 결과 안 알림 1', opt)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
