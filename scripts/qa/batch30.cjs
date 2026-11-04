// 묶음 30: 가입 화면 '다음: ○○'를 누르면 그 칸으로 (화면 가운데로 옮기고 커서) · 두 칸 항목은 앞 칸부터 · 다 채우면 '✓ 모두 채웠어요'가 톡
// node scripts/qa/batch30.cjs <default 앱>
const { chromium, devices } = require('playwright')
const [D] = process.argv.slice(2)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('x'.repeat(64)).toString('base64')

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/signup?type=worker`)
  const nextBtn = p.locator('[data-next-field]')
  await nextBtn.waitFor({ timeout: 10000 }).catch(() => {})
  const focused = () => p.evaluate(() => document.activeElement?.getAttribute('name'))
  const inView = (sel) => p.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  const waitNext = (name) => p.waitForFunction((n) => document.querySelector('[data-next-field]')?.getAttribute('data-next-field') === n, name, { timeout: 4000 }).catch(() => {})

  // 처음: 다음은 사진 (숨은 칸 → 그 자리로)
  ok("처음엔 '다음: 사진'", (await nextBtn.getAttribute('data-next-field')) === 'photo' && (await nextBtn.innerText()).includes('사진'))
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await nextBtn.click()
  await p.waitForTimeout(900)
  ok('누르면 사진 칸이 화면 안으로', await inView('[aria-label="얼굴 사진 고르기"]'))

  // 사진을 넣으면 다음은 이름 → 누르면 이름 칸에 커서
  await p.evaluate((v) => { document.querySelector('form input[name=photo]').value = v }, PHOTO)
  await waitNext('name')
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await nextBtn.click()
  await p.waitForTimeout(700)
  ok("'다음: 이름' → 이름 칸에 커서 + 화면 안", (await focused()) === 'name' && (await inView('input[name=name]')))

  // 주민번호: 앞자리가 비어 있으면 앞 칸부터
  await p.fill('input[name=name]', '김새내')
  await waitNext('rrn2')
  await nextBtn.click()
  await p.waitForTimeout(500)
  ok('주민번호는 앞 6자리 칸부터', (await focused()) === 'rrn1')

  // 나머지 채우기 → 다 채우면 완료 문구가 톡
  await p.fill('input[name=rrn1]', '900101')
  await p.fill('input[name=rrn2]', '1234567')
  await p.fill('input[name=phone]', '01055556666')
  await waitNext('pin2')
  await nextBtn.click()
  await p.waitForTimeout(400)
  ok('비밀번호도 첫 칸부터', (await focused()) === 'pin')
  await p.fill('input[name=pin]', '482915')
  await p.fill('input[name=pin2]', '482915')
  for (const n of ['agree_privacy', 'agree_third', 'agree_rrn']) await p.locator(`input[name=${n}]`).check()
  const done = p.locator('[data-signup-complete]')
  ok('다 채우면 ✓ 필수 항목을 모두 채웠어요', await done.waitFor({ timeout: 4000 }).then(() => true, () => false))
  ok('완료 문구가 톡 튀어나옴 (animate-pop)', ((await done.getAttribute('class')) || '').includes('animate-pop'))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
