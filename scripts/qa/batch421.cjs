// 묶음 421 (정기 개선 2026-11-28 05:36 KST)
// 기능 · 외주 업체 탭 '내 다른 회사 업체 가져오기' (여러 회사를 맡은 관리자)
//   · 내가 대표·관리자로 있는 다른 회사의 업체만 · 이미 있는 업체(같은 상호·연락처·사업자번호)와 거래 중지 업체는 빠짐 · 접어 둠
//   · 가져오기 → 이 회사 업체로 새로 등록 (상호·분야·담당자·연락처만 · 계좌·메모는 안 가져옴) → 그 업체 화면 + '계좌는 다시 넣어 주세요'
//   · 원래 업체는 그대로 · 기록(vendor.import_company)
//   · 서버에 직접: 내가 속하지 않은 회사 업체 · 최고 관리자 권한으로만 보이는 회사 업체 · 이미 있는 업체 → 안 만들어짐
// 디자인 · 가져올 목록 줄이 차례로 0.25초 올라옴 (움직임 줄이기면 없음) · 견적 요청 화면 '받은 견적 n/m곳' 얇은 막대(0.25초 채워짐 · 다 받으면 초록) · 360px 옆 스크롤 없음
// node scripts/qa/batch421.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createHmac } = crypto
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000421', C3 = '99999999-0000-4000-8000-000000000422'
const M = '42100000-0000-4000-8000-000000000001', N = '42100000-0000-4000-8000-000000000002'
const V1 = '42100000-0000-4000-8000-0000000000a1', V2 = '42100000-0000-4000-8000-0000000000a2', V2D = '42100000-0000-4000-8000-0000000000a3', V2X = '42100000-0000-4000-8000-0000000000a4', V3 = '42100000-0000-4000-8000-0000000000a5'
const R1 = '42100000-0000-4000-8000-0000000000b1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args) =>
  p.evaluate(
    async ({ id, args }) => {
      const body = new FormData()
      body.append('0', JSON.stringify(args))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.text()
    },
    { id: idOf(file, name), args },
  )
