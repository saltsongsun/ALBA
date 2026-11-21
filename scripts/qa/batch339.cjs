// 묶음 339 (정기 개선 2026-11-21 17:35 KST · 최고 관리자 회사 관리: 확인 기다리는 회사가 맨 위)
// · 회사 목록 순서: 확인을 기다리는 회사(오래 기다린 순) → 쓰는 회사 → 사용 중지 (새로 가입한 회사가 맨 아래에 묻히지 않게)
// · 위 안내에 '확인할 회사 보기 ↓' → 그 카드로 내려가며 테두리 한 번 · 확인 기다리는 회사 담당자 번호 옆 전화·문자 버튼
// · 확인 완료하면 확인 기다리는 묶음에서 빠짐 · 360px
// node scripts/qa/batch339.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C1 = '99999999-0000-4000-8000-000000000099'
const W1 = '99999999-0000-4000-8000-0000003390a1', W2 = '99999999-0000-4000-8000-0000003390a2', OFF = '99999999-0000-4000-8000-0000003390f0'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 확인 기다리는 회사 둘 (먼저 가입한 W1 · 나중 W2) + 사용 중지 회사 하나 (가장 먼저 만들었어도 맨 아래)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const mkCo = (id, name, verified, active, created_at, contact_name, contact_phone) =>
    rest('companies', 'POST', { ...c1, id, company_name: name, verified, active, created_at, contact_name, contact_phone })
  await mkCo(OFF, '쉬는회사', true, false, '2026-01-01T00:00:00Z', null, null)
  await mkCo(W2, '늦게온행사', false, true, '2026-11-15T00:00:00Z', '박담당', '01033903392')
  await mkCo(W1, '먼저온행사', false, true, '2026-11-10T00:00:00Z', '김담당', '01033903391')

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const go = async () => { await a.goto(`${D}/admin/companies`, { waitUntil: 'networkidle' }); await a.waitForTimeout(300) }
  const order = () => a.locator('[data-company-card]').evaluateAll((els) => els.map((e) => e.id.replace('company-', '')))

  // ── 1. 순서: 확인 기다리는 회사(먼저 가입한 순) → 쓰는 회사 → 사용 중지
  await go()
  const ids = await order()
  ok('맨 위 둘: 확인 기다리는 회사 (먼저 가입한 먼저온행사 → 늦게온행사)', ids[0] === W1 && ids[1] === W2, JSON.stringify(ids.slice(0, 3)))
  ok('쓰는 회사(기본 회사 포함)가 그 다음 · 사용 중지는 맨 아래', ids.indexOf(C1) === 2 && ids[ids.length - 1] === OFF)
  const kinds = await a.locator('[data-company-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-company-card')))
  ok("카드 표시: 'waiting' 둘 → 'active' → 'off'", kinds[0] === 'waiting' && kinds[1] === 'waiting' && kinds[2] === 'active' && kinds[kinds.length - 1] === 'off', kinds.join(','))

  // ── 2. 확인 기다리는 회사 담당자: 번호 옆 전화·문자
  const w1 = a.locator(`#company-${W1}`)
  ok("담당 '김담당 · 가입 2026-11-10' + 번호", one(await w1.innerText()).includes('담당 김담당 · 가입 2026-11-10') && (await w1.getByText('010-3390-3391').count()) >= 1)
  ok('전화 버튼(tel:) · 문자 버튼(sms:)', (await w1.locator('[data-company-contact] a[href="tel:01033903391"]').count()) === 1 && (await w1.locator('[data-company-contact] a[href^="sms:01033903391"]').count()) === 1)
  ok('확인 끝난 회사(기본 회사)에는 담당 전화 줄 없음', (await a.locator(`#company-${C1} [data-company-contact]`).count()) === 0)

  // ── 3. 안내 '확인할 회사 보기 ↓' → 그 카드로 · 테두리 한 번
  const banner = a.locator('[data-companies-waiting]')
  ok("안내: '확인을 기다리는 회사 2곳' + '확인할 회사 보기 ↓'", (await banner.getAttribute('data-companies-waiting')) === '2' && one(await banner.innerText()).includes('확인을 기다리는 회사 2곳') && (await a.locator('[data-companies-waiting-go]').getAttribute('href')) === `#company-${W1}`)
  await a.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await a.waitForTimeout(200)
  await a.locator('[data-companies-waiting-go]').scrollIntoViewIfNeeded()
  await a.locator('[data-companies-waiting-go]').click()
  await a.waitForTimeout(100)
  const anim = await w1.evaluate((e) => getComputedStyle(e).animationName)
  await a.waitForTimeout(500)
  ok('누르면 #company-… · 그 카드가 화면 안 · 테두리 한 번', new URL(a.url()).hash === `#company-${W1}` && anim === 'flash-ring' && (await w1.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight })), anim)
  ok('360px 옆으로 밀림 없음', await noSide(a))
  if (SHOTS) {
    await a.evaluate(() => scrollTo(0, 0))
    await a.waitForTimeout(300)
    await a.screenshot({ path: `${SHOTS}/companies-waiting.png` })
  }

  // ── 4. 먼저온행사 확인 완료 → 기다리는 묶음에서 빠지고 안내는 1곳
  await w1.getByRole('button', { name: '확인 완료' }).click()
  await w1.getByRole('button', { name: '확인할까요? 전체 회원 명단이 열려요' }).click()
  await a.waitForLoadState('networkidle')
  await a.waitForTimeout(400)
  await go()
  const ids2 = await order()
  ok('확인하면 맨 위는 늦게온행사 · 먼저온행사는 쓰는 회사 쪽으로', ids2[0] === W2 && ids2.indexOf(W1) > ids2.indexOf(C1) && ids2[ids2.length - 1] === OFF, JSON.stringify(ids2))
  ok("안내 '확인을 기다리는 회사 1곳' · 바로 가기는 늦게온행사", (await banner.getAttribute('data-companies-waiting')) === '1' && (await a.locator('[data-companies-waiting-go]').getAttribute('href')) === `#company-${W2}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
