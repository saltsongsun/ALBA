// 묶음 146 (정기 개선 2026-11-08 19:35)
// · 대시보드 '확정 대기 지원자': 같은 날 다른 공고에 이미 확정된 사람이면 '⚠️ 다른 근무와 겹침' + 확정할 때 '겹쳐요 · 확정?' (지원자 탭과 같게)
//   확인 문구가 뜬 버튼이 넓어져 한 줄 · 여러 명 고르면 막대 '근무 겹침 1명 · 확정?'
// · 지원자 탭 '번호로 직접 추가'는 접어 둠 (누르면 칸이 한 줄로 열림)
// node scripts/qa/batch146.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', J3 = 'cccccccc-0000-4000-8000-0000000014e3'
const AP_APP = '11111111-0000-4000-8000-000000000012'
const X = '33333333-0000-4000-8000-0000000014e1', XA = '11111111-0000-4000-8000-0000000014e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 김지원(대기)은 같은 회사 다른 공고(같은 날·같은 시간)에 이미 확정 · 대기 지원자 하나 더(겹침 없음)
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: J3, title: '같은 날 다른 행사', applications: [] })
  const [apApp] = await rest(`applications?id=eq.${AP_APP}`)
  const full = { id: J, title: j.title, start_date: j.start_date, end_date: j.end_date, start_time: j.start_time, end_time: j.end_time, status: j.status }
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { job: { ...apApp.job, ...full } })
  await rest('applications', 'POST', { ...apApp, id: '11111111-0000-4000-8000-0000000014e9', job_id: J3, status: 'approved', job: { ...apApp.job, ...full, id: J3, title: '같은 날 다른 행사' } })
  await rest('applications', 'POST', { ...apApp, job: { ...apApp.job, ...full }, id: XA, user_id: X, user: { ...apApp.user, id: X, name: '겹침없음' }, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 대시보드: 겹침 표시 + 확정 한 번 더
  await a.goto(`${D}/admin`)
  const card = a.locator('#pending .card').filter({ hasText: '김지원' }).first()
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  ok("김지원 카드에 '다른 근무와 겹침 · 같은 날 다른 행사'", (await card.locator('[data-dash-clash]').innerText().catch(() => '')).includes('다른 근무와 겹침 · 같은 날 다른 행사'))
  const plain = a.locator('#pending .card').filter({ hasText: '겹침없음' }).first()
  ok('겹치지 않는 사람은 표시 없음', (await plain.locator('[data-dash-clash]').count()) === 0)
  await card.locator('[data-dash-decide] button', { hasText: /^확정$/ }).click()
  const armed = card.locator('button[data-confirm="armed"]')
  await a.waitForTimeout(300)
  ok("'확정' 첫 누름: '겹쳐요 · 확정?' (아직 대기)", (await armed.innerText().catch(() => '')) === '겹쳐요 · 확정?' && (await rest(`applications?id=eq.${AP_APP}`))[0].status === 'applied', await armed.innerText().catch(() => ''))
  ok('누른 버튼이 넓어져 한 줄', await armed.evaluate((el) => { const r = el.getBoundingClientRect(); const hold = el.closest('[data-dash-decide]').querySelectorAll('button')[1].getBoundingClientRect(); return r.height < 50 && r.width > hold.width }))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/dash-clash.png` })
  ok('겹치지 않는 사람은 바로 확정 (한 번 더 묻지 않음)', (await plain.locator('[data-dash-decide] button', { hasText: /^확정$/ }).getAttribute('data-confirm')) === null)

  // ── 2. 여러 명 고르기: 막대에서 한 번 더
  await a.reload()
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  await card.locator('input[name="app"]').check()
  const bar = a.locator('[data-bulk-bar]')
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  await bar.locator('button[data-confirm]').nth(1).click()
  ok("막대: '근무 겹침 1명 · 확정?'", (await bar.locator('button[data-confirm="armed"]').innerText().catch(() => '')) === '근무 겹침 1명 · 확정?', await bar.locator('button[data-confirm="armed"]').innerText().catch(() => ''))

  // ── 3. 지원자 탭: '번호로 직접 추가'는 접혀 있다가 누르면 한 줄로
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  const add = a.locator('[data-direct-add]')
  await add.waitFor({ timeout: 15000 }).catch(() => {})
  ok("처음엔 접혀 있음 ('＋ 번호로 추가'만)", !(await add.locator('input[name=phone]').isVisible()) && (await add.locator('summary').innerText()).includes('번호로 추가'))
  await add.locator('summary').click()
  const phone = add.locator('input[name=phone]')
  await phone.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  await a.waitForTimeout(350)
  const geo = await add.evaluate((el) => { const f = el.querySelector('form').getBoundingClientRect(); return { w: Math.round(f.width), h: Math.round(f.height), open: el.open } })
  ok('누르면 번호 칸 + 직접 추가가 한 줄로', (await phone.isVisible()) && geo.h < 50 && geo.w > 250, JSON.stringify(geo))
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
