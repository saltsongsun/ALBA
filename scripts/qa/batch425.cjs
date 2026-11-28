// 묶음 425 (정기 개선 2026-11-28 13:36 KST)
// 기능 · 견적 비교 화면: 아직 견적을 안 낸 '앱 연결' 업체에게 한 번에 다시 알리기
//   · 버튼 글자에 몇 곳에 가는지 ('앱 연결 n곳에 다시 알리기') · 문자만 되는 업체·쉬는 업체·이미 낸 업체는 빼고 셈
//   · 누르면 그 업체 계정에만 알림 1건 (이 회사 이름으로) · 10분 안에 또 누르면 막음 · 15분 전 알림은 막지 않음
//   · 마감한 요청에는 버튼 없음 · 남의 회사 요청 id로 서버에 직접 보내도 알림 안 감
//   · 앱에 연결된 업체 카드에 '앱 연결' 표시
// 디자인 · 결과 한 줄이 0.25초 톡 (움직임 줄이기면 없음) · 360px 옆 스크롤 없음
// node scripts/qa/batch425.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000425'
const id = (k) => `42500000-0000-4000-8000-0000000000${k}`
const [PU1, PU3, PU4, PU5] = [id('e1'), id('e3'), id('e4'), id('e5')]
const [V1, V2, V3, V4, V5] = [id('a1'), id('a2'), id('a3'), id('a4'), id('a5')]
const [R1, R2, R4] = [id('b1'), id('b2'), id('b4')]
const TITLE = '무대 음향 425'
const HEAD = '📄 견적 다시 알림'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, list) =>
  p.evaluate(
    async ({ id, list }) => {
      const body = new FormData()
      body.append('0', JSON.stringify(list))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.status
    },
    { id: idOf(file, name), list },
  )
