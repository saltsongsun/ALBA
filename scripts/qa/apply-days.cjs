// 여러 날 행사 지원: 지난 날은 못 고름 · 모두 선택/해제 · 고른 날만큼 예상 금액 · 고른 날로 지원
// node scripts/qa/apply-days.cjs <fresh 앱> <fresh 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [F, MF] = process.argv.slice(2)
const AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MF}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const nums = (s) => (s.match(/[\d,]+원/g) ?? []).map((x) => Number(x.replace(/[^\d]/g, '')))
;(async () => {
  await fetch(`${MF}/rest/v1/applications?job_id=eq.${J}&user_id=eq.${AP}`, { method: 'DELETE' })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day(-1), end_date: day(2), status: 'open' })
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(AP), url: F }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${F}/jobs/${J}?joined=1`)
  await p.waitForLoadState('networkidle')
  ok('공고 링크로 가입 직후: 가입 완료 · 아직 지원 전 안내', (await see(p, '가입이 끝났어요')) && (await see(p, '지원하지 않았어요.')))
  const box = (d) => p.locator(`input[name=dates][value="${d}"]`)
  ok('지난 날은 못 고름', (await box(day(-1)).isDisabled()) && !(await box(day(-1)).isChecked()))
  ok('남은 날은 처음부터 골라져 있음', (await box(day(0)).isChecked()) && (await box(day(2)).isChecked()))
  const summary = async () => (await p.locator('p', { hasText: '일 선택' }).first().innerText().catch(() => ''))
  let s = await summary()
  const [total, per] = nums(s)
  ok('3일 선택 · 예상 금액 = 하루 × 3', s.includes('3일 선택') && total === per * 3, s)
  await p.getByRole('button', { name: '모두 해제' }).click()
  ok('모두 해제하면 안내', await see(p, '근무할 수 있는 날을 하나 이상 골라 주세요.'))
  await p.locator('label', { has: box(day(0)) }).click()
  s = await summary()
  ok('하나 고르면 1일', s.includes('1일 선택') && nums(s)[0] === per, s)
  ok('모두 선택 버튼으로 바뀜', await p.getByRole('button', { name: '모두 선택' }).isVisible())
  // 실수 지원 막기: 첫 번째 누름은 확인 문구만, 한 번 더 눌러야 지원
  await p.getByRole('button', { name: /으로 지원하기/ }).click()
  ok('첫 번째 누름: 한 번 더 누르라는 안내', await see(p, '한 번 더 누르면 지원돼요'))
  await p.waitForTimeout(800)
  ok('첫 번째 누름만으로는 지원 안 됨', (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`)).length === 0)
  await p.getByRole('button', { name: '한 번 더 누르면 지원돼요' }).click()
  ok('지원 완료', await see(p, '지원이 접수됐어요', 15000))
  const app = (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]
  ok('고른 날로 지원', JSON.stringify(app?.available_dates) === JSON.stringify([day(0)]), JSON.stringify(app?.available_dates))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
