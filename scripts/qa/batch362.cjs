// 묶음 362 (정기 개선 2026-11-23 14:35 KST · 대시보드 '일했는데 서명 안 함' + 서명 알림 문구 + 설정 스위치 움직임)
// · 대시보드 확인할 일: 지난 날 출근 기록이 있는데 그 공고 서류가 아직 서명 대기면 '일했는데 서명 안 함 · 공고' (빨강 · n명)
//   - 아래 작은 줄에 마지막으로 일한 날 'M/D(요) 근무' · 누르면 그 공고 서류 탭 '서명 안 한 n명' 칸 (#unsigned)
//   - 출근 기록이 없으면 안 나옴 · 다른 회사 공고는 안 나옴 · 오늘 근무로 '오늘 근무 · 서명 안 함'에 이미 나온 사람은 빼고
// · 서명 알림(앱 알림·문자): 근무가 이미 시작·끝난 공고면 '근무 전에'가 아니라 '아직 서명하지 않았어요' (근무 전 공고는 예전 그대로)
// · 내 정보 '글자 크게 보기' 설명 짧게 ('보여 / 줘요'처럼 안 꺾임) · 스위치 손잡이 0.2초 스프링 · 줄 누름 반응 · 움직임 줄이기면 바로
// node scripts/qa/batch362.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000003620c2'
const DOC_TODAY = 'dddddddd-0000-4000-8000-000000000004'
const JW = 'cccccccc-0000-4000-8000-0000003620a1' // 그제 일함 · 서명 안 함 (끝난 공고)
const JN = 'cccccccc-0000-4000-8000-0000003620a2' // 서명 안 함 · 출근 기록 없음
const JX = 'cccccccc-0000-4000-8000-0000003620a3' // 다른 회사 · 일함 · 서명 안 함
const JM = 'cccccccc-0000-4000-8000-0000003620a4' // 어제부터 내일까지 · 어제 일함 · 오늘도 근무 (오늘 줄에만)
const JF = 'cccccccc-0000-4000-8000-0000003620a5' // 사흘 뒤 시작 (근무 전)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const hex = (n) => n.toString(16).padStart(12, '0')

