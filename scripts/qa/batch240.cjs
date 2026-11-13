// 묶음 240 (정기 개선 2026-11-13 23:40 KST)
// · 근무자 한 사람 화면: 성실도 줄(근무 n일 · 지각 · 노쇼) 맨 앞에 'Lv.3 부지런 병아리' (명단과 같게 이 회사 기록만 · 전문가는 없음)
//   길게 누르면 '우리 회사 기록으로 센 레벨 · 근무 n번 더 하면 Lv.n'
// · 디자인: 근무자 명단을 불러오는 동안 회색 자리도 새 모양 (제목 옆 정렬 고르기 · 이름 옆 레벨 배지 자리) → 그려질 때 덜 출렁임
// node scripts/qa/batch240.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000240c2'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000240j2'
const U1 = 'bbbbbbbb-0000-4000-8000-0000000240a1', U2 = 'bbbbbbbb-0000-4000-8000-0000000240a2', UX = 'bbbbbbbb-0000-4000-8000-0000000240e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const day = (n) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10)

;(async () => {
  const [w] = await rest(`users?id=eq.${W}`)
  const base = { ...w, photo_at: null, careers: [], bank_account_enc: null, emergency_phone: null, attendance: [], ratings: [] }
  await rest('users', 'POST', { ...base, id: U1, name: '가람', phone: '01024000001', created_at: '2026-11-02T00:00:00Z' })
  await rest('users', 'POST', { ...base, id: U2, name: '나래', phone: '01024000002', created_at: '2026-11-03T00:00:00Z' })
  await rest('users', 'POST', { ...base, id: UX, name: '라온', phone: '01024000009', member_type: 'expert', created_at: '2026-10-30T00:00:00Z' })
  const att = (id, uid, jobId, n) => ({ id, job_id: jobId, user_id: uid, work_date: day(n), clock_in: `${day(n)}T00:00:00Z`, clock_out: `${day(n)}T08:00:00Z`, note: null, sched_start: '09:00:00', sched_end: '18:00:00', paid: false, created_at: `${day(n)}T00:00:00Z` })
  for (const n of [1, 2, 3, 4]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000240a1${n}0`, U1, J, n)) // 80점 → Lv.3
  for (const n of [20, 21]) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000240a2${n}`, U2, J, n)) // 40점 → Lv.2
  // 다른 회사에서 일한 기록은 세지 않음
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른회사', created_at: '2026-10-20T00:00:00Z' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...jobBase } = job
  await rest('jobs', 'POST', { ...jobBase, id: J2, company_id: C2, title: '다른 회사 공고' })
  for (let n = 5; n < 15; n++) await rest('attendance', 'POST', att(`eeeeeeee-0000-4000-8000-00000240b${String(n).padStart(3, '0')}`, U2, J2, n))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const chip = a.locator('[data-worker-rel] [data-level]')
  const open = async (id) => { await a.goto(`${D}/admin/workers/${id}`, { waitUntil: 'networkidle' }); await a.locator('[data-worker-rel]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 한 사람 화면: 성실도 줄 맨 앞 레벨
  await open(U1)
  ok("가람(이 회사 근무 4번): 'Lv.3 부지런 병아리' · 성실도 줄 맨 앞", one(await chip.innerText().catch(() => '')) === 'Lv.3 부지런 병아리' && (await a.locator('[data-worker-rel] > *').first().getAttribute('data-level')) === '3')
  ok("길게 누르면 '우리 회사 기록으로 센 레벨 · 근무 n번 더 하면 Lv.4'", /^우리 회사 기록으로 센 레벨 · 근무 \d+번 더 하면 Lv\.4$/.test((await chip.getAttribute('title').catch(() => '')) ?? ''), await chip.getAttribute('title').catch(() => ''))
  const fit = await chip.evaluate((el) => ({ rows: el.getClientRects().length, h: Math.round(el.getBoundingClientRect().height) })).catch(() => ({}))
  ok('레벨 칩 한 줄 · 360px 옆으로 안 밀림', fit.rows === 1 && fit.h < 24 && (await noSide(a)), JSON.stringify(fit))
  if (SHOTS) {
    const bx = await a.locator('section.card').first().boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/worker-level.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(260, bx.height + 16) } }).catch(() => {})
  }
  await open(U2)
  ok("나래: 이 회사 근무 2번만 셈 → 'Lv.2' (다른 회사 근무 10번은 빼고)", (await chip.getAttribute('data-level').catch(() => null)) === '2', await chip.getAttribute('data-level').catch(() => null))
  await open(UX)
  ok('전문가(라온): 레벨 칩 없음', (await a.locator('[data-worker-rel]').count()) === 1 && (await chip.count()) === 0)

  // ── 2. 명단을 불러오는 동안 회색 자리: 제목 옆 정렬 고르기 · 이름 옆 레벨 배지 자리
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await a.route('**/admin/workers**', async (route) => {
    if (route.request().headers()['next-router-prefetch']) return route.continue()
    await new Promise((r) => setTimeout(r, 1500))
    route.continue().catch(() => {})
  })
  await a.locator('a[href="/admin/workers"]:visible').last().click()
  const sk = a.locator('[data-skeleton="roster"]')
  const seen = await sk.waitFor({ timeout: 3000 }).then(() => true, () => false)
  const shape = seen ? await sk.evaluate((el) => { const s = el.querySelector('[data-skeleton-sort]'); const t = s?.previousElementSibling; const a = s?.getBoundingClientRect(), b = t?.getBoundingClientRect(); return { sort: !!s, same: !!a && !!b && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 6, w: a ? Math.round(a.width) : 0 } }) : {}
  ok('불러오는 동안 회색 자리: 제목 옆 같은 줄에 정렬 고르기 자리 (152px)', seen && shape.sort && shape.same && shape.w === 152, JSON.stringify(shape))
  if (SHOTS && seen) await a.screenshot({ path: `${SHOTS}/roster-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 520 } }).catch(() => {})
  await a.unroute('**/admin/workers**')
  await a.locator('[data-sort-select]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('다 그려지면 정렬 고르기가 같은 자리 (152px 이상)', ((await a.locator('[data-sort-select] select').boundingBox())?.width ?? 0) >= 152)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
