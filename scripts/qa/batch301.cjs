// 묶음 301 (정기 개선 2026-11-18 13:35 KST)
// · 근무자 '지난 근무': 약속한 정산일(알린 날짜 · 없으면 공고의 지급일 짐작)이 지났는데 입금 전이면 빨간 '💰 정산일 M/D 지남 · 문의 →'
//   누르면 그 회사 문의함 + 첫 빠른 답이 '정산일이 지났는데 급여가 아직 안 들어왔어요. 확인 부탁드려요.' (그 공고로 보냄)
//   보낸 뒤엔 '✓ 물어봄 ›' (같은 문의를 또 보내지 않게 · 답 보러 그 회사 문의함) · 입금 대기 줄에 '정산일 지남 n'
// · 관리자 문의함: 그 글에 '급여 문의'(빨강) · 대화의 빠른 답장 첫 줄 '늦어져서 죄송해요. 바로 확인해서 입금해 드릴게요.'
// node scripts/qa/batch301.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const J2 = 'cccccccc-0000-4000-8000-000000030101', J3 = 'cccccccc-0000-4000-8000-000000030102'
const ATT2 = 'eeeeeeee-0000-4000-8000-000000030101'
const ASK = '정산일이 지났는데 급여가 아직 안 들어왔어요. 확인 부탁드려요.'
const SORRY = '늦어져서 죄송해요. 바로 확인해서 입금해 드릴게요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 전에 끝난 행사 둘 (W가 일함 · 지급 전) — J2는 어제가 정산일이라고 알림, J3는 닷새 뒤라고 알림
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const mkJob = (id, title) => rest('jobs', 'POST', { ...jb, id, title, status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(J2, '가을 축제 주차 안내')
  await mkJob(J3, '겨울 박람회 안내')
  // (가짜 DB는 묶어 읽는 공고를 행에 그대로 붙여 둬야 함)
  const jobOf = async (id) => (await rest(`jobs?id=eq.${id}`))[0]
  const att = async (id, job) => rest('attendance', 'POST', { id, job_id: job, job: await jobOf(job), user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, created_at: new Date().toISOString() })
  await att(ATT2, J2)
  await att('eeeeeeee-0000-4000-8000-000000030102', J3)
  const told = (id, job, title, day) => rest('messages', 'POST', { id, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: job, body: `💰 정산 예정일 안내\n${title} · 정산 예정일: ${md(day)}`, read_at: null, created_at: `${kday(-2)}T10:00:00+09:00` })
  await told(3010001, J2, '가을 축제 주차 안내', kday(-1))
  await told(3010002, J3, '겨울 박람회 안내', kday(5))

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
  const w = await mk(W)
  const history = async () => {
    await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
    await w.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  }
  const card = (job) => w.locator(`[data-history-job="${job}"]`)
  const late = (md(kday(-1)))

  // ── 1. 정산일이 지났는데 입금 전: 빨간 '정산일 지남 · 문의 →' · 아직이면 주황 '정산 예정'
  await history()
  const over = card(J2).locator('[data-payday-line="over"]')
  await over.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`지난 정산일: '💰 정산일 ${late} 지남 · 문의 →' (빨강)`, one(await over.textContent().catch(() => '')) === `💰 정산일 ${late} 지남 · 문의 →` && (await over.getAttribute('class')).includes('text-rose-600'), one(await over.textContent().catch(() => '')))
  ok('누르면 그 공고로 문의 (물어볼 글 준비)', (await over.getAttribute('href')) === `/me/chat?job=${J2}&ask=paylate`)
  ok('한 줄 · 잘리지 않음', await over.evaluate((el) => el.getBoundingClientRect().height < 22 && el.scrollWidth <= el.clientWidth + 1))
  const soon = card(J3).locator('[data-payday-line]')
  ok(`아직 안 지난 정산일은 그대로 '💰 정산 예정 ${md(kday(5))}' (주황)`, one(await soon.textContent().catch(() => '')) === `💰 정산 예정 ${md(kday(5))}` && !['over', 'asked'].includes(await soon.getAttribute('data-payday-line')) && (await soon.getAttribute('class')).includes('text-amber-700'), one(await soon.textContent().catch(() => '')) + ' / ' + (await soon.getAttribute('data-payday-line').catch(() => '')))
  const badge = w.locator('[data-unpaid-late]')
  ok("입금 대기 줄에 '정산일 지남 1'", (await badge.count()) === 1 && one(await badge.textContent()) === '정산일 지남 1')
  ok('360px 옆으로 안 밀림 (지난 근무)', await noSide(w))
  if (SHOTS) {
    await card(J2).evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await w.waitForTimeout(400)
    await card(J2).screenshot({ path: `${SHOTS}/history-paylate.png` }).catch(() => {})
    await w.evaluate(() => scrollTo(0, 0))
    await w.waitForTimeout(300)
    await w.locator('[data-unpaid]').first().screenshot({ path: `${SHOTS}/history-unpaid-late.png` }).catch(() => {})
  }

  // ── 2. 누르면 그 회사 문의함 · 첫 빠른 답이 준비된 글 → 보내면 그 공고·회사로
  await card(J2).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await Promise.all([w.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {}), over.click()])
  await w.waitForLoadState('networkidle')
  const chips = w.locator('[data-quick-lead], [data-quick-replies] button')
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok(`빠른 답장 맨 앞 '${ASK}'`, one(await chips.first().textContent().catch(() => '')) === ASK, one(await chips.first().textContent().catch(() => '')))
  ok("급여 날짜를 묻는 다른 빠른 답은 빠짐 ('급여 지급일이 언제인가요?')", (await w.locator('[data-quick-lead], [data-quick-replies] button', { hasText: '급여 지급일이 언제인가요?' }).count()) === 0)
  ok('360px 옆으로 안 밀림 (문의함)', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/paylate-chat.png` }).catch(() => {})
  await chips.first().click()
  await w.locator('textarea').first().press('Enter')
  await w.waitForTimeout(1500)
  const sent = ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => m.body === ASK && !m.from_admin)
  ok('그 회사 · 그 공고로 보내짐', sent.length === 1 && sent[0].company_id === C1 && sent[0].job_id === J2, JSON.stringify(sent.map((m) => [m.company_id, m.job_id])))

  // ── 3. 보낸 뒤 '지난 근무': '✓ 물어봄 ›' → 그 회사 문의함 (다른 공고는 그대로)
  await history()
  const asked = card(J2).locator('[data-payday-line="asked"]')
  await asked.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`보낸 뒤 '💰 정산일 ${late} 지남 · ✓ 물어봄 ›' → 그 회사 문의함 · 한 줄`, one(await asked.textContent().catch(() => '')) === `💰 정산일 ${late} 지남 · ✓ 물어봄 ›` && (await asked.getAttribute('href')) === `/me/chat?co=${C1}` && (await asked.evaluate((el) => el.getBoundingClientRect().height < 22)), one(await asked.textContent().catch(() => '')))
  ok("'정산일 지남 1'은 입금 전까지 그대로", one(await badge.textContent().catch(() => '')) === '정산일 지남 1')
  if (SHOTS) await card(J2).evaluate((el) => el.scrollIntoView({ block: 'center' })).then(() => w.waitForTimeout(400)).then(() => card(J2).screenshot({ path: `${SHOTS}/history-asked.png` })).catch(() => {})

  // ── 4. 관리자: 문의 목록 '급여 문의'(빨강) · 대화의 빠른 답장 '늦어져서 죄송해요…'
  const a = await mk(A)
  // (가짜 DB는 앱이 보낸 글에 보낸 사람 정보를 붙이지 않아서 목록에 나오게 붙여 줌)
  const [wu] = await rest(`users?id=eq.${W}`)
  await rest(`messages?id=eq.${sent[0]?.id}`, 'PATCH', { user: { id: W, name: wu.name, phone: wu.phone, photo_at: null, member_type: wu.member_type ?? 'worker' } })
  await a.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  const thread = a.locator(`a[href="/admin/chat/${W}"]`).first()
  await thread.waitFor({ timeout: 15000 }).catch(() => {})
  const tag = thread.locator('[data-inbox-tag]')
  ok("문의 목록: 그 근무자 줄에 '급여 문의' (빨강)", one(await tag.textContent().catch(() => '')) === '급여 문의' && (await tag.getAttribute('data-inbox-tag')) === 'urgent', one(await thread.textContent().catch(() => '')).slice(0, 80))
  ok('360px 옆으로 안 밀림 (관리자 문의 목록)', await noSide(a))
  await a.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  const aq = a.locator('[data-quick-lead], [data-quick-replies] button')
  await aq.first().waitFor({ timeout: 15000 }).catch(() => {})
  const replies = (await aq.allTextContents()).map(one)
  ok(`대화: 빠른 답장 첫 줄 '${SORRY}' · 날짜를 다시 알리는 답은 없음`, replies.includes(SORRY) && replies.indexOf(SORRY) <= 1 && !replies.some((r) => r.startsWith('정산 예정일은')), replies.slice(0, 4).join(' | '))
  ok('360px 옆으로 안 밀림 (관리자 대화)', await noSide(a))
  if (SHOTS) await a.locator('[data-quick-replies]').screenshot({ path: `${SHOTS}/admin-paylate-reply.png` }).catch(() => {})

  // ── 5. 지급 완료하면: 그 줄도 '정산일 지남' 표시도 사라짐
  await rest(`attendance?id=eq.${ATT2}`, 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await history()
  ok('지급 완료하면 정산일 줄 없음 · 다른 공고는 그대로', (await card(J2).locator('[data-payday-line]').count()) === 0 && (await card(J3).locator('[data-payday-line]').count()) === 1)
  ok("지급 완료하면 '정산일 지남' 없음", (await w.locator('[data-unpaid-late]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
