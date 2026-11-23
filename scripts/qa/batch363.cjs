// 묶음 363 (정기 개선 2026-11-23 16:35 KST · 다른 회사 '서명 없이 근무 n' + 확인할 일 줄 올라옴·합계 톡)
// · 여러 회사를 맡은 관리자 홈 '다른 회사에 확인할 일': 그 회사에서 일했는데(지난 날 출근 기록) 서류 서명이 아직인 사람도 '서명 안 함 n'에 셈
//   - 오늘 행사 서명 안 함 + 일했는데 서명 안 함 = 한 마디 (칩이 길어져 회사 이름이 잘리지 않게) · 같은 사람은 한 번만
//   - 내가 관리자가 아닌 회사는 안 나옴 · 지금 회사 할 일에는 다른 회사 공고가 섞이지 않음
//   - 칩을 누르면 그 회사로 → '일했는데 서명 안 함 · 공고' 할 일
// · 확인할 일: 줄이 위에서부터 차례로 살짝 올라옴(0.25초) · 합계 숫자 톡(0.25초) · 움직임 줄이기면 바로
// node scripts/qa/batch363.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-0000003630c2' // N이 대표
const C3 = '99999999-0000-4000-8000-0000003630c3' // N이 관리자 아님
const N = 'aaaaaaaa-0000-4000-8000-0000003630a1' // 최고 관리자 아닌 관리자 (C1 관리자 + C2 대표)
const JW2 = 'cccccccc-0000-4000-8000-0000003630b1' // C2 · 끝남 · 일함 · 서명 안 함
const JM2 = 'cccccccc-0000-4000-8000-0000003630b2' // C2 · 어제~내일 · 어제 일함 · 오늘도 근무 · 서명 안 함
const JX3 = 'cccccccc-0000-4000-8000-0000003630b3' // C3 · 끝남 · 일함 · 서명 안 함
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const hex = (n) => n.toString(16).padStart(12, '0')

