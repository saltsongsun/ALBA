// 묶음 242 (정기 개선 2026-11-14 02:43 KST)
// · 공고 지원자 탭 정렬에 '레벨 높은 순' (이 회사 기록으로 센 병아리 레벨 · 다른 회사 근무는 세지 않음)
// · '이전 근무자에게 모집 알리기' 목록에도 이름 옆 'Lv.n' (누구에게 먼저 알릴지 고르기 쉽게)
// · 디자인: 정렬 칩을 누르면 그 칩이 바로 켜지고, 새 순서가 올 때까지 아래 목록이 살짝 흐려짐 (두세 번 누르지 않게)
// node scripts/qa/batch242.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000242c2'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000242j2', J3 = 'cccccccc-0000-4000-8000-0000000242j3'
const APP = '11111111-0000-4000-8000-000000000012'
const U1 = 'bbbbbbbb-0000-4000-8000-0000000242a1', U2 = 'bbbbbbbb-0000-4000-8000-0000000242a2', U3 = 'bbbbbbbb-0000-4000-8000-0000000242a3'
const APP1 = '11111111-0000-4000-8000-0000000242b1', APP2 = '11111111-0000-4000-8000-0000000242b2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const day = (n) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 공고는 내일 (시간과 상관없이 모집 중 · 이전 근무자 알리기가 보이게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(1), end_date: kst(1), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { status: 'applied', available_dates: [kst(1)], held_at: null })
  // 같은 회사의 지난 행사(J2) · 다른 회사(C2)의 행사(J3)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...jobBase } = job
  await rest('jobs', 'POST', { ...jobBase, id: J2, title: '지난 행사', start_date: day(1), end_date: day(30), status: 'closed' })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른회사', created_at: '2026-10-20T00:00:00Z' })
  await rest('jobs', 'POST', { ...jobBase, id: J3, company_id: C2, title: '다른 회사 행사', start_date: day(1), end_date: day(30), status: 'closed' })
  // 지원자: 김지원(이 회사 2번 → Lv.2) · 가람(이 회사 4번 → Lv.3) · 나래(이 회사 0번 · 다른 회사 10번 → Lv.1)
  const [w] = await rest(`users?id=eq.${W}`)
  const base = { ...w, photo_at: null, careers: [], bank_account_enc: null, emergency_phone: null, attendance: [], ratings: [] }
  await rest('users', 'POST', { ...base, id: U1, name: '가람', phone: '01024200001', created_at: '2026-11-02T00:00:00Z' })
  await rest('users', 'POST', { ...base, id: U2, name: '나래', phone: '01024200002', created_at: '2026-11-03T00:00:00Z' })
  await rest('users', 'POST', { ...base, id: U3, name: '다온', phone: '01024200003', created_at: '2026-11-04T00:00:00Z' })
  const att = (id, uid, jobId, n) => ({ id, job_id: jobId, user_id: uid, work_date: day(n), clock_in: `${day(n)}T00:00:00Z`, clock_out: `${day(n)}T08:00:00Z`, note: null, sched_start: '09:00:00', sched_end: '18:00:00', paid: false, created_at: `${day(n)}T00:00:00Z` })
  for (const n of [3, 4]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000242a0${n}0`, AP, J2, n))
  for (const n of [5, 6, 7, 8]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000242a1${n}0`, U1, J2, n))
  for (let n = 10; n < 20; n++) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000242a2${n}`, U2, J3, n))
  for (const n of [21, 22]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000242a3${n}`, U3, J2, n)) // 지원 안 함 → 이전 근무자 목록
  const [ap] = await rest(`applications?id=eq.${APP}`)
  const appOf = (id, uid, name, phone) => ({ ...ap, id, user_id: uid, user: { ...(ap.user ?? {}), id: uid, name, phone, member_type: 'worker', photo_at: null }, status: 'applied', held_at: null, created_at: new Date().toISOString() })
  await rest('applications', 'POST', appOf(APP1, U1, '가람', '01024200001'))
  await rest('applications', 'POST', appOf(APP2, U2, '나래', '01024200002'))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const waitIds = () => a.locator('[data-app-list] [data-app-group="대기"] [id^="app-"]').evaluateAll((els) => els.map((e) => e.id.slice(4)))
  const nameOf = { [APP]: '김지원', [APP1]: '가람', [APP2]: '나래' }
  const names = async () => (await waitIds()).map((id) => nameOf[id] ?? id)

  // ── 1. 정렬 칩: '레벨 높은 순'이 두 번째 · 처음엔 '지원순'
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  await a.locator('[data-sort-chips]').waitFor({ timeout: 15000 }).catch(() => {})
  const chips = await a.locator('[data-sort-chips] a').evaluateAll((els) => els.map((e) => e.textContent.trim()))
  ok("정렬 칩: 지원순 · 레벨 높은 순 · 평점 높은 순 · 경험 많은 순 · 성실한 순", JSON.stringify(chips) === JSON.stringify(['지원순', '레벨 높은 순', '평점 높은 순', '경험 많은 순', '성실한 순']), JSON.stringify(chips))
  ok("처음엔 '지원순'이 켜짐 (aria-current)", (await a.locator('[data-sort-chips="time"] a[aria-current="true"]').innerText().catch(() => '')) === '지원순')
  ok('카드마다 레벨: 김지원 Lv.2 · 가람 Lv.3 · 나래 Lv.1 (다른 회사 근무 10번은 빼고)',
    (await a.locator(`#app-${APP} [data-level]`).getAttribute('data-level').catch(() => null)) === '2' &&
    (await a.locator(`#app-${APP1} [data-level]`).getAttribute('data-level').catch(() => null)) === '3' &&
    (await a.locator(`#app-${APP2} [data-level]`).getAttribute('data-level').catch(() => null)) === '1')

  // ── 2. 칩을 누르면 바로 켜지고 목록이 살짝 흐려졌다가 새 순서로 (서버 응답을 1.5초 늦춰 봄)
  await a.route('**/admin/jobs/**', async (route) => {
    const h = route.request().headers()
    if (!h['rsc'] || h['next-router-prefetch']) return route.continue()
    await new Promise((r) => setTimeout(r, 1500))
    route.continue().catch(() => {})
  })
  const list = a.locator('[data-app-list]')
  await a.locator('[data-sort-chips] a', { hasText: '레벨 높은 순' }).click()
  await a.waitForTimeout(250)
  const mid = {
    chip: await a.locator('[data-sort-chips]').getAttribute('data-sort-chips'),
    on: one(await a.locator('[data-sort-chips] a[aria-current="true"]').innerText().catch(() => '')),
    cls: (await a.locator('[data-sort-chips] a', { hasText: '레벨 높은 순' }).getAttribute('class')) ?? '',
    pending: (await a.locator('[data-sort-chips][data-pending]').count()) === 1,
    opacity: Number(await list.evaluate((el) => getComputedStyle(el).opacity)),
    url: new URL(a.url()).searchParams.get('sort'),
  }
  ok("누르자마자(0.25초): '레벨 높은 순' 칩이 켜짐 (응답 오기 전)", mid.chip === 'level' && mid.on === '레벨 높은 순' && mid.cls.includes('bg-ink'), JSON.stringify(mid))
  ok('기다리는 동안 아래 지원자 목록이 살짝 흐려짐 (불투명도 < 0.8)', mid.pending && mid.opacity < 0.8, JSON.stringify(mid))
  await a.waitForURL((u) => new URL(u).searchParams.get('sort') === 'level', { timeout: 10000 }).catch(() => {})
  await a.waitForFunction(() => !document.querySelector('[data-sort-chips][data-pending]'), null, { timeout: 10000 }).catch(() => {})
  await a.waitForTimeout(300)
  const after = { url: new URL(a.url()).searchParams.get('sort'), opacity: Number(await list.evaluate((el) => getComputedStyle(el).opacity)), names: await names() }
  ok("응답이 오면: 주소 sort=level · 목록 다시 또렷하게", after.url === 'level' && after.opacity === 1, JSON.stringify(after))
  ok('레벨 높은 순: 가람(Lv.3) → 김지원(Lv.2) → 나래(Lv.1)', JSON.stringify(after.names) === JSON.stringify(['가람', '김지원', '나래']), JSON.stringify(after.names))
  if (SHOTS) {
    const bx = await a.locator('[data-sort-chips]').boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/apps-level-sort.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: 420 } }).catch(() => {})
  }
  await a.unroute('**/admin/jobs/**')
  // 뒤로 가기 기록을 쌓지 않음 (정렬만 바꿈)
  ok('정렬을 바꿔도 뒤로 가기 기록이 늘지 않음 (주소만 바꿈)', (await a.evaluate(() => history.length)) <= 2, String(await a.evaluate(() => history.length)))
  // 같은 칩을 다시 눌러도 아무 일 없음
  await a.locator('[data-sort-chips] a', { hasText: '레벨 높은 순' }).click()
  await a.waitForTimeout(200)
  ok('켜진 칩을 또 누르면 그대로 (흐려지지 않음)', (await a.locator('[data-sort-chips][data-pending]').count()) === 0 && new URL(a.url()).searchParams.get('sort') === 'level')
  // 주소로 바로 열어도 같은 순서
  await a.goto(`${D}/admin/jobs/${J}?tab=apps&sort=level`, { waitUntil: 'networkidle' })
  ok('주소로 바로 열어도 레벨 높은 순', JSON.stringify(await names()) === JSON.stringify(['가람', '김지원', '나래']) && (await a.locator('[data-sort-chips="level"]').count()) === 1)
  ok('360px 옆으로 안 밀림', await noSide(a))

  // ── 3. 이전 근무자에게 모집 알리기: 이름 옆 Lv
  const fold = a.locator('details', { has: a.locator('summary', { hasText: '이전 근무자에게 모집 알리기' }) })
  ok("'이전 근무자에게 모집 알리기'가 보임 (다온 · 지원 안 함)", (await fold.count()) === 1)
  await fold.locator('summary').click()
  const row = fold.locator('li', { hasText: '다온' })
  await row.waitFor({ timeout: 5000 }).catch(() => {})
  ok("다온(이 회사 근무 2번): 이름 옆 'Lv.2'", one(await row.locator('[data-level]').innerText().catch(() => '')) === 'Lv.2')
  const fit = await row.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), name: Math.round(el.querySelector('[data-level]')?.previousElementSibling?.getBoundingClientRect().width ?? 0) })).catch(() => ({}))
  ok('목록 한 줄 그대로 (높이 < 60px · 이름이 보임)', fit.h < 60 && fit.name > 20, JSON.stringify(fit))
  if (SHOTS) await fold.screenshot({ path: `${SHOTS}/invite-past-level.png` }).catch(() => {})
  // 지원한 사람(가람·김지원)은 이전 근무자 목록에 없음
  ok('이미 지원한 사람은 목록에 없음', (await fold.locator('li', { hasText: '가람' }).count()) === 0 && (await fold.locator('li', { hasText: '김지원' }).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
