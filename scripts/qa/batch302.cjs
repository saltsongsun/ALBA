// 묶음 302 (정기 개선 2026-11-18 15:35 KST)
// · 근무자 '급여 문의'(정산일 지남) 뒤에 관리자가 그 공고 급여를 지급 완료하면 답한 것으로:
//   문의 목록 빨간 '급여 문의' → 초록 '✓ 지급함' · '답장 전'에서 빠짐 · 홈 '읽고 아직 답하지 않은 문의'에서도 빠짐
//   (다른 공고 지급 알림은 답으로 치지 않음)
// · 정산 탭: 급여 문의를 보낸 지급 전 근무자 이름 아래 '💬 급여 문의' → 그 대화 (지급하면 사라짐)
// · 빠른 답장: 첫 말이 길면(준비해 둔 글) 칩 줄에서 잘리지 않게 위에 한 줄 전체로 (✓ · 한 번 더 누르면 뺌 그대로)
// node scripts/qa/batch302.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const J2 = 'cccccccc-0000-4000-8000-000000030201', J3 = 'cccccccc-0000-4000-8000-000000030202'
const ASK = '정산일이 지났는데 급여가 아직 안 들어왔어요. 확인 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const ago = (min) => new Date(Date.now() - min * 60e3).toISOString()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 전에 끝난 행사 둘 (W가 일함 · 지급 전) · J2는 어제가 정산일이라고 알림
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const mkJob = (id, title) => rest('jobs', 'POST', { ...jb, id, title, status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(J2, '가을 축제 주차 안내')
  await mkJob(J3, '겨울 박람회 안내')
  const jobOf = async (id) => (await rest(`jobs?id=eq.${id}`))[0]
  const att = async (id, job) => rest('attendance', 'POST', { id, job_id: job, job: await jobOf(job), user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, confirmed: true, created_at: new Date().toISOString() })
  await att('eeeeeeee-0000-4000-8000-000000030201', J2)
  await att('eeeeeeee-0000-4000-8000-000000030202', J3)
  const [wu] = await rest(`users?id=eq.${W}`)
  const user = { id: W, name: wu.name, phone: wu.phone, photo_at: null, member_type: wu.member_type ?? 'worker' }
  await rest('messages', 'POST', { id: 3020001, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J2, body: `💰 정산 예정일 안내\n가을 축제 주차 안내 · 정산 예정일: ${md(kday(-1))}`, read_at: null, created_at: ago(60 * 30), user })
  // 처음부터 있던 근무자 글은 읽음으로 · W가 지난 근무에서 '급여 문의'를 보냄 (관리자가 읽음)
  await rest('messages?id=eq.1', 'PATCH', { read_at: ago(50) })
  await rest('messages', 'POST', { id: 3020002, thread_user_id: W, sender_id: W, from_admin: false, company_id: C1, job_id: J2, job: { id: J2, title: '가을 축제 주차 안내' }, body: ASK, read_at: ago(5), created_at: ago(10), user })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const go = async (path) => { await a.goto(`${D}${path}`, { waitUntil: 'networkidle' }); await a.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }
  const row = () => a.locator(`[data-inbox-row="${W}"]`)
  const tagOf = async () => {
    await row().waitFor({ timeout: 15000 }).catch(() => {})
    const tg = row().locator('[data-inbox-tag]')
    const has = (await tg.count()) > 0
    return { text: has ? one(await tg.textContent()) : '', kind: has ? await tg.getAttribute('data-inbox-tag') : null, noreply: await row().locator('[data-inbox-noreply]').count() }
  }
  const homeNoReply = async () => { await go('/admin'); return a.locator('[data-todo="noreply"]').count() }

  // ── 1. 지급 전: 빨간 '급여 문의' · 답장 전 · 홈 할 일 · 정산 탭 이름 아래 '💬 급여 문의'
  await go('/admin/chat')
  const t0 = await tagOf()
  ok("문의 목록: 빨간 '급여 문의' · '답장 전'", t0.text === '급여 문의' && t0.kind === 'urgent' && t0.noreply === 1, JSON.stringify(t0))
  ok("홈: '읽고 아직 답하지 않은 문의' 있음", (await homeNoReply()) === 1)
  await go(`/admin/jobs/${J2}?tab=pay`)
  const asked = a.locator('[data-pay-asked]')
  await asked.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("정산 탭: 이름 아래 '💬 급여 문의' → 그 대화", (await asked.count()) === 1 && one(await asked.textContent()) === '💬 급여 문의' && (await asked.getAttribute('href')) === `/admin/chat/${W}`)
  ok('이름 칸이 넓어지지 않음 (한 줄짜리 작은 표시)', await asked.evaluate((el) => el.getBoundingClientRect().height < 26 && el.getBoundingClientRect().width < 110))
  ok('360px 옆으로 안 밀림 (정산 탭)', await noSide(a))
  if (SHOTS) await a.locator('[data-pay-row]').first().locator('td').first().screenshot({ path: `${SHOTS}/pay-asked.png` }).catch(() => {})
  await go(`/admin/jobs/${J3}?tab=pay`)
  ok("다른 공고 정산 탭엔 '급여 문의' 없음 (그 공고에서 보낸 문의만)", (await a.locator('[data-pay-row]').count()) >= 1 && (await a.locator('[data-pay-asked]').count()) === 0)

  // ── 2. 다른 공고(J3) 급여 지급 알림은 답으로 치지 않음
  await rest('messages', 'POST', { id: 3020003, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J3, body: `💸 급여 지급\n겨울 박람회 안내 급여를 등록한 계좌로 보냈어요.`, read_at: null, created_at: ago(3), user })
  await go('/admin/chat')
  const t1 = await tagOf()
  ok("다른 공고 지급 알림 뒤에도 '급여 문의' · '답장 전' 그대로", t1.text === '급여 문의' && t1.noreply === 1, JSON.stringify(t1))

  // ── 3. 정산 탭에서 그 사람 지급 완료 → '✓ 지급함' · 답장 전에서 빠짐 · 홈 할 일도 빠짐
  await go(`/admin/jobs/${J2}?tab=pay`)
  const payBtn = a.locator('[data-pay-row]').filter({ has: a.locator('[data-pay-asked]') }).locator('form button', { hasText: '미지급' }).first()
  await payBtn.click()
  await a.waitForTimeout(400)
  // 계좌가 없으면 한 번 더 눌러 확인
  if ((await a.locator('[data-pay-row] form button', { hasText: '계좌 없음' }).count()) > 0) await a.locator('[data-pay-row] form button', { hasText: '계좌 없음' }).first().click()
  await a.waitForLoadState('networkidle')
  await a.waitForTimeout(800)
  const paidMsgs = ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => m.from_admin && m.body.startsWith('💸 급여 지급') && m.job_id === J2)
  ok('지급 완료하면 그 공고 급여 지급 알림이 감', paidMsgs.length === 1 && paidMsgs[0].company_id === C1, JSON.stringify(paidMsgs.map((m) => [m.job_id, m.company_id])))
  await go(`/admin/jobs/${J2}?tab=pay`)
  ok("지급하면 정산 탭 '급여 문의' 사라짐", (await a.locator('[data-pay-asked]').count()) === 0)
  await go('/admin/chat')
  const t2 = await tagOf()
  ok("문의 목록: '✓ 지급함'(초록) · '답장 전' 아님", t2.text === '✓ 지급함' && t2.kind === 'paid' && t2.noreply === 0, JSON.stringify(t2))
  ok('360px 옆으로 안 밀림 (문의 목록)', await noSide(a))
  if (SHOTS) await row().screenshot({ path: `${SHOTS}/inbox-paid.png` }).catch(() => {})
  await a.goto(`${D}/admin/chat?noreply=1`, { waitUntil: 'networkidle' })
  ok("'답장 전'만 보기에서도 빠짐", (await a.locator(`[data-inbox-row="${W}"]`).count()) === 0)
  ok("홈: '읽고 아직 답하지 않은 문의' 없음", (await homeNoReply()) === 0)

  // ── 4. 근무자가 지급 뒤에 또 물으면 다시 '답장 전'
  await rest('messages', 'POST', { id: 3020004, thread_user_id: W, sender_id: W, from_admin: false, company_id: C1, job_id: J2, body: '통장에 아직 안 보여요.', read_at: ago(0), created_at: new Date().toISOString(), user })
  await go('/admin/chat')
  const t3 = await tagOf()
  ok("지급 뒤에 근무자가 또 쓰면 다시 '답장 전'", t3.noreply === 1 && t3.text === '', JSON.stringify(t3))

  // ── 5. 빠른 답장: 긴 첫 말은 위에 한 줄 전체로 · 짧은 말은 칩 줄
  const w = await mk(W)
  await w.goto(`${D}/me/chat?job=${J2}&ask=paylate`, { waitUntil: 'networkidle' })
  const lead = w.locator('[data-quick-lead]')
  await lead.waitFor({ timeout: 15000 }).catch(() => {})
  ok('긴 준비 글은 칩 줄 밖 한 줄 전체 · 잘리지 않음', (await lead.count()) === 1 && one(await lead.textContent()) === ASK && (await lead.evaluate((el) => el.getBoundingClientRect().width >= 300 && el.scrollWidth <= el.clientWidth + 1 && !el.closest('[data-quick-replies]'))))
  ok('나머지 짧은 말은 그대로 옆으로 미는 칩 줄', (await w.locator('[data-quick-replies] button').count()) >= 2 && (await w.locator('[data-quick-replies] button', { hasText: '두고 온 물건이 있어요.' }).count()) === 1)
  const box = w.locator('textarea[name=body]').first()
  await lead.click()
  await w.waitForTimeout(250)
  ok("누르면 입력칸에 들어가고 ✓ (aria-pressed)", (await box.inputValue()) === ASK && (await lead.getAttribute('aria-pressed')) === 'true' && one(await lead.innerText()).startsWith('✓'), await box.inputValue())
  ok('360px 옆으로 안 밀림 (근무자 문의함)', await noSide(w))
  if (SHOTS) {
    const bx = await lead.boundingBox()
    if (bx) await w.screenshot({ path: `${SHOTS}/quick-lead.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: 170 } }).catch(() => {})
  }
  await lead.click()
  ok('한 번 더 누르면 빠짐', (await box.inputValue()) === '' && (await lead.getAttribute('aria-pressed')) === 'false')
  await w.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  await w.locator('[data-quick-replies]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('첫 말이 짧으면 한 줄 버튼 없이 칩 줄만', (await w.locator('[data-quick-lead]').count()) === 0 && (await w.locator('[data-quick-replies] button').count()) >= 3)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
