// 묶음 217 (정기 개선 2026-11-12 14:35 KST)
// · 여러 회사를 맡은 관리자: 다른 회사의 '끝난 행사인데 결과를 못 들은 대기 지원자'도 '결과 안 알림 n'으로 → 누르면 그 회사 대시보드의 '끝난 행사 · 결과 안 알림' 줄
// · 근무자 내 근무 '확정 대기': 오늘 근무 시간까지 끝났는데 확정되지 않았으면 '행사가 끝나 이번에는 확정되지 않았어요' · '미확정' (문의 줄·진행 단계 없음)
//   - 아직 기다리는 지원이 먼저, 끝난 것은 아래 · 끝난 것만 남으면 칸 이름이 '지원 결과'
// · 여러 날 행사 날짜 칩: 뒷날을 열면 고른 날짜 칩이 줄 밖에 숨지 않게 가운데로 (출퇴근 탭 · 지원자 탭) · 페이지는 위아래로 안 움직임
// node scripts/qa/batch217.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000217'
const JC2 = 'cccccccc-0000-4000-8000-0000000c2170', U2 = '44444444-0000-4000-8000-000000021701', AU2 = '55555555-0000-4000-8000-000000021701'
const J8 = 'cccccccc-0000-4000-8000-0000000c2178', J9 = 'cccccccc-0000-4000-8000-0000000c2179', J10 = 'cccccccc-0000-4000-8000-0000000c2110'
const A8 = '11111111-0000-4000-8000-0000000a2178', A9 = '11111111-0000-4000-8000-0000000a2179', A10 = '11111111-0000-4000-8000-0000000a2110'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const [aw] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 여러 날 행사 날짜 칩: 뒷날을 열면 고른 칩이 보임 (회사 하나일 때 먼저)
  const d0 = kst(0), d7 = kst(7)
  const j10 = { ...j1, id: J10, title: '여드레 박람회 안내', start_date: d0, end_date: d7, headcount: 2, status: 'open', hidden_fields: [], applications: [{ status: 'approved' }], required_docs: [], created_at: nowIso }
  await rest('jobs', 'POST', j10)
  await rest('applications', 'POST', { ...aw, id: A10, job_id: J10, status: 'approved', available_dates: null, position: null, held_at: null, job: j10, created_at: nowIso })
  const a = await mk(A)
  const inView = (p) =>
    p.evaluate(() => {
      const chip = document.querySelector('[data-chip-on]')
      const row = chip?.parentElement
      if (!chip || !row) return { ok: false, why: 'no chip' }
      const r = row.getBoundingClientRect(), c = chip.getBoundingClientRect()
      return { ok: c.left >= r.left - 1 && c.right <= r.right + 1, scrolled: row.scrollLeft, y: scrollY, chip: [Math.round(c.left), Math.round(c.right)], row: [Math.round(r.left), Math.round(r.right)] }
    })
  await a.goto(`${D}/admin/jobs/${J10}?tab=att&date=${d7}`, { waitUntil: 'networkidle' })
  await a.waitForTimeout(800)
  const v1 = await inView(a)
  ok('출퇴근 탭: 마지막 날을 열면 그 날짜 칩이 줄 안에 보임 (옆으로 넘어가 있음) · 페이지는 위아래로 안 움직임', v1.ok && v1.scrolled > 0 && v1.y === 0, JSON.stringify(v1))
  ok('360px 옆으로 안 밀림 (출퇴근 탭)', await noSide(a))
  if (SHOTS) await a.locator('[data-chip-on]').locator('xpath=..').screenshot({ path: `${SHOTS}/att-chip-in-view.png` }).catch(() => {})
  await a.goto(`${D}/admin/jobs/${J10}?tab=apps&day=${d7}`, { waitUntil: 'networkidle' })
  await a.waitForTimeout(800)
  const v2 = await inView(a)
  ok('지원자 탭: 마지막 날을 고르면 그 날짜 칩이 줄 안에 보임', v2.ok && v2.scrolled > 0, JSON.stringify(v2))
  await a.goto(`${D}/admin/jobs/${J10}?tab=att&date=${d0}`, { waitUntil: 'networkidle' })
  await a.waitForTimeout(500)
  const v3 = await inView(a)
  ok('첫날이면 줄은 그대로 (처음부터 보임)', v3.ok && v3.scrolled === 0, JSON.stringify(v3))
  await rest(`applications?id=eq.${A10}`, 'DELETE')
  await rest(`jobs?id=eq.${J10}`, 'DELETE')

  // ── 2. 근무자 내 근무: 오늘 끝난 행사인데 확정 안 됨
  const j8 = { ...j1, id: J8, title: '새벽 짐 나르기 (끝남)', start_date: d0, end_date: d0, start_time: '00:00:00', end_time: '00:01:00', status: 'open', hidden_fields: [], applications: [{ status: 'applied' }], required_docs: [], created_at: nowIso }
  await rest('jobs', 'POST', j8)
  await rest('applications', 'POST', { ...aw, id: A8, job_id: J8, status: 'applied', available_dates: null, position: null, held_at: null, decided_at: null, job: j8, created_at: nowIso })
  const w = await mk(W)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const card8 = w.locator(`[data-waiting-app="${J8}"]`)
  await card8.waitFor({ timeout: 15000 }).catch(() => {})
  const t8 = one(await card8.innerText().catch(() => ''))
  ok("끝난 지원: '행사가 끝나 이번에는 확정되지 않았어요' · '미확정' ('지원완료' 아님)", (await card8.getAttribute('data-waiting-lapsed')) === '' && t8.includes('행사가 끝나 이번에는 확정되지 않았어요') && t8.includes('미확정') && !t8.includes('지원완료'), t8)
  ok('문의 줄·진행 단계 없음', (await card8.locator('[data-waiting-soon]').count()) === 0 && (await card8.locator('[data-apply-steps]').count()) === 0)
  const title = async () => one(await w.locator('[data-waiting] h2').innerText().catch(() => ''))
  ok("끝난 것만 남으면 칸 이름 '지원 결과'", (await title()) === '지원 결과', await title())
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
  if (SHOTS) await card8.screenshot({ path: `${SHOTS}/waiting-lapsed.png` }).catch(() => {})
  // 내일 공고에도 지원 → 기다리는 지원이 먼저
  const d1 = kst(1)
  const j9 = { ...j8, id: J9, title: '내일 주차 안내', start_date: d1, end_date: d1, start_time: '09:00:00', end_time: '18:00:00' }
  await rest('jobs', 'POST', j9)
  await rest('applications', 'POST', { ...aw, id: A9, job_id: J9, status: 'applied', available_dates: null, position: null, held_at: null, decided_at: null, job: j9, created_at: nowIso })
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await w.locator(`[data-waiting-app="${J9}"]`).waitFor({ timeout: 15000 }).catch(() => {})
  const order = await w.locator('[data-waiting-app]').evaluateAll((l) => l.map((x) => x.getAttribute('data-waiting-app')))
  ok("기다리는 지원이 먼저 · 끝난 지원은 아래 · 칸 이름 '확정 대기'", order.indexOf(J9) >= 0 && order.indexOf(J9) < order.indexOf(J8) && (await title()) === '확정 대기', `${order.join(',')} ${await title()}`)
  if (SHOTS) await w.locator('[data-waiting]').screenshot({ path: `${SHOTS}/waiting-order.png` }).catch(() => {})
  for (const id of [A8, A9]) await rest(`applications?id=eq.${id}`, 'DELETE')
  for (const id of [J8, J9]) await rest(`jobs?id=eq.${id}`, 'DELETE')

  // ── 3. 다른 회사: 끝난 행사 대기 지원자 → '결과 안 알림 1'
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '주말행사팀', seal_image: null, created_at: nowIso })
  const jc2 = { ...j1, id: JC2, company_id: C2, company: { company_name: '주말행사팀' }, title: '지난 토요일 마라톤 안내', start_date: kst(-2), end_date: kst(-2), status: 'closed', hidden_fields: [], applications: [{ status: 'applied' }], required_docs: [], created_at: nowIso }
  await rest('jobs', 'POST', jc2)
  const u2 = { id: U2, name: '박대기', phone: '01021700001', birth_date: '1998-03-03', photo_at: null, careers: [], role: 'worker', active: true }
  await rest('users', 'POST', u2)
  await rest('applications', 'POST', { id: AU2, job_id: JC2, user_id: U2, company_id: C2, status: 'applied', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, held_at: null, created_at: nowIso, user: u2, job: jc2 })
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const card = a.locator('[data-other-companies]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const ct = one(await card.innerText().catch(() => ''))
  ok("다른 회사 안내: '다른 회사에 확인할 일 · 주말행사팀 결과 안 알림 1'", ct.startsWith('다른 회사에 확인할 일') && one(await card.locator('[data-other-lapsed]').innerText().catch(() => '')) === '결과 안 알림 1' && ct.includes('주말행사팀'), ct)
  ok('칩 한 줄 · 360px 옆으로 안 밀림', (await card.locator('button').first().evaluate((el) => el.getBoundingClientRect().height < 40)) && (await noSide(a)))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/other-lapsed.png` }).catch(() => {})
  await card.getByRole('button', { name: /주말행사팀/ }).click()
  await a.waitForFunction((c2) => document.querySelector('header select[name=company]')?.value === c2, C2, { timeout: 15000 }).catch(() => {})
  const row = a.locator(`[data-todo="lapsed-${JC2}"]`)
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 그 회사 대시보드 '확인할 일'에 그 공고 · 1명 · '미선발 알림'", one(await row.locator('a').innerText().catch(() => '')).startsWith('지난 토요일 마라톤 안내') && (await row.locator('[data-lapsed-notify]').count()) === 1)
  // 정리
  await rest(`applications?id=eq.${AU2}`, 'DELETE')
  await rest(`jobs?id=eq.${JC2}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
