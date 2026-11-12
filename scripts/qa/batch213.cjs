// 묶음 213 (정기 개선 2026-11-12 09:36 KST)
// · 공고 쓰기 · 고치기: '담당자 연락처'를 비우면 근무자에게 무엇이 보이는지 바로 아래 안내
//   - 회사 문의 번호가 있으면 '비우면 근무자에게 회사 번호(담당 010-…)가 보여요' (묶음 212의 대신 보여 주기와 같은 번호)
//   - 회사 번호도 없으면 주황 '비우면 근무 날 근무자가 연락할 번호가 없어요' · 번호를 쓰면 안내가 사라짐 (최근 담당 칩으로 채워도)
// · 회사 설정: 문의 연락처 안내 '로그인·현장 연락처로 보여요' · 회사 설정을 여는 동안 설정 화면 모양의 불러오는 화면
// node scripts/qa/batch213.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const phone = () => p.locator('input[name=manager_phone]')
  const hint = () => phone().locator('xpath=following-sibling::p[1]')
  const openGuide = async () => {
    await p.locator('summary', { hasText: '근무 안내' }).first().click()
    await phone().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  }

  // ── 1. 새 공고: 비우면 회사 번호가 보인다고 알려 줌
  await p.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
  await openGuide()
  ok("비어 있으면 '비우면 근무자에게 회사 번호(담당 010-1234-5678)가 보여요'", one(await hint().innerText().catch(() => '')) === '비우면 근무자에게 회사 번호(담당 010-1234-5678)가 보여요' && (await hint().getAttribute('data-warn')) === null, one(await hint().innerText().catch(() => '')))
  const lines = await hint().locator('span').evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    const rects = [...r.getClientRects()]
    const tops = [...new Set(rects.map((x) => Math.round(x.top)))]
    const widths = tops.map((t) => rects.filter((x) => Math.round(x.top) === t).reduce((s, x) => s + x.width, 0))
    return { n: tops.length, widths, wrap: getComputedStyle(el).textWrap }
  })
  ok('안내는 두 줄 이내 · 두 줄이면 고르게 (마지막 줄이 첫 줄의 절반 이상) · 화면 안 · 옆으로 안 밀림', lines.n <= 2 && lines.wrap.includes('balance') && (lines.n === 1 || lines.widths[1] >= lines.widths[0] * 0.5) && (await hint().evaluate((el) => el.getBoundingClientRect().right <= innerWidth - 8)) && (await noSide(p)), JSON.stringify(lines))
  if (SHOTS) {
    await phone().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    const box = await phone().boundingBox()
    if (box) await p.screenshot({ path: `${SHOTS}/job-mgr-hint.png`, clip: { x: 0, y: Math.max(0, box.y - 140), width: 360, height: 260 } }).catch(() => {})
  }
  await phone().pressSequentially('01099998888')
  await p.waitForTimeout(150)
  ok('번호를 쓰면 안내가 사라짐', (await hint().count()) === 0 && (await phone().inputValue()) === '010-9999-8888')
  await phone().fill('')
  await phone().dispatchEvent('input')
  await p.waitForTimeout(150)
  ok('다시 비우면 안내가 돌아옴', one(await hint().innerText().catch(() => '')).startsWith('비우면 근무자에게 회사 번호'))
  // 최근 담당 칩으로 채워도 사라짐
  const chip = p.locator('[data-recent="manager"] button').first()
  if (await chip.count()) {
    await chip.click()
    await p.waitForTimeout(200)
    ok('최근 담당 칩으로 채워도 안내가 사라짐', (await hint().count()) === 0 || (await phone().inputValue()) === '')
  }

  // ── 2. 회사 번호도 없으면 주황 안내
  await rest(`companies?id=eq.${C1}`, 'PATCH', { contact_phone: null, company_phone: null })
  await p.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
  await openGuide()
  ok("회사 번호도 없으면 주황 '비우면 근무 날 근무자가 연락할 번호가 없어요'", one(await hint().innerText().catch(() => '')) === '비우면 근무 날 근무자가 연락할 번호가 없어요' && (await hint().getAttribute('data-warn')) === '', one(await hint().innerText().catch(() => '')))
  if (SHOTS) {
    await phone().evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    const box = await phone().boundingBox()
    if (box) await p.screenshot({ path: `${SHOTS}/job-mgr-warn.png`, clip: { x: 0, y: Math.max(0, box.y - 140), width: 360, height: 260 } }).catch(() => {})
  }
  await rest(`companies?id=eq.${C1}`, 'PATCH', { contact_phone: c1.contact_phone, company_phone: c1.company_phone })

  // ── 3. 공고 고치기: 이미 번호가 있으면 안내 없음
  await p.goto(`${D}/admin/jobs/${J}/edit`, { waitUntil: 'networkidle' })
  await openGuide()
  ok('번호가 있는 공고 고치기: 안내 없음', (await phone().inputValue()) !== '' && (await hint().count()) === 0)

  // ── 4. 회사 설정: 문의 연락처 안내 · 여는 동안 설정 모양
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  // '더보기'를 열면 안의 링크가 화면 모양(불러오는 화면)을 미리 받아 둠 → 그 뒤 화면 내용 응답만 1.5초 늦춤 (느린 휴대폰 망처럼)
  await p.getByRole('button', { name: '더보기' }).click()
  await p.waitForLoadState('networkidle').catch(() => {})
  await p.waitForTimeout(500)
  await p.route('**/admin/settings**', async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {})
  })
  await p.getByRole('link', { name: '회사 설정' }).last().click()
  const sk = p.locator('[data-skeleton="settings"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('회사 설정을 여는 동안 설정 화면 모양 (대시보드 모양 아님)', shown && (await sk.locator('.card').count()) >= 3 && (await sk.locator('.border-dashed').count()) === 1)
  if (SHOTS && shown) await p.screenshot({ path: `${SHOTS}/settings-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})
  ok('불러오는 화면도 360px 옆으로 안 밀림', await noSide(p))
  await p.locator('input[name=contact_phone]').waitFor({ timeout: 15000 }).catch(() => {})
  await p.unroute('**/admin/settings**')
  const ch = p.locator('[data-contact-hint]')
  ok("다 열리면 설정 화면 · 문의 연락처 안내 '로그인·현장 연락처로 보여요' (한 줄)", (await sk.count()) === 0 && one(await ch.innerText().catch(() => '')) === '로그인·현장 연락처로 보여요' && (await ch.evaluate((el) => el.getBoundingClientRect().height < 22)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
