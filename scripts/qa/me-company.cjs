// 근무자 '내 근무'·'지난 근무'에 어느 회사 근무인지 (🏢 회사 이름) — 여러 회사 일을 하는 근무자가 헷갈리지 않게
// · 오늘의 근무 · 예정된 근무 · 확정 대기 · 근무 내역 · 서명할·서명한 서류 · 지난 근무 전체 · 360px 한 줄
// node scripts/qa/me-company.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const J2 = 'cccccccc-0000-4000-8000-0000000000d2', J3 = 'cccccccc-0000-4000-8000-0000000000d3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  // 두 번째 회사의 공고 2개: 확정된 다음 주 근무(지난주에도 일함) · 지원만 한 공고
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const co2 = { company_name: '새내기행사' }
  const lite = (id, title, start) => {
    const x = { ...j1, id, company_id: C2, company: co2, title, event_name: '가을 축제', start_date: start, end_date: start, applications: [], required_docs: [] }
    return x
  }
  const j2 = lite(J2, '가을 축제 주차 안내', kst(3)), j3 = lite(J3, '가을 축제 매표소', kst(5))
  await rest('jobs', 'POST', j2)
  await rest('jobs', 'POST', j3)
  const [a1] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...a1, id: '11111111-0000-4000-8000-0000000000d2', job_id: J2, company_id: C2, status: 'approved', position: null, job: j2 })
  await rest('applications', 'POST', { ...a1, id: '11111111-0000-4000-8000-0000000000d3', job_id: J3, company_id: C2, status: 'applied', position: null, job: j3 })
  // 두 회사의 같은 이름 서류: 회사 · 공고로 구분
  const [d1] = (await rest(`signed_docs?job_id=eq.${J}&user_id=eq.${W}`)).filter((d) => d.status === 'pending')
  await rest('signed_docs', 'POST', { ...d1, id: 'ffffffff-0000-4000-8000-0000000000d2', job_id: J2, company_id: C2 })
  const [t1] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  const past = kst(-7)
  await rest('attendance', 'POST', { ...t1, id: 'eeeeeeee-0000-4000-8000-0000000000d2', job_id: J2, company_id: C2, work_date: past, clock_in: `${past}T00:00:00Z`, clock_out: `${past}T09:00:00Z`, job: { ...j2, start_date: past, end_date: past } })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }, { name: 'alba_roster', value: roster(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const sec = (h) => p.locator('section', { has: p.locator('h2', { hasText: h }) }).first()
  const text = (l) => l.innerText().catch(() => '')

  // ── 1. 내 근무 ──
  await p.goto(`${D}/me`)
  await sec('오늘의 근무').waitFor({ timeout: 10000 }).catch(() => {})
  ok('오늘의 근무: 🏢 회사 이름', (await text(sec('오늘의 근무'))).includes('🏢 주식회사 테스트'), (await text(sec('오늘의 근무'))).slice(0, 120).replace(/\n/g, ' | '))
  ok('예정된 근무: 다른 회사 이름', (await text(sec('예정된 근무'))).includes('🏢 새내기행사'))
  ok('확정 대기: 회사 이름', (await text(sec('확정 대기'))).includes('가을 축제 매표소') && (await text(sec('확정 대기'))).includes('🏢 새내기행사'))
  ok('근무 내역: 회사 이름', /🏢 (주식회사 테스트|새내기행사)/.test(await text(sec('근무 내역'))))
  const docsTxt = await text(sec('서명할 서류'))
  ok('서명할 서류: 회사 · 공고로 구분', docsTxt.includes('새내기행사 · 가을 축제 주차 안내') && docsTxt.includes('주식회사 테스트 · 경상남도'), docsTxt.replace(/\n/g, ' | '))
  ok('서명한 서류: 회사 · 공고', (await text(sec('서명한 서류'))).includes('주식회사 테스트 · '))
  const lines = p.locator('main p', { hasText: /^🏢 / })
  const hs = await lines.evaluateAll((l) => l.map((e) => e.getBoundingClientRect().height))
  ok('360px: 회사 이름 줄은 모두 한 줄', hs.length >= 3 && hs.every((h) => h < 22), JSON.stringify(hs))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 지난 근무 전체 ──
  await p.goto(`${D}/me/history`)
  await p.getByText('🏢 새내기행사').first().waitFor({ timeout: 8000 }).catch(() => {})
  const h = await text(p.locator('main'))
  ok('지난 근무: 회사마다 이름', h.includes('🏢 새내기행사') && h.includes('🏢 주식회사 테스트'), h.slice(0, 200).replace(/\n/g, ' | '))
  ok('지난 근무 360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
