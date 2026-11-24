// 묶음 380 (정기 개선 2026-11-24 22:36 KST)
// · 관리자 홈 할 일: 오늘·내일 근무인데 서명 서류가 아직 안 간 확정자 → '서류 안 보냄 · 공고' n명 + 아래 작은 줄 '내일 근무' (오늘이면 빨강)
//   (근로계약서는 모집 마감 후 — 사용자 요청 2026-11-24 · 마감을 잊어도 근무 전에 서류를 챙기게)
//   · 누르면 그 공고 서류 탭 '지금 보내기' 줄로 내려가고 버튼이 번쩍 (#docs-waiting)
//   · 서류가 이미 있는 사람(서명 대기)은 예전처럼 '서명 안 함' 줄에만 · 종이 계약만·서류 없는 공고는 없음
//   · '지금 보내기' 뒤에는 그 줄이 사라지고 '서명 안 함'으로 넘어감
// node scripts/qa/batch380.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const TPL = 'ffffffff-0000-4000-8000-000000000007'
const JT = 'cccccccc-0000-4000-8000-000000038001', JM = 'cccccccc-0000-4000-8000-000000038002', JP = 'cccccccc-0000-4000-8000-000000038003', JX = 'cccccccc-0000-4000-8000-000000038004'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003800${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003800${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)

;(async () => {
  const nowIso = new Date().toISOString()
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, ...jrow } = j
  const base = { ...jrow, company_id: C1, status: 'open', required_docs: [TPL], contract_method: 'app', headcount: 10, created_at: nowIso, audience: 'worker' }
  await rest('jobs', 'POST', { ...base, id: JT, title: '오늘 행사380', start_date: kday(0), end_date: kday(0), start_time: '23:00:00', end_time: '23:59:00' })
  await rest('jobs', 'POST', { ...base, id: JM, title: '내일 행사380', start_date: kday(1), end_date: kday(1) })
  await rest('jobs', 'POST', { ...base, id: JP, title: '종이 계약380', start_date: kday(1), end_date: kday(1), contract_method: 'paper' })
  await rest('jobs', 'POST', { ...base, id: JX, title: '서류 없는 행사380', start_date: kday(1), end_date: kday(1), required_docs: [] })
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 7; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}380`, phone: `010380000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  const app = (n, job) => rest('applications', 'POST', { id: AP(n), company_id: C1, job_id: job, user_id: U(n), user: usr[n], status: 'approved', available_dates: null, message: null, decided_at: nowIso, held_at: null, position: null, contract_received_at: null, created_at: nowIso })
  await app(1, JT)
  await app(2, JM)
  await app(3, JM)
  await app(4, JM)
  await app(5, JP)
  await app(6, JX)
  // 근무자4는 서류가 이미 있음 (서명 대기) → '서명 안 함' 줄에만
  await rest('signed_docs', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000038004', company_id: C1, job_id: JM, user_id: U(4), template_id: TPL, kind: 'contract', title: '근로계약서', status: 'pending', created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'hw_company', value: C1, url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const home = async () => {
    await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await a.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 할 일: 오늘(빨강) · 내일(주황) 서류 아직 안 보냄 · 서류가 있는 사람은 '서명 안 함'으로
  await home()
  const rowT = a.locator(`[data-todo="nodoc-${JT}"]`)
  const rowM = a.locator(`[data-todo="nodoc-${JM}"]`)
  const tT = one(await rowT.innerText().catch(() => ''))
  const tM = one(await rowM.innerText().catch(() => ''))
  ok("오늘: '서류 안 보냄 · 오늘 행사380' + '오늘 근무' 1명 (빨강)", tT.includes('서류 안 보냄 · 오늘 행사380') && tT.includes('오늘 근무') && /1\s*명/.test(tT) && (await rowT.locator('.text-rose-600').count()) > 0, tT)
  ok("내일: '서류 안 보냄 · 내일 행사380' + '내일 근무' 2명 (주황 · 서류 있는 1명 빼고)", tM.includes('서류 안 보냄 · 내일 행사380') && tM.includes('내일 근무') && /2\s*명/.test(tM) && (await rowM.locator('.text-amber-700').count()) > 0, tM)
  // 공고 이름이 잘리지 않음
  ok('공고 이름 안 잘림 (360px)', await rowM.locator('a').first().evaluate((el) => [...el.querySelectorAll('*')].every((x) => getComputedStyle(x).textOverflow !== 'ellipsis' || x.scrollWidth <= x.clientWidth + 1)))
  ok("서류가 이미 있는 사람은 '내일 근무 · 서명 안 함' 줄에 (1명)", /1\s*명/.test(one(await a.locator(`[data-todo="unsigned-${JM}"]`).innerText().catch(() => ''))))
  ok('종이 계약만·서류 없는 공고는 줄 없음', (await a.locator(`[data-todo="nodoc-${JP}"], [data-todo="nodoc-${JX}"]`).count()) === 0)
  ok('할 일 줄 한 줄 · 360px 옆으로 안 밀림', (await rowM.evaluate((el) => el.getBoundingClientRect().height < 60)) && (await noSide(a)))
  if (SHOTS) await rowM.screenshot({ path: `${SHOTS}/todo-nodoc.png` }).catch(() => {})

  // ── 2. 누르면 서류 탭 '지금 보내기' 줄로 · 버튼 번쩍
  await Promise.all([a.waitForURL((u) => u.pathname === `/admin/jobs/${JM}`, { timeout: 15000 }).catch(() => {}), rowM.locator('a').first().click()])
  await a.waitForTimeout(600)
  const u = new URL(a.url())
  const btn = a.locator('#docs-waiting button', { hasText: '지금 보내기' })
  ok("서류 탭 #docs-waiting 으로 · '지금 보내기'가 번쩍", u.searchParams.get('tab') === 'docs' && u.hash === '#docs-waiting' && (await btn.getAttribute('data-flash').catch(() => null)) === '' && (await btn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })), a.url())
  if (SHOTS) await a.locator('#docs-waiting').screenshot({ path: `${SHOTS}/docs-waiting-flash.png` }).catch(() => {})
  // '지금 보내기' → 서류 생김 → 홈에서 줄이 사라지고 '서명 안 함'이 3명
  await Promise.all([a.waitForURL((x) => x.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), btn.click()])
  const made = ((await rest(`signed_docs?job_id=eq.${JM}`)) ?? []).filter((d) => d.status !== 'void').length
  await home()
  ok("'지금 보내기' 뒤: '서류 아직 안 보냄' 줄 사라짐 · '서명 안 함' 3명", made === 3 && (await a.locator(`[data-todo="nodoc-${JM}"]`).count()) === 0 && /3\s*명/.test(one(await a.locator(`[data-todo="unsigned-${JM}"]`).innerText().catch(() => ''))), `${made}`)

  // ── 3. 다른 회사로 바꾸면 이 회사 할 일은 안 보임 (회사별)
  const other = (await rest('companies')).find((c) => c.id !== C1)
  if (other) {
    const ctx2 = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx2.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'hw_company', value: other.id, url: D }])
    const o = await ctx2.newPage()
    await o.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    ok('다른 회사 홈에는 이 회사 공고 줄이 없음', (await o.locator(`[data-todo="nodoc-${JT}"]`).count()) === 0)
  } else ok('(다른 회사 없음 · 건너뜀)', true)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
