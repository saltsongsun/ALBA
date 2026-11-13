// 묶음 239 (사용자 요청 2026-11-13 "레벨도 근무자명단에 표기해주고 명단도 정렬 여러가지로 해줘")
// · 근무자 명단: 이름 옆 병아리 레벨 'Lv.n' (이 회사 기록만으로 셈 — 다른 회사에서 일한 기록은 넣지 않음 · 전문가는 레벨 없음)
//   넓은 화면 표에도 '레벨' 칸
// · 정렬: 최근 가입순(처음) · 레벨 높은 순 · 근무 많은 순 · 최근 근무순 · 평점 높은 순 · 이름순
//   제목 옆 정렬 고르기 → 바로 그 순서로 · 거르기(새로 가입·우리 회사 지원자 …)·검색을 바꿔도 정렬은 그대로
// node scripts/qa/batch239.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000239c2'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000239j2'
const U1 = 'bbbbbbbb-0000-4000-8000-0000000239a1', U2 = 'bbbbbbbb-0000-4000-8000-0000000239a2', U3 = 'bbbbbbbb-0000-4000-8000-0000000239a3', UX = 'bbbbbbbb-0000-4000-8000-0000000239e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const day = (n) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10) // 2026-10-02 …

;(async () => {
  // ── 준비: 근무자 셋 (가입 순서: 다현 → 가람 → 나래) · 전문가 하나 · 다른 회사 하나
  const [w] = await rest(`users?id=eq.${W}`)
  const base = { ...w, photo_at: null, careers: [], bank_account_enc: null, emergency_phone: null }
  // 명단 표의 근무일수·최근 근무·평점은 이 회사 기록 (가짜 DB는 사람 줄에 붙여 둔 값을 그대로 돌려줌)
  await rest('users', 'POST', { ...base, id: U1, name: '가람', phone: '01023900001', created_at: '2026-11-02T00:00:00Z', attendance: [1, 2, 3, 4].map((n) => ({ work_date: day(n) })), ratings: [{ score: 3 }] })
  await rest('users', 'POST', { ...base, id: U2, name: '나래', phone: '01023900002', created_at: '2026-11-03T00:00:00Z', attendance: [{ work_date: day(20) }, { work_date: day(21) }], ratings: [{ score: 5 }, { score: 5 }] })
  await rest('users', 'POST', { ...base, id: U3, name: '다현', phone: '01023900003', created_at: '2026-11-01T00:00:00Z', attendance: [], ratings: [] })
  await rest('users', 'POST', { ...base, id: UX, name: '라온', phone: '01023900009', member_type: 'expert', created_at: '2026-10-30T00:00:00Z', attendance: [], ratings: [] })
  // 레벨: 근무 1번 = 마치기 10 + 정시 5 + 직접 종료 5 = 20점 · Lv.2 = 30점 · Lv.3 = 80점
  const [job] = await rest(`jobs?id=eq.${J}`)
  const att = (id, uid, jobId, n) => ({ id, job_id: jobId, user_id: uid, work_date: day(n), clock_in: `${day(n)}T00:00:00Z`, clock_out: `${day(n)}T08:00:00Z`, note: null, sched_start: '09:00:00', sched_end: '18:00:00', paid: false, created_at: `${day(n)}T00:00:00Z` })
  for (const n of [1, 2, 3, 4]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000239a1${n}0`, U1, J, n)) // 80점 → Lv.3
  for (const n of [20, 21]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000239a2${n}`, U2, J, n)) // 40점 → Lv.2
  // 다른 회사(C2)에서 나래가 많이 일함 — 우리 회사 명단 레벨에는 들어가면 안 됨
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른회사', created_at: '2026-10-20T00:00:00Z' })
  const { applications, company, ...jobBase } = job
  await rest('jobs', 'POST', { ...jobBase, id: J2, company_id: C2, title: '다른 회사 공고' })
  for (let n = 5; n < 15; n++) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000239b${String(n).padStart(3, '0')}`, U2, J2, n))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const names = () => p.locator('div.stagger.sm\\:hidden a[href^="/admin/workers/"]').evaluateAll((els) => els.map((e) => e.textContent.trim()))
  const ours = (list) => list.filter((n) => ['가람', '나래', '다현', '라온'].includes(n))
  const card = (n) => p.locator('div.stagger.sm\\:hidden .card', { has: p.locator('a', { hasText: n }) }).first()
  const open = async (qs = '') => { await p.goto(`${D}/admin/workers${qs}`, { waitUntil: 'networkidle' }); await p.locator('[data-sort-select]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 레벨 표시 (이 회사 기록만)
  await open()
  const lvl = async (n) => card(n).locator('[data-level]').getAttribute('data-level').catch(() => null)
  ok("가람: 이 회사 근무 4번 → 'Lv.3'", (await lvl('가람')) === '3' && one(await card('가람').locator('[data-level]').innerText()) === 'Lv.3')
  ok('나래: 이 회사 근무 2번 → Lv.2 (다른 회사 근무 10번은 세지 않음)', (await lvl('나래')) === '2', await lvl('나래'))
  ok('다현: 기록 없음 → Lv.1', (await lvl('다현')) === '1')
  ok('전문가(라온): 레벨 없음', (await card('라온').locator('[data-level]').count()) === 0)
  ok("배지에 '우리 회사 기록으로 센 레벨' 설명", ((await card('가람').locator('[data-level]').getAttribute('title')) ?? '').includes('우리 회사 기록으로 센 레벨'))
  const head = await p.evaluate(() => { const h = document.querySelector('h1'); const s = document.querySelector('[data-sort-select]'); const a = h.getBoundingClientRect(), b = s.getBoundingClientRect(); return { same: Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 8, right: b.right <= innerWidth - 8 } })
  ok("제목 '근무자 n명' 옆 한 줄에 정렬 고르기 · 360px 옆으로 안 밀림", head.same && head.right && (await noSide(p)), JSON.stringify(head))
  ok('처음은 최근 가입순 (나래 → 가람 → 다현 → 라온)', JSON.stringify(ours(await names())) === JSON.stringify(['나래', '가람', '다현', '라온']), JSON.stringify(ours(await names())))
  if (SHOTS) {
    const bx = await card('가람').boundingBox()
    const top = (await p.locator('h1').boundingBox())?.y ?? 0
    if (bx) await p.screenshot({ path: `${SHOTS}/roster-level.png`, clip: { x: 0, y: Math.max(0, top - 8), width: 360, height: Math.min(700, bx.y + bx.height - top + 16) } }).catch(() => {})
  }

  // ── 2. 정렬 고르기 → 바로 그 순서로 (주소에 s=)
  await p.locator('[data-sort-select] select').selectOption('level')
  await p.waitForURL((u) => new URL(u).searchParams.get('s') === 'level', { timeout: 10000 }).catch(() => {})
  await p.locator('[data-sort-select="level"]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('레벨 높은 순: 가람(Lv.3) → 나래(Lv.2) → 다현(Lv.1) … 전문가는 맨 뒤', JSON.stringify(ours(await names())) === JSON.stringify(['가람', '나래', '다현', '라온']), JSON.stringify(ours(await names())))
  if (SHOTS) {
    const top = (await p.locator('h1').boundingBox())?.y ?? 0
    await p.screenshot({ path: `${SHOTS}/roster-sort-level.png`, clip: { x: 0, y: Math.max(0, top - 8), width: 360, height: 600 } }).catch(() => {})
  }
  await open('?s=days')
  ok('근무 많은 순: 가람(4일) → 나래(2일)', JSON.stringify(ours(await names()).slice(0, 2)) === JSON.stringify(['가람', '나래']), JSON.stringify(ours(await names())))
  await open('?s=recent')
  ok('최근 근무순: 나래(10/22) → 가람(10/05)', JSON.stringify(ours(await names()).slice(0, 2)) === JSON.stringify(['나래', '가람']), JSON.stringify(ours(await names())))
  await open('?s=rating')
  ok('평점 높은 순: 나래(5점) → 가람(3점) · 평가 없는 사람은 뒤', JSON.stringify(ours(await names()).slice(0, 2)) === JSON.stringify(['나래', '가람']), JSON.stringify(ours(await names())))
  await open('?s=name')
  const all = await names()
  ok('이름순: 가나다 순서', JSON.stringify(all) === JSON.stringify([...all].sort((a, b) => a.localeCompare(b, 'ko'))), JSON.stringify(all))
  ok("정렬 고르기에 지금 정렬('이름순')이 보임", (await p.locator('[data-sort-select] select').inputValue()) === 'name')

  // ── 3. 거르기·검색을 바꿔도 정렬은 그대로
  const chip = p.locator('[data-filter-row] a', { hasText: '새로 가입' })
  ok("거르기 칩 주소에 정렬이 남음 ('새로 가입' → s=name)", ((await chip.getAttribute('href')) ?? '').includes('s=name'), await chip.getAttribute('href'))
  ok('검색칸에도 정렬이 함께 감', (await p.locator('form input[type=hidden][name=s]').getAttribute('value').catch(() => null)) === 'name')
  await open('?s=level&f=mine')
  ok('우리 회사 지원자만 + 레벨 순 함께', (await p.locator('[data-sort-select] select').inputValue()) === 'level' && one(await p.locator('[data-filter-row] a.bg-ink').innerText().catch(() => '')) === '우리 회사 지원자')

  // ── 4. 넓은 화면 표: '레벨' 칸
  await p.setViewportSize({ width: 1024, height: 800 })
  await open('?s=level')
  const th = await p.locator('table thead th').evaluateAll((els) => els.map((e) => e.textContent.replace(/[▲▼]/g, '').trim()))
  ok("표에 '레벨' 칸 (이름 다음)", th[1] === '레벨', JSON.stringify(th))
  ok("표 가람 줄 'Lv.3'", one(await p.locator('table tbody tr', { hasText: '가람' }).locator('[data-level]').innerText().catch(() => '')) === 'Lv.3')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
