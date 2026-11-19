// 묶음 313 (정기 개선 2026-11-19 12:35 KST)
// · 현장 긴급 투입 QR 종이: 공고 이름 아래 '🏢 회사 이름' (여러 회사가 같은 행사장에 QR을 붙여도 어느 회사인지 바로)
//   다른 회사 관리자는 이 QR 화면을 못 엶 (회사 이름·공고가 안 보임)
// · 외주 관리를 여는 동안 같은 모양의 불러오기 화면 (제목 · 지급할 금액 칸 · 탭 셋 · 견적 카드)
//   업체·견적 상세는 목록 모양을 쓰지 않음 (잘못된 주소는 그대로 '없는 화면' 안내)
// node scripts/qa/batch313.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000313'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000313a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const coName = c1.company_name
  const [job] = await rest(`jobs?id=eq.${J}`)
  // 다른 회사(C2)만 맡은 관리자
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼일삼컴퍼니', seal_image: null, verified: true, join_code: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  const { attendance: _a, ratings: _r, ...ab } = a1
  await rest('users', 'POST', { ...ab, id: A2, name: '다른회사관리자', phone: '01031303130', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-15T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. QR 종이: 공고 이름 아래 회사 이름
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/${J}/qr`, { waitUntil: 'networkidle' })
  const qc = a.locator('.print-sheet [data-qr-company]')
  ok(`QR 종이에 '🏢 ${coName}'`, one(await qc.textContent().catch(() => '')) === `🏢 ${coName}`, one(await qc.textContent().catch(() => '')))
  const order = await a.evaluate(() => {
    const s = document.querySelector('.print-sheet')
    const h = s?.querySelector('h1'), c = s?.querySelector('[data-qr-company]')
    return !!h && !!c && h.nextElementSibling === c
  })
  ok('회사 이름은 공고 이름 바로 아래', order)
  ok("'긴급 투입' · QR 그림 · 오늘 합류한 사람 칸은 그대로", one(await a.locator('.print-sheet').textContent()).includes('긴급 투입') && (await a.locator('.print-sheet svg, .print-sheet img, .print-sheet canvas').count()) > 0)
  ok('360px 옆으로 안 밀림 (QR 화면)', await noSide(a))
  if (SHOTS) await a.locator('.print-sheet').screenshot({ path: `${SHOTS}/qr-company.png` }).catch(() => {})
  // 인쇄 모양에서도 회사 이름이 보임
  await a.emulateMedia({ media: 'print' })
  ok('인쇄할 때도 회사 이름이 보임', await qc.isVisible().catch(() => false))
  await a.emulateMedia({ media: 'screen' })

  // ── 2. 다른 회사 관리자: 이 QR 화면을 못 엶
  const o = await mk(A2)
  const r = await o.goto(`${D}/admin/jobs/${J}/qr`, { waitUntil: 'networkidle' })
  const body = one(await o.locator('body').textContent().catch(() => ''))
  ok('다른 회사 관리자: 회사 이름·공고 이름·QR이 안 보임', (await o.locator('[data-qr-company], .print-sheet').count()) === 0 && !body.includes(job.title) && !body.includes(coName), `status=${r?.status()}`)
  ok('다른 회사 관리자: 없는 화면 안내', (await o.locator('[data-admin-404], [data-404]').count()) > 0 || r?.status() === 404, `status=${r?.status()}`)

  // ── 3. 외주 관리 여는 동안 같은 모양
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await a.evaluate(() => window.next?.router?.prefetch('/admin/vendors'))
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForTimeout(800)
  const slow = async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch']) await new Promise((res) => setTimeout(res, 1500))
    await route.continue().catch(() => {})
  }
  await a.route('**/admin/vendors**', slow)
  await a.evaluate(() => window.next?.router?.push('/admin/vendors'))
  const sk = a.locator('[data-skeleton="vendors"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('여는 동안 외주 관리 모양 (지급할 금액 칸 · 탭 셋 · 견적 카드 둘)', shown && (await sk.locator('.card').count()) === 4 && (await sk.locator('.border-b-2').count()) === 3, `shown=${shown}`)
  ok('360px 옆으로 안 밀림 (불러오는 중)', await noSide(a))
  if (SHOTS && shown) await a.screenshot({ path: `${SHOTS}/vendors-skeleton.png` })
  await a.getByRole('heading', { name: '외주 관리' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('다 열리면 실제 화면 (불러오기 모양은 사라짐)', (await a.getByRole('heading', { name: '외주 관리' }).count()) === 1 && (await sk.count()) === 0)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/vendors-loaded.png` })
  // 탭을 바꿀 때는 지금 화면을 그대로 두고 바뀜 (탭이 깜빡이지 않게)
  let flashed = false
  const watch = setInterval(() => sk.count().then((n) => { if (n) flashed = true }).catch(() => {}), 50)
  await a.getByRole('link', { name: /^대금 지급/ }).click()
  await a.waitForURL(/tab=pay/, { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  clearInterval(watch)
  ok('탭을 바꿀 때는 불러오기 모양이 안 나옴 (제목·탭 그대로)', !flashed && (await a.getByRole('heading', { name: '외주 관리' }).count()) === 1)
  await a.unroute('**/admin/vendors**')

  // ── 4. 업체·견적 상세: 목록 모양 불러오기를 쓰지 않음 · 잘못된 주소는 그대로 '없는 화면' 안내
  for (const path of ['/admin/vendors/00000000-0000-4000-8000-000000000000', '/admin/vendors/requests/00000000-0000-4000-8000-000000000000']) {
    await a.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    ok(`없는 ${path.includes('requests') ? '견적 요청' : '업체'} 주소 → '없는 화면' 안내 · 목록 모양 없음`, (await a.locator('[data-admin-404], [data-404]').count()) > 0 && (await sk.count()) === 0)
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
