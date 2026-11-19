// 묶음 319 (정기 개선 2026-11-20 00:35 KST)
// · 전문가 홈(/pro): 모집 중인 전문가 의뢰가 없을 때 알림을 안 켠 전문가에게 '휴대폰 알림 받기 · 새 의뢰·확정을 바로 알려요' 카드 (근무자 홈과 같게)
//   외주 업체·로그인 전에는 없음
// · 전문가·외주 업체 홈 위 '답할 견적 · 받을 대금' 두 칸: 0인 칸은 흐리게 (할 일이 있는 칸만 또렷하게)
// node scripts/qa/batch319.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011', C1 = '99999999-0000-4000-8000-000000000099'
const E = '33333333-0000-4000-8000-0000000319e1', V = '33333333-0000-4000-8000-0000000319e2', VE = 'ffffffff-0000-4000-8000-0000000319a1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [u] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: E, name: '김전문', phone: '01031903191', member_type: 'expert', photo_at: new Date().toISOString(), created_at: '2026-10-20T00:00:00Z' })
  await rest('users', 'POST', { ...ub, id: V, name: '두리렌탈', phone: '01031903192', member_type: 'vendor', created_at: '2026-10-20T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {}
      // 알림을 켤 수 있는 휴대폰처럼 (권한 아직 안 물음 · 시험용 브라우저는 기본이 '거부')
      try { Object.defineProperty(Notification, 'permission', { get: () => 'default' }) } catch {}
    })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const tile = (p, k) => p.locator(`[data-pro-tile="${k}"]`)

  // ── 1. 전문가: 의뢰 없음 → 알림 받기 카드 · 0인 칸은 흐리게
  const e = await mk(E)
  await e.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  const card = e.locator('.card', { hasText: '휴대폰 알림 받기' })
  await card.first().waitFor({ timeout: 5000 }).catch(() => {})
  ok("의뢰 없음 아래 '휴대폰 알림 받기 · 새 의뢰·확정을 바로 알려요' + 켜기 버튼", (await card.count()) === 1 && one(await card.innerText()).includes('새 의뢰·확정을 바로 알려요') && (await card.locator('button').count()) === 1)
  ok("'지금 모집 중인 전문가 의뢰가 없어요' 안내는 그대로", (await e.getByText('지금 모집 중인 전문가 의뢰가 없어요').count()) === 1)
  ok("'답할 견적 0건' · '받을 대금 0원' 칸은 흐리게", (await tile(e, 'quotes').getAttribute('data-zero')) === '' && (await tile(e, 'pay').getAttribute('data-zero')) === '' && (await tile(e, 'quotes').locator('.text-white\\/45').count()) === 1)
  ok('360px 옆으로 안 밀림 (전문가 홈)', await noSide(e))
  if (SHOTS) await e.screenshot({ path: `${SHOTS}/pro-expert-empty.png` })

  // ── 2. 받을 대금이 생기면 그 칸만 또렷하게
  await rest('vendors', 'POST', { id: VE, company_id: C1, name: '김전문', phone: '01031903191', category: '음향·조명', contact_name: '김전문', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, user_id: E, created_at: new Date().toISOString() })
  await rest('vendor_payments', 'POST', { id: 'dddddddd-0000-4000-8000-0000000319b1', vendor_id: VE, company_id: C1, job_id: null, quote_id: null, title: '무대 음향', amount: 500000, vat_included: true, due_date: kday(), paid_at: null, invoice_at: null, memo: null, created_at: new Date().toISOString() })
  await e.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  await e.waitForTimeout(900)
  ok("받을 대금이 있으면 그 칸은 또렷하게 (500,000원) · 답할 견적 0건은 그대로 흐림", (await tile(e, 'pay').getAttribute('data-zero')) === null && one(await tile(e, 'pay').innerText()).includes('500,000원') && (await tile(e, 'quotes').getAttribute('data-zero')) === '')
  if (SHOTS) await e.locator('[data-pro-tile]').first().locator('xpath=..').screenshot({ path: `${SHOTS}/pro-tiles.png` }).catch(() => {})

  // ── 3. 외주 업체: 의뢰 칸이 없으니 알림 카드도 없음 · 0인 칸 흐림
  const v = await mk(V)
  await v.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  await v.waitForTimeout(800)
  ok('외주 업체: 의뢰 목록·알림 받기 카드 없음 · 0인 칸 흐림', (await v.getByText('모집 중인 전문가 의뢰').count()) === 0 && (await v.locator('.card', { hasText: '휴대폰 알림 받기' }).count()) === 0 && (await tile(v, 'quotes').getAttribute('data-zero')) === '')
  // ── 4. 로그인 전: 알림 카드 없음
  const g = await mk(null)
  await g.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  ok('로그인 전: 알림 받기 카드 없음', (await g.locator('.card', { hasText: '휴대폰 알림 받기' }).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
