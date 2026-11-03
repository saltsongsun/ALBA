// 회사 직접 가입: 신청하면 바로 관리자 화면 (공고·지원자 관리 바로) · 확인 전에는 해피워크 전체 회원 명단·사진·번호로 직접 추가 막힘
// · 사업자등록번호 검증·중복 막기 · 이미 가입된 번호면 로그인 안내 · 최고 관리자 '확인 완료' 뒤 열림
// node scripts/qa/company-signup.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const BIZ = '2208162517'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    return ctx
  }
  const fill = async (p, o) => {
    await p.locator('input[name=company_name]').fill(o.company)
    await p.locator('input[name=business_no]').fill(o.biz)
    await p.locator('input[name=ceo_name]').fill('김대표')
    await p.locator('input[name=name]').fill('이담당')
    await p.locator('input[name=phone]').fill(o.phone)
    await p.locator('input[name=pin]').fill('482913')
    await p.locator('input[name=pin2]').fill('482913')
    await p.locator('input[name=agree_privacy]').check()
    await p.getByRole('button', { name: '회사로 시작하기' }).click()
  }

  // ── 가입 화면에서 회사로 시작하기 ──
  const c1 = await ctxOf(null)
  const p = await c1.newPage()
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${D}/signup`)
  await p.getByRole('link', { name: /회사로 시작하기/ }).click()
  await p.waitForURL(/\/start/, { timeout: 10000 }).catch(() => {})
  ok('가입 유형 화면 → 회사로 시작하기', new URL(p.url()).pathname === '/start', p.url())

  // 잘못된 사업자등록번호
  await fill(p, { company: '해피이벤트', biz: '1234567890', phone: '01051516161' })
  ok('잘못된 사업자등록번호는 거절', await see(p, '사업자등록번호 10자리를 정확히', 15000))
  // 이미 가입된 휴대폰 번호
  await p.locator('input[name=business_no]').fill(BIZ)
  await p.locator('input[name=phone]').fill('01033334444')
  await p.getByRole('button', { name: '회사로 시작하기' }).click()
  ok('이미 가입된 번호: 로그인 안내 + 이 번호로 로그인하기', (await see(p, '이미 가입된 휴대폰 번호예요', 15000)) && (await p.getByRole('button', { name: '이 번호로 로그인하기 →' }).count()) === 1)

  // 정상 가입 → 바로 관리자 화면
  await p.locator('input[name=phone]').fill('01051516161')
  await p.getByRole('button', { name: /회사로 시작하기/ }).click()
  await p.waitForURL(/\/admin/, { timeout: 15000 }).catch(() => {})
  ok('가입하면 바로 관리자 화면', new URL(p.url()).pathname === '/admin', p.url())
  ok('환영 안내', await see(p, '해피이벤트로 시작했어요'))
  ok('확인 전 안내', await see(p, '🔒 회사 확인 중이에요'))
  const co = (await rest('companies')).find((c) => c.company_name === '해피이벤트')
  ok('회사 저장: 확인 전 · 사업자번호 형식', co?.verified === false && co?.business_no === '220-81-62517' && co?.ceo_name === '김대표', JSON.stringify(co && { v: co.verified, b: co.business_no }))
  const me = (await rest('users?phone=eq.01051516161'))[0]
  ok('담당자 계정: 관리자', me?.role === 'admin' && me?.is_super === false)
  ok('대표 관리자로 소속', (await rest('company_members')).some((m) => m.company_id === co?.id && m.user_id === me?.id && m.role === 'owner'))
  ok('기본 서류 서식 준비', (await rest('doc_templates')).filter((t) => t.company_id === co?.id).length > 0)

  // 근무자 명단 잠금: 가입할 때 정한 내 비밀번호로 풀기 (10분)
  await p.goto(`${D}/admin/workers`)
  ok('근무자 명단: 처음엔 잠금', await p.locator('[data-roster-lock]').isVisible().catch(() => false))
  await p.locator('#roster-pin').fill('482913')
  await p.getByRole('button', { name: '명단 열기' }).click()
  await p.locator('[data-roster-open]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('명단 잠금: 내 비밀번호로 열림', await p.locator('[data-roster-open]').isVisible().catch(() => false))

  // 확인 전: 전체 회원 명단·다른 회원 정보·사진 막힘, 다른 회사 공고 안 보임
  await p.goto(`${D}/admin/workers`)
  ok('근무자 명단: 우리 회사 지원자만 안내', await see(p, '우리 회사에 지원한 회원'))
  const cardOf = (name) => p.locator('.sm\\:hidden .card', { hasText: name })
  ok('다른 회사 지원자(김지원) 안 보임', (await cardOf('김지원').count()) === 0)
  await p.goto(`${D}/admin/workers/${AP}`)
  ok('다른 회원 상세: 열리지 않음', await see(p, '찾는 화면이 없어요'))
  // (보안 쿠키가 실리게 화면 안에서 불러 봄)
  const photoStatus = () => p.evaluate(async (u) => (await fetch(u, { cache: 'no-store' })).status, `${D}/photo/${AP}`)
  const ps1 = await photoStatus()
  ok('다른 회원 사진: 막힘', ps1 === 404, String(ps1))
  await p.goto(`${D}/admin/jobs`)
  ok('다른 회사 공고 안 보임', !(await see(p, '경상남도 생활체육대축전 행사장 안내 스태프', 1000)))

  // 같은 사업자등록번호로 또 가입 → 막힘
  const c2 = await ctxOf(null)
  const p2 = await c2.newPage()
  await p2.goto(`${D}/start`)
  await fill(p2, { company: '가짜해피', biz: '220-81-62517', phone: '01052526262' })
  ok('같은 사업자등록번호는 다시 가입 못 함', await see(p2, '이미 해피워크를 쓰는 사업자등록번호예요', 15000))

  // 최고 관리자: 확인 기다리는 회사 → 확인 완료
  const c3 = await ctxOf(A)
  const s = await c3.newPage()
  s.on('pageerror', (e) => errs.push(e.message))
  await s.goto(`${D}/admin/companies`)
  ok('최고 관리자: 확인 기다리는 회사 1곳', await see(s, '확인을 기다리는 회사 1곳'))
  const card = s.locator('section', { hasText: '해피이벤트' })
  ok('담당자 연락처 보임', await card.getByText('010-5151-6161').first().isVisible().catch(() => false))
  await card.getByRole('button', { name: '확인 완료' }).click()
  await card.getByRole('button', { name: '확인할까요? 전체 회원 명단이 열려요' }).click()
  ok('확인 완료 안내', await see(s, '회사를 확인했어요', 15000))
  ok('저장: 확인됨', (await rest(`companies?id=eq.${co?.id}`))[0]?.verified === true)

  // 확인 뒤: 전체 회원 명단·사진 열림
  await p.goto(`${D}/admin/workers`)
  await p.waitForLoadState('networkidle')
  ok('확인 뒤: 김지원 보임', (await cardOf('김지원').count()) === 1)
  ok('확인 뒤: 안내 사라짐', !(await see(p, '우리 회사에 지원한 회원', 800)))
  const ps2 = await photoStatus()
  ok('확인 뒤: 사진 보임', ps2 === 200, String(ps2))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
