// 묶음 194 (정기 개선 2026-11-11 10:35 KST)
// · 견적 비교: 부가세 포함·별도가 섞여 있으면 부가세 포함 금액으로 견줌 (순서·'최저가'·'최저 ○원' 모두)
//   - 부가세 별도 견적 아래에 '부가세 더하면 ○원' · 섞였을 때만 안내 한 줄 · 견적 요청 목록의 '최저'도 같은 기준
// · 업체가 여는 견적 링크: 주소가 틀리면 업체용 안내 ('견적 링크를 열 수 없어요' — '모집 중인 알바' 버튼 없음)
//   - 견적 화면: 마감까지 남은 날 ('오늘까지'·'내일까지'·'3일 남음') · 문의 번호는 010-1234-5678 모양, 누르는 높이 40px
// · 전문가·외주 업체 '견적·대금': 거래하는 회사가 두 곳 이상이면 회사별로 골라 보기 (회사마다 받을 대금)
// node scripts/qa/batch194.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000019402'
const V1 = '77777777-0000-4000-8000-000000019401', V2 = '77777777-0000-4000-8000-000000019402'
const R = 'dddddddd-0000-4000-8000-000000019401', Q1 = 'eeeeeeee-0000-4000-8000-000000019401', Q2 = 'eeeeeeee-0000-4000-8000-000000019402'
const T1 = 'tok194aaaaaaaaaaaaaaaaaaaa', T2 = 'tok194bbbbbbbbbbbbbbbbbbbb'
const P = 'bbbbbbbb-0000-4000-8000-000000019401' // 외주 업체 계정 (두 회사와 거래)
const VP1 = '77777777-0000-4000-8000-000000019411', VP2 = '77777777-0000-4000-8000-000000019412'
const R2 = 'dddddddd-0000-4000-8000-000000019402'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString(), today = kstDay(Date.now())
  const vbase = { company_id: C1, category: '음향·조명', contact_name: '김대표', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, user_id: null, created_at: nowIso }
  await rest('vendors', 'POST', { ...vbase, id: V1, name: '한빛음향', phone: '01050001941' })
  await rest('vendors', 'POST', { ...vbase, id: V2, name: '두리렌탈', phone: '01050001942', category: '장비·렌탈' })
  await rest('quote_requests', 'POST', { id: R, company_id: C1, title: '메인 무대 음향 2일', details: '메인 스피커 4조, 무선마이크 6개', due_date: today, job_id: J, status: 'open', created_by: A, created_at: nowIso })
  const qbase = { request_id: R, status: 'submitted', submitted_at: nowIso, submitted_by: 'vendor', created_at: nowIso }
  await rest('quotes', 'POST', { ...qbase, id: Q1, vendor_id: V1, token: T1, amount: 1500000, vat_included: true, note: '설치·철수 포함' })
  await rest('quotes', 'POST', { ...qbase, id: Q2, vendor_id: V2, token: T2, amount: 1400000, vat_included: false, note: null })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message))
    return p
  }
  const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) } }
  const open = async (p, path) => { const r = await p.goto(D + path); await p.waitForLoadState('networkidle').catch(() => {}); return r }

  // ── 1. 견적 비교: 포함 150만 vs 별도 140만(=154만) → 포함 기준으로 150만이 최저
  const a = await pg(A)
  const detail = `/admin/vendors/requests/${R}`
  const names = () => a.locator('a[href^="/admin/vendors/77777777"]').allTextContents().then((l) => l.map(one))
  const lowestCard = () => a.locator('div.card', { has: a.locator('[data-quote-lowest]') }).innerText().then(one, () => '')
  await open(a, detail)
  ok("섞였을 때 안내 한 줄 ('부가세 포함 금액으로 견줬어요')", one(await a.locator('[data-quote-vat-mixed]').innerText().catch(() => '')).includes('부가세 포함 금액으로 견줬어요'))
  ok("'최저가'는 부가세 포함 150만 원 업체에 (별도 140만 원 업체가 아님)", (await lowestCard()).includes('한빛음향') && (await a.locator('[data-quote-lowest]').count()) === 1, await lowestCard())
  ok('싼 순서도 부가세 포함 기준 (한빛음향 → 두리렌탈)', JSON.stringify(await names()) === JSON.stringify(['한빛음향', '두리렌탈']), JSON.stringify(await names()))
  const vt = a.locator('[data-quote-vat-total]')
  ok("별도 견적 아래 '부가세 더하면 1,540,000원' (하나만)", (await vt.count()) === 1 && one(await vt.first().innerText().catch(() => '')) === '부가세 더하면 1,540,000원', one(await vt.first().innerText().catch(() => '')))
  ok("위 '최저 1,500,000원'", one(await a.locator('[data-quote-low]').innerText().catch(() => '')) === '최저 1,500,000원', one(await a.locator('[data-quote-low]').innerText().catch(() => '')))
  ok('적힌 금액은 그대로 (1,400,000원 · 부가세 별도)', one(await a.locator('div.card', { hasText: '두리렌탈' }).innerText()).includes('1,400,000원') && one(await a.locator('div.card', { hasText: '두리렌탈' }).innerText()).includes('부가세 별도'))
  ok('360px: 옆으로 안 밀림 (견적 비교)', await noSide(a))
  await shot(a, '1-compare-mixed')

  // 목록: '최저 1,500,000원 부가세 포함' (한 덩어리, 꺾이지 않음)
  await open(a, '/admin/vendors')
  const row = a.locator(`a[href="${detail}"]`)
  const lowEl = row.locator('[data-request-low]')
  ok("목록의 최저도 같은 기준 ('최저 1,500,000원 부가세 포함')", one(await lowEl.innerText().catch(() => '')) === '최저 1,500,000원 부가세 포함', one(await lowEl.innerText().catch(() => '')))
  ok("'최저 ○원 부가세 포함'은 한 줄", await lowEl.evaluate((el) => el.getClientRects().length === 1).catch(() => false))
  ok('360px: 옆으로 안 밀림 (목록)', await noSide(a))
  await shot(a, '2-list')

  // 둘 다 부가세 포함이면: 안내·'부가세 더하면' 없음, 140만 원이 최저
  await rest(`quotes?id=eq.${Q2}`, 'PATCH', { vat_included: true })
  await open(a, detail)
  ok('둘 다 포함: 안내 없음 · 140만 원 업체가 최저가', (await a.locator('[data-quote-vat-mixed]').count()) === 0 && (await vt.count()) === 0 && (await lowestCard()).includes('두리렌탈'), await lowestCard())
  await open(a, '/admin/vendors')
  ok("둘 다 포함: 목록은 '최저 1,400,000원'만", one(await lowEl.innerText().catch(() => '')) === '최저 1,400,000원', one(await lowEl.innerText().catch(() => '')))

  // 둘 다 부가세 별도면: 섞이지 않았으니 안내 없음, 둘 다 '부가세 더하면', 최저는 포함 금액
  await rest(`quotes?id=eq.${Q1}`, 'PATCH', { vat_included: false })
  await rest(`quotes?id=eq.${Q2}`, 'PATCH', { vat_included: false })
  await open(a, detail)
  ok("둘 다 별도: 안내 없음 · 둘 다 '부가세 더하면' · 최저 1,540,000원", (await a.locator('[data-quote-vat-mixed]').count()) === 0 && (await vt.count()) === 2 && one(await a.locator('[data-quote-low]').innerText().catch(() => '')) === '최저 1,540,000원', `${await vt.count()}개 · ${one(await a.locator('[data-quote-low]').innerText().catch(() => ''))}`)

  // ── 2. 업체가 여는 견적 링크
  const g = await pg('')
  for (const [label, path] of [['없는 링크', '/quote/zzzzzzzzzzzzzzzzzzzzzzzz'], ['잘린 링크', `/quote/${T1.slice(0, 9)}`]]) {
    const res = await open(g, path)
    const card = one(await g.locator('[data-quote-404]').innerText().catch(() => ''))
    ok(`${label}: 업체용 안내 ('견적 링크를 열 수 없어요' · 다시 보내 달라고)`, card.includes('견적 링크를 열 수 없어요') && card.includes('링크를 다시 보내 달라고') && res.status() === 404, `${res.status()} ${card.slice(0, 40)}`)
    ok(`${label}: 알바용 버튼('모집 중인 알바'·'내 근무') 없음`, !card.includes('모집 중인 알바') && !card.includes('내 근무') && (await g.locator('[data-404]').count()) === 0)
  }
  ok("가입한 업체는 '받은 견적 보기'로", (await g.locator('[data-quote-404-app]').getAttribute('href').catch(() => '')) === '/pro/money')
  ok('360px: 옆으로 안 밀림 (링크 안내)', await noSide(g))
  await shot(g, '3-quote-404')

  // 견적 화면: 마감까지 남은 날 · 문의 번호
  await rest(`quotes?id=eq.${Q2}`, 'PATCH', { status: 'requested', amount: null, vat_included: true, submitted_at: null, submitted_by: null })
  const left = g.locator('[data-quote-left]')
  await open(g, `/quote/${T2}`)
  ok("마감이 오늘: '오늘까지'", one(await left.innerText().catch(() => '')) === '오늘까지', one(await left.innerText().catch(() => '')))
  const tel = g.locator('[data-quote-contact]')
  ok('문의 번호는 010-1234-5678 모양 · 누르면 전화', /\d{2,3}-\d{3,4}-\d{4}/.test(await tel.innerText().catch(() => '')) && /^tel:\d+$/.test((await tel.getAttribute('href').catch(() => '')) ?? ''), `${one(await tel.innerText().catch(() => ''))} → ${await tel.getAttribute('href').catch(() => '')}`)
  ok('문의 번호 누르는 높이 40px 이상', await tel.evaluate((el) => el.getBoundingClientRect().height >= 40).catch(() => false))
  ok('360px: 옆으로 안 밀림 (견적 화면)', await noSide(g))
  await shot(g, '4-quote-today')
  await rest(`quote_requests?id=eq.${R}`, 'PATCH', { due_date: kstDay(Date.now() + 864e5) })
  await open(g, `/quote/${T2}`)
  ok("마감이 내일: '내일까지'", one(await left.innerText().catch(() => '')) === '내일까지', one(await left.innerText().catch(() => '')))
  await rest(`quote_requests?id=eq.${R}`, 'PATCH', { due_date: kstDay(Date.now() + 3 * 864e5) })
  await open(g, `/quote/${T2}`)
  ok("마감이 사흘 뒤: '3일 남음'", one(await left.innerText().catch(() => '')) === '3일 남음', one(await left.innerText().catch(() => '')))
  await rest(`quote_requests?id=eq.${R}`, 'PATCH', { due_date: kstDay(Date.now() - 864e5) })
  await open(g, `/quote/${T2}`)
  ok("마감이 지났으면 남은 날 대신 '지났지만 아직 받고 있어요'", (await left.count()) === 0 && (await g.locator('main, body').first().innerText()).includes('지났지만 아직 받고 있어요'))
  await rest(`quote_requests?id=eq.${R}`, 'PATCH', { status: 'closed' })
  await open(g, `/quote/${T2}`)
  ok('마감된 요청에는 남은 날 없음', (await left.count()) === 0 && (await g.locator('body').innerText()).includes('견적 접수가 마감됐어요'))

  // ── 3. 외주 업체 '견적·대금': 회사별로 보기
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '소리나라', phone: '01019400001', member_type: 'vendor', created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP1, name: '소리나라', phone: '01019400001', user_id: P })
  const pay = { vendor_id: VP1, company_id: C1, job_id: null, quote_id: null, vat_included: true, due_date: today, paid_at: null, invoice_at: null, memo: null, created_at: nowIso }
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000000194b1', title: '개막식 음향', amount: 1500000 })
  const p = await pg(P)
  await open(p, '/pro/money')
  ok('거래하는 회사가 한 곳이면 회사 고르기 없음', (await p.locator('[data-pro-firms]').count()) === 0 && (await p.locator('main').innerText()).includes('개막식 음향'))

  // 두 번째 회사: 견적 요청 1건 + 받을 대금 80만 + 받은 대금 30만
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP2, company_id: C2, name: '소리나라', phone: '01019400001', user_id: P })
  await rest('quote_requests', 'POST', { id: R2, company_id: C2, title: '송년회 음향', details: null, due_date: today, job_id: null, status: 'open', created_by: A, created_at: nowIso })
  await rest('quotes', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000019403', request_id: R2, vendor_id: VP2, token: 'tok194cccccccccccccccccccc', status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, submitted_by: null, created_at: nowIso })
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000000194b2', vendor_id: VP2, company_id: C2, title: '체육대회 음향', amount: 800000 })
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000000194b3', vendor_id: VP2, company_id: C2, title: '워크숍 음향', amount: 300000, paid_at: today })
  await open(p, '/pro/money')
  const firms = p.locator('[data-pro-firms]')
  const chips = () => firms.locator('a').allInnerTexts().then((l) => l.map(one))
  ok("두 곳 이상이면 회사 고르기 (전체 · 받을 대금 큰 회사부터 · 회사마다 '받을 ○')", JSON.stringify(await chips()) === JSON.stringify(['전체', '주식회사 테스트 받을 150만 원', '두번째기획 받을 80만 원']), JSON.stringify(await chips()))
  const main = () => p.locator('main').innerText().then(one)
  ok('전체: 받을 대금 2건 2,300,000원 · 받은 대금 1건', (await main()).includes('받을 대금 2건 2,300,000원') && (await main()).includes('받은 대금 1건 300,000원'), (await main()).slice(0, 160))
  ok('회사 고르기는 한 줄 (칩 높이 그대로)', await firms.evaluate((el) => el.getBoundingClientRect().height <= 48))
  ok('360px: 옆으로 안 밀림 (견적·대금)', await noSide(p))
  await shot(p, '5-pro-money-all')

  await firms.locator(`[data-pro-firm="${C2}"]`).click()
  await p.waitForURL(new RegExp(`co=${C2}`), { timeout: 8000 }).catch(() => {})
  await p.waitForLoadState('networkidle').catch(() => {})
  const lists = () => p.locator('main section').allInnerTexts().then((l) => one(l.join(' ')))
  ok('두번째기획만: 받을 대금 1건 800,000원 · 받은 대금 1건 300,000원', (await lists()).includes('받을 대금 1건 800,000원') && (await lists()).includes('받은 대금 1건 300,000원'), (await lists()).slice(0, 120))
  ok('두번째기획만: 그 회사 견적·대금만 (다른 회사 것은 안 보임)', (await lists()).includes('송년회 음향') && (await lists()).includes('체육대회 음향') && !(await lists()).includes('개막식 음향') && !(await lists()).includes('주식회사 테스트'), (await lists()).slice(0, 200))
  ok('고른 회사 칩이 켜짐', (await firms.locator(`[data-pro-firm="${C2}"]`).getAttribute('aria-current')) === 'true' && (await firms.locator('a').first().getAttribute('aria-current')) === null)
  await shot(p, '6-pro-money-company')

  await firms.locator(`[data-pro-firm="${C1}"]`).click()
  await p.waitForURL(new RegExp(`co=${C1}`), { timeout: 8000 }).catch(() => {})
  await p.waitForLoadState('networkidle').catch(() => {})
  ok('주식회사 테스트만: 받을 대금 1건 1,500,000원 · 견적 요청은 없음', (await lists()).includes('받을 대금 1건 1,500,000원') && (await lists()).includes('개막식 음향') && !(await lists()).includes('송년회 음향'), (await lists()).slice(0, 160))

  // 내가 거래하지 않는 회사 번호를 주소에 넣어도 전체로 (남의 것은 볼 수 없음)
  await open(p, '/pro/money?co=99999999-0000-4000-8000-00000001949f')
  ok('모르는 회사 번호 → 전체 보기', (await firms.locator('a').first().getAttribute('aria-current')) === 'true' && (await main()).includes('받을 대금 2건 2,300,000원'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
