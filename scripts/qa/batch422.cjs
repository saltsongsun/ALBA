// 묶음 422 (정기 개선 2026-11-28 07:36 KST)
// 기능 · 새 견적 요청 '지난 요청으로 채우기' 칩
//   · 이 회사 최근 요청(같은 제목은 최근 것 하나) → 제목·내용을 채우고 그때 받은 업체 중 지금 거래 중인 곳을 더해서 골라 둠 (이미 고른 업체는 그대로)
//   · 내가 대표·관리자로 있는 다른 회사 요청(🏢 회사 이름) → 제목·내용만 · 업체는 이 회사에서 고름
//   · 내가 속하지 않은 회사 · 최고 관리자 권한으로만 보이는 회사 요청은 안 보임 · 다른 회사 업체 이름·금액은 화면 자료에 없음
//   · 채운 뒤 만들면 이 회사 요청으로 만들어지고 원래 회사 요청은 그대로
// 디자인 · 업체 칩 누름 반응 + 고르면 ✓ 표시와 0.25초 톡 · '· n곳 고름'이 바로 바뀜(톡) · 채운 칸 테두리 한 번 · '✓ 채웠어요' 한 줄 톡
//   · 움직임 줄이기면 없음 · 360px 옆 스크롤 없음 · 칩 줄은 한 줄(옆으로 넘김)
// node scripts/qa/batch422.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000423', C3 = '99999999-0000-4000-8000-000000000424'
const M = '42200000-0000-4000-8000-000000000001', N = '42200000-0000-4000-8000-000000000002'
const V1 = '42200000-0000-4000-8000-0000000000a1', V2 = '42200000-0000-4000-8000-0000000000a2', V3 = '42200000-0000-4000-8000-0000000000a3', V4 = '42200000-0000-4000-8000-0000000000a4'
const R1 = '42200000-0000-4000-8000-0000000000b1', R1B = '42200000-0000-4000-8000-0000000000b2', R2 = '42200000-0000-4000-8000-0000000000b3', R3 = '42200000-0000-4000-8000-0000000000b4', R4 = '42200000-0000-4000-8000-0000000000b5'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사422', join_code: 'ISO423', seal_image: null, created_at: ago(5) })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '남의회사422', join_code: 'ISO424', seal_image: null, created_at: ago(5) })
  await rest('users', 'POST', { ...a1, id: M, name: '두회사관리자422', phone: '01042200091', is_super: false })
  await rest('users', 'POST', { ...a1, id: N, name: '한회사관리자422', phone: '01042200092', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: M, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'owner', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: ago(5) })
  const vb = { user_id: null, contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(96) }
  await rest('vendors', 'POST', { ...vb, id: V1, company_id: C1, name: '음향하나422', category: '음향', phone: '01042200001' })
  await rest('vendors', 'POST', { ...vb, id: V2, company_id: C1, name: '조명둘422', category: '조명', phone: '01042200002' })
  await rest('vendors', 'POST', { ...vb, id: V3, company_id: C1, name: '중지셋422', category: '기타', phone: '01042200003', active: false })
  await rest('vendors', 'POST', { ...vb, id: V4, company_id: C2, name: '격리업체422', category: '무대', phone: '01042200004' })
  const rb = { job_id: null, due_date: null, status: 'open', created_by: M }
  await rest('quote_requests', 'POST', { ...rb, id: R1B, company_id: C1, title: '무대 음향 2일 422', details: '예전 내용422', created_at: ago(72) })
  await rest('quote_requests', 'POST', { ...rb, id: R1, company_id: C1, title: '무대 음향 2일 422', details: 'R1 내용422', created_at: ago(48) })
  await rest('quote_requests', 'POST', { ...rb, id: R2, company_id: C1, title: '조명 장비 422', details: 'R2 내용422', created_at: ago(24) })
  await rest('quote_requests', 'POST', { ...rb, id: R3, company_id: C2, title: '격리 행사 장비 422', details: '격리 내용422', created_at: ago(10) })
  await rest('quote_requests', 'POST', { ...rb, id: R4, company_id: C3, title: '남의 요청 422', details: '남의 내용422', created_at: ago(5) })
  const qb = { status: 'requested', vat_included: true, amount: null }
  await rest('quotes', 'POST', { ...qb, request_id: R1, vendor_id: V1, token: 'tok422a' })
  await rest('quotes', 'POST', { ...qb, request_id: R1, vendor_id: V3, token: 'tok422b' })
  await rest('quotes', 'POST', { ...qb, request_id: R2, vendor_id: V2, token: 'tok422c' })
  await rest('quotes', 'POST', { ...qb, request_id: R3, vendor_id: V4, token: 'tok422d', amount: 7654321, status: 'submitted' })

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
  const openForm = async (p) => {
    await p.goto(`${D}/admin/vendors`, { waitUntil: 'networkidle' })
    const fold = p.locator('details:has(input[name="title"])').first()
    await fold.evaluate((d) => (d.open = true)).catch(() => {})
    await p.waitForTimeout(450)
    return fold
  }
  const chips = (p) => p.locator('[data-quote-reuse-chip]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-quote-reuse-chip')}:${e.textContent.replace(/\s+/g, ' ').trim()}`))

  // ── 1. 두 회사를 맡은 M (지금 C1)
  const m = await ctxOf(M, { company: C1 })
  const fold = await openForm(m)
  const cs = await chips(m)
  ok("칩: 이 회사 최근 요청 2개(같은 제목은 하나) + 🏢 격리상사422 요청 1개", cs.length === 3 && cs[0] === 'mine:↺조명 장비 422' && cs[1] === 'mine:↺무대 음향 2일 422' && cs[2].startsWith('other:🏢격리상사422') && cs[2].includes('격리 행사 장비 422'), JSON.stringify(cs))
  const html = await m.content()
  ok('대조: 두 회사 관리자 화면 자료에는 C2 요청 id가 있음', html.includes(R3))
  ok('남의 회사 요청·다른 회사 업체 이름·금액은 화면 자료에 없음', !html.includes(R4) && !html.includes('남의 요청 422') && !html.includes('남의 내용422') && !html.includes('격리업체422') && !html.includes(V4) && !html.includes('7654321') && !html.includes('7,654,321'))
  const row = await m.locator('[data-quote-reuse] .fade-x').evaluate((e) => ({ h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth }))
  ok('칩 줄은 한 줄 (넘치면 옆으로 넘김)', row.h < 44, JSON.stringify(row))
  ok('360px 옆 스크롤 없음', await noSide(m))

  // 이 회사 요청 → 제목·내용 + 그때 업체(거래 중인 곳만)
  const r1 = await m.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-quote-reuse-chip="mine"]')].find((e) => e.textContent.includes('무대 음향'))
    btn.click()
    const t = document.querySelector('input[name="title"]')
    return { filled: t.hasAttribute('data-filled'), anim: getComputedStyle(t).animationName }
  })
  ok('채운 제목 칸에 테두리 한 번 (flash-ring)', r1.filled && r1.anim === 'flash-ring', JSON.stringify(r1))
  await m.waitForTimeout(100)
  const v1 = await m.evaluate((ids) => ({
    title: document.querySelector('input[name="title"]').value,
    details: document.querySelector('textarea[name="details"]').value,
    checked: [...document.querySelectorAll('input[name="vendor"]:checked')].map((c) => c.value),
    all: [...document.querySelectorAll('input[name="vendor"]')].map((c) => c.value),
  }), null)
  ok('제목·내용 채움 (같은 제목 중 최근 것)', v1.title === '무대 음향 2일 422' && v1.details === 'R1 내용422', JSON.stringify(v1).slice(0, 120))
  ok('그때 업체 중 거래 중인 음향하나422만 골라 둠 (거래 중지 업체는 목록에도 없음)', v1.checked.length === 1 && v1.checked[0] === V1 && !v1.all.includes(V3))
  const said1 = one(await m.locator('[data-quote-reused]').innerText().catch(() => ''))
  ok("'✓ 채웠어요 · 그때 업체 1곳을 골라 뒀어요'", said1 === '✓ 채웠어요 · 그때 업체 1곳을 골라 뒀어요', said1)
  const p1 = one(await m.locator('[data-quote-picked]').innerText().catch(() => ''))
  ok("'· 1곳 고름'", p1 === '· 1곳 고름', p1)
  const ck = await m.evaluate((id) => {
    const span = document.querySelector(`input[name="vendor"][value="${id}"]`).nextElementSibling
    return getComputedStyle(span, '::before').content
  }, V1)
  ok('고른 업체 칩에 ✓', ck.includes('✓'), ck)

  // 손으로 하나 더 고르면 '· 2곳 고름' (톡 0.25초)
  await m.locator(`input[name="vendor"][value="${V2}"] + span`).click()
  await m.waitForTimeout(60)
  const p2 = await m.locator('[data-quote-picked]').evaluate((e) => ({ t: e.textContent.trim(), a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration }))
  ok("'· 2곳 고름' 바로 바뀜 + 0.25초 톡", p2.t === '· 2곳 고름' && p2.a === 'pop' && parseFloat(p2.d) === 0.25, JSON.stringify(p2))
  const chipAnim = await m.evaluate((id) => getComputedStyle(document.querySelector(`input[name="vendor"][value="${id}"]`).nextElementSibling).animationName, V2)
  ok('고른 칩 0.25초 톡', chipAnim === 'pop', chipAnim)

  // 다른 회사 요청 → 제목·내용만 · 고른 업체는 그대로
  await m.locator('[data-quote-reuse-chip="other"]').click()
  await m.waitForTimeout(100)
  const v2 = await m.evaluate(() => ({
    title: document.querySelector('input[name="title"]').value,
    details: document.querySelector('textarea[name="details"]').value,
    checked: [...document.querySelectorAll('input[name="vendor"]:checked')].map((c) => c.value).sort(),
  }))
  ok('다른 회사 요청: 제목·내용만 채움 · 고른 업체 2곳 그대로', v2.title === '격리 행사 장비 422' && v2.details === '격리 내용422' && v2.checked.length === 2, JSON.stringify(v2))
  const said2 = one(await m.locator('[data-quote-reused]').innerText().catch(() => ''))
  ok("'✓ 채웠어요 · 업체는 이 회사에서 골라 주세요'", said2 === '✓ 채웠어요 · 업체는 이 회사에서 골라 주세요', said2)
  if (SHOTS) { await m.locator('[data-quote-reuse]').scrollIntoViewIfNeeded(); await m.waitForTimeout(350); await m.screenshot({ path: `${SHOTS}/422-quote-reuse.png` }) }
  ok('채운 뒤에도 360px 옆 스크롤 없음', await noSide(m))

  // 만들기 → 이 회사 요청 · 원래 회사 요청은 그대로
  await m.locator('details:has(input[name="title"]) button[type="submit"]').first().click()
  await m.waitForURL(/\/admin\/vendors\/requests\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
  await m.waitForLoadState('networkidle').catch(() => {})
  const made = ((await rest(`quote_requests?company_id=eq.${C1}`)) ?? []).filter((r) => r.title === '격리 행사 장비 422')
  ok('이 회사(C1) 요청으로 만들어짐', made.length === 1 && made[0].details === '격리 내용422' && m.url().includes(`/admin/vendors/requests/${made[0]?.id}`), m.url())
  const mq = made[0] ? ((await rest(`quotes?request_id=eq.${made[0].id}`)) ?? []).map((q) => q.vendor_id).sort() : []
  ok('견적은 고른 이 회사 업체 2곳에만', mq.length === 2 && mq.includes(V1) && mq.includes(V2), JSON.stringify(mq))
  const [r3] = await rest(`quote_requests?id=eq.${R3}`)
  const q3 = (await rest(`quotes?request_id=eq.${R3}`)) ?? []
  ok('격리상사422 원래 요청·견적은 그대로', r3?.company_id === C2 && r3?.title === '격리 행사 장비 422' && q3.length === 1 && q3[0].vendor_id === V4)

  // ── 2. C1만 맡은 N: 이 회사 칩만
  const n = await ctxOf(N, { company: C1 })
  await openForm(n)
  const ncs = await chips(n)
  ok('C1만 맡은 관리자: 다른 회사 칩 없음', ncs.length >= 2 && ncs.every((c) => c.startsWith('mine:')), JSON.stringify(ncs))
  const nh = await n.content()
  // (위에서 M이 같은 제목·내용으로 C1 요청을 만들었으니 글자 대신 원래 C2 요청 id로 확인)
  ok('C1만 맡은 관리자 화면 자료에 격리상사422 요청 없음', !nh.includes(R3) && !nh.includes(R4) && !nh.includes('남의 요청 422') && !nh.includes('격리업체422'))

  // ── 3. 최고 관리자 A (C1): 최고 관리자 권한으로만 보이는 회사 요청은 안 보임
  const a = await ctxOf(A, { company: C1 })
  await openForm(a)
  const acs = await chips(a)
  const ah = await a.content()
  ok('최고 관리자: 속하지 않은 회사 요청 칩 없음', acs.every((c) => c.startsWith('mine:')) && !ah.includes(R3) && !ah.includes(R4) && !ah.includes('남의 요청 422'), JSON.stringify(acs))

  // ── 4. M이 C2로 바꾸면: C2 요청은 내 것, C1 요청은 🏢
  const m2 = await ctxOf(M, { company: C2 })
  await openForm(m2)
  const m2cs = await chips(m2)
  ok('C2에서: 격리 행사 장비 422 는 내 요청, C1 요청은 🏢 회사 이름', m2cs[0] === 'mine:↺격리 행사 장비 422' && m2cs.some((c) => c.startsWith('other:🏢') && c.includes('조명 장비 422')), JSON.stringify(m2cs))
  const m2h = await m2.content()
  ok('C2 화면 자료에 C1 업체 이름 없음', !m2h.includes('음향하나422') && !m2h.includes('조명둘422'))

  // ── 5. 움직임 줄이기
  const r = await ctxOf(M, { company: C1, reduce: true })
  await openForm(r)
  await r.locator('[data-quote-reuse-chip="mine"]').first().click()
  await r.waitForTimeout(80)
  const ra = await r.evaluate(() => ({
    line: getComputedStyle(document.querySelector('[data-quote-reused]')).animationName,
    picked: document.querySelector('[data-quote-picked]') ? getComputedStyle(document.querySelector('[data-quote-picked]')).animationName : 'none',
    chip: [...document.querySelectorAll('input[name="vendor"]:checked')].map((c) => getComputedStyle(c.nextElementSibling).animationName),
    ring: getComputedStyle(document.querySelector('input[name="title"]')).animationName,
  }))
  ok('움직임 줄이기: 톡·테두리 움직임 없음', ra.line === 'none' && ra.picked === 'none' && ra.chip.every((x) => x === 'none') && ra.ring === 'none', JSON.stringify(ra))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch422: ${fails} FAIL` : '== batch422: ALL PASS')
})()
