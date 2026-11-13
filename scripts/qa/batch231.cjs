// 묶음 231 (정기 개선 2026-11-13 10:39 KST)
// · 외주 업체 홈·견적·대금: 아직 이어진 회사가 없으면 '회사에 이 번호를 알려 주세요' (내 휴대폰 번호 크게 · 번호 복사 · 공유)
//   — 예전 안내 '이 번호나 사업자등록번호로 등록하면'은 틀린 말이라 바꿈 (회사 등록은 휴대폰 번호로만 이어짐)
//   이어진 회사가 있으면 'n개 회사에 외주사로 등록돼 있어요 · 회사 이름'
// · 외주 업체 홈 숫자(답할 견적 · 받을 대금): 처음 열 때 0에서 짧게 올라감 ('움직임 줄이기'면 바로)
// node scripts/qa/batch231.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', C1 = '99999999-0000-4000-8000-000000000099'
const P = '44444444-0000-4000-8000-0000000231a1', VP = '55555555-0000-4000-8000-0000000231b1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  const nowIso = new Date().toISOString()
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '소리나라', phone: '01023100001', member_type: 'vendor', created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const mk = async (opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(P), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const p = await mk()
  const open = async (path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('[data-mode="pro"] h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const share = p.locator('[data-partner-share]')

  // ── 1. 아직 이어진 회사가 없음: 회사에 알려 줄 번호
  await open('/pro')
  ok("홈: '회사에 이 번호를 알려 주세요' · 내 번호 010-2310-0001 크게", (await share.count()) === 1 && (await share.getByText('회사에 이 번호를 알려 주세요').count()) === 1 && one(await share.locator('[data-partner-phone]').innerText()) === '010-2310-0001')
  ok("'번호 복사' · '공유하기' 버튼 · '사업자등록번호만으로는 이어지지 않아요'", (await share.getByRole('button', { name: '번호 복사' }).count()) === 1 && (await share.getByRole('button', { name: '공유하기' }).count()) === 1 && (await share.getByText('사업자등록번호만으로는 이어지지 않아요').count()) === 1)
  ok("틀린 예전 안내('이 번호나 사업자등록번호로') 없음", !(await p.locator('main').innerText()).includes('사업자등록번호로 외주사를 등록'))
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await share.getByRole('button', { name: '번호 복사' }).click()
  ok("복사하면 '복사됨 ✓'", await share.getByText('복사됨 ✓').first().waitFor({ timeout: 3000 }).then(() => true, () => false))
  ok('360px 옆으로 안 밀림 (홈)', await noSide(p))
  if (SHOTS) {
    const bx = await share.boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/partner-share.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(bx.height + 16, 400) } }).catch(() => {})
  }
  await open('/pro/money')
  const empty = p.locator('[data-pro-money-empty]')
  ok("견적·대금: '아직 받은 견적·대금이 없어요' + 알려 줄 번호 (틀린 안내 없음)", (await empty.locator('[data-partner-share]').count()) === 1 && (await empty.getByText('아직 받은 견적·대금이 없어요').count()) === 1 && !(await empty.innerText()).includes('업체는 사업자등록번호'))

  // ── 2. 회사가 이 번호로 등록함: 어느 회사에 등록됐는지
  const vbase = { company_id: C1, category: '음향·조명', contact_name: '김대표', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: nowIso }
  await rest('vendors', 'POST', { ...vbase, id: VP, name: '소리나라', phone: '01023100001', user_id: P })
  await open('/pro')
  const linked = p.locator('[data-partner-linked]')
  ok("홈: 번호 카드 대신 '답할 견적 요청이 없어요 · 1개 회사에 외주사로 등록돼 있어요 · 주식회사 테스트'", (await share.count()) === 0 && (await p.getByText('답할 견적 요청이 없어요').count()) === 1 && one(await linked.innerText().catch(() => '')) === '1개 회사에 외주사로 등록돼 있어요 · 주식회사 테스트')
  await open('/pro/money')
  ok('견적·대금: 등록된 회사 이름 (번호 카드 없음)', (await share.count()) === 0 && one(await p.locator('[data-partner-linked]').innerText().catch(() => '')).includes('주식회사 테스트'))

  // ── 3. 홈 숫자가 0에서 올라감 (받을 대금 150만 원)
  await rest('vendor_payments', 'POST', { id: 'dddddddd-0000-4000-8000-0000000231c1', vendor_id: VP, company_id: C1, job_id: null, quote_id: null, title: '개막식 음향', amount: 1500000, vat_included: true, due_date: today, paid_at: null, invoice_at: null, memo: null, created_at: nowIso })
  await p.goto(`${D}/pro`, { waitUntil: 'domcontentloaded' })
  const money = p.locator('[data-mode="pro"] [data-value="1500000"]').first()
  await money.waitFor({ timeout: 15000 }).catch(() => {})
  const early = Number((await money.innerText().catch(() => '0')).replace(/\D/g, ''))
  await p.waitForTimeout(1200)
  const late = one(await money.innerText().catch(() => ''))
  ok("받을 대금이 0에서 올라가 '1,500,000'에서 멈춤", early < 1500000 && late === '1,500,000', `${early} → ${late}`)
  const r = await mk({ reducedMotion: 'reduce' })
  await r.goto(`${D}/pro`, { waitUntil: 'domcontentloaded' })
  const rm = r.locator('[data-mode="pro"] [data-value="1500000"]').first()
  await rm.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'움직임 줄이기'면 처음부터 1,500,000", one(await rm.innerText().catch(() => '')) === '1,500,000')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
