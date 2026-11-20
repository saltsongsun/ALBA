// 묶음 325 (정기 개선 2026-11-20 13:35 KST)
// · 관리자 근무자 상세: 위 칩 줄에 '지급 전 n원' (우리 회사 근무 중 아직 지급 전인 실지급 합계 · 근무 이력의 지급 상태와 같은 기준)
//   오늘 근무 중이라 계산 전인 것은 빼고 · 다 지급했으면 없음 · 근무 이력 접힌 줄에도 ' · 지급 전 n원'
//   누르면 근무 이력 칸이 펼쳐지며 그리로 내려감 (#work-history) · 다른 회사 관리자에게는 없음 · 360px
// node scripts/qa/batch325.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000325c2', A2 = 'aaaaaaaa-0000-4000-8000-0000000325a2'
const J2 = 'cccccccc-0000-4000-8000-0000000325a2', ATT = 'eeeeeeee-0000-4000-8000-000000032501'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 전 끝난 행사 (W가 일함 · 지급 전) — 지원 기록도 (근무 이력은 지원한 공고로 묶음)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J2, title: '가을 축제 주차 안내', status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  const [j2] = await rest(`jobs?id=eq.${J2}`)
  const [app0] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...app0, id: 'dddddddd-0000-4000-8000-0000000325d1', job_id: J2, job: j2, status: 'approved', created_at: new Date().toISOString() })
  await rest('attendance', 'POST', { id: ATT, job_id: J2, job: j2, user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, created_at: new Date().toISOString() })
  // 다른 회사(관리자 A2)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01032503251', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const open = async () => { await a.goto(`${D}/admin/workers/${W}`, { waitUntil: 'networkidle' }); await a.waitForTimeout(400) }
  await open()
  const chip = a.locator('[data-unpaid-chip]')
  const ct = one(await chip.textContent().catch(() => ''))
  // 근무 이력의 그 공고 실지급 (화면 숫자)과 같아야 함
  const rowNet = one(await a.locator('[data-work-history] li', { hasText: '가을 축제 주차 안내' }).locator('.tabular-nums').first().textContent().catch(() => ''))
  ok("위 칩 줄에 '지급 전 n원'", /^지급 전 [\d,]+원$/.test(ct), ct)
  ok('금액 = 근무 이력의 그 공고 실지급 (오늘 근무 중인 공고는 빼고)', rowNet && ct.endsWith(rowNet), `${ct} / ${rowNet}`)
  ok("근무 이력 접힌 줄에도 ' · 지급 전'", one(await a.locator('#work-history > summary').textContent()).includes(`지급 전 ${ct.replace('지급 전 ', '')}`))
  ok('칩 줄 360px (옆으로 밀림 없음)', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/worker-unpaid.png` })
  // 접힌 상태에서 칩 → 근무 이력이 펼쳐지며 보임
  await a.evaluate(() => { document.getElementById('work-history').open = false })
  await chip.click()
  await a.waitForTimeout(700)
  const st = await a.evaluate(() => { const d = document.getElementById('work-history'); const r = d.getBoundingClientRect(); return { open: d.open, hash: location.hash, inView: r.top < innerHeight && r.bottom > 0 } })
  ok('칩을 누르면 근무 이력이 펼쳐지고 그 칸으로 내려감', st.open && st.hash === '#work-history' && st.inView, JSON.stringify(st))

  // 다 지급하면 칩 없음
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await open()
  ok("다 지급했으면 '지급 전' 칩 없음", (await a.locator('[data-unpaid-chip]').count()) === 0 && !one(await a.locator('#work-history > summary').textContent()).includes('지급 전'))

  // 다른 회사 관리자: 우리 회사 근무 금액이 보이지 않음
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { paid: false, paid_at: null })
  const o = await mk(A2)
  await o.goto(`${D}/admin/workers/${W}`, { waitUntil: 'networkidle' })
  ok("다른 회사 관리자: '지급 전' 칩·금액 없음", (await o.locator('[data-unpaid-chip]').count()) === 0 && !one(await o.locator('main').textContent()).includes('가을 축제 주차 안내'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
