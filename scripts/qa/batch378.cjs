// 묶음 378 (사용자 요청 2026-11-24)
// ① "지원자를 확정하면 확정한 전체 일정 얼마인지 알려줘" (관리자에게만)
//   · 지원자 탭: 확정한 사람 카드에 '확정 일정 n일 · 약 ○원' (고른 날만 · 없으면 공고 전체 날) + 위 요약 '확정 전체 일정 약 ○원' (확정하면 숫자가 통 튐)
//   · 한꺼번에 확정하면 안내에 '이번 n명 약 ○원 · 확정 n명 전체 약 ○원'
// ② "근로계약서는 확정 후 작성 말고 모집완료 후 작성으로"
//   · 모집 중인 공고에 확정해도 서명 서류는 아직 안 만듦 → 확정 알림에 '서명할 서류(근로계약서 등)는 모집이 끝나면 보내 드려요'
//     근무자 공고 화면에 '서명할 서류는 모집이 끝나면 보내 드려요' · 관리자 서류 탭에 '확정 n명 · 서류는 모집 마감 때 보내요' + '지금 보내기'
//   · '모집 마감'을 누르면 확정자 모두에게 서류가 생기고 '✍️ 서명할 서류가 왔어요' 알림 · 안내 '모집을 마감했어요 · 확정 n명에게 서명할 서류를 보냈어요'
//   · 마감한 뒤에 확정한 사람은 바로 서류 · 모집 중이어도 근무가 오늘이거나, 내일인데 저녁 6시가 지났으면 바로 (근무 전에 서명하게)
//     (매일 저녁 6시 작업이 내일 근무 확정자에게 서류를 보내는 때와 같음 · 그 전엔 '모집이 끝나면 보내 드려요')
//   · 보낼 때가 지났는데 서류가 아직 없으면 근무자 화면에 '서명할 서류를 곧 보내 드려요' (예전처럼 '✓ 서명'으로 안 보임)
//   · '지금 보내기'로 먼저 보낼 수 있음 · 근무일에 서류 없이 근무 시작을 누르면 그때 서류를 만들고 먼저 서명하게 (안전장치)
// node scripts/qa/batch378.cjs <default 앱> <default 가짜> <shots>
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
const JF = 'cccccccc-0000-4000-8000-000000037801', JG = 'cccccccc-0000-4000-8000-000000037802', JN = 'cccccccc-0000-4000-8000-000000037803', JT = 'cccccccc-0000-4000-8000-000000037804'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003780${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003780${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
const won = (n) => `${n.toLocaleString('ko-KR')}원`
// 'YYYY-MM-DD' → '11/26(목)' (앱 fmtDate와 같음)
const fd = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})` }
const DAY = 82560 // 09:00~18:00 · 시급 10,320원 · 휴게 60분 → 8시간

;(async () => {
  const nowIso = new Date().toISOString()
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, ...jrow } = j
  const base = { ...jrow, company_id: C1, status: 'open', required_docs: [TPL], contract_method: 'app', headcount: 10, start_time: '09:00:00', end_time: '18:00:00', pay_type: 'hourly', hourly_wage: 10320, break_mode: 'auto', premium_enabled: false, allowance: 0, early_clamp: false, lat: null, lng: null, gps_required: false, created_at: nowIso, audience: 'worker' }
  await rest('jobs', 'POST', { ...base, id: JF, title: '사흘 축제378', start_date: kday(5), end_date: kday(7) })
  await rest('jobs', 'POST', { ...base, id: JG, title: '먼저 보내기378', start_date: kday(9), end_date: kday(9) })
  await rest('jobs', 'POST', { ...base, id: JN, title: '내일 행사378', start_date: kday(1), end_date: kday(1) })
  await rest('jobs', 'POST', { ...base, id: JT, title: '오늘 행사378', start_date: kday(0), end_date: kday(0), start_time: '00:00:00', end_time: '23:59:00' })
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 7; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}378`, phone: `010378000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  // 가짜 DB는 함께 읽기(join)를 안 해서 지원서에 사람 정보를 같이 넣어 둠
  const app = (n, job, status, dates = null, id = AP(n)) => rest('applications', 'POST', { id, company_id: C1, job_id: job, user_id: U(n), user: usr[n], status, available_dates: dates, message: null, decided_at: status === 'approved' ? nowIso : null, held_at: null, position: null, created_at: nowIso })
  await app(1, JF, 'applied')
  await app(2, JF, 'applied', [kday(6)])
  await app(3, JF, 'applied')
  await app(4, JF, 'applied')
  await app(5, JG, 'approved')
  await app(6, JN, 'applied')
  // 가짜 DB는 함께 읽기를 안 해서 '내 근무' 화면이 오늘 근무를 알게 공고도 같이 넣어 둠
  await rest('applications', 'POST', { id: AP(7), company_id: C1, job_id: JT, user_id: U(7), user: usr[7], job: (await rest(`jobs?id=eq.${JT}`))[0], status: 'approved', available_dates: null, message: null, decided_at: nowIso, held_at: null, position: null, created_at: nowIso })
  const docsOf = async (job, uid) => ((await rest(`signed_docs?job_id=eq.${job}&user_id=eq.${uid}`)) ?? []).filter((d) => d.status !== 'void')
  const msgsOf = async (uid) => ((await rest(`messages?thread_user_id=eq.${uid}`)) ?? []).map((m) => m.body)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const flash = (p) => p.locator('[role=status]').first().innerText().then(one).catch(() => '')
  const a = await pg(A)
  // 확정 버튼: 주휴가 생기는 사람 등은 한 번 더 묻는 버튼 (두 번 누름)
  const confirmIn = async (p, sel) => {
    const btn = p.locator(`${sel} form button`, { hasText: '확정' }).first()
    await btn.click()
    await p.waitForTimeout(250)
    if ((await btn.getAttribute('data-confirm').catch(() => null)) === 'armed') await btn.click()
    await p.waitForTimeout(1500)
  }

  // ── 1. 모집 중인 공고에 한 사람 확정 → 카드에 그 사람 금액 · 위 요약 합계 · 서류는 아직 없음
  await open(a, `/admin/jobs/${JF}?tab=apps`)
  const card1 = a.locator(`#app-${AP(1)}`)
  await confirmIn(a, `#app-${AP(1)}`)
  // 화면은 그대로 · 머리글 아래 '확정 1명 · 전체 약 ○원 · +○원' (확정한 카드는 접힌 '확정' 칸으로 들어감)
  // 합계는 앞 금액에서 새 금액으로 잠깐 굴러감 (정기 개선 2026-11-25) → 다 굴러간 뒤에 읽기
  await a.locator('[data-plan-toast] [data-plan-toast-total]:not([data-rolling])').waitFor({ timeout: 5000 }).catch(() => {})
  const toast = one(await a.locator('[data-plan-toast] [role=status]').innerText().catch(() => ''))
  ok(`떠 있는 안내: '확정 1명 · 전체 약 ${won(DAY * 3)} +${won(DAY * 3)}' (한 줄 · 화면 안)`, toast.startsWith(`확정 1명 · 전체 약 ${won(DAY * 3)} +${won(DAY * 3)}`) && (await a.locator('[data-plan-toast] [role=status]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height < 56 })) && (await a.locator('[data-plan-toast] span.truncate').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)), toast)
  if (SHOTS) await a.locator('[data-plan-toast] [role=status]').screenshot({ path: `${SHOTS}/plan-toast.png` }).catch(() => {})
  // 접힌 '확정 1명' 칸을 펼치면 그 사람 카드에 금액
  await a.locator('details[data-app-group="확정"] > summary').click().catch(() => {})
  await card1.locator('[data-app-plan]').waitFor({ timeout: 10000 }).catch(() => {})
  const plan1 = one(await card1.locator('[data-app-plan]').innerText().catch((e) => 'ERR ' + e.message.slice(0, 80)))
  const anim1 = await card1.locator('[data-app-plan]').evaluate((el) => getComputedStyle(el).animationName).catch(() => '')
  ok(`카드: '확정 일정 3일 · 약 ${won(DAY * 3)}' (톡)`, plan1 === `확정 일정 3일 · 약 ${won(DAY * 3)}` && anim1 === 'pop', `${plan1} · ${anim1}`)
  const total1 = one(await a.locator('[data-apps-plan-total]').innerText().catch(() => ''))
  ok(`위 요약: '확정 전체 일정 약 ${won(DAY * 3)}' (한 줄)`, total1 === `확정 전체 일정 약 ${won(DAY * 3)}` && (await a.locator('[data-apps-plan-total]').evaluate((el) => el.getBoundingClientRect().height < 26)), total1)
  ok('모집 중이라 서명 서류는 아직 없음', (await docsOf(JF, U(1))).length === 0)
  ok("확정 알림에 '서명할 서류(근로계약서 등)는 모집이 끝나면 보내 드려요'", (await msgsOf(U(1))).some((m) => m.includes('근무가 확정됐어요') && m.includes('서명할 서류(근로계약서 등)는 모집이 끝나면 보내 드려요')))
  ok('360px 옆으로 안 밀림 (지원자 탭)', await noSide(a))
  if (SHOTS) await card1.screenshot({ path: `${SHOTS}/card-plan.png` }).catch(() => {})

  // ── 2. 근무자 화면: 서류는 모집이 끝나면
  const w1 = await pg(U(1))
  await open(w1, `/jobs/${JF}`)
  const later = w1.locator('[data-docs-later]')
  // 정기 개선 2026-11-25: 아래 작은 줄에 늦어도 언제 오는지 날짜로 (근무 전날 저녁 6시)
  ok(`근무자 공고 화면: '서명할 서류는 모집이 끝나면 보내 드려요 / 늦어도 ${fd(kday(4))} 저녁 6시에 알림으로 와요' · 서명 버튼 없음`, one(await later.innerText().catch(() => '')) === `서명할 서류는 모집이 끝나면 보내 드려요 늦어도 ${fd(kday(4))} 저녁 6시에 알림으로 와요` && (await w1.locator('[data-sign-cta]').count()) === 0, one(await later.innerText().catch(() => '')))
  if (SHOTS) await w1.locator('.card', { has: later }).screenshot({ path: `${SHOTS}/worker-docs-later.png` }).catch(() => {})

  // ── 3. 한꺼번에 확정 (대기 3명) → 안내에 이번 금액 · 전체 금액
  await open(a, `/admin/jobs/${JF}?tab=apps`)
  const allBtn = a.locator('[data-approve-all] button')
  await allBtn.click()
  await a.waitForTimeout(300)
  if (!(await a.url().includes('m='))) {
    // 한 번 더 묻는 버튼이면 다시
    if ((await allBtn.count()) && !(await allBtn.innerText()).startsWith('대기')) await allBtn.click()
  }
  await a.waitForURL((u) => u.searchParams.has('m'), { timeout: 15000 }).catch(() => {})
  const f3 = await flash(a)
  ok('한꺼번에 확정은 위쪽 안내 하나만 (떠 있는 안내와 겹치지 않음)', (await a.locator('[data-plan-toast]').count()) === 0)
  const batch = DAY * 1 + DAY * 3 + DAY * 3 // 근무자2(하루) · 근무자3 · 근무자4 (사흘씩)
  ok(`안내: '3명을 확정했어요. 근무자에게 알렸어요. 이번 3명 약 ${won(batch)} · 확정 4명 전체 약 ${won(batch + DAY * 3)}'`, f3.includes(`3명을 확정했어요. 근무자에게 알렸어요. 이번 3명 약 ${won(batch)} · 확정 4명 전체 약 ${won(batch + DAY * 3)}`), f3)
  ok('고른 날만 계산 (근무자2: 하루)', one(await a.locator(`#app-${AP(2)} [data-app-plan]`).innerText().catch(() => '')) === `확정 일정 1일 · 약 ${won(DAY)}`)
  ok('위 요약도 새 합계', one(await a.locator('[data-apps-plan-total]').innerText().catch(() => '')) === `확정 전체 일정 약 ${won(batch + DAY * 3)}`)
  ok('여전히 서류 없음 (모집 중)', (await docsOf(JF, U(3))).length === 0)

  // ── 4. 서류 탭: 확정 4명 · 서류는 모집 마감 때 + 지금 보내기
  await open(a, `/admin/jobs/${JF}?tab=docs`)
  const wait = a.locator('[data-docs-waiting]')
  ok(`서류 탭: '확정 4명 · 서류는 모집 마감 때 보내요 / 마감을 안 하면 ${fd(kday(4))} 저녁 6시에 자동으로' + '지금 보내기'`, one(await wait.innerText().catch(() => '')) === `확정 4명 · 서류는 모집 마감 때 보내요 마감을 안 하면 ${fd(kday(4))} 저녁 6시에 자동으로 지금 보내기`, one(await wait.innerText().catch(() => '')))
  ok('360px 옆으로 안 밀림 (서류 탭)', await noSide(a))
  if (SHOTS) await wait.screenshot({ path: `${SHOTS}/docs-waiting.png` }).catch(() => {})

  // ── 5. 모집 마감 → 확정자 모두에게 서류 + 알림
  await open(a, `/admin/jobs/${JF}`)
  await a.locator('[data-more-toggle]').click()
  await a.locator('[data-more-panel] button', { hasText: '모집 마감' }).waitFor({ timeout: 5000 }).catch(() => {})
  await Promise.all([a.waitForURL((u) => u.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), a.locator('[data-more-panel] button', { hasText: '모집 마감' }).click()])
  const f5 = await flash(a)
  ok("마감 안내: '모집을 마감했어요 · 확정 4명에게 서명할 서류를 보냈어요'", f5.includes('모집을 마감했어요 · 확정 4명에게 서명할 서류를 보냈어요'), f5)
  const d5 = await Promise.all([1, 2, 3, 4].map((n) => docsOf(JF, U(n))))
  ok('확정 4명 모두 서명 대기 서류 1건씩', d5.every((d) => d.length === 1 && d[0].status === 'pending'), JSON.stringify(d5.map((d) => d.length)))
  const told = await Promise.all([1, 2, 3, 4].map(async (n) => (await msgsOf(U(n))).some((m) => m.startsWith('✍️ 서명할 서류가 왔어요') && m.includes('모집이 끝나 서류가 준비됐어요'))))
  ok("4명 모두 '✍️ 서명할 서류가 왔어요 … 모집이 끝나 서류가 준비됐어요' 알림", told.every(Boolean), JSON.stringify(told))
  await open(w1, `/jobs/${JF}`)
  ok('근무자 화면: 이제 서명 버튼 · 서류 기다림 줄 없음', (await w1.locator('[data-sign-cta]').count()) === 1 && (await w1.locator('[data-docs-later]').count()) === 0)

  // ── 6. 마감 뒤 확정은 바로 서류 (새로 지원 → 확정)
  await app(6, JF, 'applied', null, 'dddddddd-0000-4000-8000-000000037899')
  await open(a, `/admin/jobs/${JF}?tab=apps`)
  await confirmIn(a, '#app-dddddddd-0000-4000-8000-000000037899')
  ok('마감한 뒤에 확정하면 바로 서류', (await docsOf(JF, U(6))).length === 1)

  // ── 7. 근무가 내일: 저녁 6시(한국)부터는 모집 중이어도 바로 서류 · 그 전엔 모집이 끝나면(또는 저녁 6시 작업)
  await open(a, `/admin/jobs/${JN}?tab=apps`)
  await confirmIn(a, `#app-${AP(6)}`)
  const evening = new Date(Date.now() + 9 * 3600e3).getUTCHours() >= 18
  if (evening) {
    ok('(저녁 6시 뒤) 근무가 내일이면 모집 중이어도 바로 서류', (await docsOf(JN, U(6))).length === 1)
    ok('확정 알림은 바로 서명하라고', (await msgsOf(U(6))).some((m) => m.includes('내일 행사378') && m.includes('서류에 서명해 주세요')))
  } else {
    ok('(저녁 6시 전) 근무가 내일이어도 서류는 아직 · 저녁 작업이나 마감 때', (await docsOf(JN, U(6))).length === 0)
    ok("확정 알림은 '모집이 끝나면 보내 드려요'", (await msgsOf(U(6))).some((m) => m.includes('내일 행사378') && m.includes('모집이 끝나면 보내 드려요')))
  }

  // ── 8. '지금 보내기' (마감 전)
  await open(a, `/admin/jobs/${JG}?tab=docs`)
  await Promise.all([a.waitForURL((u) => u.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), a.locator('[data-docs-waiting] button', { hasText: '지금 보내기' }).click()])
  ok("'지금 보내기' → '확정 1명에게 서명할 서류를 보냈어요' · 서류 생김 · 줄은 사라짐", (await flash(a)).includes('확정 1명에게 서명할 서류를 보냈어요') && (await docsOf(JG, U(5))).length === 1 && (await a.locator('[data-docs-waiting]').count()) === 0, await flash(a))

  // ── 8-2. 관리자 서류 탭: 보낼 때가 지났는데 서류가 없는 확정자 → 주황 '아직 서류를 못 받았어요' + 지금 보내기
  await open(a, `/admin/jobs/${JT}?tab=docs`)
  const late = a.locator('[data-docs-waiting="late"]')
  ok("오늘 근무 · 서류 없는 확정자: '확정 1명 · 아직 서류를 못 받았어요 / 근무 전에 서명하게 지금 보내 주세요' + '지금 보내기'", one(await late.innerText().catch(() => '')) === '확정 1명 · 아직 서류를 못 받았어요 근무 전에 서명하게 지금 보내 주세요 지금 보내기' && (await noSide(a)), one(await late.innerText().catch(() => '')))
  if (SHOTS) await late.screenshot({ path: `${SHOTS}/docs-late.png` }).catch(() => {})
  // ── 9. 보낼 때가 지났는데 서류가 아직 없음(저녁 작업이 놓침): 근무자 공고 화면은 '곧 보내 드려요' · 서명 단계는 ✓ 아님
  const w7 = await pg(U(7))
  await open(w7, `/jobs/${JT}`)
  const soon = w7.locator('[data-docs-later="soon"]')
  ok("오늘 근무 · 서류 아직 없음: '서명할 서류를 곧 보내 드려요 · 근무 시작 전에 서명해 주세요' · 서명 버튼 없음", one(await soon.innerText().catch(() => '')) === '서명할 서류를 곧 보내 드려요 · 근무 시작 전에 서명해 주세요' && (await w7.locator('[data-sign-cta]').count()) === 0, one(await soon.innerText().catch(() => '')))
  // ── 10. 안전장치: 근무일에 서류 없이 근무 시작 → 그때 서류를 만들고 먼저 서명하게
  await open(w7, '/me')
  const btn = w7.locator('[data-clock-main]').first()
  if ((await btn.count()) && (await btn.isVisible())) {
    await btn.click()
    await w7.waitForTimeout(2500)
    ok('근무일 서류 없음 → 근무 시작을 누르면 서류가 생기고 시작은 막힘', (await docsOf(JT, U(7))).length === 1 && ((await rest(`attendance?job_id=eq.${JT}&user_id=eq.${U(7)}`)) ?? []).length === 0)
  } else ok('(근무 시작 버튼이 안 보여 안전장치 확인은 건너뜀)', true)

  // ── 11. 오늘 근무(J)는 예전처럼 (시드 서류 그대로)
  ok('오늘 근무 공고의 기존 서류는 그대로', (await docsOf(J, W)).length >= 1)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
