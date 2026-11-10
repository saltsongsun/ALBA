// 묶음 145 (정기 개선 2026-11-08 18:35)
// · 지원자 확정: 같은 회사의 다른 공고에 같은 날 이미 확정된 사람이면 한 번 더 물어봄 (한 사람을 두 현장에 보내지 않게)
//   하나씩 '확정' → '겹쳐요 · 확정?' (누른 버튼이 넓어져 한 줄) · 여러 명 고르면 막대 확인 문구 '근무 겹침 1명 · 확정?'
// · 관리자 목록 검색 칸(공고·문의·서류·근무자): 따로 '찾기' 버튼 없이 칸 안 왼쪽에 돋보기 (쓰는 대로 찾음)
// node scripts/qa/batch145.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', J3 = 'cccccccc-0000-4000-8000-0000000014d3'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const X = '33333333-0000-4000-8000-0000000014d1', XA = '11111111-0000-4000-8000-0000000014d1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 김지원(대기)은 같은 회사 다른 공고(같은 날·같은 시간)에 이미 확정 · 대기 지원자 하나 더(겹침 없음)
  // (오후 6시 뒤에 돌려도 '끝난 행사 · 확정?' 확인에 걸리지 않게 공고 날짜를 내일로)
  const tmr = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr })
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: J3, title: '같은 날 다른 행사 스태프', applications: [] })
  const [apApp] = await rest(`applications?id=eq.${AP_APP}`)
  await rest('applications', 'POST', { ...apApp, id: '11111111-0000-4000-8000-0000000014d9', job_id: J3, status: 'approved', job: { ...apApp.job, id: J3, title: '같은 날 다른 행사 스태프' } })
  await rest('applications', 'POST', { ...apApp, id: XA, user_id: X, user: { ...apApp.user, id: X, name: '겹침없음' }, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 하나씩 확정: 겹치는 사람은 한 번 더
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  const card = a.locator('[data-app-group="대기"] .card').filter({ hasText: '김지원' }).first()
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  ok("김지원 카드에 '다른 근무와 겹침' 표시", (await card.innerText()).includes('다른 근무와 겹침'))
  const confirm = card.getByRole('button', { name: '확정', exact: true })
  await confirm.click()
  const armed = card.locator('button[data-confirm="armed"]')
  ok("'확정' 첫 누름: '겹쳐요 · 확정?' (아직 대기)", (await armed.innerText().catch(() => '')) === '겹쳐요 · 확정?' && (await rest(`applications?id=eq.${AP_APP}`))[0].status === 'applied', await armed.innerText().catch(() => ''))
  await a.waitForTimeout(300)
  ok('확인 문구가 한 줄 (누른 버튼이 넓어짐)', await armed.evaluate((el) => el.getBoundingClientRect().height < 50 && el.getBoundingClientRect().width > el.closest('.flex').querySelectorAll('button')[1].getBoundingClientRect().width), await armed.evaluate((el) => `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`))
  const other = a.locator('[data-app-group="대기"] .card').filter({ hasText: '겹침없음' }).first()
  ok('겹치지 않는 사람은 겹침 표시 없음', !(await other.innerText()).includes('다른 근무와 겹침'))

  // ── 2. 여러 명 고르기: 겹치는 사람이 섞이면 막대에서 한 번 더
  await a.reload()
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  await card.locator('input[name="app"]').check()
  const bar = a.locator('[data-bulk-bar]')
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  await bar.locator('button[data-confirm]').nth(1).click()
  ok("막대: '근무 겹침 1명 · 확정?'", (await bar.locator('button[data-confirm="armed"]').innerText().catch(() => '')) === '근무 겹침 1명 · 확정?', await bar.locator('button[data-confirm="armed"]').innerText().catch(() => ''))
  ok('막대 버튼 한 줄', await bar.locator('button[data-confirm]').evaluateAll((bs) => bs.every((x) => x.getBoundingClientRect().height < 40)))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/clash-bulk.png` })

  // ── 3. 검색 칸: 돋보기가 칸 안에 · 따로 '찾기'·'검색' 버튼 없음
  for (const path of ['/admin/jobs', '/admin/chat', '/admin/docs', '/admin/workers']) {
    await a.goto(`${D}${path}`)
    const box = a.locator('input[name=q][data-live-search]')
    await box.waitFor({ timeout: 15000 }).catch(() => {})
    const form = a.locator('form:has(input[data-live-search])')
    const btn = await form.locator('button', { hasText: /^(찾기|검색)$/ }).count()
    const geo = await box.evaluate((el) => {
      const icon = el.parentElement.querySelector('svg')
      if (!icon) return null
      const r = el.getBoundingClientRect(), i = icon.getBoundingClientRect()
      return { inside: i.left > r.left && i.right < r.left + parseFloat(getComputedStyle(el).paddingLeft) && i.top > r.top && i.bottom < r.bottom, pad: parseFloat(getComputedStyle(el).paddingLeft), w: r.width }
    })
    ok(`${path}: 돋보기가 칸 안 왼쪽 · 글자와 안 겹침 · '찾기' 버튼 없음`, !!geo && geo.inside && geo.pad >= 32 && btn === 0, JSON.stringify(geo) + ` btn=${btn}`)
    ok(`${path}: 360px 옆으로 안 밀림`, await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
    if (SHOTS && path === '/admin/jobs') await a.screenshot({ path: `${SHOTS}/search-icon.png` })
  }
  // 쓰는 대로 찾기는 그대로 (공고)
  await a.goto(`${D}/admin/jobs`)
  const box = a.locator('input[name=q][data-live-search]')
  await box.fill('생활체육')
  await a.waitForURL(/q=/, { timeout: 8000 }).catch(() => {})
  ok("쓰는 대로 찾기 그대로 ('찾기' 안 눌러도 ?q=)", new URL(a.url()).searchParams.get('q') === '생활체육', a.url())
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
