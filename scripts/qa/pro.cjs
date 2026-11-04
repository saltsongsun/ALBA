// 가입 유형별 화면: 아르바이트 / 전문가 / 외주 업체
// · 가입 유형 고르기 → 유형마다 다른 가입 화면 (전문가·업체는 보라색)
// · 알바 공고와 전문가 의뢰가 서로 다른 화면에 · 지원도 유형이 맞아야
// · 전문가 의뢰 저장 → 사업소득 3.3% · 용역계약서
// · 외주 업체 가입 → 회사가 같은 번호로 등록한 외주사와 이어져 견적 요청이 앱으로
// node scripts/qa/pro.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const EX = 'eeeeeeee-0000-4000-8000-0000000000e1', JX = 'cccccccc-0000-4000-8000-0000000000e2'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const J_TITLE = '경상남도 생활체육대축전 행사장 안내 스태프', JX_TITLE = '개막식 음향 감독'
const VIOLET = 'rgb(106, 63, 232)', BLUE = 'rgb(37, 87, 232)'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const brandOf = (loc) => loc.first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
const errs = []
;(async () => {
  // 전문가 회원 · 전문가 의뢰 (가짜 DB에 직접)
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: EX, name: '김음향', phone: '01088887777', member_type: 'expert', specialty: '음향,조명', intro: '공연 음향 7년', photo_at: '2026-10-29T00:00:00Z', attendance: [], ratings: [] })
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: JX, title: JX_TITLE, audience: 'expert', tax_type: 'business', employment_insurance: false, applications: [], required_docs: [], start_date: day(2), end_date: day(2), company: { company_name: '주식회사 테스트' } })

  const b = await chromium.launch()
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 가입: 유형 고르기 → 유형마다 다른 화면 ──
  const anon = await pg(null)
  await anon.goto(`${D}/signup`)
  ok('가입: 유형 고르기 3가지', (await see(anon, '어떤 분이세요?')) && (await anon.locator('a[href^="/signup?type="]').count()) === 3)
  await anon.goto(`${D}/signup?type=expert`)
  ok('전문가 가입: 전문 분야 고르기', await see(anon, '음향'))
  ok('전문가 가입 화면은 보라색', (await brandOf(anon.getByRole('button', { name: /전문가로 가입하기/ }))) === VIOLET, await brandOf(anon.getByRole('button', { name: /전문가로 가입하기/ })))
  await anon.goto(`${D}/signup?type=worker`)
  ok('알바 가입 화면은 파란색', (await brandOf(anon.getByRole('button', { name: /아르바이트로 가입하기/ }))) === BLUE)
  await anon.goto(`${D}/signup?type=vendor`)
  ok('업체 가입: 상호·사업자번호, 주민번호 없음', (await anon.locator('input[name=biz_name]').count()) === 1 && (await anon.locator('input[name=rrn1]').count()) === 0)

  // ── 2. 공고가 화면마다 나뉨 ──
  const wk = await pg(W)
  await wk.goto(`${D}/`)
  ok('알바 홈: 알바 공고만', (await see(wk, J_TITLE)) && !(await see(wk, JX_TITLE, 1200)))
  const ex = await pg(EX)
  await ex.goto(`${D}/`)
  await ex.waitForURL(/\/pro/, { timeout: 8000 }).catch(() => {})
  ok('전문가가 홈에 오면 전문가 화면으로', ex.url().endsWith('/pro'), ex.url())
  ok('전문가 화면: 전문가 의뢰만', (await see(ex, JX_TITLE)) && !(await see(ex, J_TITLE, 1200)))
  ok('전문가 아래 탭: 의뢰 찾기·견적·대금', (await ex.locator('nav[data-bottom-nav] a').count()) === 5 && (await see(ex, '견적·대금')))
  ok('전문가 화면 강조색 보라', (await brandOf(ex.locator('nav[data-bottom-nav] [data-tab-indicator]'))) === 'rgb(244, 240, 255)')

  // ── 3. 지원은 유형이 맞아야 ──
  await wk.goto(`${D}/jobs/${JX}`)
  ok('알바 회원이 전문가 의뢰 열면 안내', await see(wk, '전문가 회원만 지원할 수 있는 의뢰예요'))
  ok('전문가 의뢰: 3.3% 떼고 금액 안내', await see(wk, /사업소득 3\.3% 떼고 약/))
  await ex.goto(`${D}/jobs/${J}`)
  ok('전문가가 알바 공고 열면 안내', await see(ex, '아르바이트 회원만 지원할 수 있는 공고예요'))
  await ex.goto(`${D}/jobs/${JX}`)
  await ex.getByRole('button', { name: /의뢰 지원하기/ }).click()
  await ex.getByRole('button', { name: '한 번 더 누르면 의뢰에 지원돼요' }).click()
  ok('전문가: 의뢰 지원 (두 번 눌러서)', await see(ex, '지원이 접수됐어요', 10000))
  const exApp = (await rest('applications')).find((a) => a.user_id === EX && a.job_id === JX)
  ok('지원 행 생김', !!exApp)

  // ── 4. 관리자: 전문가 의뢰로 저장하면 3.3% · 용역계약서 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/jobs/${J}/edit`)
  await ad.locator('label', { hasText: '전문가 의뢰' }).first().click()
  ok('공고 폼: 전문가 의뢰 고르면 보라색', (await ad.locator('form[data-mode=pro]').count()) === 1)
  await ad.getByRole('button', { name: /저장/ }).last().click()
  await see(ad, '저장했습니다', 15000)
  const [saved] = await rest(`jobs?id=eq.${J}`)
  const tpls = await rest('doc_templates')
  const service = tpls.find((t) => t.kind === 'service')
  ok('저장: 전문가 의뢰 · 사업소득 3.3%', saved.audience === 'expert' && saved.tax_type === 'business' && saved.employment_insurance === false, `${saved.audience}/${saved.tax_type}`)
  ok('저장: 용역계약서 서식이 생기고 근로계약서 대신 들어감', !!service && saved.required_docs.includes(service.id) && !saved.required_docs.some((id) => tpls.find((t) => t.id === id)?.kind === 'contract'))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { audience: 'worker', tax_type: 'daily', employment_insurance: true })

  // ── 5. 외주 업체 가입 → 회사 외주사와 이어져 견적 요청이 앱으로 ──
  await ad.goto(`${D}/admin/vendors?tab=list`)
  const vf = ad.locator('form', { hasText: '외주사 등록' })
  await vf.locator('input[name=name]').fill('빛나는조명')
  await vf.locator('input[name=category]').fill('음향·조명')
  await vf.locator('input[name=phone]').fill('010-6060-7070')
  await vf.getByRole('button', { name: '외주사 등록' }).click()
  ok('회사: 외주사 등록', await see(ad, '빛나는조명을(를) 외주사로 등록했어요', 15000))
  const vd = await pg(null)
  await vd.goto(`${D}/signup?type=vendor`)
  await vd.locator('input[name=biz_name]').fill('빛나는조명')
  await vd.locator('input[name=biz_no]').fill('2208162517')
  await vd.locator('input[name=name]').fill('박조명')
  await vd.locator('input[name=phone]').fill('01060607070')
  await vd.locator('input[name=pin]').fill('482913')
  await vd.locator('input[name=pin2]').fill('482913')
  await vd.locator('input[name=agree_privacy]').check()
  await vd.locator('input[name=agree_third]').check()
  await vd.getByRole('button', { name: /외주 업체로 가입하기/ }).click()
  await vd.waitForURL(/\/pro/, { timeout: 15000 }).catch(() => {})
  ok('업체 가입 → 전문가·업체 화면', vd.url().includes('/pro'), vd.url())
  const vUser = (await rest('users?phone=eq.01060607070'))[0]
  ok('업체 회원: 사업자번호·유형 저장 (주민번호 없음)', vUser?.member_type === 'vendor' && vUser?.biz_no === '2208162517' && !vUser?.rrn_enc)
  const linked = (await rest('vendors')).find((v) => v.name === '빛나는조명')
  ok('같은 번호의 외주사와 앱 연결', linked?.user_id === vUser?.id)
  ok('업체 아래 탭 4개 (근무 탭 없음)', (await vd.locator('nav[data-bottom-nav] a').count()) === 4 && (await vd.locator('nav[data-bottom-nav] a[href="/me"]').count()) === 0)
  // 회사가 견적 요청 → 업체 앱에 도착
  await ad.goto(`${D}/admin/vendors?tab=quotes`)
  const rf = ad.locator('form', { hasText: '견적 요청 만들기' })
  await rf.locator('input[name=title]').fill('무대 조명 1일')
  await rf.locator('input[name=due_date]').fill(day(1))
  await rf.locator('label', { hasText: '빛나는조명' }).click()
  await rf.getByRole('button', { name: '견적 요청 만들기' }).click()
  ok('회사: 견적 요청', await see(ad, '견적 요청을 만들었어요', 15000))
  const msg = (await rest(`messages?thread_user_id=eq.${vUser.id}`)).find((m) => m.body.startsWith('📄 견적 요청'))
  ok('업체 문의함에 견적 요청 알림', !!msg)
  await vd.goto(`${D}/pro`)
  ok('업체 홈: 답할 견적 1건', await see(vd, '무대 조명 1일'))
  await vd.getByText('무대 조명 1일').first().click()
  await vd.waitForURL(/\/quote\//, { timeout: 10000 }).catch(() => {})
  ok('누르면 견적 입력 화면', vd.url().includes('/quote/'))
  await vd.goto(`${D}/pro/money`)
  ok('견적·대금 화면', (await see(vd, '견적 · 대금')) && (await see(vd, '무대 조명 1일')))
  await vd.goto(`${D}/me`)
  await vd.waitForURL(/\/pro/, { timeout: 8000 }).catch(() => {})
  ok('업체는 내 근무 대신 전문가 화면', vd.url().endsWith('/pro'))

  // ── 6. 알바 ↔ 전문가 바꾸기 ──
  await wk.goto(`${D}/me/profile#type`)
  await wk.waitForLoadState('networkidle')
  ok('내 정보: 가입 유형', await see(wk, '🎛️ 전문가로 바꾸기'))
  await wk.getByRole('button', { name: '🎛️ 전문가로 바꾸기' }).click()
  await see(wk, /전문가로 바꿀까요/)
  await wk.getByRole('button', { name: /전문가로 바꿀까요/ }).click()
  await wk.waitForURL((u) => u.pathname === '/pro', { timeout: 10000 }).catch(() => {})
  const [w2] = await rest(`users?id=eq.${W}`)
  ok('전문가로 바뀜 → 전문가 화면', w2.member_type === 'expert' && wk.url().includes('/pro'), `${w2.member_type} ${wk.url()}`)
  await rest(`users?id=eq.${W}`, 'PATCH', { member_type: 'worker' })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
  process.exit(fails ? 1 : 0)
})()
