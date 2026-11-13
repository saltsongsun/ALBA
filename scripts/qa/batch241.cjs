// 묶음 241 (정기 개선 2026-11-14 00:53 KST)
// · 지원자 이름 옆 병아리 레벨 'Lv.n' — 대시보드 '확정 대기' 카드 · 공고 지원자 탭 카드 (명단과 같게 이 회사 기록만 · 전문가는 없음)
//   확정할 때 이 회사에서 많이 일해 본 사람이 바로 눈에 띄게 · 대시보드는 '근무 n일' 줄 맨 앞 (이름 줄이 두 줄로 꺾이지 않게)
// · 넓은 화면 근무자 명단 표: 칸 제목(이름·레벨·근무일수·최근 근무·가입일)을 누르면 그 순서로 · 지금 정렬한 칸에 ▼(이름은 ▲)
// node scripts/qa/batch241.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', APP = '11111111-0000-4000-8000-000000000012'
const UX = 'bbbbbbbb-0000-4000-8000-0000000241e1', APX = '11111111-0000-4000-8000-0000000241e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const day = (n) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 공고는 내일 (시간과 상관없이 '확정 대기'에 보이게) · 김지원은 이 회사에서 2번 일함 → Lv.2
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(1), end_date: kst(1), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { status: 'applied', available_dates: [kst(1)], held_at: null })
  const att = (id, uid, n) => ({ id, job_id: J, user_id: uid, work_date: day(n), clock_in: `${day(n)}T00:00:00Z`, clock_out: `${day(n)}T08:00:00Z`, note: null, sched_start: '09:00:00', sched_end: '18:00:00', paid: false, created_at: `${day(n)}T00:00:00Z` })
  for (const n of [3, 4]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000241a0${n}0`, AP, n))
  // 전문가 지원자 (레벨 없음)
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: UX, name: '라온', phone: '01024100009', member_type: 'expert', photo_at: null, created_at: '2026-11-01T00:00:00Z', attendance: [], ratings: [] })
  const [ap] = await rest(`applications?id=eq.${APP}`)
  await rest('applications', 'POST', { ...ap, id: APX, user_id: UX, user: { ...(ap.user ?? {}), id: UX, name: '라온', member_type: 'expert', phone: '01024100009' }, status: 'applied', held_at: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 대시보드 '확정 대기' 카드
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const card = (n) => a.locator('#pending .card', { has: a.locator('a', { hasText: n }) }).first()
  await card('김지원').waitFor({ timeout: 15000 }).catch(() => {})
  const lv = card('김지원').locator('[data-level]')
  ok("대기 카드: 김지원 이름 옆 'Lv.2' (이 회사 근무 2번)", one(await lv.innerText().catch(() => '')) === 'Lv.2' && (await lv.getAttribute('data-level')) === '2')
  // 레벨은 '근무 n일' 줄 맨 앞 (이름·나이·지원 시각 줄은 그대로 한 줄)
  const rows = await card('김지원').evaluate((el) => { const n = [...el.querySelectorAll('a')].find((x) => x.textContent.trim() === '김지원'); const row = n.parentElement; return { nameRow: Math.round(row.getBoundingClientRect().height), inRel: !!el.querySelector('[data-pending-rel] > [data-level]:first-child') } })
  ok("레벨은 '근무 n일' 줄 맨 앞 · 이름 줄은 한 줄 그대로 · 360px 옆으로 안 밀림", rows.inRel && rows.nameRow < 30 && (await noSide(a)), JSON.stringify(rows))
  ok('전문가 지원자(라온): 레벨 배지 없음', (await card('라온').count()) === 1 && (await card('라온').locator('[data-level]').count()) === 0)
  if (SHOTS) await card('김지원').screenshot({ path: `${SHOTS}/pending-level.png` }).catch(() => {})

  // ── 2. 공고 지원자 탭 카드
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  const appCard = a.locator(`#app-${APP}`)
  await appCard.waitFor({ timeout: 15000 }).catch(() => {})
  ok("지원자 탭: 김지원 카드 'Lv.2'", one(await appCard.locator('[data-level]').innerText().catch(() => '')) === 'Lv.2')
  ok('지원자 탭: 전문가(라온) 카드 레벨 없음', (await a.locator(`#app-${APX} [data-level]`).count()) === 0 && (await a.locator(`#app-${APX}`).count()) === 1)

  // ── 3. 넓은 화면 명단 표: 칸 제목 누르면 정렬
  await a.setViewportSize({ width: 1100, height: 800 })
  await a.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  const head = (k) => a.locator(`table thead [data-sort-head="${k}"]`)
  ok("처음: '가입일' 칸이 정렬 중 (▼ 보임)", (await a.locator('table thead th[aria-sort]').count()) === 1 && ((await head('new').locator('span').getAttribute('class')) ?? '').includes('text-brand-600'))
  await head('level').click()
  await a.waitForURL((u) => new URL(u).searchParams.get('s') === 'level', { timeout: 10000 }).catch(() => {})
  await a.locator('[data-sort-select="level"]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("'레벨' 칸을 누르면 레벨 높은 순 (주소 s=level · aria-sort=descending · 위 정렬 고르기도 같이)", new URL(a.url()).searchParams.get('s') === 'level' && (await head('level').locator('xpath=..').getAttribute('aria-sort')) === 'descending' && (await a.locator('[data-sort-select] select').inputValue()) === 'level')
  await head('name').click()
  await a.waitForURL((u) => new URL(u).searchParams.get('s') === 'name', { timeout: 10000 }).catch(() => {})
  await a.locator('[data-sort-select="name"]').waitFor({ timeout: 10000 }).catch(() => {})
  const names = await a.locator('table tbody tr td:first-child a[href^="/admin/workers/"]').evaluateAll((els) => els.map((e) => e.textContent.trim()))
  ok("'이름' 칸: 가나다 순 · aria-sort=ascending · ▲", JSON.stringify(names) === JSON.stringify([...names].sort((x, y) => x.localeCompare(y, 'ko'))) && (await head('name').locator('xpath=..').getAttribute('aria-sort')) === 'ascending' && one(await head('name').locator('span').innerText()) === '▲', JSON.stringify(names))
  ok("정렬 없는 칸(나이·연락처·계좌)은 그냥 글자", (await a.locator('table thead th', { hasText: '연락처' }).locator('a').count()) === 0)
  if (SHOTS) await a.locator('table thead').screenshot({ path: `${SHOTS}/roster-table-head.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
