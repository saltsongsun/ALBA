// 묶음 22: 지난 근무 '회사별 보기'(여러 회사 일을 했을 때 칩) · 최근 6개월 실수령 막대 · 최고 관리자 회사 관리 '회사별 한눈에'(모집 중·이번 달 근무·후기)
// node scripts/qa/batch22.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const J2 = 'cccccccc-0000-4000-8000-0000000000e2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
// 합계 숫자가 0에서 올라가는 효과가 끝날 때까지
const settled = (p) => p.waitForTimeout(900).then(() => p.waitForFunction(() => [...document.querySelectorAll('[data-summary] [data-value]')].every((e) => e.textContent.replace(/,/g, '') === e.dataset.value), null, { timeout: 4000 })).catch(() => {})

;(async () => {
  // 오늘 근무를 4시간 하고 퇴근한 것으로 (이번 달 실수령이 생기게)
  await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { clock_in: new Date(Date.now() - 4 * 3600e3).toISOString(), clock_out: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 한 회사만: 칩 없음, 막대는 보임 ──
  const w = await pg(W)
  await w.goto(`${D}/me/history`)
  await w.locator('[data-month-bars]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('한 회사 일만 했으면 회사 칩 없음', (await w.locator('[data-history-companies]').count()) === 0)
  ok('최근 6개월 실수령 막대 6칸', (await w.locator('[data-month-bar]').count()) === 6)
  const nowBar = w.locator(`[data-month-bar="${kst().slice(0, 7)}"]`)
  ok('이번 달 막대에 금액', /\d/.test(await nowBar.innerText()) && (await nowBar.innerText()).includes(`${Number(kst().slice(5, 7))}월`), await nowBar.innerText().catch(() => ''))

  // ── 2. 다른 회사 일도 함 ──
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const past = kst(-40)
  const j2 = { ...j1, id: J2, company_id: C2, company: { company_name: '새내기행사' }, title: '가을 축제 주차 안내', event_name: '가을 축제', start_date: past, end_date: past, applications: [], required_docs: [] }
  await rest('jobs', 'POST', j2)
  const [t1] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('attendance', 'POST', { ...t1, id: 'eeeeeeee-0000-4000-8000-0000000000e2', job_id: J2, company_id: C2, work_date: past, clock_in: `${past}T00:00:00Z`, clock_out: `${past}T09:00:00Z`, paid: true, job: j2 })
  await rest('company_reviews', 'POST', { company_id: C2, job_id: J2, author_id: W, rating: 5, body: '안내가 친절하고 쉬는 시간도 잘 챙겨 주셨어요', hidden_at: null })

  await w.goto(`${D}/me/history`)
  const chips = w.locator('[data-history-companies] a')
  await chips.first().waitFor({ timeout: 10000 }).catch(() => {})
  const chipTxt = await chips.allInnerTexts()
  ok('회사 칩: 전체 2 · 두 회사', chipTxt.length === 3 && /전체\s*2/.test(chipTxt[0]) && chipTxt.some((t) => t.includes('🏢 새내기행사')) && chipTxt.some((t) => t.includes('🏢 주식회사 테스트')), chipTxt.join(' / '))
  ok('처음엔 전체 켜짐', (await w.locator('[data-history-companies] a[aria-current=page]').innerText()).includes('전체'))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const pastBar = w.locator(`[data-month-bar="${past.slice(0, 7)}"]`)
  ok('지난 달 막대도 금액', /\d/.test(await pastBar.innerText()), await pastBar.innerText().catch(() => ''))
  const bg = await pastBar.locator('span').nth(1).evaluate((el) => [getComputedStyle(el).backgroundColor, el.offsetHeight])
  ok('지난 달 막대가 색으로 보임', bg[0] !== 'rgba(0, 0, 0, 0)' && bg[0] !== 'transparent' && bg[1] > 20, JSON.stringify(bg))
  const gap = await w.evaluate(() => document.querySelector('[data-history-companies]').nextElementSibling.getBoundingClientRect().top - document.querySelector('[data-history-companies]').getBoundingClientRect().bottom)
  ok('회사 칩과 합계 카드가 겹치지 않음', gap >= 4, String(gap))

  await chips.filter({ hasText: '새내기행사' }).click()
  await w.waitForURL(/co=/, { timeout: 8000 }).catch(() => {})
  await w.waitForFunction(() => document.querySelector('[data-history-companies] a[aria-current=page]')?.textContent?.includes('새내기행사'), null, { timeout: 8000 }).catch(() => {})
  await settled(w)
  const body = await w.locator('main').innerText()
  ok('새내기행사만: 그 회사 근무만 보임', body.includes('가을 축제 주차 안내') && !body.includes('경상남도 생활체육대축전 행사장'), body.slice(0, 200).replace(/\n/g, ' | '))
  ok('합계도 그 회사만 (행사 1곳)', /행사\s*1곳/.test(body), body.slice(0, 120).replace(/\n/g, ' | '))
  ok('이번 달 막대는 비어 있음', !/\d/.test((await nowBar.innerText()).replace(/\d+월/, '')))

  // 막대를 누르면 그 달로 이동
  await pastBar.click()
  await w.waitForTimeout(400)
  ok('막대 누르면 그 달로 이동', (await w.evaluate(() => location.hash)) === `#m-${past.slice(0, 7)}`)

  await w.goto(`${D}/me/history?co=${encodeURIComponent('없는회사')}`)
  await settled(w)
  ok('모르는 회사면 전체', /행사\s*2곳/.test(await w.locator('main').innerText()))

  // ── 3. 최고 관리자: 회사별 한눈에 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/companies`)
  const card = (name) => ad.locator('section', { has: ad.locator('h2', { hasText: name }) }).first()
  await card('새내기행사').waitFor({ timeout: 10000 }).catch(() => {})
  const s1 = await card('주식회사 테스트').locator('[data-company-stats]').innerText().catch(() => '')
  const s2 = await card('새내기행사').locator('[data-company-stats]').innerText().catch(() => '')
  ok('기본 회사: 모집 중 1건 · 이번 달 근무 1명', /모집 중\s*1건/.test(s1) && /월 근무\s*1명/.test(s1), s1.replace(/\n/g, ' '))
  ok('새 회사: 모집 중 0건 · 이번 달 0명 · ★5.0 (1)', /모집 중\s*0건/.test(s2) && /월 근무\s*0명/.test(s2) && s2.includes('★5.0 (1)'), s2.replace(/\n/g, ' '))
  ok('관리자 화면 360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
