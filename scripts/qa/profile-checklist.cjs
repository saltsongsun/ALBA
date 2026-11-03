// 내 정보: 정보 채우기 n/5 (비어 있는 항목을 눌러 바로 그 칸으로), 다 채우면 사라짐
// node scripts/qa/profile-checklist.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  await rest(`users?id=eq.${WK}`, 'PATCH', { photo_at: null, bank_account_enc: null, bank_name: null, emergency_phone: null, address: '서울', careers: [] })
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(WK), url: D }, { name: 'alba_roster', value: roster(WK), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${D}/me/profile`)
  ok('정보 채우기 1/5 (주소만 있음)', await see(p, /정보 채우기\s*1\/5/))
  ok('빈 항목: 사진·계좌·비상연락처·경력', (await see(p, '얼굴 사진')) && (await see(p, '급여 계좌')) && (await see(p, '비상연락처')) && (await see(p, '행사 경력')))
  await p.locator('a', { hasText: '급여 계좌' }).first().click()
  await p.waitForTimeout(800)
  ok('누르면 그 칸으로', p.url().endsWith('#account') && (await p.locator('#account select[name=bank_name]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 })))
  const f = p.locator('#account form')
  await f.locator('select[name=bank_name]').selectOption('KB국민은행')
  await f.locator('input[name=bank_account]').fill('123456789012')
  await f.locator('input[name=emergency_phone]').fill('010-5555-6666')
  await f.getByRole('button', { name: '저장' }).click()
  ok('저장', await see(p, '저장했어요'))
  await p.goto(`${D}/me/profile`)
  ok('채운 만큼 올라감 3/5', await see(p, /정보 채우기\s*3\/5/))
  // 경력 채우기를 누르면 접힌 경력 칸이 펼쳐진 채로
  await p.locator('a', { hasText: '행사 경력' }).first().click()
  ok('경력 칸으로 가면서 펼쳐짐', await p.locator('#careers details').evaluate((d) => d.open).catch(() => false))
  // 나머지(사진·경력)도 채우면 안내가 사라짐
  await rest(`users?id=eq.${WK}`, 'PATCH', { photo_at: new Date().toISOString(), careers: [{ event: '부산국제영화제', period: '2025.10', role: '안내' }] })
  await p.goto(`${D}/me/profile`)
  ok('다 채우면 안내 없음', (await see(p, '급여 계좌 · 연락 정보')) && !(await see(p, '정보 채우기', 1000)))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
