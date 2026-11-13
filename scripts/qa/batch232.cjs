// 묶음 232 (정기 개선 2026-11-13 11:36 KST)
// · 견적·대금 금액 칸 (업체 견적 링크 · 받은 견적 기록 · 대금 지급 건): 부가세 포함/별도에 따라 한 줄로 바로 계산
//   포함 → '공급가 1,363,636원 + 부가세 136,364원' · 별도 → '부가세 150,000원 더해 합계 1,650,000원' (고를 때마다 톡)
//   화면 안내만 — 저장하는 금액·부가세 여부는 그대로
// · 외주사 등록: 연락처 아래 '업체가 해피워크에 가입한 휴대폰 번호면 견적 요청이 앱으로도 가요'
//   등록·저장할 때 가입한 업체 계정과 이어지면 안내에 '📱 … 앱으로도 가요'
// node scripts/qa/batch232.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', P = '44444444-0000-4000-8000-0000000232a1'
const V = '55555555-0000-4000-8000-0000000232b1', R = '66666666-0000-4000-8000-0000000232c1', Q = '77777777-0000-4000-8000-0000000232d1', TOK = 'tok232aaaaaaaaaaaaaaaaaaaaaa'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  const nowIso = new Date().toISOString()
  const vbase = { company_id: C1, category: '음향·조명', contact_name: '김대표', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, user_id: null, created_at: nowIso }
  await rest('vendors', 'POST', { ...vbase, id: V, name: '한빛음향', phone: '01050002321' })
  await rest('quote_requests', 'POST', { id: R, company_id: C1, title: '메인 무대 음향 2일', details: '메인 스피커 4조', due_date: kst(2), job_id: J, status: 'open', created_by: A, created_at: nowIso })
  await rest('quotes', 'POST', { id: Q, request_id: R, vendor_id: V, token: TOK, status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, submitted_by: null, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 업체 견적 링크: 금액 + 부가세 한 줄
  const v = await mk(null)
  await v.goto(`${D}/quote/${TOK}`, { waitUntil: 'networkidle' })
  const amount = v.locator('input[name=amount]')
  await amount.waitFor({ timeout: 15000 }).catch(() => {})
  await amount.pressSequentially('1500000', { delay: 10 })
  const line = v.locator('[data-vat-line]')
  ok("쓰는 대로 '1,500,000원 · 150만 원'", one(await v.locator('[data-amount-read]').innerText().catch(() => '')) === '1,500,000원 · 150만 원')
  ok("부가세 포함(기본): '공급가 1,363,636원 + 부가세 136,364원'", (await line.getAttribute('data-vat-line')) === 'included' && one(await line.innerText()) === '공급가 1,363,636원 + 부가세 136,364원', one(await line.innerText().catch(() => '')))
  await v.locator('label', { hasText: '부가세 별도' }).click()
  await v.waitForTimeout(150)
  ok("부가세 별도: '부가세 150,000원 더해 합계 1,650,000원' · 톡", (await line.getAttribute('data-vat-line')) === 'excluded' && one(await line.innerText()) === '부가세 150,000원 더해 합계 1,650,000원' && ((await line.getAttribute('class')) ?? '').includes('animate-pop'), one(await line.innerText().catch(() => '')))
  ok('360px 옆으로 안 밀림 (견적 링크)', await noSide(v))
  if (SHOTS) {
    const bx = await v.locator('form').first().boundingBox()
    if (bx) await v.screenshot({ path: `${SHOTS}/quote-vat.png`, clip: { x: 0, y: Math.max(0, bx.y - 50), width: 360, height: Math.min(bx.height + 60, 520) } }).catch(() => {})
  }
  await v.getByRole('button', { name: '견적 보내기' }).click()
  await v.waitForTimeout(1500)
  const [q] = await rest(`quotes?id=eq.${Q}`)
  ok('보낸 값은 그대로: 1,500,000원 · 부가세 별도', q?.amount === 1500000 && q?.vat_included === false && q?.status === 'submitted', JSON.stringify({ a: q?.amount, v: q?.vat_included, s: q?.status }))

  // ── 2. 외주사 등록: 휴대폰 번호 안내 · 가입한 업체와 이어지면 알려 줌
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '소리나라', phone: '01023200001', member_type: 'vendor', created_at: nowIso })
  const a = await mk(A)
  await a.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  await a.getByText('＋ 외주사 등록').first().click().catch(() => {})
  const f = a.locator('form', { hasText: '외주사 등록' })
  await f.locator('input[name=name]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("연락처 아래 '업체가 해피워크에 가입한 휴대폰 번호면 견적 요청이 앱으로도 가요'", one(await f.locator('[data-vendor-phone-hint]').innerText().catch(() => '')) === '업체가 해피워크에 가입한 휴대폰 번호면 견적 요청이 앱으로도 가요')
  await f.locator('input[name=name]').fill('소리나라')
  await f.locator('input[name=category]').fill('음향·조명')
  await f.locator('input[name=phone]').fill('010-2320-0001')
  await f.getByRole('button', { name: '외주사 등록' }).click()
  const linked = await a.getByText('소리나라을(를) 외주사로 등록했어요 · 📱 해피워크 가입 업체라 견적 요청이 앱으로도 가요.').first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  const row = ((await rest('vendors')) ?? []).find((x) => x.name === '소리나라')
  ok("가입한 업체 번호로 등록: '📱 해피워크 가입 업체라 견적 요청이 앱으로도 가요' · 계정과 이어짐", linked && row?.user_id === P, row?.user_id)
  await a.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  await a.getByText('＋ 외주사 등록').first().click().catch(() => {})
  await f.locator('input[name=name]').fill('두리렌탈')
  await f.locator('input[name=category]').fill('장비·렌탈')
  await f.locator('input[name=phone]').fill('010-2320-0099')
  await f.getByRole('button', { name: '외주사 등록' }).click()
  const plain = await a.getByText('두리렌탈을(를) 외주사로 등록했어요.').first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  ok("가입 안 한 번호: 안내는 전과 같음 ('…등록했어요.')", plain && !(await a.getByText('두리렌탈을(를) 외주사로 등록했어요 · 📱').count()))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