const mine = async (name) => ((await rest(`vendors?company_id=eq.${C1}`)) ?? []).filter((v) => v.name === name)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사421', join_code: 'ISO421', seal_image: null, created_at: ago(5) })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '남의회사421', join_code: 'ISO422', seal_image: null, created_at: ago(5) })
  await rest('users', 'POST', { ...a1, id: M, name: '두회사관리자421', phone: '01042100091', is_super: false })
  await rest('users', 'POST', { ...a1, id: N, name: '한회사관리자421', phone: '01042100092', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: M, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'owner', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: ago(5) })
  const base = { user_id: null, contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(48) }
  await rest('vendors', 'POST', { ...base, id: V1, company_id: C1, name: '기존렌탈421', category: '렌탈', phone: '01042100009' })
  await rest('vendors', 'POST', { ...base, id: V2, company_id: C2, name: '두리음향421', category: '음향', phone: '01042100001', email: 'duri@example.com', bank_name: '국민', bank_account_enc: 'ENC-SECRET-421', account_holder: '두리', memo: '격리상사 메모421' })
  await rest('vendors', 'POST', { ...base, id: V2D, company_id: C2, name: '한빛조명421', category: '조명', phone: '010-4210-0009' }) // 우리 회사 기존렌탈421과 같은 연락처 → 빠짐
  await rest('vendors', 'POST', { ...base, id: V2X, company_id: C2, name: '거래중지421', category: '기타', phone: '01042100003', active: false })
  await rest('vendors', 'POST', { ...base, id: V3, company_id: C3, name: '남의업체421', category: '무대', phone: '01042100005' })

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

  // ── 1. 두 회사를 맡은 M (지금 C1): 가져올 업체 = 두리음향421 하나 (중복·거래 중지·남의 회사는 빠짐)
  const m = await ctxOf(M, { company: C1 })
  await m.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  const fold = m.locator('details:has([data-vendor-import])')
  ok("'내 다른 회사 업체 가져오기' 칸 · 접혀 있음", (await fold.count()) === 1 && (await fold.evaluate((d) => !d.open)))
  const sum = one(await fold.locator('summary').innerText().catch(() => ''))
  ok("요약: '두리음향421 · 계좌는 빼고 가져와요'", sum.includes('두리음향421') && sum.includes('계좌는 빼고 가져와요') && !sum.includes('등'), sum)
  await fold.evaluate((d) => (d.open = true))
  await m.waitForTimeout(400)
  const rows = fold.locator('[data-vendor-import-row]')
  const rt = one(await fold.innerText())
  ok('목록: 두리음향421 · 🏢 격리상사421 (같은 연락처 한빛조명·거래 중지·남의 회사 업체 없음)', (await rows.count()) === 1 && rt.includes('🏢 격리상사421') && !rt.match(/한빛조명421|거래중지421|남의업체421/), rt.slice(0, 120))
  const an = await rows.first().evaluate((e) => ({ name: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration }))
  ok('줄이 0.25초 올라옴', an.name === 'rise' && parseFloat(an.dur) === 0.25, JSON.stringify(an))
  ok('360px 옆 스크롤 없음', await noSide(m))
  if (SHOTS) { await fold.scrollIntoViewIfNeeded(); await m.waitForTimeout(300); await m.screenshot({ path: `${SHOTS}/421-vendor-import.png` }) }

  // ── 2. 가져오기 → 그 업체 화면 · 계좌는 빈칸
  await rows.first().locator('button').click()
  await m.waitForURL(/\/admin\/vendors\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
  await m.waitForLoadState('networkidle').catch(() => {})
  // 바쁠 때는 업체 화면 뼈대(로딩)가 잠깐 보였다가 내용이 들어와서, 내용이 나올 때까지 기다림
  await m.waitForFunction(() => (document.querySelector('main')?.innerText ?? '').includes('계좌'), null, { timeout: 15000 }).catch(() => {})
  const made = (await mine('두리음향421'))[0]
  ok('이 회사 업체로 새로 등록 (상호·분야·연락처·이메일 같음)', !!made && made.company_id === C1 && made.category === '음향' && made.phone === '01042100001' && made.email === 'duri@example.com' && made.active === true, JSON.stringify(made ?? {}).slice(0, 160))
  ok('계좌·메모·예금주는 안 가져옴', !!made && made.bank_account_enc == null && made.bank_name == null && made.account_holder == null && made.memo == null)
  ok('그 업체 화면으로 · 계좌 미등록', m.url().includes(`/admin/vendors/${made?.id}`) && one(await m.locator('main').innerText()).includes('계좌: 미등록'), m.url())
  const flash = one(await m.locator('body').innerText())
  ok("'격리상사421에서 가져왔어요 · 계좌는 이 회사에서 다시 넣어 주세요'", flash.includes('격리상사421에서 가져왔어요 · 계좌는 이 회사에서 다시 넣어 주세요'))
  if (SHOTS) { await m.waitForTimeout(300); await m.screenshot({ path: `${SHOTS}/421-vendor-imported.png` }) }
  const [orig] = await rest(`vendors?id=eq.${V2}`)
  ok('원래 업체는 그대로 (격리상사421 · 계좌·메모 그대로)', orig.company_id === C2 && orig.bank_account_enc === 'ENC-SECRET-421' && orig.memo === '격리상사 메모421')
  const logs = ((await rest('audit_logs')) ?? []).filter((l) => l.action === 'vendor.import_company')
  ok('기록: vendor.import_company · 이 회사', logs.length === 1 && logs[0].company_id === C1, JSON.stringify(logs.map((l) => l.company_id)))
  await m.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  ok('다시 보면 가져올 업체가 없어 칸이 사라짐', (await m.locator('[data-vendor-import]').count()) === 0)

  // ── 3. 서버에 직접 (위조)
  ok('서버 동작 이름을 찾음 (importVendorFromCompany)', !!idOf('vendor', 'importVendorFromCompany'))
  await call(m, 'vendor', 'importVendorFromCompany', [V3]).catch(() => '')
  ok('내가 속하지 않은 회사(남의회사421) 업체 → 안 만들어짐', (await mine('남의업체421')).length === 0)
  await call(m, 'vendor', 'importVendorFromCompany', [V2]).catch(() => '')
  ok('이미 가져온 업체를 또 → 두 개가 되지 않음', (await mine('두리음향421')).length === 1)
  const n = await ctxOf(N)
  await n.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  ok('한 회사만 맡은 관리자에게는 칸이 없음', (await n.locator('[data-vendor-import]').count()) === 0)
  await call(n, 'vendor', 'importVendorFromCompany', [V2D]).catch(() => '')
  ok('한 회사만 맡은 관리자가 다른 회사 업체를 직접 → 안 만들어짐', (await mine('한빛조명421')).length === 0)
  const a = await ctxOf(A)
  await a.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  ok('최고 관리자에게도 남의 회사 업체는 안 보임', !(one(await a.locator('main').innerText())).match(/남의업체421|한빛조명421/))
  await call(a, 'vendor', 'importVendorFromCompany', [V3]).catch(() => '')
  ok('최고 관리자 권한으로만 보이는 회사 업체를 직접 → 안 만들어짐', (await mine('남의업체421')).length === 0)

  // ── 4. 견적 요청 화면: 받은 견적 1/2곳 막대
  await rest('quote_requests', 'POST', { id: R1, company_id: C1, job_id: null, title: '무대 음향 421', details: null, due_date: null, status: 'open', created_by: M, created_at: ago(3) })
  await rest('quotes', 'POST', { id: crypto.randomUUID(), request_id: R1, vendor_id: V1, token: 'tok-421-a', status: 'submitted', amount: 990000, vat_included: true, note: null, submitted_by: 'vendor', submitted_at: ago(1), created_at: ago(3) })
  await rest('quotes', 'POST', { id: crypto.randomUUID(), request_id: R1, vendor_id: made?.id ?? V1, token: 'tok-421-b', status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, created_at: ago(3) })
  await m.goto(`${D}/admin/vendors/requests/${R1}`, { waitUntil: 'networkidle' })
  const bar = m.locator('[data-quote-progress]')
  const bi = await bar.evaluate((e) => {
    const s = e.firstElementChild
    const cs = getComputedStyle(s)
    return { v: e.getAttribute('data-quote-progress'), w: Math.round((s.getBoundingClientRect().width / e.getBoundingClientRect().width) * 100), name: cs.animationName, dur: cs.animationDuration, green: s.className.includes('emerald') }
  }).catch(() => ({}))
  ok("'받은 견적 1/2곳' 막대: 반 · 0.25초 채워짐 · 아직 초록 아님", bi.v === '1/2' && bi.w >= 48 && bi.w <= 52 && bi.name === 'grow' && parseFloat(bi.dur) === 0.25 && !bi.green, JSON.stringify(bi))
  ok('360px 옆 스크롤 없음 (견적 요청)', await noSide(m))
  if (SHOTS) { await m.waitForTimeout(300); await m.screenshot({ path: `${SHOTS}/421-quote-progress.png` }) }

  // ── 5. 움직임 줄이기
  await rest(`vendors?id=eq.${made?.id}`, 'DELETE')
  const r = await ctxOf(M, { company: C1, reduce: true })
  await r.goto(`${D}/admin/vendors?tab=list`, { waitUntil: 'networkidle' })
  const rf = r.locator('details:has([data-vendor-import])')
  await rf.evaluate((d) => (d.open = true)).catch(() => {})
  const rd = await rf.locator('[data-vendor-import-row]').first().evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 9)
  await r.goto(`${D}/admin/vendors/requests/${R1}`, { waitUntil: 'networkidle' })
  const rb = await r.locator('[data-quote-progress] > span').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 9)
  ok('움직임 줄이기: 줄·막대 움직임 없음', rd < 0.001 && rb < 0.001, `${rd} ${rb}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch421: ${fails} FAIL` : '== batch421: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
