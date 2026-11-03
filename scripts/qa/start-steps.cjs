// 새 회사 '해피워크 시작하기': 회사 정보 → 첫 공고 → 근무자 모으기 (→ 관리자 초대, 대표만·선택)
// · 할 때마다 저절로 ✓ · 필수 3가지를 마치면 사라짐 · 이미 쓰던 회사엔 안 보임 · 360px
// node scripts/qa/start-steps.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', A3 = 'aaaaaaaa-0000-4000-8000-0000000000a3', J2 = 'cccccccc-0000-4000-8000-0000000000c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

;(async () => {
  // 막 가입한 회사2: 주소·직인 없음, 공고·지원 없음, 대표 A2 혼자
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null, company_address: null, verified: false, created_at: '2026-11-01T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '이대표', phone: '01022223333', is_super: false })
  await rest('users', 'POST', { ...a1, id: A3, name: '박직원', phone: '01022224444', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const card = (p) => p.locator('[data-start-steps]')
  const progress = async (p) => (await card(p).locator('h2 + span').innerText().catch(() => '')).trim()
  const done = (p, title) => card(p).locator('a[data-done]', { hasText: title }).count().then((n) => n === 1)

  // ── 1. 이미 쓰던 회사(기본 회사): 안 보임 ──
  const a = await pg(A)
  await a.goto(`${D}/admin`)
  await a.waitForLoadState('networkidle')
  ok('이미 쓰던 회사: 시작하기 안 보임', (await card(a).count()) === 0)

  // ── 2. 막 가입한 회사: 0/4 ──
  const own = await pg(A2)
  await own.goto(`${D}/admin`)
  ok('새 회사: 시작하기 보임', await see(own, '🚀 해피워크 시작하기'))
  ok('0/4 (대표는 관리자 초대까지)', (await progress(own)) === '0/4', await progress(own))
  for (const [t, href] of [
    ['회사 정보 채우기', '/admin/settings'],
    ['첫 공고 올리기', '/admin/jobs/new'],
    ['근무자 모으기', '/admin/jobs'],
    ['함께 일할 관리자 초대', '/admin/settings#admins'],
  ])
    ok(`단계 ${t} → ${href}`, (await card(own).locator('a', { hasText: t }).getAttribute('href')) === href)
  ok('예전 \'회사 설정 마무리\' 띠는 겹치지 않게 숨김', !(await see(own, '회사 설정을 마무리해 주세요', 800)))
  ok('360px: 옆으로 안 밀림', await own.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const rows = await card(own).locator('li a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  ok('360px: 단계마다 두 줄(제목·설명)로 깔끔', rows.every((h) => h < 64), JSON.stringify(rows))

  // ── 3. 관리자 초대 → ✓, 일반 관리자는 3단계만 ──
  await rest('company_members', 'POST', { company_id: C2, user_id: A3, role: 'admin' })
  await own.reload()
  ok('관리자 초대하면 ✓ (1/4)', (await progress(own)) === '1/4' && (await done(own, '함께 일할 관리자 초대')))
  const staff = await pg(A3)
  await staff.goto(`${D}/admin`)
  ok('일반 관리자: 관리자 초대 단계 없음 (0/3)', (await progress(staff)) === '0/3' && (await card(staff).locator('a', { hasText: '관리자 초대' }).count()) === 0)

  // ── 4. 첫 공고 → ✓, 첫 지원 → ✓ ──
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: '새내기행사' }, title: '새내기 첫 공고', applications: [], required_docs: [] })
  await own.reload()
  ok('공고를 올리면 ✓ (2/4)', (await progress(own)) === '2/4' && (await done(own, '첫 공고 올리기')))
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000e9', job_id: J2, user_id: W, status: 'applied', created_at: new Date().toISOString() })
  await own.reload()
  ok('지원을 받으면 ✓ (3/4)', (await progress(own)) === '3/4' && (await done(own, '근무자 모으기')))
  ok('남은 단계: 회사 정보', !(await done(own, '회사 정보 채우기')))

  // ── 5. 회사 정보까지 채우면 사라짐 ──
  await rest(`companies?id=eq.${C2}`, 'PATCH', { company_address: '부산 해운대구', seal_image: 'data:image/png;base64,iVBORw0KGgo=' })
  await own.reload()
  await own.waitForLoadState('networkidle')
  ok('필수 3가지를 마치면 사라짐', (await card(own).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
