// 가입 동의: '필수 동의 모두 체크' 한 번에 + 진행 막대(필수 n/N)에 제3자 제공 동의 포함 + 체크 칸 크기 같음 · 360px
// node scripts/qa/signup-consent.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const [D] = process.argv.slice(2)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const progress = () => p.locator('form .sticky').first().innerText().catch(() => '')
  const checked = (n) => p.locator(`input[name=${n}]`).isChecked()
  const all = p.locator('[data-agree-all] input')

  // ── 1. 아르바이트 가입 ──
  await p.goto(`${D}/signup?type=worker`)
  await all.waitFor({ timeout: 10000 }).catch(() => {})
  ok('처음: 필수 0/8 (제3자 제공 동의 포함)', /필수 0\/8/.test(await progress()), await progress())
  ok('필수 동의 모두 체크 칸', (await all.count()) === 1)
  await all.check()
  ok('모두 체크 → 세 동의 모두 체크', (await checked('agree_privacy')) && (await checked('agree_third')) && (await checked('agree_rrn')))
  await p.waitForTimeout(300)
  ok('진행 막대도 바로 3/8', /필수 3\/8/.test(await progress()), await progress())
  await p.locator('input[name=agree_third]').uncheck()
  await p.waitForTimeout(300)
  ok('하나 풀면 모두 체크도 풀림', !(await all.isChecked()))
  ok('진행 막대 2/8', /필수 2\/8/.test(await progress()), await progress())
  await p.locator('input[name=agree_third]').check()
  ok('다시 다 체크하면 모두 체크도 켜짐', await all.isChecked())
  await all.uncheck()
  ok('모두 체크 풀면 세 동의 모두 풀림', !(await checked('agree_privacy')) && !(await checked('agree_third')) && !(await checked('agree_rrn')))
  const sizes = await p.locator('input[type=checkbox][name^="agree_"]').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().width)))
  ok('동의 체크 칸 크기 모두 같음 (긴 글에도 안 줄어듦)', sizes.length === 3 && sizes.every((w) => w === sizes[0] && w >= 18), JSON.stringify(sizes))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 외주 업체 가입: 동의 2개 ──
  await p.goto(`${D}/signup?type=vendor`)
  await all.waitFor({ timeout: 10000 }).catch(() => {})
  ok('외주 업체: 필수 0/7', /필수 0\/7/.test(await progress()), await progress())
  await all.check()
  ok('외주 업체: 모두 체크 → 두 동의', (await checked('agree_privacy')) && (await checked('agree_third')) && (await p.locator('input[name=agree_rrn]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
