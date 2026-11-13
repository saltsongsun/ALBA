// 묶음 244 (정기 개선 2026-11-14 05:40 KST)
// · 회사 설정: 다른 회사가 이미 쓰는 사업자등록번호면 바로 알려 주고 저장도 막음 (남의 번호가 계약서·명세서에 들어가지 않게)
//   원래 저장돼 있던 번호 그대로면 막지 않음 · 최고 관리자 '회사 만들기'도 이미 등록된 번호면 바로 알려 줌
// · 로그인: 휴대폰 번호 11자리를 다 치면 ✓가 뜨고 비밀번호 칸으로 바로 (한 번 덜 누르게)
// node scripts/qa/batch244.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000244c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const bizOf = async (id) => ((await rest(`companies?id=eq.${id}`)) ?? [])[0]?.business_no

;(async () => {
  // 다른 회사(새봄기획)가 105-87-12345를 씀
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새봄기획', business_no: '105-87-12345', created_at: '2026-10-20T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const biz = a.locator('#business_no')
  const check = a.locator('#business_no-check')
  const waitCheck = (v, p = a, id = 'business_no') => p.waitForFunction(([v, id]) => document.querySelector(`#${id}-check`)?.getAttribute('data-biz-check') === v, [v, id], { timeout: 8000 }).catch(() => {})
  const save = async () => {
    await a.getByRole('button', { name: '설정 저장' }).first().click()
    await a.waitForTimeout(1200)
  }
  const bodyText = () => a.locator('main').innerText().then(one)

  // ── 1. 회사 설정: 다른 회사 번호로 바꾸려 하면 바로 안내
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await biz.waitFor({ timeout: 15000 }).catch(() => {})
  await biz.fill('')
  await biz.pressSequentially('1058712345', { delay: 20 })
  await waitCheck('taken')
  ok("다른 회사 번호: '다른 회사가 이미 쓰는 번호예요 · 다시 확인해 주세요' (회사 이름은 안 알려 줌)",
    (await check.getAttribute('data-biz-check')) === 'taken' && one(await check.innerText()) === '다른 회사가 이미 쓰는 번호예요 · 다시 확인해 주세요', one(await check.innerText()))
  ok('안내는 한 줄 (360px)', (await check.evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 24)))
  ok("회사 설정에는 '기존 회사에 합류' 링크 없음", (await a.locator('[data-biz-join]').count()) === 0)
  if (SHOTS) {
    // 아래 탭에 가리지 않게 화면 가운데로 옮긴 뒤 찍음
    await biz.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    const bx = await biz.locator('xpath=..').boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/settings-biz-taken.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(180, bx.height + 24) } }).catch(() => {})
  }
  // 저장해도 막힘
  await save()
  ok("저장 → '다른 회사가 이미 쓰는 사업자등록번호예요' · 그대로 (123-45-67890)", (await bodyText()).includes('다른 회사가 이미 쓰는 사업자등록번호예요') && (await bizOf(C1)) === '123-45-67890', await bizOf(C1))

  // ── 2. 새 번호면 ✓ · 저장됨
  await biz.fill('')
  await biz.pressSequentially('1234567891', { delay: 20 })
  await waitCheck('free')
  ok("아무도 안 쓰는 번호: '✓ 올바른 사업자등록번호예요'", one(await check.innerText()) === '✓ 올바른 사업자등록번호예요')
  await save()
  ok('저장됨 (123-45-67891)', (await bizOf(C1)) === '123-45-67891', await bizOf(C1))

  // ── 3. 예전부터 같은 번호를 두 회사가 쓰고 있었으면: 번호를 안 바꾸고 저장하는 건 막지 않음
  await rest(`companies?id=eq.${C2}`, 'PATCH', { business_no: '123-45-67891' })
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await a.locator('input[name=contact_name]').fill('담당2')
  await save()
  const [c1b] = await rest(`companies?id=eq.${C1}`)
  ok('원래 번호 그대로면 다른 설정은 저장됨 (예전 자료 때문에 막히지 않게)', c1b?.contact_name === '담당2' && c1b?.business_no === '123-45-67891' && !(await bodyText()).includes('다른 회사가 이미 쓰는'), JSON.stringify({ n: c1b?.contact_name, b: c1b?.business_no }))
  ok('360px 옆으로 안 밀림 (회사 설정)', await noSide(a))

  // ── 4. 최고 관리자 '회사 만들기': 이미 등록된 번호면 바로 안내 (만드는 건 막지 않음)
  await a.goto(`${D}/admin/companies`, { waitUntil: 'networkidle' })
  const nb = a.locator('#new_business_no')
  await nb.waitFor({ timeout: 15000 }).catch(() => {})
  await nb.pressSequentially('1234567891', { delay: 20 })
  await waitCheck('taken', a, 'new_business_no')
  ok("회사 만들기: '이미 이 번호로 등록된 회사가 있어요 · 위 회사 목록에서 확인해 주세요'", one(await a.locator('#new_business_no-check').innerText()) === '이미 이 번호로 등록된 회사가 있어요 · 위 회사 목록에서 확인해 주세요')
  await nb.fill('')
  await nb.pressSequentially('2208162517', { delay: 20 })
  await waitCheck('free', a, 'new_business_no')
  ok("회사 만들기: 새 번호는 '✓ 올바른 사업자등록번호예요'", one(await a.locator('#new_business_no-check').innerText()) === '✓ 올바른 사업자등록번호예요')

  // ── 5. 로그인: 휴대폰 번호를 다 치면 ✓ · 비밀번호 칸으로
  const g = await (await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })).newPage()
  g.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await g.goto(`${D}/login`, { waitUntil: 'networkidle' })
  const phone = g.locator('#phone')
  await phone.click()
  await phone.pressSequentially('0103333444', { delay: 25 })
  ok('10자리까지는 ✓ 없음 · 그대로 번호 칸', (await g.locator('[data-phone-check]').count()) === 0 && (await g.evaluate(() => document.activeElement?.id)) === 'phone')
  await phone.pressSequentially('4', { delay: 25 })
  await g.waitForTimeout(250)
  ok("11자리 → '010-3333-4444' · ✓ · 비밀번호 칸으로 바로", (await phone.inputValue()) === '010-3333-4444' && (await g.locator('[data-phone-check]').count()) === 1 && (await g.evaluate(() => document.activeElement?.id)) === 'pin', await g.evaluate(() => document.activeElement?.id))
  if (SHOTS) {
    const bx = await g.locator('form').boundingBox()
    if (bx) await g.screenshot({ path: `${SHOTS}/login-phone-check.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: 220 } }).catch(() => {})
  }
  // 고치려고 지우면 ✓가 사라지고, 다시 채우면 또 비밀번호 칸으로
  await phone.click()
  await g.keyboard.press('End')
  await g.keyboard.press('Backspace')
  ok('한 자리 지우면 ✓ 사라짐 · 번호 칸에 그대로', (await g.locator('[data-phone-check]').count()) === 0 && (await g.evaluate(() => document.activeElement?.id)) === 'phone')
  await g.keyboard.type('4')
  ok('다시 채우면 비밀번호 칸으로', (await g.evaluate(() => document.activeElement?.id)) === 'pin')
  // 비밀번호를 이미 넣었으면 번호를 고쳐도 그 자리에 둠
  await g.keyboard.type('12')
  await phone.click()
  await g.keyboard.press('End')
  await g.keyboard.press('Backspace')
  await g.keyboard.type('4')
  ok('비밀번호를 이미 넣었으면 번호를 고쳐도 번호 칸에 그대로', (await g.evaluate(() => document.activeElement?.id)) === 'phone')
  ok('360px 옆으로 안 밀림 (로그인)', await noSide(g))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
