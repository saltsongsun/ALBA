// 묶음 40: 내 정보 '급여 계좌 · 연락 정보' — 칸마다 이름표(은행·계좌번호·예금주·주소·비상연락처)라 값이 채워져 있어도 무슨 칸인지 보임
//          · 아직 빈 꼭 필요한 칸(계좌번호·주소)은 노란 테두리(쓰기 시작하면 사라짐, 다시 지우면 다시) · 선택인 비상연락처는 테두리 없음 · '정보 채우기'에서 누르면 그 칸으로 바로 + 커서
//          · 다 채운 칸은 테두리 없음 · 360px
// node scripts/qa/batch40.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 주소만 있고 계좌·비상연락처는 빈 근무자
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, bank_name: null, emergency_phone: null, address: '서울 중구 세종대로 110' })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/me/profile`)
  const form = p.locator('#account form')
  await form.waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForLoadState('networkidle').catch(() => {})

  // ── 1. 이름표 ──
  const labels = await form.locator('label').allInnerTexts()
  ok('칸마다 이름표: 은행·계좌번호·예금주·주소·비상연락처', ['은행', '계좌번호', '예금주', '주소', '비상연락처'].every((t) => labels.some((l) => l.includes(t))), labels.join(' / '))
  ok('이름표를 누르면 그 칸으로 (label for)', await form.locator('label[for=address]').evaluate((l) => document.getElementById(l.htmlFor)?.getAttribute('name') === 'address'))
  ok('채워진 주소 칸도 무슨 칸인지 보임', (await form.locator('#address').inputValue()) === '서울 중구 세종대로 110' && (await form.locator('label[for=address]').isVisible()))

  // ── 2. 빈 칸 노란 테두리 ──
  const miss = (id) => form.locator(`#${id}`).evaluate((el) => el.hasAttribute('data-missing'))
  ok('빈 계좌번호는 노란 테두리', await miss('bank_account'))
  ok('채워진 주소·선택 칸(예금주·비상연락처)은 테두리 없음', !(await miss('address')) && !(await miss('account_holder')) && !(await miss('emergency_phone')))
  const border = await form.locator('#bank_account').evaluate((el) => getComputedStyle(el).borderTopColor)
  ok('노란 테두리 색 (amber)', border === 'rgb(251, 191, 36)', border)

  // ── 3. '정보 채우기' → 그 칸으로 바로 + 커서 ──
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.locator('a', { hasText: '비상연락처' }).first().click()
  await p.waitForFunction(() => document.activeElement?.id === 'emergency_phone', null, { timeout: 5000 }).catch(() => {})
  await p.waitForTimeout(500)
  const inView = (id) => form.locator(`#${id}`).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  ok("'비상연락처 채우기' → 비상연락처 칸에 커서 + 화면 안", p.url().endsWith('#emergency_phone') && (await p.evaluate(() => document.activeElement?.id)) === 'emergency_phone' && (await inView('emergency_phone')))
  await p.keyboard.type('010-5555-6666')
  ok('비상연락처는 써도 지워도 테두리 없음 (선택)', !(await miss('emergency_phone')))
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.locator('a', { hasText: '급여 계좌' }).first().click()
  await p.waitForFunction(() => document.activeElement?.id === 'bank_account', null, { timeout: 5000 }).catch(() => {})
  await p.waitForTimeout(500)
  ok("'급여 계좌 채우기' → 계좌번호 칸에 커서 + 화면 안", (await p.evaluate(() => document.activeElement?.id)) === 'bank_account' && (await inView('bank_account')))
  // 쓰기 시작하면 테두리 사라짐, 다시 지우면 다시
  await p.keyboard.type('1234')
  ok('쓰기 시작하면 노란 테두리 사라짐', !(await miss('bank_account')))
  await form.locator('#bank_account').fill('')
  ok('다시 지우면 다시 노란 테두리', await miss('bank_account'))
  // 주소를 지우면 주소도 노란 테두리 (계약서에 들어감)
  await form.locator('#address').fill('')
  ok('주소를 지우면 노란 테두리 (처음엔 채워져 있었어도)', await miss('address'))
  await form.locator('#address').fill('서울 중구 세종대로 110')
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 저장하면 그대로 ──
  await form.locator('select[name=bank_name]').selectOption('KB국민은행')
  await form.locator('#bank_account').fill('123456789012')
  await form.locator('#emergency_phone').fill('010-5555-6666')
  await form.getByRole('button', { name: '저장' }).click()
  ok('저장', await p.getByText('저장했어요').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  await p.goto(`${D}/me/profile`)
  await form.waitFor({ timeout: 10000 }).catch(() => {})
  ok('다 채운 뒤에는 노란 테두리 없음', (await form.locator('[data-missing]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
