// 묶음 53: 공고 등록·수정 — 고친 채로 다른 화면을 누르면 한 번 멈춤('저장하지 않았어요 · 한 번 더 누르면 나가요', 저장 바는 없음)
//          · 손대지 않았으면 바로 이동 · '공고 저장'은 그대로 저장되고 이동 · 휴대폰에서 '공고 등록' 버튼이 아래 탭에 가리지 않음
//          · 회사 설정: 바의 '저장'으로 저장하면 같은 자리에 '✓ 저장했어요'가 잠깐 · 360px
// node scripts/qa/batch53.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', JOB = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const path = () => new URL(a.url()).pathname
  const jobsTab = a.locator('[data-admin-tabbar] a[href="/admin/jobs"]')

  // ── 1. 새 공고: 손대지 않았으면 바로 이동 ──
  await a.goto(`${D}/admin/jobs/new`)
  const title = a.locator('input[name=title]')
  await title.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  ok('새 공고: 처음엔 안내 없음 (저장 바도 없음)', (await a.locator('[data-unsaved]').count()) === 0)
  await jobsTab.click()
  await a.waitForURL((u) => new URL(u).pathname === '/admin/jobs', { timeout: 10000 }).catch(() => {})
  ok('손대지 않았으면 바로 이동', path() === '/admin/jobs', a.url())

  // ── 2. 고친 채로 나가려 하면 한 번 멈춤 → 두 번째에 나감 ──
  await a.goto(`${D}/admin/jobs/new`)
  await title.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  await title.fill('가을 축제 주차 안내')
  ok('고쳐도 저장 바는 없음 (공고 저장 버튼이 늘 보여서)', (await a.locator('[data-unsaved]').count()) === 0 && (await a.getByRole('button', { name: '공고 등록' }).count()) === 1)
  await jobsTab.click()
  const warn = a.locator('[data-unsaved="warn"]')
  await warn.waitFor({ timeout: 5000 }).catch(() => {})
  ok("한 번 멈추고 '저장하지 않았어요 · 한 번 더 누르면 나가요'", path() === '/admin/jobs/new' && (await warn.innerText().catch(() => '')).includes('한 번 더 누르면 나가요') && (await warn.getByRole('button').count()) === 0)
  ok('쓴 내용은 그대로', (await title.inputValue()) === '가을 축제 주차 안내')
  // 아래에 붙은 '공고 등록' 버튼이 아래 탭에 가리지 않음 (안내는 화면 위쪽이라 겹치지 않음)
  const sub = await a.locator('[data-job-submit] button[type=submit]').boundingBox()
  const tabBox = await a.locator('[data-admin-tabbar]').boundingBox()
  const warnBox = await warn.boundingBox()
  ok("'공고 등록' 버튼이 아래 탭 위에 보임", !!sub && !!tabBox && sub.y + sub.height <= tabBox.y + 12 && sub.y >= 0, JSON.stringify({ btn: sub && Math.round(sub.y + sub.height), tab: tabBox && Math.round(tabBox.y) }))
  ok('안내는 버튼과 겹치지 않음 (화면 위쪽)', !!warnBox && !!sub && warnBox.y + warnBox.height < sub.y)
  ok('360px: 옆으로 안 밀림 (안내)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await jobsTab.click()
  await a.waitForURL((u) => new URL(u).pathname === '/admin/jobs', { timeout: 10000 }).catch(() => {})
  ok('한 번 더 누르면 나감', path() === '/admin/jobs', a.url())

  // ── 3. 수정 화면: '공고 저장'은 막지 않음 ──
  await a.goto(`${D}/admin/jobs/${JOB}/edit`)
  await title.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  const newTitle = '경상남도 생활체육대축전 행사장 안내 스태프 (수정)'
  await title.fill(newTitle)
  await a.getByRole('button', { name: '공고 저장' }).click()
  await a.waitForURL((u) => new URL(u).pathname === `/admin/jobs/${JOB}`, { timeout: 15000 }).catch(() => {})
  const [j] = await rest(`jobs?id=eq.${JOB}`)
  ok("'공고 저장'은 그대로 저장되고 공고 화면으로", path() === `/admin/jobs/${JOB}` && j?.title === newTitle, `${path()} ${j?.title}`)

  // ── 4. 회사 설정: 바에서 저장하면 '✓ 저장했어요' ──
  await a.goto(`${D}/admin/settings`)
  const phone = a.locator('input[name=company_phone]')
  await phone.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.evaluate(() => window.scrollTo(0, 0))
  await phone.fill('0212340000')
  const barSave = a.locator('[data-unsaved]').getByRole('button', { name: '저장' })
  await barSave.waitFor({ timeout: 5000 }).catch(() => {})
  await barSave.click()
  const toast = a.locator('[data-saved-toast]')
  await toast.waitFor({ timeout: 10000 }).catch(() => {})
  const [co] = await rest(`companies?id=eq.${CO}`)
  ok("바에서 저장: 같은 자리에 '✓ 저장했어요' + 저장됨", (await toast.innerText().catch(() => '')).includes('저장했어요') && co?.company_phone === '0212340000', co?.company_phone)
  await toast.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  ok("'저장했어요'는 잠깐 뒤 사라짐", (await toast.count()) === 0 && (await a.locator('[data-unsaved]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