;(async () => {
  // ── 준비: 공고 5개 · 서명 대기 서류 · 출근 기록
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('companies', 'POST', { id: C2, company_name: '다른회사362', ceo_name: '대표', active: true, verified: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  const job = (id, title, s, e, extra = {}) => rest('jobs', 'POST', { ...jb, id, title, status: e < kday(0) ? 'closed' : 'open', contract_method: 'app', start_date: kday(s), end_date: kday(e), applications: [], attendance: [], created_at: new Date().toISOString(), ...extra })
  await job(JW, '지난 토요일 축제 안내', -3, -2)
  await job(JN, '지난 박람회 주차 안내', -3, -2)
  await job(JX, '다른회사 지난 행사', -3, -2, { company_id: C2 })
  await job(JM, '사흘짜리 전시 안내', -1, 1)
  await job(JF, '다음 주 공연 안내', 3, 3)
  const [d0] = await rest(`signed_docs?id=eq.${DOC_TODAY}`)
  const { id: _i, company_id: _c, ...docBase } = d0
  let n = 1
  for (const j of [JW, JN, JX, JM, JF]) await rest('signed_docs', 'POST', { ...docBase, id: `dddddddd-0000-4000-8000-${hex(0x3620d0 + n++)}`, job_id: j, status: 'pending', signed_at: null, signature: null, created_at: `${kday(-4)}T01:00:00Z` })
  const [att0] = await rest(`attendance?job_id=eq.${J}&limit=1`)
  const { id: _ai, company_id: _ac, ...attBase } = att0 ?? {}
  const att = (id, jobId, day) =>
    rest('attendance', 'POST', { ...attBase, id: `eeeeeeee-0000-4000-8000-${hex(id)}`, job_id: jobId, user_id: W, work_date: kday(day), clock_in: `${kday(day)}T00:00:00Z`, clock_out: `${kday(day)}T09:00:00Z`, created_at: `${kday(day)}T00:00:00Z` })
  await att(0x3620e1, JW, -3)
  await att(0x3620e2, JW, -2)
  await att(0x3620e3, JX, -2)
  await att(0x3620e4, JM, -1)
  // JM: 오늘도 근무하는 확정자 (오늘 근무 · 서명 안 함 줄에 나와야 함)
  const [app0] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  if (app0) {
    const { id: _pi, company_id: _pc, ...appBase } = app0
    await rest('applications', 'POST', { ...appBase, id: 'ffffffff-0000-4000-8000-0000003620f4', job_id: JM, user_id: W, status: 'approved', available_dates: null, held_at: null })
    // JF: 근무 전 확정자 (서류 탭 문자 버튼에 번호가 있게)
    await rest('applications', 'POST', { ...appBase, id: 'ffffffff-0000-4000-8000-0000003620f5', job_id: JF, user_id: W, status: 'approved', available_dates: null, held_at: null })
  }
  const [jx] = await rest(`signed_docs?job_id=eq.${JX}`)
  ok('(준비) 다른 회사 공고 서류는 그 회사 것', jx?.company_id === C2, jx?.company_id)

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

  // ── 1. 대시보드 확인할 일
  const a = await mk(A)
  await go(a, '/admin')
  const row = a.locator(`[data-todo="worked-unsigned-${JW}"]`)
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  const txt = one(await row.innerText().catch(() => ''))
  ok("'일했는데 서명 안 함 · 지난 토요일 축제 안내 1명 ›'", txt.startsWith('일했는데 서명 안 함 · 지난 토요일 축제 안내') && txt.includes('1명'), txt)
  ok(`아래 작은 줄: 마지막으로 일한 날 '${md(kday(-2))} 근무'`, txt.includes(`${md(kday(-2))} 근무`), txt)
  ok('빨강 (근로계약서는 일하기 전에 줘야 해서)', await row.locator('b').evaluate((el) => el.classList.contains('text-rose-600')))
  ok('→ 그 공고 서류 탭 서명 안 한 사람 칸', (await row.locator('a').first().getAttribute('href')) === `/admin/jobs/${JW}?tab=docs#unsigned`)
  ok('출근 기록이 없는 공고는 안 나옴', (await a.locator(`[data-todo="worked-unsigned-${JN}"]`).count()) === 0)
  ok('다른 회사 공고는 안 나옴 (회사별 자료 분리)', (await a.locator(`[data-todo="worked-unsigned-${JX}"]`).count()) === 0 && !(await a.locator('[data-todo]').allInnerTexts()).join(' ').includes('다른회사 지난 행사'))
  ok('오늘도 근무하는 사람은 오늘 줄에만 (같은 사람 두 줄 안 됨)', (await a.locator(`[data-todo="unsigned-today-${JM}"]`).count()) === 1 && (await a.locator(`[data-todo="worked-unsigned-${JM}"]`).count()) === 0)
  ok('줄 글씨 한 줄씩 (말줄임)', await row.locator('a span.block').first().evaluate((el) => el.getBoundingClientRect().height < 24))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await row.locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/todo-worked-unsigned.png` }).catch(() => {})

  // 누르면 공고 서류 탭 '서명 안 한 1명'
  await Promise.all([a.waitForURL((u) => u.pathname === `/admin/jobs/${JW}`, { timeout: 15000 }).catch(() => {}), row.locator('a').first().click()])
  await a.waitForLoadState('networkidle')
  const tools = a.locator('[data-unsigned-tools]')
  await tools.waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 끝난 공고 서류 탭 '서명 안 한 1명'", new URL(a.url()).hash === '#unsigned' && one(await tools.innerText().catch(() => '')).includes('서명 안 한 1명'), a.url())

  // ── 2. 문자·앱 알림 문구
  const smsOf = async (p) => decodeURIComponent((await p.locator('[data-unsigned-tools] a[href^="sms:"]').first().getAttribute('href').catch(() => '')) ?? '')
  const smsW = await smsOf(a)
  ok("끝난 공고 문자: '아직 서명하지 않았어요' ('근무 전에' 아님)", smsW.includes('근로계약서 등 서류에 아직 서명하지 않았어요') && !smsW.includes('근무 전에'), smsW.slice(0, 120))
  await go(a, `/admin/jobs/${JF}?tab=docs`)
  const smsF = await smsOf(a)
  ok("근무 전 공고 문자: 예전 그대로 '근무 전에 … 서명해 주세요'", smsF.includes('근무 전에 근로계약서 등 서류에 서명해 주세요'), smsF.slice(0, 120))
  // 앱 알림 (두 번 눌러 보냄) → 문의함에 '아직 서명하지 않았어요'
  await go(a, `/admin/jobs/${JW}?tab=docs`)
  const nudge = a.locator('[data-unsigned-tools] form button', { hasText: '앱 알림' })
  await nudge.click()
  await a.waitForTimeout(300)
  await Promise.all([a.waitForURL((u) => u.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), a.locator('[data-unsigned-tools] form button').first().click()])
  await a.waitForLoadState('networkidle')
  const msgs = (await rest(`messages?thread_user_id=eq.${W}&job_id=eq.${JW}`)) ?? []
  const last = msgs.sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''))[0]
  ok("끝난 공고 앱 알림: '지난 토요일 축제 안내 서류에 아직 서명하지 않았어요.'", !!last && last.body.includes('지난 토요일 축제 안내 서류에 아직 서명하지 않았어요.') && !last.body.includes('근무 전에') && last.company_id === C1, last?.body?.slice(0, 100))

  // ── 3. 내 정보 스위치
  const w = await mk(W)
  await go(w, '/me/profile')
  const desc = w.locator('[data-text-toggle-desc]')
  await desc.waitFor({ timeout: 15000 }).catch(() => {})
  ok("글자 크게 보기 설명: '글자와 버튼이 커져요 (이 휴대폰에만)'", one(await desc.innerText().catch(() => '')) === '글자와 버튼이 커져요 (이 휴대폰에만)', one(await desc.innerText().catch(() => '')))
  ok("'(이 휴대폰에만)'은 붙어서 한 줄 · 설명은 두 줄 안", await desc.evaluate((el) => el.querySelector('.whitespace-nowrap').getClientRects().length === 1 && el.getBoundingClientRect().height < 46))
  // '커져요'가 줄 끝에서 꺾이지 않음 (앞 말과 같은 줄)
  ok("'글자와 버튼이 커져요'는 한 줄", await desc.evaluate((el) => { const r = document.createRange(); r.setStart(el.firstChild, 0); r.setEnd(el.firstChild, el.firstChild.textContent.trimEnd().length); const ys = new Set([...r.getClientRects()].map((x) => Math.round(x.top))); return ys.size === 1 }))
  const knob = w.locator('[data-text-toggle] [data-switch-knob]')
  ok('손잡이 0.2초로 미끄러짐 (left)', JSON.stringify(await knob.evaluate((el) => [getComputedStyle(el).transitionProperty, getComputedStyle(el).transitionDuration])) === '["left","0.2s"]', JSON.stringify(await knob.evaluate((el) => [getComputedStyle(el).transitionProperty, getComputedStyle(el).transitionDuration])))
  ok('줄 전체 누름 반응', (await w.locator('[data-text-toggle]').evaluate((el) => getComputedStyle(el).transitionDuration)) !== '0s')
  ok('어두운 화면 스위치도 같은 움직임', (await w.locator('[data-theme-toggle] [data-switch-knob]').evaluate((el) => getComputedStyle(el).transitionDuration)) === '0.2s')
  // 손잡이 위치는 스위치 칸 안에서 잼 (글자가 커지면 화면 전체가 다시 놓여서)
  const rel = () => knob.evaluate((el) => el.getBoundingClientRect().left - el.parentElement.getBoundingClientRect().left)
  const x0 = await rel()
  await w.locator('[data-text-toggle]').click()
  await w.waitForTimeout(400)
  const x1 = await rel()
  ok('누르면 켜짐 · 손잡이 오른쪽으로', (await w.locator('[data-text-toggle]').getAttribute('aria-checked')) === 'true' && x1 - x0 > 10, `${x0} → ${x1}`)
  if (SHOTS) await w.locator('[data-text-toggle]').locator('xpath=ancestor::*[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/profile-toggles.png` }).catch(() => {})
  await w.locator('[data-text-toggle]').click()
  await w.waitForTimeout(300)
  ok('360px 옆으로 안 밀림 (내 정보)', await noSide(w))

  // ── 4. 움직임 줄이기
  const rm = await mk(W, { reducedMotion: 'reduce' })
  await go(rm, '/me/profile')
  const rd = await rm.locator('[data-text-toggle] [data-switch-knob]').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 손잡이 바로', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
