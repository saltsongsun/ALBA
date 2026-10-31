// 비밀번호 보기·숨기기: node scripts/qa/pin-reveal.cjs <앱 주소>
const { chromium, devices } = require('playwright')
const [B] = process.argv.slice(2)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
;(async () => {
  const b = await chromium.launch()
  const p = await (await b.newContext({ ...devices['Galaxy S9+'] })).newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${B}/login`)
  await p.waitForLoadState('networkidle')
  await p.locator('input[name=pin]').fill('738291')
  await p.getByRole('button', { name: '👁 비밀번호 보기' }).click()
  ok('로그인: 보기 누르면 숫자가 보임', (await p.locator('input[name=pin]').getAttribute('type')) === 'text')
  await p.getByRole('button', { name: '🙈 비밀번호 숨기기' }).click()
  ok('로그인: 다시 누르면 가려짐', (await p.locator('input[name=pin]').getAttribute('type')) === 'password')
  ok('입력한 값은 그대로', (await p.locator('input[name=pin]').inputValue()) === '738291')
  await p.goto(`${B}/signup`)
  await p.waitForLoadState('networkidle')
  await p.getByRole('button', { name: '👁 비밀번호 보기' }).click()
  const types = await Promise.all(['pin', 'pin2'].map((n) => p.locator(`input[name=${n}]`).getAttribute('type')))
  ok('가입: 비밀번호·확인 칸 함께 보임', types.every((t) => t === 'text'), types.join(','))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
