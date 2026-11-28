// 묶음 426 (정기 개선 2026-11-28 15:36 KST)
// 기능 · 외주 업체 홈 '답할 견적 요청': 아직 안 낸 요청 먼저, 그다음 마감이 가까운 순 (마감일 없음은 뒤, 낸 견적은 맨 뒤)
//   · 5개가 넘으면 나머지는 '견적 요청 n개 더 보기'로 접어 둠 (전에는 6번째부터 말없이 안 보였음)
//   · 아직 안 낸 요청에만 마감 배지: 지남(빨강) · 오늘까지 · 내일까지 — 그 밖에는 배지 없음
//   · 두 회사에 등록된 업체: 두 회사 요청이 함께 섞여 순서대로 · 마감한 요청은 안 보임
// 디자인 · 배지 0.25초 톡 · 펼치면 목록이 0.25초 내려옴 (움직임 줄이기면 없음) · 360px 옆 스크롤 없음
// node scripts/qa/batch426.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000426'
const id = (k) => `42600000-0000-4000-8000-0000000000${k}`
const P = id('e1'), P2 = id('e2')
const V1 = id('a1'), V2 = id('a2'), V3 = id('a3')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째상사426', join_code: 'TWO426', seal_image: null, created_at: ago(5) })
  const vendorUser = (uid, name, phone) => rest('users', 'POST', { id: uid, name, phone, role: 'worker', member_type: 'vendor', active: true, careers: [], photo_at: null, created_at: ago(300) })
  await vendorUser(P, '빛소리426', '01042600001')
  await vendorUser(P2, '한건426', '01042600002')
  const vb = { category: '조명', contact_name: '대표', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(200) }
  // 같은 업체를 두 회사가 각자 등록
  await rest('vendors', 'POST', { ...vb, id: V1, company_id: C1, name: '빛소리426', phone: '01042600001', user_id: P })
  await rest('vendors', 'POST', { ...vb, id: V2, company_id: C2, name: '빛소리426', phone: '01042600001', user_id: P })
  await rest('vendors', 'POST', { ...vb, id: V3, company_id: C1, name: '한건426', phone: '01042600002', user_id: P2 })
  // 요청 8개 (+ 마감한 요청 1개): 만든 순서는 일부러 뒤섞음
  const reqs = [
    // key, company, vendor, due, quote status, made (hours ago)
    ['h', C1, V1, null, 'submitted', 1],
    ['e', C1, V1, null, 'requested', 2],
    ['g', C2, V2, kday(10), 'requested', 3],
    ['f', C1, V1, kday(0), 'submitted', 4],
    ['d', C1, V1, kday(5), 'requested', 5],
    ['c', C2, V2, kday(1), 'requested', 6],
    ['b', C1, V1, kday(0), 'requested', 7],
    ['a', C1, V1, kday(-1), 'requested', 8],
  ]
  const n = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, x: 9, y: 10 }
  for (const [k, co, v, due, st, h] of reqs) {
    await rest('quote_requests', 'POST', { id: id(`b${n[k]}`), company_id: co, title: `요청${k}426`, details: null, due_date: due, job_id: null, status: 'open', created_by: A, created_at: ago(h) })
    await rest('quotes', 'POST', { id: id(`c${n[k]}`), request_id: id(`b${n[k]}`), vendor_id: v, token: `tok426${k}aaaaaaaaaaaaaaaa`, status: st, amount: st === 'submitted' ? 700000 : null, vat_included: true, note: null, submitted_at: st === 'submitted' ? ago(h) : null, submitted_by: st === 'submitted' ? 'vendor' : null, created_at: ago(h) })
  }
  await rest('quote_requests', 'POST', { id: id('b9'), company_id: C1, title: '마감한요청426', details: null, due_date: kday(0), job_id: null, status: 'closed', created_by: A, created_at: ago(0.5) })
  await rest('quotes', 'POST', { id: id('c9'), request_id: id('b9'), vendor_id: V1, token: 'tok426xaaaaaaaaaaaaaaaa', status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, submitted_by: null, created_at: ago(0.5) })
  // 요청이 하나뿐인 업체 (접기 없음)
  await rest('quote_requests', 'POST', { id: id('ba'), company_id: C1, title: '하나426', details: null, due_date: kday(3), job_id: null, status: 'open', created_by: A, created_at: ago(1) })
  await rest('quotes', 'POST', { id: id('ca'), request_id: id('ba'), vendor_id: V3, token: 'tok426yaaaaaaaaaaaaaaaa', status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, submitted_by: null, created_at: ago(1) })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, reduce = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p) => {
    await p.goto(`${D}/pro`, { waitUntil: 'networkidle' })
    await p.locator('[data-mode="pro"] h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const titles = (p, sel) => p.locator(sel).evaluateAll((els) => els.map((e) => (e.textContent.match(/요청([a-z])426/) ?? [])[1]))

  // ── 1. 순서 + 처음 5개
  const p = await mk(P)
  await open(p)
  const shown = await titles(p, 'section:has(h2:text("답할 견적 요청")) > div.stagger > a')
  ok("처음 5개: 지남 → 오늘 → 내일 → 5일 뒤 → 10일 뒤 (안 낸 것·마감 가까운 순, 두 회사 섞어서)", shown.join('') === 'abcdg', shown.join(''))
  const folded = await titles(p, '[data-pro-quote-more] a')
  ok('접힌 3개: 마감일 없음(안 냄) → 낸 견적(오늘 마감) → 낸 견적(마감일 없음)', folded.join('') === 'efh', folded.join(''))
  const sum = one(await p.locator('[data-pro-quote-more] summary').innerText().catch(() => ''))
  ok("접기 제목 '견적 요청 3개 더 보기' · 처음엔 닫힘", sum === '견적 요청 3개 더 보기' && !(await p.locator('[data-pro-quote-more]').evaluate((e) => e.open)), sum)
  ok('접힌 것은 안 보임', !(await p.locator('[data-pro-quote-more] a').first().isVisible()))
  const tile = one(await p.locator('[data-pro-tile="quotes"]').innerText().catch(() => ''))
  ok('위 칸 숫자는 그대로 8건', /8/.test(tile), tile)
  ok('마감한 요청은 안 보임', !(await p.locator('main').innerText()).includes('마감한요청426'))
  const co = one(await p.locator(`a[href="/quote/tok426caaaaaaaaaaaaaaaa"]`).innerText().catch(() => ''))
  ok('다른 회사 요청에는 그 회사 이름', co.startsWith('둘째상사426'), co)

  // ── 2. 마감 배지
  const badge = async (k) => p.locator(`a[href="/quote/tok426${k}aaaaaaaaaaaaaaaa"] [data-pro-quote-due]`).evaluate((e) => ({ k: e.getAttribute('data-pro-quote-due'), t: e.textContent.trim(), a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration, c: getComputedStyle(e).color })).catch(() => null)
  const ba = await badge('a'), bb = await badge('b'), bc = await badge('c')
  ok("어제 마감: '지남' 빨강 배지 + 0.25초 톡", ba?.t === '지남' && ba.k === 'late' && ba.a === 'pop' && parseFloat(ba.d) === 0.25, JSON.stringify(ba))
  ok("오늘 마감: '오늘까지'", bb?.t === '오늘까지' && bb.k === 'today', JSON.stringify(bb))
  ok("내일 마감: '내일까지'", bc?.t === '내일까지' && bc.k === 'tomorrow', JSON.stringify(bc))
  const none = { d: await badge('d'), f: await badge('f') }
  ok('5일 뒤 마감·이미 낸 견적(오늘 마감)에는 배지 없음', none.d === null && none.f === null, JSON.stringify(none))
  const rowA = one(await p.locator(`a[href="/quote/tok426aaaaaaaaaaaaaaaaa"]`).innerText())
  ok("줄 글자는 그대로 ('마감 M/D(요일)' · '견적 내기 →')", /마감 \d+\/\d+\(.\)/.test(rowA) && rowA.includes('견적 내기 →'), rowA)
  ok('360px 옆 스크롤 없음', await noSide(p))
  if (SHOTS) { await p.locator('section:has(h2:text("답할 견적 요청"))').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${SHOTS}/426-pro-quotes.png` }) }

  // ── 3. 펼치기
  await p.locator('[data-pro-quote-more] summary').click()
  await p.waitForTimeout(80)
  const opened = await p.locator('[data-pro-quote-more] > div').evaluate((e) => ({ a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration })).catch(() => null)
  await p.waitForTimeout(350)
  const sum2 = one(await p.locator('[data-pro-quote-more] summary').innerText())
  ok("펼치면 3개 보임 · 제목 '접기' · 0.25초 내려옴", (await p.locator('[data-pro-quote-more] a').nth(2).isVisible()) && sum2 === '접기' && opened?.a === 'slide-down' && parseFloat(opened.d) === 0.25, `${sum2} ${JSON.stringify(opened)}`)
  const rowF = one(await p.locator('a[href="/quote/tok426faaaaaaaaaaaaaaaa"]').innerText())
  ok("낸 견적 줄: '보낸 견적 700,000원' · '고치기 →'", rowF.includes('보낸 견적 700,000원') && rowF.includes('고치기 →'), rowF)
  ok('펼친 뒤에도 360px 옆 스크롤 없음', await noSide(p))

  // ── 4. 요청이 하나뿐이면 접기 없음
  const q = await mk(P2)
  await open(q)
  ok('요청 1개: 접기 없음 · 그 줄은 보임', (await q.locator('[data-pro-quote-more]').count()) === 0 && (await q.locator('a[href="/quote/tok426yaaaaaaaaaaaaaaaa"]').count()) === 1)
  ok('다른 업체 요청은 안 보임', !(await q.locator('main').innerText()).includes('요청a426'))

  // ── 5. 움직임 줄이기
  const r = await mk(P, true)
  await open(r)
  const ra = await r.locator('[data-pro-quote-due]').first().evaluate((e) => getComputedStyle(e).animationName).catch(() => 'missing')
  await r.locator('[data-pro-quote-more] summary').click()
  await r.waitForTimeout(80)
  const rb = await r.locator('[data-pro-quote-more] > div').evaluate((e) => getComputedStyle(e).animationName).catch(() => 'missing')
  ok('움직임 줄이기: 배지 톡·펼침 움직임 없음', ra === 'none' && rb === 'none', `${ra} ${rb}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch426: ${fails} FAIL` : '== batch426: ALL PASS')
})()
