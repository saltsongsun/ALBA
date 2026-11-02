// 가입하다 '이미 가입된 휴대폰 번호'면: '이 번호로 로그인하기' → 번호가 채워진 로그인 화면 (다시 입력하지 않게, 돌아갈 공고 유지)
// node scripts/qa/signup-dup.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const [D, MD] = process.argv.slice(2)
const J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path) => fetch(`${MD}/rest/v1/${path}`).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const usersBefore = (await rest('users')).length
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  // 이미 가입된 근무자 번호(010-3333-4444)로 업체 가입 시도 (공고 링크에서 들어옴)
  await p.goto(`${D}/signup?type=vendor&next=${encodeURIComponent(`/jobs/${J}`)}`)
  await p.waitForLoadState('networkidle')
  await p.locator('input[name=biz_name]').fill('중복상사')
  await p.locator('input[name=biz_no]').fill('2234567890')
  await p.locator('input[name=name]').fill('중복이')
  await p.locator('input[name=phone]').fill('01033334444')
  await p.locator('input[name=pin]').fill('482913')
  await p.locator('input[name=pin2]').fill('482913')
  await p.locator('input[name=agree_privacy]').check()
  await p.locator('input[name=agree_third]').check()
  await p.getByRole('button', { name: /외주 업체로 가입하기/ }).click()
  ok('이미 가입된 번호 안내', await see(p, '이미 가입된 휴대폰 번호예요', 15000))
  const login = p.getByRole('button', { name: '이 번호로 로그인하기 →' })
  ok('이 번호로 로그인하기 버튼', await login.isVisible())
  const joinCls = (await p.getByRole('button', { name: /외주 업체로 가입하기/ }).getAttribute('class')) ?? ''
  ok('가입 버튼은 회색으로 (로그인이 먼저 보이게)', joinCls.includes('btn-gray'), joinCls)
  ok('새 계정 안 생김', (await rest('users')).length === usersBefore)

  await login.click()
  await p.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {})
  const u = new URL(p.url())
  ok('로그인 화면으로 · 돌아갈 공고 유지', u.pathname === '/login' && u.searchParams.get('next') === `/jobs/${J}`, p.url())
  ok('주소에 번호를 남기지 않음', !p.url().includes('3333'))
  await p.waitForLoadState('networkidle')
  // 화면이 준비된 뒤(브라우저에서 채움) 확인
  ok('채워 뒀다는 안내', await see(p, '가입된 번호를 채웠어요'))
  const filled = await p.locator('input[name=phone]').inputValue()
  ok('번호가 채워져 있음', filled.replace(/\D/g, '') === '01033334444', filled)
  ok('비밀번호 칸에 바로 입력', (await p.evaluate(() => document.activeElement?.id)) === 'pin')

  // 다시 열면 비어 있음 (한 번만 채움)
  await p.goto(`${D}/login`)
  await p.waitForLoadState('networkidle')
  ok('다시 열면 번호 칸 비어 있음', (await p.locator('input[name=phone]').inputValue()) === '')
  ok('안내도 없음', !(await see(p, '가입된 번호를 채웠어요', 800)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