const reminds = async (uid) => ((await rest(`messages?thread_user_id=eq.${uid}`)) ?? []).filter((m) => (m.body ?? '').startsWith(HEAD) && m.created_at > ago(0.1))

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사425', join_code: 'ISO425', seal_image: null, created_at: ago(5) })
  const [wRow] = await rest(`users?id=eq.${W}`)
  for (const [u, n, ph] of [[PU1, '음향하나 사장', '01042500101'], [PU3, '쉬는업체 사장', '01042500103'], [PU4, '격리업체 사장', '01042500104'], [PU5, '낸업체 사장', '01042500105']])
    await rest('users', 'POST', { ...wRow, id: u, name: n, phone: ph, attendance: [], ratings: [], bank_account_enc: null, created_at: ago(200) })
  const vb = { contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(96) }
  await rest('vendors', 'POST', { ...vb, id: V1, company_id: C1, user_id: PU1, name: '음향하나425', category: '음향', phone: '01042500001' })
  await rest('vendors', 'POST', { ...vb, id: V2, company_id: C1, user_id: null, name: '문자만425', category: '음향', phone: '01042500002' })
  await rest('vendors', 'POST', { ...vb, id: V3, company_id: C1, user_id: PU3, name: '쉬는업체425', category: '음향', phone: '01042500003', active: false })
  await rest('vendors', 'POST', { ...vb, id: V5, company_id: C1, user_id: PU5, name: '낸업체425', category: '음향', phone: '01042500005' })
  await rest('vendors', 'POST', { ...vb, id: V4, company_id: C2, user_id: PU4, name: '격리업체425', category: '무대', phone: '01042500004' })
  const rb = { details: '내용425', due_date: null, job_id: null, created_by: A, created_at: ago(30) }
  await rest('quote_requests', 'POST', { ...rb, id: R1, company_id: C1, title: TITLE, status: 'open' })
  await rest('quote_requests', 'POST', { ...rb, id: R2, company_id: C1, title: '마감한 요청 425', status: 'closed' })
  await rest('quote_requests', 'POST', { ...rb, id: R4, company_id: C2, title: '격리 요청 425', status: 'open' })
  const wait = { status: 'requested', vat_included: true, submitted_by: null, submitted_at: null, note: null, amount: null }
  await rest('quotes', 'POST', { ...wait, id: id('c1'), request_id: R1, vendor_id: V1, token: 'tok425a1' })
  await rest('quotes', 'POST', { ...wait, id: id('c2'), request_id: R1, vendor_id: V2, token: 'tok425a2' })
  await rest('quotes', 'POST', { ...wait, id: id('c3'), request_id: R1, vendor_id: V3, token: 'tok425a3' })
  await rest('quotes', 'POST', { ...wait, id: id('c5'), request_id: R1, vendor_id: V5, token: 'tok425a5', status: 'submitted', amount: 500000, submitted_by: 'vendor', submitted_at: ago(2) })
  await rest('quotes', 'POST', { ...wait, id: id('c6'), request_id: R2, vendor_id: V1, token: 'tok425a6' })
  await rest('quotes', 'POST', { ...wait, id: id('c4'), request_id: R4, vendor_id: V4, token: 'tok425a4' })
  // 15분 전에 보낸 다시 알림 (10분이 지났으니 막지 않아야 함)
  await rest('messages', 'POST', { thread_user_id: PU1, sender_id: null, from_admin: true, company_id: C1, job_id: null, body: `${HEAD}\n옛 알림 · ${TITLE}`, created_at: ago(0.25) })

  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid, { company = null, reduce = false } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const card = (p, name) => p.locator('div.card', { has: p.locator(`a:text-is("${name}")`) }).first()

  // ── 1. 버튼: 앱 연결 + 쉬지 않음 + 아직 안 낸 업체만 셈
  const a = await ctxOf(A, { company: C1 })
  await a.goto(`${D}/admin/vendors/requests/${R1}`, { waitUntil: 'networkidle' })
  await a.waitForFunction(() => !!document.querySelector('[data-quote-remind]'), null, { timeout: 15000 }).catch(() => {})
  const btnT = one(await a.locator('[data-quote-remind] button').innerText().catch(() => ''))
  ok("버튼 '앱 연결 1곳에 다시 알리기' (문자만·쉬는·이미 낸 업체는 셈에서 빠짐)", btnT === '앱 연결 1곳에 다시 알리기', btnT)
  const marks = { v1: await card(a, '음향하나425').locator('[data-quote-app]').count(), v2: await card(a, '문자만425').locator('[data-quote-app]').count() }
  ok("'앱 연결' 표시: 연결된 업체 카드에만", marks.v1 === 1 && marks.v2 === 0, JSON.stringify(marks))
  ok('360px 옆 스크롤 없음', await noSide(a))

  // ── 2. 누르면 그 업체 계정에만 알림 1건 + 결과 한 줄 톡
  await a.locator('[data-quote-remind] button').click()
  await a.waitForFunction(() => !!document.querySelector('[data-quote-reminded]'), null, { timeout: 15000 }).catch(() => {})
  const said = await a.locator('[data-quote-reminded]').evaluate((e) => ({ t: e.textContent.trim(), a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration })).catch(() => null)
  ok("결과 '✓ 1곳에 앱으로 다시 알렸어요.' + 0.25초 톡", said?.t === '✓ 1곳에 앱으로 다시 알렸어요.' && said.a === 'pop' && parseFloat(said.d) === 0.25, JSON.stringify(said))
  const m1 = await reminds(PU1)
  ok('음향하나 계정에 새 알림 1건 · 이 회사 · 요청 이름 들어감', m1.length === 1 && m1[0].company_id === C1 && m1[0].body.includes(TITLE) && m1[0].body.includes('아직 견적이 오지 않았어요'), JSON.stringify(m1.map((m) => [m.company_id, m.body.slice(0, 60)])))
  const others = { pu3: (await reminds(PU3)).length, pu5: (await reminds(PU5)).length, pu4: (await reminds(PU4)).length }
  ok('쉬는 업체·이미 낸 업체·남의 회사 업체에는 안 감', others.pu3 === 0 && others.pu5 === 0 && others.pu4 === 0, JSON.stringify(others))
  if (SHOTS) { await a.locator('[data-quote-remind]').scrollIntoViewIfNeeded(); await a.evaluate(() => scrollBy(0, -120)); await a.waitForTimeout(300); await a.screenshot({ path: `${SHOTS}/425-quote-remind.png` }) }

  // ── 3. 10분 안에 또 누르면 막음
  await a.locator('[data-quote-remind] button').click()
  await a.waitForFunction(() => document.querySelector('[data-quote-reminded]')?.textContent.includes('방금'), null, { timeout: 15000 }).catch(() => {})
  const again = one(await a.locator('[data-quote-reminded]').innerText().catch(() => ''))
  ok("또 누르면 '방금 알렸어요. 10분 뒤에 다시 보낼 수 있어요.' · 알림 늘지 않음", again === '방금 알렸어요. 10분 뒤에 다시 보낼 수 있어요.' && (await reminds(PU1)).length === 1, again)

  // ── 4. 마감한 요청에는 버튼 없음
  await a.goto(`${D}/admin/vendors/requests/${R2}`, { waitUntil: 'networkidle' })
  const closedOk = (await a.locator('main').innerText()).includes('마감한 요청 425')
  ok('마감한 요청: 다시 알리기 버튼 없음', closedOk && (await a.locator('[data-quote-remind]').count()) === 0)
  const forgedClosed = await call(a, 'vendor', 'remindQuoteVendors', [R2, null])
  ok('서버에 직접: 마감한 요청은 안 감', (await reminds(PU1)).length === 1, String(forgedClosed))

  // ── 5. 남의 회사 요청 id로 서버에 직접 보내도 안 감
  const h = await a.content()
  const forged = await call(a, 'vendor', 'remindQuoteVendors', [R4, null])
  await a.waitForTimeout(300)
  ok('서버에 직접: 남의 회사 요청은 알림 안 감', (await reminds(PU4)).length === 0 && !h.includes('격리 요청 425'), String(forged))

  // ── 6. 알바생 계정은 쓸 수 없음
  const w = await ctxOf(W)
  await w.goto(`${D}/`, { waitUntil: 'networkidle' })
  await rest(`messages?thread_user_id=eq.${PU1}`, 'PATCH', { created_at: ago(1) })
  await call(w, 'vendor', 'remindQuoteVendors', [R1, null])
  await w.waitForTimeout(300)
  ok('알바생 계정으로 보내도 알림 안 감', (await reminds(PU1)).length === 0)

  // ── 7. 움직임 줄이기
  const r = await ctxOf(A, { company: C1, reduce: true })
  await r.goto(`${D}/admin/vendors/requests/${R1}`, { waitUntil: 'networkidle' })
  await r.locator('[data-quote-remind] button').click()
  await r.waitForFunction(() => !!document.querySelector('[data-quote-reminded]'), null, { timeout: 15000 }).catch(() => {})
  const ra = await r.locator('[data-quote-reminded]').evaluate((e) => getComputedStyle(e).animationName).catch(() => 'missing')
  ok('움직임 줄이기: 톡 없음', ra === 'none', ra)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch425: ${fails} FAIL` : '== batch425: ALL PASS')
})()
