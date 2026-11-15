// 묶음 269 (정기 개선 2026-11-16 04:35 KST)
// · 관리자 ↔ 외주 업체 대화 화면: 이름 옆 '외주' 표 + 이름 아래 대금 요약
//   '지급 전 1건 · 1,500,000원' / 챙길 것만 둘째 줄 '지급일 지남 1 · 계산서 안 받음 1' → 누르면 그 외주사 화면
//   (계산서·대금 이야기를 하면서 외주 관리 화면을 따로 찾지 않게 · 이 회사에 등록된 그 업체 대금만 · 다른 회사 대금은 안 셈)
//   근무자 대화엔 표도 줄도 없음
// · 공고 '서류' 탭: '서명 완료 n / m건' 아래 얇은 막대가 0에서 차오름 (300ms) · 다 받으면 '✓ 모두' + 초록 막대
// node scripts/qa/batch269.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000002690c2'
const P = 'bbbbbbbb-0000-4000-8000-000000026901', VP1 = '77777777-0000-4000-8000-000000026911', VP2 = '77777777-0000-4000-8000-000000026912'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '소리나라', phone: '01026900001', member_type: 'vendor', created_at: nowIso })
  const vbase = { category: '음향', contact_name: null, business_no: null, bank_name: null, account_no: null, account_holder: null, memo: null, active: true, created_at: nowIso, phone: '01026900001', name: '소리나라', user_id: P }
  await rest('vendors', 'POST', { ...vbase, id: VP1, company_id: C1 })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른기획', created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP2, company_id: C2 })
  const pay = { job_id: null, quote_id: null, vat_included: true, memo: null, created_at: nowIso }
  // 우리 회사: 지급 전 · 지급일 어제 · 계산서 안 받음 1건 / 지급 끝 · 계산서 받음 1건 · 다른 회사: 지급 전 2건 (안 셈)
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000002691b1', company_id: C1, vendor_id: VP1, title: '개막식 음향', amount: 1500000, due_date: kst(-1), paid_at: null, invoice_at: null })
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000002691b2', company_id: C1, vendor_id: VP1, title: '리허설 음향', amount: 300000, due_date: kst(-5), paid_at: kst(-2), invoice_at: kst(-3) })
  for (const [i, amt] of [[3, 700000], [4, 900000]]) await rest('vendor_payments', 'POST', { ...pay, id: `dddddddd-0000-4000-8000-0000002691b${i}`, company_id: C2, vendor_id: VP2, title: '다른 회사 음향', amount: amt, due_date: kst(-1), paid_at: null, invoice_at: null })
  // (가짜 DB는 글에 붙는 사람 정보를 같이 넣어 줘야 함)
  await rest('messages', 'POST', { id: 926901, thread_user_id: P, sender_id: P, from_admin: false, company_id: C1, job_id: null, body: '견적서 보내 드렸어요.', read_at: null, created_at: nowIso, user: { id: P, name: '소리나라', phone: '01026900001', photo_at: null, member_type: 'vendor' }, sender: { id: P, name: '소리나라' } })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 업체 대화: '외주' 표 + 대금 한 줄
  await p.goto(`${D}/admin/chat/${P}`, { waitUntil: 'networkidle' })
  const tag = p.locator('[data-thread-member]')
  await tag.waitFor({ timeout: 15000 }).catch(() => {})
  ok("이름 옆 '외주'", one(await tag.textContent().catch(() => '')) === '외주' && (await tag.getAttribute('data-thread-member')) === 'vendor')
  const line = p.locator('[data-thread-vendor]')
  const due = one(await line.locator('[data-vendor-due]').textContent().catch(() => ''))
  const flags = one(await line.locator('[data-vendor-flags]').textContent().catch(() => ''))
  ok("'지급 전 1건 · 1,500,000원' (다른 회사 대금은 안 셈)", due === '지급 전 1건 · 1,500,000원', due)
  ok("둘째 줄 '지급일 지남 1 · 계산서 안 받음 1' (빨강 · 주황)", flags === '지급일 지남 1 · 계산서 안 받음 1' && (await line.locator('[data-vendor-flags] .text-rose-600').count()) === 1 && (await line.locator('[data-vendor-flags] .text-amber-700').count()) === 1, flags)
  ok('누르면 이 회사의 그 외주사 화면', (await line.getAttribute('href')) === `/admin/vendors/${VP1}`)
  const fit = await line.evaluate((el) => [...el.querySelectorAll('[data-vendor-due], [data-vendor-flags]')].map((t) => {
    const r = document.createRange()
    r.selectNodeContents(t)
    const c = getComputedStyle(t)
    return Math.round(t.getBoundingClientRect().height / parseFloat(c.lineHeight)) === 1 && r.getBoundingClientRect().width <= t.clientWidth + 1
  })).catch(() => [])
  ok('두 줄 모두 한 줄씩 · 잘리지 않음 · 360px 옆으로 안 밀림', fit.length === 2 && fit.every(Boolean) && (await noSide(p)), JSON.stringify(fit))
  if (SHOTS) {
    await p.evaluate(() => scrollTo(0, 0))
    await p.waitForTimeout(300)
    await line.locator('xpath=..').screenshot({ path: `${SHOTS}/thread-vendor-head.png` }).catch(() => {})
  }
  await line.click()
  await p.waitForURL((u) => u.pathname === `/admin/vendors/${VP1}`, { timeout: 15000 }).catch(() => {})
  await p.locator('h1', { hasText: '소리나라' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('외주사 화면이 열림', new URL(p.url()).pathname === `/admin/vendors/${VP1}` && (await p.locator('h1', { hasText: '소리나라' }).count()) === 1)

  // ── 2. 근무자 대화엔 없음
  await p.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  ok('근무자 대화엔 표·대금 줄 없음', (await p.locator('[data-thread-member], [data-thread-vendor]').count()) === 0 && (await p.locator('text=← 문의 목록').count()) === 1)

  // ── 3. 서류 탭 진행 막대
  const docs = (await rest(`signed_docs?job_id=eq.${J}`)) ?? []
  const live = docs.filter((d) => d.status !== 'void')
  const signed = live.filter((d) => d.status === 'signed').length
  await p.goto(`${D}/admin/jobs/${J}?tab=docs`, { waitUntil: 'networkidle' })
  const bar = p.locator('[data-signed-bar]')
  await bar.waitFor({ timeout: 15000 }).catch(() => {})
  const fill = await bar.locator('div').evaluate((el) => { const c = getComputedStyle(el); return { name: c.animationName, dur: c.animationDuration, t: el.style.transform } }).catch(() => null)
  ok(`막대 '${signed}/${live.length}' · 0에서 차오름 (300ms)`, (await bar.getAttribute('data-signed-bar')) === `${signed}/${live.length}` && fill?.name === 'grow' && fill.dur === '0.3s' && fill.t === `scaleX(${signed / live.length})`, JSON.stringify(fill))
  if (SHOTS && signed < live.length) {
    await bar.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(500)
    await bar.locator('xpath=../..').screenshot({ path: `${SHOTS}/docs-signed-bar.png` }).catch(() => {})
  }
  // 다 받으면 '✓ 모두' + 초록
  for (const d of live) if (d.status !== 'signed') await rest(`signed_docs?id=eq.${d.id}`, 'PATCH', { status: 'signed', signed_at: nowIso })
  await p.goto(`${D}/admin/jobs/${J}?tab=docs`, { waitUntil: 'networkidle' })
  await bar.waitFor({ timeout: 15000 }).catch(() => {})
  const all = await bar.locator('div').evaluate((el) => ({ green: el.className.includes('bg-emerald-500'), t: el.style.transform })).catch(() => null)
  const head = one(await bar.locator('xpath=..').locator('p').textContent().catch(() => ''))
  ok("다 받으면 '✓ 모두' + 초록 막대 가득", head.endsWith('✓ 모두') && all?.green && all.t === 'scaleX(1)', `${head} ${JSON.stringify(all)}`)
  ok('서류 탭 360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) {
    await bar.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(500)
    await bar.locator('xpath=../..').screenshot({ path: `${SHOTS}/docs-signed-all.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
