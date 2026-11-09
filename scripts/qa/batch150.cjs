// 묶음 150 (정기 개선 2026-11-09 00:35)
// · 외주사를 두 번 등록하지 않게: 같은 연락처·사업자등록번호면 쓰는 대로 '이미 등록된 외주사예요 / ○○ · 연락처가 같아요 ›'
//   저장을 눌러도 서버가 막음 (견적·대금이 두 업체로 나뉘지 않게) · 다른 번호면 그대로 등록
// node scripts/qa/batch150.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

;(async () => {
  // 준비: 이미 등록된 업체 (연락처 하이픈 있게 저장 · 사업자번호 하이픈 있게)
  await rest('vendors', 'POST', { id: '77777777-0000-4000-8000-000000001501', company_id: C, name: '한빛음향', category: '음향·조명', contact_name: '김대표', phone: '010-1111-2222', business_no: '123-45-67890', active: true })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/vendors?tab=list`)
  await a.getByText('＋ 외주사 등록').first().click()
  const f = a.locator('form', { hasText: '외주사 등록' })
  const hint = f.locator('[data-vendor-dup]')
  await f.locator('input[name=name]').fill('한빛음향 새로')
  ok('처음엔 안내 없음', (await hint.count()) === 0)
  // 하이픈 없이 써도 같은 번호면
  await f.locator('input[name=phone]').pressSequentially('01011112222')
  await hint.waitFor({ timeout: 3000 }).catch(() => {})
  ok("같은 연락처: '이미 등록된 외주사예요' / '한빛음향 · 연락처가 같아요'", (await hint.innerText().catch(() => '')).replace(/\n/g, ' / ').includes('이미 등록된 외주사예요 / 한빛음향 · 연락처가 같아요'), await hint.innerText().catch(() => ''))
  ok('안내를 누르면 그 업체 화면', ((await hint.getAttribute('href')) ?? '').startsWith('/admin/vendors/77777777'))
  ok('안내 두 줄로 잘리지 않음 · 360px 옆으로 안 밀림', (await hint.evaluate((el) => { const t = el.querySelector('span span:last-child'); return t.scrollWidth <= t.clientWidth + 1 && el.getBoundingClientRect().height < 70 })) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  if (SHOTS) await hint.scrollIntoViewIfNeeded().then(() => a.screenshot({ path: `${SHOTS}/vendor-dup.png` })).catch(() => {})
  // 그래도 누르면 서버가 막음
  await f.getByRole('button', { name: '외주사 등록' }).click()
  ok('저장하면 서버도 막음 (같은 연락처)', await see(a, '이미 등록된 외주사예요 · 한빛음향 (같은 연락처). 업체 탭에서 그 업체를 고쳐 주세요.', 10000))
  ok('업체가 두 번 생기지 않음', (await rest('vendors')).filter((v) => String(v.phone).replace(/\D/g, '') === '01011112222').length === 1)

  // 번호를 바꾸면 안내가 사라짐 · 사업자등록번호가 같으면 다시
  await f.locator('input[name=phone]').fill('')
  await f.locator('input[name=phone]').pressSequentially('01099998888')
  await a.waitForTimeout(150)
  ok('다른 번호면 안내 사라짐', (await hint.count()) === 0)
  await f.locator('input[name=business_no]').pressSequentially('1234567890')
  await hint.waitFor({ timeout: 3000 }).catch(() => {})
  ok("같은 사업자등록번호: '한빛음향 · 사업자등록번호가 같아요'", (await hint.innerText().catch(() => '')).includes('한빛음향 · 사업자등록번호가 같아요'), await hint.innerText().catch(() => ''))
  await f.locator('input[name=business_no]').fill('')
  await a.waitForTimeout(150)
  // 다른 번호·사업자번호 없음 → 그대로 등록
  await f.getByRole('button', { name: '외주사 등록' }).click()
  ok('다른 번호면 그대로 등록', await see(a, '한빛음향 새로을(를) 외주사로 등록했어요', 15000))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
