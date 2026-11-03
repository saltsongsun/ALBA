// 공고에 '✓ 확인된 회사' 표시 + 공고 화면의 회사 이름 → 그 회사 공고 모음 (공고 N개)
// · 확인 전 회사는 표시 없음 · 전문가 의뢰는 회사 이름만 · 360px
// node scripts/qa/company-badge.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', J2 = 'cccccccc-0000-4000-8000-0000000000c2'
const T1 = '경상남도 생활체육대축전 행사장 안내 스태프', T2 = '새내기 회사 주차 안내'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 회사1 = 확인된 회사, 회사2 = 막 가입해 확인 전
  await rest(`companies?id=eq.${C1}`, 'PATCH', { verified: true })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { company: { company_name: '주식회사 테스트', verified: true } })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null, verified: false, created_at: '2026-11-01T00:00:00Z' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: '새내기행사', verified: false }, title: T2, applications: [], required_docs: [] })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }, { name: 'alba_roster', value: roster(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const card = (t) => p.locator('a.card-link', { hasText: t }).last()

  // ── 1. 공고 목록 카드 ──
  await p.goto(`${D}/`)
  await card(T1).waitFor({ timeout: 10000 }).catch(() => {})
  ok('확인된 회사 공고: ✓ 확인된 회사', (await card(T1).innerText()).includes('✓ 확인된 회사'))
  ok('확인 전 회사 공고: 표시 없음', !(await card(T2).innerText()).includes('확인된 회사'))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 공고 화면: 회사 이름 → 그 회사 공고 모음 ──
  await p.goto(`${D}/jobs/${J}`)
  const line = p.locator('[data-company-line]')
  ok('공고 화면: 회사 줄에 ✓ 확인된 회사', (await line.innerText()).includes('✓ 확인된 회사'))
  ok('공고 화면: 그 회사 모집 공고 수', /공고 \d+개 →/.test(await line.innerText()), await line.innerText())
  ok('회사 이름 → 그 회사 공고 모음 링크', (await line.getAttribute('href')) === `/?co=${C1}`)
  const box = await line.boundingBox()
  ok('360px: 회사 줄 한 줄', !!box && box.height < 30, JSON.stringify(box))
  await line.click()
  await p.waitForURL(/co=/, { timeout: 8000 }).catch(() => {})
  ok('누르면 그 회사 공고만', (await p.locator('[data-company-sub]').innerText().catch(() => '')).startsWith('✓ 확인된 회사') && (await p.locator('#jobs ~ .stagger a.card-link', { hasText: T2 }).count()) === 0)
  await p.goto(`${D}/jobs/${J2}`)
  ok('확인 전 회사 공고 화면: 표시 없음', !(await p.locator('[data-company-line]').innerText()).includes('확인된 회사'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
