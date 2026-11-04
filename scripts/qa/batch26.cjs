// 묶음 26: 관리자 화면 단순하게 — 머리글 한 줄 · 휴대폰 아래 탭(홈·공고·근무자·문의·더보기) · 대시보드 순서(현황 → 확인할 일, 새 문의는 할 일 안으로)
// node scripts/qa/batch26.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (opts) => {
    const ctx = await b.newContext({ locale: 'ko-KR', ...opts })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 휴대폰 ──
  const m = await pg({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } })
  await m.goto(`${D}/admin`)
  await m.locator('[data-admin-tabbar]').waitFor({ timeout: 10000 }).catch(() => {})
  const head = await m.locator('header').boundingBox()
  ok('머리글 한 줄 (높이 64px 이하)', !!head && head.height <= 64, JSON.stringify(head))
  ok('머리글에 회사 이름', (await m.locator('header').innerText()).includes('🏢 주식회사 테스트'))
  ok('위쪽 메뉴 줄은 휴대폰에서 숨김', !(await m.locator('header nav[aria-label="관리자 메뉴"]').isVisible()))
  const tabs = m.locator('[data-admin-tabbar] a, [data-admin-tabbar] button')
  ok('아래 탭 5개: 홈·공고·근무자·문의·더보기', (await tabs.allInnerTexts()).map((t) => t.replace(/\d+/g, '').trim()).join(',') === '홈,공고,근무자,문의,더보기', (await tabs.allInnerTexts()).join(','))
  ok('홈 탭 켜짐', (await m.locator('[data-admin-tabbar] a[aria-current=page]').getAttribute('href')) === '/admin')
  ok('문의 탭에 안 읽은 수', /\d/.test(await m.locator('[data-admin-tabbar] a[href="/admin/chat"]').innerText()))
  const bar = await m.locator('[data-admin-tabbar] > div').boundingBox()
  ok('아래 탭이 떠 있음', !!bar && bar.y + bar.height <= 740 - 8)
  ok('360px: 옆으로 안 밀림', await m.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // 대시보드 순서: 현황 제목 → 확인할 일(새 문의 포함), 따로 뜨던 '새 문의' 띠 없음
  const order = await m.evaluate(() => {
    const y = (el) => (el ? el.getBoundingClientRect().top + scrollY : -1)
    const h1 = [...document.querySelectorAll('main h1')].find((h) => h.textContent.includes('현황'))
    const todo = [...document.querySelectorAll('main section')].find((s) => s.textContent.includes('✅ 확인할 일'))
    const push = [...document.querySelectorAll('main .card')].find((c) => c.textContent.includes('휴대폰 알림'))
    const jobs = [...document.querySelectorAll('main h2')].find((h) => h.textContent.includes('진행·예정 공고'))
    return { h1: y(h1), todo: y(todo), push: y(push), jobs: y(jobs) }
  })
  ok('현황 제목이 맨 위, 그 아래 확인할 일', order.h1 >= 0 && order.todo > order.h1, JSON.stringify(order))
  ok('휴대폰 알림 칸은 맨 아래', order.push > order.jobs, JSON.stringify(order))
  const todo = m.locator('section', { hasText: '✅ 확인할 일' })
  ok('새 문의는 확인할 일 안에 (누르면 문의)', (await todo.locator('a[href="/admin/chat"]', { hasText: '새 문의' }).count()) === 1)
  ok("따로 뜨던 '새 문의 N건이 있어요' 띠 없음", (await m.getByText(/새 문의 \d+건이 있어요/).count()) === 0)

  // 더보기
  await m.locator('[data-admin-tabbar] button', { hasText: '더보기' }).click()
  const sheet = m.locator('[role=dialog][aria-label=더보기]')
  await sheet.waitFor({ timeout: 3000 }).catch(() => {})
  const items = await sheet.locator('a').allInnerTexts()
  ok('더보기: 정산·외주·서식·설정 + 최고 관리자 메뉴 + 근무자 화면', ['정산', '외주', '서류 서식', '회사 설정', '회사 관리', '커뮤니티 관리', '근무자 화면'].every((k) => items.some((t) => t.includes(k))), items.join(' / '))
  await m.keyboard.press('Escape')
  ok('Esc로 닫힘', await sheet.waitFor({ state: 'detached', timeout: 2000 }).then(() => true, () => false))
  await m.locator('[data-admin-tabbar] button', { hasText: '더보기' }).click()
  await sheet.locator('a', { hasText: '회사 설정' }).click()
  await m.waitForURL(/\/admin\/settings/, { timeout: 10000 }).catch(() => {})
  await m.waitForTimeout(500)
  ok('누르면 이동 + 시트 닫힘', (await sheet.count()) === 0 && m.url().includes('/admin/settings'))
  ok('설정 화면에서는 더보기가 켜짐', (await m.locator('[data-admin-tabbar] button', { hasText: '더보기' }).getAttribute('class')).includes('text-brand-600'))

  // 공고 탭
  await m.locator('[data-admin-tabbar] a[href="/admin/jobs"]').click()
  await m.waitForURL(/\/admin\/jobs$/, { timeout: 10000 }).catch(() => {})
  ok('공고 탭으로 이동·켜짐', (await m.locator('[data-admin-tabbar] a[aria-current=page]').getAttribute('href')) === '/admin/jobs')

  // ── 2. 넓은 화면: 위쪽 메뉴 그대로, 아래 탭 없음 ──
  const d = await pg({ viewport: { width: 1280, height: 900 } })
  await d.goto(`${D}/admin`)
  ok('넓은 화면: 위쪽 메뉴 보임', await d.locator('header nav[aria-label="관리자 메뉴"]').isVisible())
  ok('넓은 화면: 아래 탭 없음', !(await d.locator('[data-admin-tabbar]').isVisible()))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
