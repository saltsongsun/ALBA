// 묶음 423 (정기 개선 2026-11-28 09:36 KST)
// 기능 · 업체가 없는 새 회사 견적 탭: 내 다른 회사(대표·관리자) 업체가 있으면 '내 다른 회사 업체 가져오기 · n곳' 버튼
//   → 업체 탭 '내 다른 회사 업체 가져오기' 칸이 펼쳐진 채로 + 테두리 한 번 (거래 중지·남의 회사 업체는 세지 않음 · 견적 탭 화면 자료에 업체 이름 없음)
//   · 그 회사만 맡은 관리자에게는 버튼 없음
// 기능 · 외주사 화면 '계좌: 미등록 · 계좌 넣기 ›' → '정보 수정'이 펼쳐진 채로 + 테두리 한 번 → 계좌를 넣어 저장하면 링크가 사라짐
// 디자인 · 외주사 화면 받은 견적·지급 완료·미지급 숫자가 처음 열 때 올라감 (움직임 줄이기면 바로) · 버튼 0.25초 톡 · 360px 옆 스크롤 없음
// node scripts/qa/batch423.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000425', C3 = '99999999-0000-4000-8000-000000000426', C5 = '99999999-0000-4000-8000-000000000427'
const M = '42300000-0000-4000-8000-000000000001', N = '42300000-0000-4000-8000-000000000002'
const V1 = '42300000-0000-4000-8000-0000000000a1', V2 = '42300000-0000-4000-8000-0000000000a2', V2X = '42300000-0000-4000-8000-0000000000a3', V3 = '42300000-0000-4000-8000-0000000000a4'
const V5 = '42300000-0000-4000-8000-0000000000a5'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사423', join_code: 'ISO425', seal_image: null, created_at: ago(50) })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '남의회사423', join_code: 'ISO426', seal_image: null, created_at: ago(50) })
  await rest('companies', 'POST', { ...c1, id: C5, company_name: '새회사423', join_code: 'ISO427', seal_image: null, created_at: ago(2) })
  await rest('users', 'POST', { ...a1, id: M, name: '두회사관리자423', phone: '01042300091', is_super: false })
  await rest('users', 'POST', { ...a1, id: N, name: '새회사만423', phone: '01042300092', is_super: false })
  await rest('company_members', 'POST', { company_id: C5, user_id: M, role: 'owner', created_at: ago(2) })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'admin', created_at: ago(40) })
  await rest('company_members', 'POST', { company_id: C5, user_id: N, role: 'admin', created_at: ago(2) })
  const vb = { user_id: null, contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(48) }
  await rest('vendors', 'POST', { ...vb, id: V1, company_id: C2, name: '격리음향423', category: '음향', phone: '01042300001' })
  await rest('vendors', 'POST', { ...vb, id: V2, company_id: C2, name: '격리조명423', category: '조명', phone: '01042300002' })
  await rest('vendors', 'POST', { ...vb, id: V2X, company_id: C2, name: '격리중지423', category: '기타', phone: '01042300003', active: false })
  await rest('vendors', 'POST', { ...vb, id: V3, company_id: C3, name: '남의업체423', category: '무대', phone: '01042300004' })

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

  // ── 1. 새 회사(C5) 견적 탭 · 두 회사를 맡은 M
  const m = await ctxOf(M, { company: C5 })
  await m.goto(`${D}/admin/vendors`, { waitUntil: 'networkidle' })
  const cta = m.locator('[data-vendor-import-cta]')
  ok('업체 없는 새 회사 견적 탭: 업체부터 등록 안내 그대로', (await m.locator('[data-vendor-first]').count()) === 1)
  const ctaText = one(await cta.innerText().catch(() => ''))
  ok("'내 다른 회사 업체 가져오기 · 2곳' (거래 중지·남의 회사 업체는 안 셈)", ctaText === '내 다른 회사 업체 가져오기 · 2곳', ctaText)
  const ca = await cta.evaluate((e) => ({ a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration, h: e.getBoundingClientRect().height }))
  ok('버튼 0.25초 톡 · 한 줄', ca.a === 'pop' && parseFloat(ca.d) === 0.25 && ca.h < 50, JSON.stringify(ca))
  const qh = await m.content()
  ok('견적 탭 화면 자료에는 다른 회사 업체 이름이 없음 (개수만)', !qh.includes('격리음향423') && !qh.includes('격리조명423') && !qh.includes('남의업체423') && !qh.includes(V1))
  ok('360px 옆 스크롤 없음 (견적 탭)', await noSide(m))
  if (SHOTS) { await cta.scrollIntoViewIfNeeded(); await m.waitForTimeout(300); await m.screenshot({ path: `${SHOTS}/423-quotes-empty.png` }) }

  await cta.click()
  await m.waitForURL(/tab=list/, { timeout: 15000 }).catch(() => {})
  await m.waitForLoadState('networkidle').catch(() => {})
  await m.waitForTimeout(400)
  const fold = await m.evaluate(() => {
    const d = document.getElementById('vendor-import')
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { open: d.open, ring: d.hasAttribute('data-ring-once'), inView: r.top < innerHeight && r.bottom > 0, rows: d.querySelectorAll('[data-vendor-import-row]').length, text: d.innerText.replace(/\s+/g, ' ') }
  })
  ok('업체 탭 가져오기 칸: 펼쳐짐 + 테두리 한 번 + 화면에 보임', !!fold && fold.open && fold.ring && fold.inView, JSON.stringify(fold && { ...fold, text: undefined }))
  ok('가져올 업체 2곳 (격리음향423·격리조명423 · 중지·남의 회사 없음)', !!fold && fold.rows === 2 && fold.text.includes('격리음향423') && fold.text.includes('격리조명423') && !fold.text.includes('격리중지423') && !fold.text.includes('남의업체423'))
  ok('360px 옆 스크롤 없음 (업체 탭)', await noSide(m))

  // 그냥 업체 탭으로 오면 접혀 있음 (전과 같음)
  await m.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  const plain = await m.evaluate(() => { const d = document.getElementById('vendor-import'); return d ? { open: d.open, ring: d.hasAttribute('data-ring-once') } : null })
  ok('그냥 업체 탭: 가져오기 칸은 접힌 채 · 테두리 없음', !!plain && !plain.open && !plain.ring, JSON.stringify(plain))

  // ── 2. 새 회사만 맡은 N: 버튼 없음
  const n = await ctxOf(N, { company: C5 })
  await n.goto(`${D}/admin/vendors`, { waitUntil: 'networkidle' })
  ok('새 회사만 맡은 관리자: 가져오기 버튼 없음 · 안내는 그대로', (await n.locator('[data-vendor-import-cta]').count()) === 0 && (await n.locator('[data-vendor-first]').count()) === 1)
  await n.goto(`${D}/admin/vendors?tab=list&import=1`, { waitUntil: 'networkidle' })
  ok('새 회사만 맡은 관리자: 주소로 와도 가져오기 칸 없음', (await n.locator('#vendor-import').count()) === 0 && !(await n.content()).includes('격리음향423'))

  // ── 3. 외주사 화면 '계좌 넣기 ›' (계좌 없는 업체 · 지급 완료 1,500,000원)
  await rest('vendors', 'POST', { ...vb, id: V5, company_id: C5, name: '새회사업체423', category: '음향', phone: '01042300005' })
  await rest('vendor_payments', 'POST', { company_id: C5, vendor_id: V5, job_id: null, title: '음향 대금423', amount: 1500000, vat_included: true, due_date: null, memo: null, paid_at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), invoice_at: null, created_at: ago(3) })
  await m.goto(`${D}/admin/vendors/${V5}`, { waitUntil: 'networkidle' })
  const link = m.locator('[data-vendor-bank-link]')
  const acct = one(await m.locator('main p:has([data-vendor-bank-link])').innerText().catch(() => ''))
  ok("'계좌: 미등록 계좌 넣기 ›' 한 줄", acct === '계좌: 미등록계좌 넣기 ›' || acct === '계좌: 미등록 계좌 넣기 ›', acct)
  await m.waitForTimeout(900)
  const sums = await m.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-vendor-sum]')].map((e) => [e.getAttribute('data-vendor-sum'), e.textContent.trim()])))
  ok('숫자 다 올라간 뒤: 받은 견적 0건 · 지급 완료 1,500,000원 · 미지급 0원', sums['받은 견적'] === '0건' && sums['지급 완료'] === '1,500,000원' && sums['미지급'] === '0원', JSON.stringify(sums))
  const editBefore = await m.evaluate(() => { const d = document.getElementById('vendor-edit'); return d ? { open: d.open, ring: d.hasAttribute('data-ring-once') } : null })
  ok('처음엔 정보 수정 접힘 · 테두리 없음 (전과 같음)', !!editBefore && !editBefore.open && !editBefore.ring)
  if (SHOTS) { await m.screenshot({ path: `${SHOTS}/423-vendor-bank-link.png` }) }
  await link.click()
  await m.waitForURL(/edit=bank/, { timeout: 15000 }).catch(() => {})
  await m.waitForLoadState('networkidle').catch(() => {})
  await m.waitForTimeout(400)
  const edit = await m.evaluate(() => {
    const d = document.getElementById('vendor-edit')
    const sel = d?.querySelector('select[name="bank_name"]')
    const r = d?.getBoundingClientRect()
    return d ? { open: d.open, ring: d.hasAttribute('data-ring-once'), inView: r.top < innerHeight && r.bottom > 0, bank: !!sel } : null
  })
  ok("'계좌 넣기 ›' → 정보 수정 펼쳐짐 + 테두리 한 번 + 화면에 보임 + 은행 고르기 칸", !!edit && edit.open && edit.ring && edit.inView && edit.bank, JSON.stringify(edit))
  ok('360px 옆 스크롤 없음 (외주사 화면)', await noSide(m))
  // 계좌를 넣어 저장 → 다시 열면 링크 없음
  await m.locator('#vendor-edit select[name="bank_name"]').selectOption({ index: 1 }) // 첫 번째 은행 (선택지에 value가 없어 글자로 감)
  await m.locator('#vendor-edit input[name="bank_account"]').fill('123456789012')
  await m.locator('#vendor-edit button[type="submit"]').click()
  await m.waitForTimeout(1500)
  await m.goto(`${D}/admin/vendors/${V5}`, { waitUntil: 'networkidle' })
  const after = one(await m.locator('main').innerText())
  ok('계좌를 넣고 나면 계좌가 보이고 링크는 사라짐', (await m.locator('[data-vendor-bank-link]').count()) === 0 && !after.includes('미등록') && after.includes('계좌:'), after.slice(0, 120))

  // ── 4. 움직임 줄이기: 숫자 바로 · 버튼 톡 없음
  const r = await ctxOf(M, { company: C5, reduce: true })
  await r.goto(`${D}/admin/vendors/${V5}`, { waitUntil: 'domcontentloaded' })
  await r.waitForTimeout(80)
  const rs = await r.evaluate(() => document.querySelector('[data-vendor-sum="지급 완료"]')?.textContent.trim())
  ok('움직임 줄이기: 지급 완료 1,500,000원 바로', rs === '1,500,000원', rs)
  await rest(`vendors?id=eq.${V5}`, 'DELETE')
  await r.goto(`${D}/admin/vendors`, { waitUntil: 'networkidle' })
  const ra = await r.locator('[data-vendor-import-cta]').evaluate((e) => getComputedStyle(e).animationName).catch(() => 'missing')
  ok('움직임 줄이기: 가져오기 버튼 톡 없음', ra === 'none', ra)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch423: ${fails} FAIL` : '== batch423: ALL PASS')
})()