;(async () => {
  // ── 준비
  const [au] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...au, id: N, name: '두회사관리363', phone: '01036300001', is_super: false })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  for (const [id, name] of [[C2, '둘째회사363'], [C3, '셋째회사363']]) await rest('companies', 'POST', { ...c1, id, company_name: name, seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: '2026-10-01T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C2, user_id: N, role: 'owner', created_at: '2026-10-15T00:00:00Z' })
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, company: _c, ...jb } = base
  const job = (id, company, title, s, e) => rest('jobs', 'POST', { ...jb, id, company_id: company, title, status: e < kday(0) ? 'closed' : 'open', contract_method: 'app', start_date: kday(s), end_date: kday(e), applications: [], attendance: [], created_at: new Date().toISOString() })
  await job(JW2, C2, '둘째회사 지난 축제', -3, -2)
  await job(JM2, C2, '둘째회사 사흘 전시', -1, 1)
  await job(JX3, C3, '셋째회사 지난 행사', -3, -2)
  const [d0] = await rest('signed_docs?id=eq.dddddddd-0000-4000-8000-000000000004')
  const { id: _i, company_id: _dc, ...docBase } = d0
  let k = 1
  for (const j of [JW2, JM2, JX3]) await rest('signed_docs', 'POST', { ...docBase, id: `dddddddd-0000-4000-8000-${hex(0x3630d0 + k++)}`, job_id: j, status: 'pending', signed_at: null, signature: null, created_at: `${kday(-4)}T01:00:00Z` })
  const [att0] = await rest(`attendance?job_id=eq.${J}&limit=1`)
  const { id: _ai, company_id: _ac, ...attBase } = att0 ?? {}
  const att = (id, jobId, day) => rest('attendance', 'POST', { ...attBase, id: `eeeeeeee-0000-4000-8000-${hex(id)}`, job_id: jobId, user_id: W, work_date: kday(day), clock_in: `${kday(day)}T00:00:00Z`, clock_out: `${kday(day)}T09:00:00Z`, created_at: `${kday(day)}T00:00:00Z` })
  await att(0x3630e1, JW2, -2)
  await att(0x3630e2, JM2, -1)
  await att(0x3630e3, JX3, -2)
  const [app0] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  if (app0) {
    const { id: _pi, company_id: _pc, ...appBase } = app0
    await rest('applications', 'POST', { ...appBase, id: 'ffffffff-0000-4000-8000-0000003630f2', job_id: JM2, user_id: W, status: 'approved', available_dates: null, held_at: null })
  }

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
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 다른 회사 칩
  const n = await mk(N)
  await go(n, '/admin')
  const line = n.locator('[data-other-companies]')
  await line.waitFor({ timeout: 15000 }).catch(() => {})
  const chip = line.locator('form', { hasText: '둘째회사363' })
  const chipText = one(await chip.innerText().catch(() => ''))
  ok("'둘째회사363 서명 안 함 2' (오늘 행사 1 + 일했는데 서명 안 함 1 · 같은 사람 두 번 안 셈)", one(await chip.locator('[data-other-unsigned]').innerText().catch(() => '')) === '서명 안 함 2' && (await chip.locator('[data-other-worked="1"]').count()) === 1, chipText)
  ok('회사 이름이 잘리지 않음', await chip.locator('span.truncate').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1), chipText)
  ok("머리글 '다른 회사에 확인할 일'", one(await line.innerText()).includes('다른 회사에 확인할 일'))
  ok('관리자가 아닌 회사(셋째회사)는 안 나옴', !one(await line.innerText()).includes('셋째회사363'))
  ok('지금 회사 할 일에 다른 회사 공고가 안 섞임', (await n.locator(`[data-todo="worked-unsigned-${JW2}"], [data-todo="worked-unsigned-${JX3}"]`).count()) === 0 && !(await n.locator('[data-todo]').allInnerTexts()).join(' ').includes('둘째회사 지난 축제'))
  ok('칩 한 줄 안에 (360px 옆으로 안 밀림)', await noSide(n))
  if (SHOTS) await line.screenshot({ path: `${SHOTS}/other-worked.png` }).catch(() => {})

  // 칩을 누르면 그 회사로 → '일했는데 서명 안 함 · 둘째회사 지난 축제' + '오늘 근무 · 서명 안 함 · 둘째회사 사흘 전시'
  await Promise.all([n.waitForURL((u) => u.pathname === '/admin', { timeout: 15000 }).catch(() => {}), chip.locator('button').click()])
  await n.waitForLoadState('networkidle')
  await n.waitForTimeout(500)
  const wRow = n.locator(`[data-todo="worked-unsigned-${JW2}"]`)
  await wRow.waitFor({ timeout: 15000 }).catch(() => {})
  ok("그 회사로 바뀌고 '일했는데 서명 안 함 · 둘째회사 지난 축제 1명'", one(await wRow.innerText().catch(() => '')).startsWith('일했는데 서명 안 함 · 둘째회사 지난 축제') && one(await wRow.innerText()).includes('1명'), one(await wRow.innerText().catch(() => '')))
  ok("진행 중 공고는 '오늘 근무 · 서명 안 함'으로 (같은 수)", (await n.locator(`[data-todo="unsigned-today-${JM2}"]`).count()) === 1 && (await n.locator(`[data-todo="worked-unsigned-${JM2}"]`).count()) === 0)

  // ── 2. 확인할 일 움직임
  const rows = n.locator('[data-todo]')
  const anim = await rows.evaluateAll((els) => els.map((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration, getComputedStyle(el).animationDelay]))
  ok('확인할 일 줄 올라옴 0.25초', anim.length >= 2 && anim.every((x) => x[0] === 'rise' && x[1] === '0.25s'), JSON.stringify(anim.slice(0, 3)))
  ok('위에서부터 차례로 (뒤 줄일수록 늦게)', anim.length >= 2 && parseFloat(anim[1][2]) > parseFloat(anim[0][2]), JSON.stringify(anim.map((x) => x[2])))
  const total = n.locator('[data-todo-total]')
  ok('합계 숫자 톡 0.25초', JSON.stringify(await total.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])) === '["pop","0.25s"]')
  ok('합계 = 줄 숫자 더한 값', Number(one(await total.innerText())) === (await rows.evaluateAll((els) => els.reduce((t, el) => t + Number((el.querySelector('b')?.textContent ?? '0').replace(/\D/g, '') || 0), 0))))
  // 합계가 바뀌면 새로 그려져 다시 톡 (같은 줄은 그대로)
  await total.evaluate((el) => { el.dataset.before = '1' })
  await rows.first().evaluate((el) => { el.dataset.before = '1' })
  await rest('signed_docs', 'POST', { ...docBase, id: `dddddddd-0000-4000-8000-${hex(0x3630d9)}`, job_id: JW2, user_id: N, status: 'pending', signed_at: null, signature: null, created_at: `${kday(-4)}T01:00:00Z` })
  await att(0x3630e9, JW2, -2).then(() => rest(`attendance?id=eq.eeeeeeee-0000-4000-8000-${hex(0x3630e9)}`, 'PATCH', { user_id: N }))
  // 30초 자동 새로 읽기를 기다리지 않고: 다른 앱에 갔다 돌아온 것처럼 (AutoRefresh가 바로 새로 읽음)
  await n.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await n.waitForTimeout(2500)
  const after = Number(one(await n.locator('[data-todo-total]').innerText().catch(() => '0')))
  const refreshed = (await n.locator('[data-todo-total][data-before="1"]').count()) === 0
  ok('합계가 바뀌면 숫자를 새로 그림 (다시 톡)', refreshed && after > 0, `after=${after}`)
  ok('그대로인 줄은 새로 그리지 않음', (await n.locator('[data-todo][data-before="1"]').count()) === 1, JSON.stringify(await n.locator('[data-todo]').evaluateAll((els) => els.map((e) => e.getAttribute('data-todo').slice(0, 22) + (e.dataset.before ? '*' : '')))))
  if (SHOTS) await n.locator('[data-todo]').first().locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/todos-c2.png` }).catch(() => {})

  // ── 3. 움직임 줄이기
  const rm = await mk(N, { reducedMotion: 'reduce' })
  await go(rm, '/admin')
  const rd = await rm.locator('[data-todo]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  // ── 4. 최고 관리자 A(지금 C1): 지금 회사 할 일 그대로 · 화면 오류 없음
  const a = await mk(A)
  await go(a, '/admin')
  ok('지금 회사(C1) 화면에 둘째회사 공고 할 일 없음', (await a.locator(`[data-todo="worked-unsigned-${JW2}"]`).count()) === 0)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
