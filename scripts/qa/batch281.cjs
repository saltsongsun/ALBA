// 묶음 281 (정기 개선 2026-11-17 02:36 KST)
// · 외주 업체 '견적·대금': 지급일이 지난 대금 줄 '지급 예정 M/D · 물어보기 ›'
//   → 그 회사 문의함 + 빠른 답장 맨 앞에 '대금 지급일이 지났어요. 확인 부탁드려요. 개막식 음향 · 1,500,000원 (지급 예정 M/D(요일))'
//   보낸 뒤엔 '✓ 물어봄 ›' (같은 글을 또 보내지 않게 · 누르면 그 회사 문의함에서 답 보기)
// · 지급일 전 · 지급 끝난 대금 · 다른 회사 대금 번호 · 근무자: 물어보기 없음 / 글이 안 채워짐
// · 회사 관리자 문의 대화: 그 글에 '확인해 보고 오늘 안에 알려 드릴게요.' 같은 빠른 답장 · 문의 목록 '대금 문의' 표시
// · 계산서 줄은 회색 문장 + 강조색 '알리기 ›' (같은 주황 문장 되풀이 없이)
// node scripts/qa/batch281.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000028102'
const P = 'bbbbbbbb-0000-4000-8000-000000028101', VP1 = '77777777-0000-4000-8000-000000028111', VP2 = '77777777-0000-4000-8000-000000028112'
const PAY1 = 'dddddddd-0000-4000-8000-0000002811b1', PAY2 = 'dddddddd-0000-4000-8000-0000002811b2', PAY3 = 'dddddddd-0000-4000-8000-0000002811b3', PAY4 = 'dddddddd-0000-4000-8000-0000002811b4'
const HEAD = '대금 지급일이 지났어요. 확인 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const md = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(`${s}T00:00:00Z`).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString(), today = kstDay(Date.now()), late = kstDay(Date.now() - 3 * 864e5), soon = kstDay(Date.now() + 5 * 864e5)
  const ASK = `${HEAD} 개막식 음향 · 1,500,000원 (지급 예정 ${md(late)})`
  const vbase = { company_id: C1, category: '음향', contact_name: null, business_no: null, bank_name: null, account_no: null, account_holder: null, memo: null, active: true, created_at: nowIso, user_id: null }
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '울림사운드', phone: '01028100001', member_type: 'vendor', created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP1, name: '울림사운드', phone: '01028100001', user_id: P })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '이백팔십일기획', seal_image: null, created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP2, company_id: C2, name: '울림사운드', phone: '01028100001', user_id: P })
  const pay = { company_id: C1, vendor_id: VP1, job_id: null, quote_id: null, vat_included: true, paid_at: null, invoice_at: null, memo: null, created_at: nowIso }
  await rest('vendor_payments', 'POST', { ...pay, id: PAY1, title: '개막식 음향', amount: 1500000, due_date: late })
  await rest('vendor_payments', 'POST', { ...pay, id: PAY2, title: '폐막식 음향', amount: 700000, due_date: soon })
  await rest('vendor_payments', 'POST', { ...pay, id: PAY3, title: '리허설 음향', amount: 300000, due_date: late, paid_at: nowIso, invoice_at: late })
  await rest('vendor_payments', 'POST', { ...pay, id: PAY4, vendor_id: VP2, company_id: C2, title: '체육대회 음향', amount: 800000, due_date: late })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const as = async (u) => { await ctx.clearCookies(); await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }]) }
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const row = (title) => p.locator(`[data-pay-row="${title}"]`)

  // ── 1. 업체 '견적·대금': 지급일 지난 줄에만 '물어보기 ›'
  await as(P)
  await p.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  const ask1 = row('개막식 음향').locator('[data-paydue-ask="new"]')
  ok("지급일 지난 대금: '물어보기 ›' → 그 회사 문의함 (이 대금)", one(await ask1.textContent().catch(() => '')) === '물어보기 ›' && (await ask1.getAttribute('href').catch(() => '')) === `/me/chat?co=${C1}&ask=paydue&pay=${PAY1}`)
  ok('다른 회사 대금도 각자', (await row('체육대회 음향').locator('[data-paydue-ask="new"]').getAttribute('href').catch(() => '')) === `/me/chat?co=${C2}&ask=paydue&pay=${PAY4}`)
  ok('지급일 전 · 지급 끝난 대금은 물어보기 없음', (await row('폐막식 음향').count()) === 1 && (await row('폐막식 음향').locator('[data-paydue-ask]').count()) === 0 && (await row('리허설 음향').locator('[data-paydue-ask]').count()) === 0)
  const dateLine = one(await ask1.locator('xpath=..').textContent().catch(() => ''))
  const fits = (loc) => loc.locator('xpath=..').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width <= el.clientWidth + 1 && el.getBoundingClientRect().height < 24 }).catch(() => false)
  ok(`날짜 줄 '지급 예정 ${md(late)} · 물어보기 ›' 한 줄 · 잘리지 않음`, dateLine === `지급 예정 ${md(late)} · 물어보기 ›` && (await fits(ask1)), dateLine)
  const need = row('개막식 음향').locator('[data-invoice="need"]')
  const needCol = await need.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.querySelector('span')).color]).catch(() => [])
  ok("계산서 줄: 글은 그대로 · 문장은 회색, '알리기 ›'만 강조색", one(await need.textContent().catch(() => '')) === '세금계산서 발행 필요 · 알리기 ›' && needCol.length === 2 && needCol[0] !== needCol[1] && needCol[1] === 'rgb(106, 63, 232)', needCol.join(' / '))
  ok('360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) {
    await row('개막식 음향').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await row('개막식 음향').locator('xpath=..').screenshot({ path: `${SHOTS}/pro-money-paydue.png` }).catch(() => {})
  }

  // ── 2. 누르면 그 회사 문의함 + 준비된 글 → 보냄
  await Promise.all([p.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {}), ask1.click()])
  await p.waitForLoadState('networkidle')
  const chips = p.locator('[data-quick-replies] button')
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok(`빠른 답장 맨 앞 '${ASK}'`, one(await chips.first().textContent().catch(() => '')).endsWith(ASK), one(await chips.first().textContent().catch(() => '')))
  ok('360px 옆으로 안 밀림 (문의함)', await noSide(p))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/paydue-chat.png` }).catch(() => {})
  await chips.first().click()
  await p.locator('textarea').first().press('Enter')
  await p.waitForTimeout(1500)
  const sent = (await rest(`messages?thread_user_id=eq.${P}`)).filter((m) => m.body === ASK)
  ok('그 회사(주식회사 테스트) 문의함으로 보내짐', sent.length === 1 && sent[0].company_id === C1, JSON.stringify(sent.map((m) => m.company_id)))
  await p.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  const asked = row('개막식 음향').locator('[data-paydue-ask="asked"]')
  ok("보낸 뒤 '✓ 물어봄 ›' → 그 회사 문의함 · 한 줄 · 다른 회사 대금은 그대로", one(await asked.textContent().catch(() => '')) === '✓ 물어봄 ›' && (await fits(asked)) && (await asked.getAttribute('href').catch(() => '')) === `/me/chat?co=${C1}` && (await row('체육대회 음향').locator('[data-paydue-ask="new"]').count()) === 1)

  if (SHOTS) {
    await row('개막식 음향').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await row('개막식 음향').locator('xpath=..').screenshot({ path: `${SHOTS}/pro-money-asked.png` }).catch(() => {})
  }

  // ── 3. 지급일 전 대금 · 다른 회사 대금 번호 · 근무자: 글이 안 채워짐
  await p.goto(`${D}/me/chat?co=${C1}&ask=paydue&pay=${PAY2}`, { waitUntil: 'networkidle' })
  ok('지급일 전 대금 번호로는 글이 안 채워짐', (await p.locator('[data-quick-replies] button', { hasText: HEAD }).count()) === 0)
  await p.goto(`${D}/me/chat?co=${C1}&ask=paydue&pay=${PAY4}`, { waitUntil: 'networkidle' })
  ok('다른 회사 대금 번호로는 글이 안 채워짐', (await p.locator('[data-quick-replies] button', { hasText: HEAD }).count()) === 0)
  await as(W)
  await p.goto(`${D}/me/chat?co=${C2}&ask=paydue&pay=${PAY4}`, { waitUntil: 'networkidle' })
  ok('외주사가 아닌 근무자는 글이 안 채워짐', (await p.locator('[data-quick-replies] button', { hasText: HEAD }).count()) === 0)

  // ── 4. 회사 관리자: 문의 목록 '대금 문의' · 대화에 알맞은 빠른 답장
  await as(A)
  // (가짜 DB는 앱이 보낸 글에 보낸 사람 정보를 붙이지 않아서 목록에 나오게 붙여 줌)
  await rest(`messages?id=eq.${sent[0].id}`, 'PATCH', { user: { id: P, name: '울림사운드', phone: '01028100001', photo_at: null, member_type: 'vendor' } })
  await p.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  const thread = p.locator(`a[href="/admin/chat/${P}"]`).first()
  ok("문의 목록: 그 업체 줄에 '대금 문의'", one(await thread.textContent().catch(() => '')).includes('대금 문의'), one(await thread.textContent().catch(() => '')).slice(0, 80))
  await p.goto(`${D}/admin/chat/${P}`, { waitUntil: 'networkidle' })
  const reply = p.locator('[data-quick-replies] button', { hasText: '확인해 보고 오늘 안에 알려 드릴게요.' })
  await reply.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("대화: 빠른 답장 '확인해 보고 오늘 안에 알려 드릴게요.' · '늦어서 죄송해요. 이번 주 안에 지급할게요.'", (await reply.count()) === 1 && (await p.locator('[data-quick-replies] button', { hasText: '이번 주 안에 지급할게요.' }).count()) === 1)
  ok('관리자 화면 360px 옆으로 안 밀림', await noSide(p))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
