// 묶음 355 (정기 개선 2026-11-22 23:35 KST · 명세서·확인서 '종료 기록 없음' + 확인서 위쪽 정리)
// · 명세서·근무확인서 위(인쇄 안 됨): 지난 근무 중 종료 기록이 없는 날 → '종료 기록 없음 · M/D(요) 외 n일 · 이 날은 아직 계산에 빠져 있어요'
//   - 근무자: '담당자에게 알리기 →' → 그 공고 회사 문의함 · 첫 빠른 답 '근무 종료 기록이 빠진 날이 있어요. 확인 부탁드려요. (날짜)' → 보낸 뒤 '✓ 알렸어요'
//   - 관리자: '종료 넣기 →' → 출퇴근 탭의 그 날 · 그 사람 / 문의 목록 '종료 기록' · 대화 말풍선 아래 'M/D 종료 넣기 (n일) →' · 다 넣으면 '✓ 종료 기록이 다 들어갔어요'
//   - 오늘 근무 중인 날은 빼고 · 다른 회사 관리자는 명세서 자체가 안 열림
// · 근무확인서: 마친 근무가 없으면 빈 서류 대신 안내 (인쇄·용도 칸 숨김) · 위 줄 '돌아가기 · 인쇄' / 아래 줄 용도 (360px에서 엉키지 않게) · 넣은 용도가 짧게 톡 (0.25초)
// · 명세서: 마친 근무·지급액이 없으면 인쇄 버튼 숨김 (0원 명세서 막기)
// node scripts/qa/batch355.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000003550c2'
const A2 = 'aaaaaaaa-0000-4000-8000-0000003550a2'
const J5 = 'cccccccc-0000-4000-8000-000000035501', J6 = 'cccccccc-0000-4000-8000-000000035502'
const ASK = '근무 종료 기록이 빠진 날이 있어요. 확인 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // J5: 사흘 전~어제 (사흘 전은 끝까지 · 그제·어제는 종료 기록 없음) / J6: 그제 하루 (종료 기록 없음뿐)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J5, title: '가을 음악회 안내', status: 'closed', start_date: kday(-3), end_date: kday(-1), applications: [], attendance: [], created_at: new Date().toISOString() })
  await rest('jobs', 'POST', { ...jb, id: J6, title: '주말 장터 안내', status: 'closed', start_date: kday(-2), end_date: kday(-2), applications: [], attendance: [], created_at: new Date().toISOString() })
  const jobOf = async (id) => (await rest(`jobs?id=eq.${id}`))[0]
  const att = async (id, job, day, out) =>
    rest('attendance', 'POST', { id, job_id: job, job: await jobOf(job), user_id: W, work_date: day, clock_in: `${day}T09:00:00+09:00`, clock_out: out ? `${day}T18:00:00+09:00` : null, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, paid: false, paid_at: null, created_at: new Date().toISOString() })
  await att('eeeeeeee-0000-4000-8000-000000035501', J5, kday(-3), true)
  await att('eeeeeeee-0000-4000-8000-000000035502', J5, kday(-2), false)
  await att('eeeeeeee-0000-4000-8000-000000035503', J5, kday(-1), false)
  await att('eeeeeeee-0000-4000-8000-000000035504', J6, kday(-2), false)
  for (const jid of [J5, J6])
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: W, status: 'approved', available_dates: null, position: null, message: null, contract_received_at: null, created_at: new Date().toISOString(), job: await jobOf(jid), user: { id: W, name: '근무자', phone: '01033334444' } })
  // 다른 회사 관리자 (그 회사만 맡음)
  const [au] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { id: C2, company_name: '다른회사355', ceo_name: '다른대표', active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  await rest('users', 'POST', { ...au, id: A2, name: '다른관리355', phone: '01035500002', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-01T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }
  const print = (p) => p.locator('button', { hasText: '인쇄 / PDF 저장' })

  // ── 1. 근무자 명세서: 종료 기록 없는 이틀 → 한 줄 + 담당자에게 알리기 (마친 하루가 있으니 인쇄는 그대로)
  const w = await mk(W)
  await go(w, `/print/payslip/${J5}/${W}`)
  const note = w.locator('[data-noend]')
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`명세서 위 '종료 기록 없음 · ${md(kday(-2))} 외 1일'`, (await note.count()) === 1 && one(await note.locator('p').first().innerText()) === `종료 기록 없음 · ${md(kday(-2))} 외 1일` && (await note.getAttribute('data-noend')) === '2', one(await note.innerText().catch(() => '')))
  ok("'이 날은 아직 계산에 빠져 있어요' · 인쇄에는 안 나옴", one(await note.innerText()).includes('이 날은 아직 계산에 빠져 있어요') && (await note.evaluate((el) => el.classList.contains('no-print'))))
  const askLink = note.locator('[data-noend-ask]')
  ok("'담당자에게 알리기 →' → 그 공고 회사 문의함 (날짜 두 개)", (await askLink.getAttribute('href')) === `/me/chat?job=${J5}&ask=noend&d=${kday(-2)},${kday(-1)}`, await askLink.getAttribute('href'))
  ok('마친 날이 있으면 인쇄 버튼은 그대로', (await print(w).count()) === 1)
  ok('360px 옆으로 안 밀림 (명세서)', await noSide(w))
  ok('알림 줄 높이 작게 (두 줄 안)', (await note.evaluate((el) => el.getBoundingClientRect().height)) < 80, String(await note.evaluate((el) => el.getBoundingClientRect().height)))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/payslip-noend.png` })
  await w.emulateMedia({ media: 'print' })
  ok('인쇄 화면에서는 안 보임', !(await note.isVisible()))
  await w.emulateMedia({ media: 'screen' })

  // 오늘 근무 중인 날은 세지 않음 (기본 공고 J: 오늘 시작 · 종료 전)
  await go(w, `/print/payslip/${J}/${W}`)
  ok('오늘 근무 중인 날만 있으면 알림 없음', (await w.locator('[data-noend]').count()) === 0)

  // ── 2. 알리기 → 문의함 첫 빠른 답 (날짜 포함) → 보내면 그 공고·회사로
  await go(w, `/print/payslip/${J5}/${W}`)
  await Promise.all([w.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {}), w.locator('[data-noend-ask]').click()])
  await w.waitForLoadState('networkidle')
  const chips = w.locator('[data-quick-lead], [data-quick-replies] button')
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  const want = `${ASK} (${md(kday(-2))}, ${md(kday(-1))})`
  ok('빠른 답장 맨 앞이 날짜가 적힌 준비 글', one(await chips.first().textContent().catch(() => '')) === want, one(await chips.first().textContent().catch(() => '')))
  ok('360px 옆으로 안 밀림 (문의함)', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/chat-noend.png` })
  await chips.first().click()
  await w.locator('textarea').first().press('Enter')
  await w.waitForTimeout(1500)
  const sent = ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => m.body === want && !m.from_admin)
  ok('그 회사 · 그 공고로 보내짐', sent.length === 1 && sent[0].company_id === C1 && sent[0].job_id === J5, JSON.stringify(sent.map((m) => [m.company_id, m.job_id])))
  // 날짜가 이상하면 빼고 준비 글만
  await go(w, `/me/chat?job=${J5}&ask=noend&d=2026-13-99,<b>`)
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('주소의 날짜가 이상하면 날짜 없이 준비 글만', one(await chips.first().textContent().catch(() => '')) === ASK, one(await chips.first().textContent().catch(() => '')))

  // 보낸 뒤 명세서: '✓ 알렸어요'
  await go(w, `/print/payslip/${J5}/${W}`)
  const asked = w.locator('[data-noend-asked]')
  await asked.waitFor({ timeout: 15000 }).catch(() => {})
  ok("보낸 뒤 '✓ 알렸어요' (다시 묻지 않게) → 그 공고 문의함", one(await asked.textContent().catch(() => '')) === '✓ 알렸어요' && (await asked.getAttribute('href')) === `/me/chat?job=${J5}` && (await w.locator('[data-noend-ask]').count()) === 0)

  // ── 3. 근무확인서: 위 줄 돌아가기·인쇄 / 아래 줄 용도 · 넣은 용도 톡
  await go(w, `/print/cert/${J5}/${W}`)
  const top = w.locator('a', { hasText: '← 돌아가기' })
  const pb = print(w)
  const form = w.locator('[data-cert-purpose]')
  const [tb, pbb, fb] = await Promise.all([top.boundingBox(), pb.boundingBox(), form.boundingBox()])
  ok('확인서 위 줄: 돌아가기 · 인쇄가 한 줄', tb && pbb && Math.abs(tb.y + tb.height / 2 - (pbb.y + pbb.height / 2)) < 12, JSON.stringify([tb, pbb]))
  ok('아래 줄: 용도 칸이 화면 폭으로 (360px)', fb && pbb && fb.y > pbb.y + pbb.height - 2 && fb.width > 300, JSON.stringify(fb))
  ok('확인서에도 종료 기록 없음 줄', (await w.locator('[data-noend]').count()) === 1)
  ok("용도 버튼 '넣기'", one(await form.locator('button').innerText()) === '넣기')
  ok('360px 옆으로 안 밀림 (확인서)', await noSide(w))
  await form.locator('input').fill('은행 제출용')
  await Promise.all([w.waitForURL((u) => u.searchParams.get('purpose') === '은행 제출용', { timeout: 15000 }).catch(() => {}), form.locator('button').click()])
  await w.waitForLoadState('networkidle')
  const pv = w.locator('[data-cert-purpose-value]')
  await pv.waitFor({ timeout: 15000 }).catch(() => {})
  ok("넣은 용도가 확인서 '용도' 줄에", one(await pv.textContent().catch(() => '')) === '은행 제출용')
  ok('용도가 0.25초 톡', (await pv.evaluate((el) => getComputedStyle(el).animationDuration).catch(() => '')) === '0.25s')
  ok("넣은 뒤 버튼은 '바꾸기'", one(await form.locator('button').innerText()) === '바꾸기')
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/cert-top.png` })

  // 마친 근무가 없는 공고(J6): 빈 서류 대신 안내 · 인쇄·용도 없음 / 명세서도 인쇄 없음
  await go(w, `/print/cert/${J6}/${W}`)
  const empty = w.locator('[data-cert-empty]')
  await empty.waitFor({ timeout: 15000 }).catch(() => {})
  ok("마친 근무 없음: '마친 근무가 아직 없어요' + 이유", one(await empty.innerText().catch(() => '')) === '마친 근무가 아직 없어요 근무 종료 기록이 들어가면 확인서가 만들어져요', one(await empty.innerText().catch(() => '')))
  ok('빈 확인서는 인쇄·용도 칸 숨김', (await print(w).count()) === 0 && (await w.locator('[data-cert-purpose]').count()) === 0)
  ok(`종료 기록 없음 줄 '${md(kday(-2))}' (하루)`, one(await w.locator('[data-noend] p').first().innerText().catch(() => '')) === `종료 기록 없음 · ${md(kday(-2))}`)
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/cert-empty.png` })
  await go(w, `/print/payslip/${J6}/${W}`)
  ok('0원 명세서는 인쇄 버튼 숨김', (await print(w).count()) === 0 && (await w.locator('.print-sheet').count()) >= 1)

  // ── 4. 관리자: 명세서 '종료 넣기 →' · 문의 목록 '종료 기록' · 대화 말풍선 아래 'M/D 종료 넣기 (2일) →'
  const a = await mk(A)
  await go(a, `/print/payslip/${J5}/${W}`)
  const fix = a.locator('[data-noend-fix]')
  ok("관리자 명세서: '종료 넣기 →' → 출퇴근 탭 그 날 · 그 사람", (await fix.getAttribute('href').catch(() => null)) === `/admin/jobs/${J5}?tab=att&date=${kday(-2)}&fix=${W}#att-${W}`, await fix.getAttribute('href').catch(() => null))
  ok('관리자 쪽엔 알리기 버튼 없음', (await a.locator('[data-noend-ask], [data-noend-asked]').count()) === 0)
  // (가짜 DB는 앱이 보낸 글에 보낸 사람 정보를 붙이지 않아서 목록에 나오게 붙여 줌)
  const [wu] = await rest(`users?id=eq.${W}`)
  await rest(`messages?id=eq.${sent[0]?.id}`, 'PATCH', { user: { id: W, name: wu.name, phone: wu.phone, photo_at: null, member_type: wu.member_type ?? 'worker' }, job: { id: J5, title: '가을 음악회 안내' }, sender: { name: wu.name } })
  await go(a, '/admin/chat')
  const thread = a.locator(`a[href="/admin/chat/${W}"]`).first()
  await thread.waitFor({ timeout: 15000 }).catch(() => {})
  ok("문의 목록: '종료 기록' 표시", one(await thread.locator('[data-inbox-tag]').textContent().catch(() => '')) === '종료 기록', one(await thread.textContent().catch(() => '')).slice(0, 80))
  await go(a, `/admin/chat/${W}`)
  const rl = a.locator('[data-noend-resolve-link]')
  await rl.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`대화: 말풍선 아래 '${md(kday(-2))} 종료 넣기 (2일) →'`, one(await rl.textContent().catch(() => '')) === `${md(kday(-2))} 종료 넣기 (2일) →` && (await rl.getAttribute('href')) === `/admin/jobs/${J5}?tab=att&date=${kday(-2)}&fix=${W}#att-${W}`, one(await rl.textContent().catch(() => '')))
  const aq = (await a.locator('[data-quick-lead], [data-quick-replies] button').allTextContents()).map(one)
  ok("빠른 답장 '종료 기록을 넣었어요. 명세서를 다시 확인해 주세요.'", aq.includes('종료 기록을 넣었어요. 명세서를 다시 확인해 주세요.'), aq.slice(0, 4).join(' | '))
  ok('360px 옆으로 안 밀림 (관리자 대화)', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/admin-chat-noend.png` })

  // 다른 회사 관리자: 그 명세서는 열리지 않음 (알림 줄도 없음)
  const a2 = await mk(A2)
  await go(a2, `/print/payslip/${J5}/${W}`)
  ok('다른 회사 관리자: 명세서 안 열림 · 알림 없음', (await a2.locator('[data-noend]').count()) === 0 && (await a2.locator('.print-sheet').count()) === 0)

  // ── 5. 종료를 넣으면: 대화 '✓ 다 들어갔어요' · 명세서 알림 없음
  await rest(`attendance?job_id=eq.${J5}&work_date=eq.${kday(-2)}`, 'PATCH', { clock_out: `${kday(-2)}T18:00:00+09:00` })
  await rest(`attendance?job_id=eq.${J5}&work_date=eq.${kday(-1)}`, 'PATCH', { adj_out: `${kday(-1)}T18:00:00+09:00` })
  await go(a, `/admin/chat/${W}`)
  ok("다 넣으면 '✓ 종료 기록이 다 들어갔어요'", one(await a.locator('[data-noend-resolved]').textContent().catch(() => '')) === '✓ 종료 기록이 다 들어갔어요' && (await a.locator('[data-noend-resolve-link]').count()) === 0)
  await go(w, `/print/payslip/${J5}/${W}`)
  ok('근무자 명세서: 알림 줄 사라짐', (await w.locator('[data-noend]').count()) === 0)

  // ── 6. 움직임 줄이기: 알림 줄 바로
  const r = await mk(W, { reducedMotion: 'reduce' })
  await go(r, `/print/cert/${J6}/${W}`)
  const rd = await r.locator('[data-noend]').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로 보임', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
