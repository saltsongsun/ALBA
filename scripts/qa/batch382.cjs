// 묶음 382 (정기 개선 2026-11-25 02:35 KST)
// ① 여러 회사를 맡은 관리자 홈 '다른 회사에 확인할 일': 그 회사 오늘·내일 근무 확정자 중 서명 서류가 아직 안 간 사람 '서류 안 보냄 n'
//    · 서류가 이미 있는 사람·종이 계약 공고·모레 이후 근무는 안 셈 · 내가 관리자가 아닌 회사는 안 나옴 (회사별)
//    · 칩을 누르면 그 회사로 → '서류 안 보냄 · 공고' 할 일 · 처음 보일 때 톡 (움직임 줄이기면 바로)
// ② 서류 탭 '확정 n명 · 마감 때 서류가 가요' / '확정 n명 · 서류가 아직 안 갔어요' — 360px에서 한 줄 (예전엔 '때 보내요'만 다음 줄)
// node scripts/qa/batch382.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-0000003820c2' // N이 대표
const C3 = '99999999-0000-4000-8000-0000003820c3' // N이 관리자 아님
const N = 'aaaaaaaa-0000-4000-8000-0000003820a1' // C1 관리자 + C2 대표
const TPL = 'ffffffff-0000-4000-8000-000000000007'
const JT2 = 'cccccccc-0000-4000-8000-000000038201', JM2 = 'cccccccc-0000-4000-8000-000000038202', JP2 = 'cccccccc-0000-4000-8000-000000038203', JD2 = 'cccccccc-0000-4000-8000-000000038204'
const JX3 = 'cccccccc-0000-4000-8000-000000038205'
const JL1 = 'cccccccc-0000-4000-8000-000000038206', JN1 = 'cccccccc-0000-4000-8000-000000038207'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003820${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003820${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  const [au] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...au, id: N, name: '두회사관리382', phone: '01038200001', is_super: false })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  for (const [id, name] of [[C2, '둘째회사382'], [C3, '셋째회사382']]) await rest('companies', 'POST', { ...c1, id, company_name: name, business_no: null, seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: '2026-10-01T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C2, user_id: N, role: 'owner', created_at: '2026-10-15T00:00:00Z' })
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, attendance, ...jrow } = j
  const base = { ...jrow, status: 'open', required_docs: [TPL], contract_method: 'app', headcount: 10, start_time: '09:00:00', end_time: '18:00:00', created_at: nowIso, audience: 'worker' }
  const job = (id, cid, title, s, e = s, extra = {}) => rest('jobs', 'POST', { ...base, id, company_id: cid, title, start_date: kday(s), end_date: kday(e), ...extra })
  await job(JT2, C2, '둘째 오늘382', 0, 0, { start_time: '23:00:00', end_time: '23:59:00' })
  await job(JM2, C2, '둘째 내일382', 1)
  await job(JP2, C2, '둘째 종이382', 1, 1, { contract_method: 'paper' })
  await job(JD2, C2, '둘째 사흘뒤382', 3)
  await job(JX3, C3, '셋째 내일382', 1)
  await job(JL1, C1, '첫째 사흘뒤382', 3)
  await job(JN1, C1, '첫째 오늘382', 0, 0, { start_time: '23:00:00', end_time: '23:59:00' })
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 9; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}382`, phone: `010382000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  const app = (n, jobId, cid, dates = null) => rest('applications', 'POST', { id: AP(n), company_id: cid, job_id: jobId, user_id: U(n), user: usr[n], status: 'approved', available_dates: dates, message: null, decided_at: nowIso, held_at: null, position: null, contract_received_at: null, created_at: nowIso })
  await app(1, JT2, C2) // 오늘 · 서류 없음 → 셈
  await app(2, JM2, C2) // 내일 · 서류 없음 → 셈
  await app(3, JM2, C2) // 내일 · 서류 있음 → 안 셈
  await app(4, JP2, C2) // 종이 계약 → 안 셈
  await app(5, JD2, C2) // 사흘 뒤 → 안 셈
  await app(6, JX3, C3) // 내가 관리자가 아닌 회사 → 안 나옴
  await app(7, JL1, C1) // 지금 회사 · 사흘 뒤 (서류 탭 '마감 때 서류가 가요')
  await app(8, JN1, C1) // 지금 회사 · 오늘 (서류 탭 '서류가 아직 안 갔어요')
  await rest('signed_docs', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000038203', company_id: C2, job_id: JM2, user_id: U(3), template_id: TPL, kind: 'contract', title: '근로계약서', status: 'pending', created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 다른 회사 칩 '서류 안 보냄 2'
  const n = await mk(N)
  await go(n, '/admin')
  const line = n.locator('[data-other-companies]')
  await line.waitFor({ timeout: 15000 }).catch(() => {})
  const chip = line.locator('form', { hasText: '둘째회사382' })
  const nd = chip.locator('[data-other-nodoc]')
  ok("'둘째회사382 · 서류 안 보냄 2' (서류 있는 사람·종이 계약·사흘 뒤는 빼고)", one(await nd.innerText().catch(() => '')) === '서류 안 보냄 2', one(await chip.innerText().catch(() => '')))
  ok('처음 보일 때 톡 (pop)', (await nd.evaluate((el) => getComputedStyle(el).animationName).catch(() => '')) === 'pop')
  ok('내가 관리자가 아닌 셋째회사는 안 나옴', (await line.locator('form', { hasText: '셋째회사382' }).count()) === 0)
  ok("줄 머리 '다른 회사에 확인할 일'", one(await line.innerText().catch(() => '')).includes('다른 회사에 확인할 일'))
  ok('지금 회사 할 일에 다른 회사 공고가 섞이지 않음', (await n.locator(`[data-todo="nodoc-${JT2}"], [data-todo="nodoc-${JM2}"]`).count()) === 0)
  ok('칩 한 줄 · 회사 이름 안 잘림 · 360px 옆으로 안 밀림', (await chip.evaluate((el) => el.getBoundingClientRect().height < 48).catch(() => false)) && (await chip.locator('.truncate').evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false)) && (await noSide(n)), one(await chip.innerText().catch(() => '')))
  if (SHOTS) await line.screenshot({ path: `${SHOTS}/other-nodoc.png` }).catch(() => {})
  // 움직임 줄이기면 바로 (애니메이션 시간이 거의 0)
  const r = await mk(N, { reducedMotion: 'reduce' })
  await go(r, '/admin')
  const dur = await r.locator('[data-other-companies] [data-other-nodoc]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration)).catch(() => 9)
  ok('움직임 줄이기: 톡 없이 바로', dur < 0.01, String(dur))

  // ── 2. 칩을 누르면 그 회사로 → '서류 안 보냄 · 공고' 할 일
  await Promise.all([n.waitForURL(() => true, { timeout: 15000 }).catch(() => {}), chip.locator('button').first().click()])
  await n.waitForTimeout(1200)
  await go(n, '/admin')
  ok("둘째회사로 바뀜 → 할 일 '서류 안 보냄 · 둘째 오늘382' · '서류 안 보냄 · 둘째 내일382'", (await n.locator(`[data-todo="nodoc-${JT2}"]`).count()) === 1 && (await n.locator(`[data-todo="nodoc-${JM2}"]`).count()) === 1 && (await n.locator(`[data-todo="nodoc-${JP2}"], [data-todo="nodoc-${JD2}"]`).count()) === 0)
  const back = one(await n.locator('[data-other-companies] form', { hasText: '주식회사 테스트' }).locator('[data-other-nodoc]').innerText().catch(() => ''))
  ok('둘째회사 홈의 다른 회사 칩: 첫째회사 서류 안 보냄 n (오늘 근무 확정자)', /^서류 안 보냄 [1-9]\d*$/.test(back), back)

  // ── 3. 서류 탭 제목 한 줄 (360px)
  const a = await mk(A)
  await go(a, `/admin/jobs/${JL1}?tab=docs`)
  const t1 = a.locator('[data-docs-waiting] b').first()
  ok("'확정 1명 · 마감 때 서류가 가요' 한 줄", one(await t1.innerText().catch(() => '')) === '확정 1명 · 마감 때 서류가 가요' && (await t1.evaluate((el) => el.getBoundingClientRect().height < 26).catch(() => false)), one(await t1.innerText().catch(() => '')))
  const sub1 = a.locator('[data-docs-waiting] [data-docs-auto-at]')
  ok('아래 줄 (날짜 포함)도 한 줄', (await sub1.evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)), one(await sub1.innerText().catch(() => '')))
  if (SHOTS) await a.locator('[data-docs-waiting]').screenshot({ path: `${SHOTS}/docs-title.png` }).catch(() => {})
  await go(a, `/admin/jobs/${JN1}?tab=docs`)
  const t2 = a.locator('[data-docs-waiting="late"] b').first()
  ok("오늘 근무: '확정 1명 · 서류가 아직 안 갔어요' 한 줄", one(await t2.innerText().catch(() => '')) === '확정 1명 · 서류가 아직 안 갔어요' && (await t2.evaluate((el) => el.getBoundingClientRect().height < 26).catch(() => false)), one(await t2.innerText().catch(() => '')))
  ok('360px 옆으로 안 밀림 (서류 탭)', await noSide(a))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
