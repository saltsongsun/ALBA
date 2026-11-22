// 묶음 351 (정기 개선 2026-11-22 16:35 KST)
// · 전문가·외주 업체 홈: 대금 계좌가 비어 있으면 맨 위에 '대금 계좌를 등록해 주세요' 한 줄
//   - 받을 대금이 있으면 '받을 대금이 계좌를 기다려요' (빨강 · 금액은 위 칸에만) · 없으면 '회사가 대금을 바로 보낼 수 있어요'
//   - 누르면 내 정보의 계좌 칸으로 · 계좌가 있으면 안 보임 · 아르바이트·로그인 전에는 안 보임
// · 디자인: 전문가·외주 화면의 이모지를 선 아이콘으로 (가입 유형 줄 · 답할 견적 · 받을 대금 · 견적·대금 제목 · 지급명세서 줄)
// node scripts/qa/batch351.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099'
const V = '77777777-0000-4000-8000-000000003511', E = '77777777-0000-4000-8000-000000003512', V2 = '77777777-0000-4000-8000-000000003513'
const VR = '88888888-0000-4000-8000-000000003511'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const EMOJI = /[🎛🏢📄💸🧾🙋]/u

;(async () => {
  const now = new Date().toISOString()
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  const [w] = await rest(`users?id=eq.${W}`)
  const { attendance: _a, ratings: _r, ...wb } = w
  await rest('users', 'POST', { ...wb, id: V, name: '소리나라351', phone: '01035110001', member_type: 'vendor', bank_account_enc: null, created_at: now })
  await rest('users', 'POST', { ...wb, id: E, name: '김전문351', phone: '01035110002', member_type: 'expert', specialty: '음향', bank_account_enc: null, created_at: now })
  await rest('users', 'POST', { ...wb, id: V2, name: '계좌있는업체351', phone: '01035110003', member_type: 'vendor', bank_account_enc: 'enc:xxxx', created_at: now })
  // 소리나라351: 회사에 외주사로 등록돼 있고 아직 안 받은 대금 1,500,000원
  await rest('vendors', 'POST', { id: VR, company_id: C1, name: '소리나라351', category: '음향·조명', contact_name: '김대표', phone: '01035110001', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, user_id: V, created_at: now })
  await rest('vendor_payments', 'POST', { id: 'dddddddd-0000-4000-8000-0000000351c1', vendor_id: VR, company_id: C1, job_id: null, quote_id: null, title: '개막식 음향', amount: 1500000, vat_included: true, due_date: today, paid_at: null, invoice_at: null, memo: null, created_at: now })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const row = (p) => p.locator('[data-pro-account]')

  // ── 1. 외주 업체 · 계좌 없음 · 받을 대금 있음
  const v = await pg(V)
  await v.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  await row(v).waitFor({ timeout: 15000 }).catch(() => {})
  const t1 = one(await row(v).innerText().catch(() => ''))
  ok("외주: '대금 계좌를 등록해 주세요 · 받을 대금이 계좌를 기다려요 · 등록 →' (금액은 위 칸에만)", t1 === '대금 계좌를 등록해 주세요 받을 대금이 계좌를 기다려요 등록 →' && (await row(v).getAttribute('data-pro-account')) === 'due', t1)
  const sub = row(v).locator('span.block.truncate')
  ok('둘째 줄이 잘리지 않음 (360px)', await sub.evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false))
  const hero = await v.locator('[data-mode="pro"] > section').first().boundingBox().catch(() => null)
  const rb = await row(v).boundingBox().catch(() => null)
  ok('히어로 바로 아래 · 한 덩어리(높이 ≤ 84px) · 360px 옆으로 안 밀림', !!hero && !!rb && rb.y > hero.y + hero.height - 1 && rb.y - (hero.y + hero.height) < 40 && rb.height <= 84 && (await noSide(v)), JSON.stringify(rb))
  const kind = v.locator('[data-pro-kind]')
  ok("가입 유형 줄 '외주 업체' 선 아이콘 (이모지 없음)", one(await kind.innerText()) === '외주 업체' && (await kind.locator('svg').count()) === 1 && !EMOJI.test(await kind.innerText()))
  const payTitle = v.locator('h2', { hasText: '받을 대금' })
  ok("'받을 대금' 제목 선 아이콘", (await payTitle.count()) === 1 && (await payTitle.locator('svg').count()) === 1 && !EMOJI.test(await payTitle.innerText()))
  if (SHOTS) await v.screenshot({ path: `${SHOTS}/pro-account.png` }).catch(() => {})
  await row(v).click()
  await v.waitForURL((u) => u.pathname === '/me/profile', { timeout: 15000 }).catch(() => {})
  await v.locator('#bank_account').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  ok('누르면 내 정보 · 계좌 칸 주소로', new URL(v.url()).pathname === '/me/profile' && new URL(v.url()).hash === '#bank_account' && (await v.locator('#bank_account').count()) === 1, v.url())
  // 견적·대금 화면 제목도 선 아이콘
  await v.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  const moneyTitles = v.locator('h2.section-title')
  const titles = await moneyTitles.evaluateAll((els) => els.map((e) => ({ t: e.textContent.trim(), svg: !!e.querySelector('svg') })))
  ok("견적·대금 화면 제목 '견적 요청'·'대금' 선 아이콘", titles.length >= 1 && titles.every((x) => x.svg && !/[📄💸]/u.test(x.t)), JSON.stringify(titles))

  // ── 2. 전문가 · 계좌 없음 · 받을 대금 없음
  const e = await pg(E)
  await e.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  await row(e).waitFor({ timeout: 15000 }).catch(() => {})
  ok("전문가: '회사가 대금을 바로 보낼 수 있어요'", one(await row(e).innerText().catch(() => '')) === '대금 계좌를 등록해 주세요 회사가 대금을 바로 보낼 수 있어요 등록 →' && (await row(e).getAttribute('data-pro-account')) === '', one(await row(e).innerText().catch(() => '')))
  ok("가입 유형 줄 '전문가' 선 아이콘", one(await e.locator('[data-pro-kind]').innerText()) === '전문가' && (await e.locator('[data-pro-kind] svg').count()) === 1)
  await e.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  const slip = e.locator('[data-pro-payslip]')
  ok('지급명세서 줄 선 아이콘 (🧾 없음)', (await slip.count()) === 1 && (await slip.locator('svg').count()) === 1 && !(await slip.innerText()).includes('🧾'))
  ok('견적·대금 360px 옆으로 안 밀림', await noSide(e))

  // ── 3. 계좌가 있으면 · 아르바이트 · 로그인 전에는 안 보임
  const v2 = await pg(V2)
  await v2.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  ok('계좌가 있는 업체: 안 보임', (await row(v2).count()) === 0 && (await v2.locator('[data-pro-kind]').count()) === 1)
  const wk = await pg(W)
  await wk.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  ok('아르바이트 회원: 안 보임', (await row(wk).count()) === 0)
  const guest = await pg(null)
  await guest.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  const gk = guest.locator('[data-pro-kind]')
  ok("로그인 전: 안 보임 · '전문가 · 외주 업체' 선 아이콘", (await row(guest).count()) === 0 && one(await gk.innerText()) === '전문가 · 외주 업체' && (await gk.locator('svg').count()) === 1)

  // ── 4. 움직임 줄이기: 줄이 튀어나오지 않음
  const r = await pg(V, { reducedMotion: 'reduce' })
  await r.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  const dur = await row(r).evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로 보임', dur < 0.05, String(dur))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
