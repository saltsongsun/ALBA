// 묶음 424 (정기 개선 2026-11-28 11:36 KST)
// 기능 · 견적 비교 화면에서 선정한 견적 카드에 대금 지급 한 칸: 상태 배지 + '지급 예정일 없음/지급 예정 M/D' + 날짜를 바로 정하기
//   · 정하면 '지급 예정 M/D'로 바뀜 (대금 지급 탭과 같은 저장) · 선정 전에는 없음
//   · '대금 지급에서 보기 →' → 대금 지급 탭의 바로 그 지급 건으로 (가운데 + 테두리)
//   · 다른 회사의 같은 견적 id 지급 건(만들어 넣은 것)은 쓰지 않음 · 남의 회사 지급 건 날짜는 서버에서 안 바뀜
// 디자인 · 날짜 줄이 저장 뒤 0.25초 톡 (움직임 줄이기면 없음) · 360px 옆 스크롤 없음
// node scripts/qa/batch424.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000428'
const V1 = '42400000-0000-4000-8000-0000000000a1', V2 = '42400000-0000-4000-8000-0000000000a2', V3 = '42400000-0000-4000-8000-0000000000a3'
const R1 = '42400000-0000-4000-8000-0000000000b1'
const Q1 = '42400000-0000-4000-8000-0000000000c1', Q2 = '42400000-0000-4000-8000-0000000000c2'
const P2 = '42400000-0000-4000-8000-0000000000d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args) =>
  p.evaluate(
    async ({ id, args }) => {
      const body = new FormData()
      for (const [k, v] of Object.entries(args.form ?? {})) body.append(`1_${k}`, v)
      body.append('0', JSON.stringify(args.list))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.status
    },
    { id: idOf(file, name), args },
  )

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사424', join_code: 'ISO428', seal_image: null, created_at: ago(5) })
  const vb = { user_id: null, contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(96) }
  await rest('vendors', 'POST', { ...vb, id: V1, company_id: C1, name: '음향하나424', category: '음향', phone: '01042400001' })
  await rest('vendors', 'POST', { ...vb, id: V2, company_id: C1, name: '음향둘424', category: '음향', phone: '01042400002' })
  await rest('vendors', 'POST', { ...vb, id: V3, company_id: C2, name: '격리업체424', category: '무대', phone: '01042400003' })
  await rest('quote_requests', 'POST', { id: R1, company_id: C1, title: '무대 음향 424', details: '내용424', due_date: null, job_id: null, status: 'open', created_by: A, created_at: ago(30) })
  const qb = { request_id: R1, status: 'submitted', vat_included: true, submitted_by: 'vendor', submitted_at: ago(20), note: null }
  await rest('quotes', 'POST', { ...qb, id: Q1, vendor_id: V1, token: 'tok424a', amount: 1000000 })
  await rest('quotes', 'POST', { ...qb, id: Q2, vendor_id: V2, token: 'tok424b', amount: 1200000 })

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

  // ── 1. 선정 전: 대금 칸 없음
  const a = await ctxOf(A, { company: C1 })
  await a.goto(`${D}/admin/vendors/requests/${R1}`, { waitUntil: 'networkidle' })
  ok('선정 전: 대금 지급 칸 없음', (await a.locator('[data-quote-pay]').count()) === 0)

  // ── 2. 음향하나424 선정 (두 번 눌러 확인)
  const sel = card(a, '음향하나424').locator('button', { hasText: '이 업체로 선정' })
  await sel.click()
  await a.waitForTimeout(200)
  await card(a, '음향하나424').locator('button[type="submit"]').filter({ hasText: /선정\?/ }).click()
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForFunction(() => !!document.querySelector('[data-quote-pay]'), null, { timeout: 15000 }).catch(() => {})
  const pays = ((await rest(`vendor_payments?company_id=eq.${C1}`)) ?? []).filter((p) => p.quote_id === Q1)
  const P1 = pays[0]?.id
  ok('선정하면 대금 지급 건이 생김 (전과 같음)', pays.length === 1 && pays[0].amount === 1000000, JSON.stringify(pays).slice(0, 120))
  const st1 = one(await a.locator('[data-quote-pay-state]').innerText().catch(() => ''))
  ok("선정 카드: '지급 예정 · 날짜 없음'", st1 === '지급 예정 날짜 없음' || st1 === '지급 예정날짜 없음', st1)
  ok('대금 칸은 선정한 카드 안에만', (await card(a, '음향하나424').locator('[data-quote-pay]').count()) === 1 && (await card(a, '음향둘424').locator('[data-quote-pay]').count()) === 0)
  const href1 = await a.locator('[data-quote-pay-link]').getAttribute('href')
  ok("'대금 지급에서 보기 →' 는 그 지급 건으로", href1 === `/admin/vendors?tab=pay#pay-${P1}`, href1)
  ok('360px 옆 스크롤 없음', await noSide(a))

  // ── 3. 날짜 정하기 → '지급 예정 M/D' (0.25초 톡)
  const due = kday(5)
  await card(a, '음향하나424').locator('[data-quote-pay] input[name="due_date"]').fill(due)
  await card(a, '음향하나424').locator('[data-quote-pay] button[type="submit"]').click()
  await a.waitForFunction((t) => (document.querySelector('[data-quote-pay-state]')?.textContent ?? '').includes(t), `지급 예정 ${md(due)}`, { timeout: 15000 }).catch(() => {})
  const st2 = await a.locator('[data-quote-pay-state]').evaluate((e) => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration }))
  ok(`날짜 저장 → '지급 예정 ${md(due)}(요일)' (같은 말 반복 없음) + 0.25초 톡`, st2.t.replace(/\s/g, '').startsWith(`지급예정${md(due)}(`) && (st2.t.match(/지급 예정/g) ?? []).length === 1 && st2.a === 'pop' && parseFloat(st2.d) === 0.25, JSON.stringify(st2))
  const [p1] = await rest(`vendor_payments?id=eq.${P1}`)
  ok('저장된 날짜가 그 지급 건에 들어감', p1?.due_date === due, p1?.due_date)
  const btn = one(await card(a, '음향하나424').locator('[data-quote-pay] button[type="submit"]').innerText())
  ok("버튼 글자 '날짜 바꾸기'", btn === '날짜 바꾸기', btn)
  if (SHOTS) { await card(a, '음향하나424').scrollIntoViewIfNeeded(); await a.waitForTimeout(300); await a.screenshot({ path: `${SHOTS}/424-quote-pay.png` }) }

  // ── 4. 다른 회사에 같은 견적 id로 만든 지급 건은 쓰지 않음 · 남의 회사 지급 건 날짜는 안 바뀜
  await rest('vendor_payments', 'POST', { id: P2, company_id: C2, vendor_id: V3, job_id: null, quote_id: Q1, title: '격리 지급424', amount: 9999999, vat_included: true, due_date: null, memo: null, paid_at: null, invoice_at: null, created_at: ago(1) })
  await a.reload({ waitUntil: 'networkidle' })
  const h = await a.content()
  const href2 = await a.locator('[data-quote-pay-link]').getAttribute('href')
  ok('다른 회사 지급 건(같은 견적 id)은 화면 자료에 없음 · 링크는 이 회사 건', !h.includes(P2) && !h.includes('9,999,999') && href2 === `/admin/vendors?tab=pay#pay-${P1}`, href2)
  const forged = await call(a, 'vendor', 'setPaymentDue', { list: [P2, '$K1'], form: { due_date: kday(9) } })
  await a.waitForTimeout(300)
  const [p2] = await rest(`vendor_payments?id=eq.${P2}`)
  ok('서버에 직접: 남의 회사 지급 건 날짜는 안 바뀜', p2?.due_date == null, `${forged} ${p2?.due_date}`)

  // ── 5. '대금 지급에서 보기 →' → 그 지급 건이 가운데 + 테두리
  await a.locator('[data-quote-pay-link]').click()
  await a.waitForURL(/tab=pay/, { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForTimeout(500)
  const row = await a.evaluate((id) => {
    const el = document.getElementById(`pay-${id}`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { focus: el.hasAttribute('data-hash-focus'), inView: r.top >= 0 && r.top < innerHeight, ring: getComputedStyle(el).boxShadow !== 'none', text: el.innerText.replace(/\s+/g, ' ').slice(0, 60) }
  }, P1)
  ok('대금 지급 탭: 그 지급 건이 화면에 + 테두리', !!row && row.focus && row.inView && row.ring && row.text.includes('음향하나424'), JSON.stringify(row))
  ok('360px 옆 스크롤 없음 (대금 지급 탭)', await noSide(a))

  // ── 6. 지급 완료 뒤에는 날짜 칸 없음 · 링크는 '전체 보기'로
  await rest(`vendor_payments?id=eq.${P1}`, 'PATCH', { paid_at: kday(0) })
  await a.goto(`${D}/admin/vendors/requests/${R1}`, { waitUntil: 'networkidle' })
  const st3 = one(await a.locator('[data-quote-pay-state]').innerText().catch(() => ''))
  const href3 = await a.locator('[data-quote-pay-link]').getAttribute('href')
  ok(`지급 완료: '지급 완료 ${md(kday(0))}(요일)' · 날짜 칸 없음 · 링크에 show=all`, st3.replace(/\s/g, '').startsWith(`지급완료${md(kday(0))}(`) && (await a.locator('[data-quote-pay] input').count()) === 0 && href3 === `/admin/vendors?tab=pay&show=all#pay-${P1}`, `${st3} | ${href3}`)

  // ── 7. 움직임 줄이기
  const r = await ctxOf(A, { company: C1, reduce: true })
  await r.goto(`${D}/admin/vendors/requests/${R1}`, { waitUntil: 'networkidle' })
  const ra = await r.locator('[data-quote-pay-state]').evaluate((e) => getComputedStyle(e).animationName).catch(() => 'missing')
  ok('움직임 줄이기: 톡 없음', ra === 'none', ra)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch424: ${fails} FAIL` : '== batch424: ALL PASS')
})()
