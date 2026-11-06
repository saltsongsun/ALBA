// 묶음 98: 정기 개선 — 새 회사(확인 전) 대시보드
// · '가입 근무자' 숫자가 해피워크 전체 회원 수였는데, 눌러 들어간 명단은 '우리 회사에 지원한 회원'만 → 확인 전 회사는 '우리 지원자'(지원한 사람 수)로 같게
// · 확인된 회사는 그대로 '가입 근무자'(전체)
// · '해피워크 시작하기': 아직 안 한 첫 단계에 '지금 하기' (연한 바탕 · 진한 번호) · 하나만
// node scripts/qa/batch98.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000000c2', A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', J2 = 'cccccccc-0000-4000-8000-0000000000c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 막 가입한 회사(확인 전) + 대표 관리자
  const [a1] = await rest(`users?id=eq.${A}`)
  const [c1] = await rest(`companies?id=eq.${C}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새봄이벤트', ceo_name: null, business_no: null, company_address: null, company_phone: null, verified: false, created_at: new Date().toISOString(), join_code: 'NEWCO1' })
  await rest('users', 'POST', { ...a1, id: A2, name: '김새봄', phone: '01033334444', is_super: false, created_at: new Date().toISOString() })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: new Date().toISOString() })
  const workers = (await rest('users')).filter((u) => u.role === 'worker' && u.active !== false && u.member_type !== 'vendor').length

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const stat = async (p, label) => {
    const card = p.locator('a.card-link', { hasText: label }).first()
    await card.waitFor({ timeout: 10000 }).catch(() => {})
    await p.waitForTimeout(1500) // 숫자 올라가는 효과가 끝날 때까지
    return Number((await card.locator('p').nth(1).innerText().catch(() => '')).replace(/[^\d]/g, ''))
  }

  // ── 1. 확인 전 회사: '우리 지원자' 0 (전체 회원 수가 아님) ──
  const n = await pg(A2)
  await n.goto(`${D}/admin`)
  ok(`확인 전 회사: '우리 지원자' 0명 (전체 회원 ${workers}명이 아님) · '가입 근무자' 없음`, (await stat(n, '우리 지원자')) === 0 && (await n.locator('a.card-link', { hasText: '가입 근무자' }).count()) === 0)

  // ── 2. 시작하기: 지금 할 일 하나 ──
  const nx = n.locator('[data-next-step]')
  ok("시작하기: 첫 단계 '회사 정보 채우기'에 '지금 하기' (하나만)", (await nx.count()) === 1 && (await nx.innerText()).includes('회사 정보 채우기') && (await nx.innerText()).includes('지금 하기'))
  ok('지금 하기 줄도 한 줄 (360px)', await nx.locator('span.block').first().evaluate((el) => el.getBoundingClientRect().height < 24))
  ok('360px: 옆으로 안 밀림', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 우리 공고에 한 명이 지원하면 1 ──
  const [job] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...job, id: J2, company_id: C2, title: '새봄 첫 공고', company: { company_name: '새봄이벤트' } })
  const [ap] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...ap, id: undefined, job_id: J2, company_id: C2, status: 'applied', job: { ...job, id: J2, company_id: C2 } })
  await n.goto(`${D}/admin`)
  ok("지원이 들어오면 '우리 지원자' 1", (await stat(n, '우리 지원자')) === 1)
  ok("첫 공고를 올렸으니 '지금 하기'는 다른 단계로", !(await n.locator('[data-next-step]').innerText().catch(() => '')).includes('첫 공고 올리기'))

  // ── 4. 확인된 회사는 그대로 '가입 근무자' (전체) ──
  const a = await pg(A)
  await a.goto(`${D}/admin`)
  ok(`확인된 회사: '가입 근무자' ${workers}명 (전체)`, (await stat(a, '가입 근무자')) === workers)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
