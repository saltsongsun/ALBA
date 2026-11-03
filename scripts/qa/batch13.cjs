// 묶음 13: 공고 목록 '⭐ 후기 좋은 곳'(근무자 후기 4점 이상 회사만, 회원) · 거르기 켜면 '조건에 맞는 공고 N개'
// node scripts/qa/batch13.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', CO = '99999999-0000-4000-8000-000000000099'
const CO2 = '99999999-0000-4000-8000-000000000098', J2 = 'cccccccc-0000-4000-8000-000000000098'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 두 번째 회사 + 공고 (후기 2점)
  const [co] = await rest(`companies?id=eq.${CO}`)
  await rest('companies', 'POST', { ...co, id: CO2, company_name: '주식회사 두번째', created_at: '2026-09-02T00:00:00Z' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...job, id: J2, company_id: CO2, title: '두번째 회사 주차 안내', company: { company_name: '주식회사 두번째' }, applications: [] })
  await rest('company_reviews', 'POST', [
    { company_id: CO, job_id: J, author_id: AP, rating: 5, body: '최고였어요 또 할래요', hidden_at: null },
    { company_id: CO2, job_id: J2, author_id: AP, rating: 2, body: '쉬는 시간이 없었어요', hidden_at: null },
  ])

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await pg(W)
  const titles = () => w.locator('a.card-link[href^="/jobs/"] h3').allInnerTexts()

  await w.goto(`${D}/`)
  const all = await titles()
  ok('전체: 두 회사 공고 다 보임', all.some((t) => t.includes('두번째 회사')) && all.some((t) => t.includes('생활체육대축전')), all.join(' / '))
  ok("거르기 없으면 '조건에 맞는' 없음", (await w.locator('[data-filter-count]').count()) === 0)
  const chip = w.locator('[data-good-filter]')
  ok("'⭐ 후기 좋은 곳' 칩 있음", (await chip.count()) === 1)
  await chip.click()
  await w.waitForURL(/good=1/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-good-filter][aria-pressed=true]').waitFor({ timeout: 8000 }).catch(() => {})
  const good = await titles()
  ok('후기 좋은 곳: 4점 이상 회사 공고만', good.length >= 1 && good.every((t) => !t.includes('두번째 회사')), good.join(' / '))
  ok('조건에 맞는 공고 N개', /조건에 맞는 공고\s*\d+개/.test(await w.locator('[data-filter-count]').innerText().catch(() => '')))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await w.locator('[data-good-filter]').click()
  await w.waitForURL((u) => !u.toString().includes('good=1'), { timeout: 8000 }).catch(() => {})
  await w.locator('[data-good-filter][aria-pressed=false]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('한 번 더 누르면 다시 전체', (await titles()).some((t) => t.includes('두번째 회사')))

  const guest = await pg(null)
  await guest.goto(`${D}/?good=1`)
  ok('비회원: 칩 없음, 주소로 켜도 전체', (await guest.locator('[data-good-filter]').count()) === 0 && (await guest.locator('a.card-link[href^="/jobs/"] h3').allInnerTexts()).some((t) => t.includes('두번째 회사')))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
