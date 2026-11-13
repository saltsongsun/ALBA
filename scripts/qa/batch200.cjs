// 묶음 200 (정기 개선 2026-11-11 17:40 KST)
// · 회사 공고 모음 링크(/?co=회사)로 들어온 사람이 위쪽 머리글의 '로그인 · 가입하기'를 눌러도 그 회사 공고로 돌아오게:
//   - 머리글 링크에 돌아올 주소(next)를 붙임 (회사 공고 모음 · 공고 화면) · 로그인 ↔ 가입을 오가도 그대로
//   - 로그인·가입 화면에 회사 이름 + '로그인하면/가입하면 이 회사 공고로 돌아가요' (쓰는 중인 회사만)
//   - 유형 없이 온 가입(/signup?next=/?co=회사)은 고르기 없이 아르바이트 가입으로 (다시 고르기는 그대로)
// · 머리글: 지금 있는 화면으로 가는 버튼은 뺌 (로그인 화면에 '로그인', 가입 화면에 '가입하기'가 두 번 보이지 않게)
// · 회사 공고 모음: 이미 지원한 근무자에게 '내 지원 · 확정 n건 · 확정 대기 n건' 한 줄 (없으면 전처럼 '내 근무 보기')
// node scripts/qa/batch200.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', AP = '33333333-0000-4000-8000-000000000011'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', C3 = '99999999-0000-4000-8000-000000000097'
const NONE = '99999999-0000-4000-8000-000000000001' // 없는 회사
const J2 = 'cccccccc-0000-4000-8000-0000000000c2'
const LONG = '주식회사 아주아주 이름이 긴 행사 기획 운영 전문 대행 회사 경남지사'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const enc = encodeURIComponent
const href = (p, sel) => p.locator(sel).first().getAttribute('href', { timeout: 8000 }).catch(() => null)

;(async () => {
  // 회사2 = 쓰는 중인 다른 회사(이름이 김), 회사3 = 쉬는 회사
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: LONG, seal_image: null, verified: false, created_at: '2026-10-15T00:00:00Z' })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '쉬는회사', seal_image: null, active: false, created_at: '2026-10-16T00:00:00Z' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: LONG }, title: '두번째 회사 무대 스태프', applications: [], required_docs: [] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    // 서버가 그린 머리글과 브라우저가 그린 머리글이 다르면(hydration) 콘솔에 오류가 남
    p.on('console', (m) => { if (m.type() === 'error' && /hydrat/i.test(m.text())) errs.push(m.text().slice(0, 160)) })
    return p
  }
  const CO = `/?co=${C1}`

  // ── 1. 머리글 '로그인 · 가입하기'에 돌아올 주소
  const g = await pg(null)
  await g.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  ok('회사 공고 모음: 머리글 로그인 → 이 회사 공고로 돌아옴', (await href(g, '[data-header-login]')) === `/login?next=${enc(CO)}`, await href(g, '[data-header-login]'))
  ok('회사 공고 모음: 머리글 가입하기 → 아르바이트 가입 + 돌아올 주소', (await href(g, '[data-header-signup]')) === `/signup?type=worker&next=${enc(CO)}`, await href(g, '[data-header-signup]'))
  // 거르기를 고른 주소(/?co=…&when=soon)에서도 회사만 남겨서
  await g.goto(`${D}/?when=soon&co=${C1}`, { waitUntil: 'networkidle' })
  ok('거르기를 고른 회사 화면에서도 회사 주소만 실림', (await href(g, '[data-header-login]')) === `/login?next=${enc(CO)}`, await href(g, '[data-header-login]'))
  await g.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  ok('공고 화면: 머리글 로그인·가입하기 → 이 공고로 돌아옴', (await href(g, '[data-header-login]')) === `/login?next=${enc(`/jobs/${J}`)}` && (await href(g, '[data-header-signup]')) === `/signup?next=${enc(`/jobs/${J}`)}`, `${await href(g, '[data-header-login]')} ${await href(g, '[data-header-signup]')}`)
  await g.goto(`${D}/`, { waitUntil: 'networkidle' })
  ok('그 밖의 화면(홈): 전처럼 /login · /signup', (await href(g, '[data-header-login]')) === '/login' && (await href(g, '[data-header-signup]')) === '/signup', `${await href(g, '[data-header-login]')} ${await href(g, '[data-header-signup]')}`)
  await g.goto(`${D}/?co=not-a-company`, { waitUntil: 'networkidle' })
  ok('회사 주소가 이상하면 돌아올 주소 없이', (await href(g, '[data-header-login]')) === '/login' && (await href(g, '[data-header-signup]')) === '/signup')
  await g.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  ok('전문가 화면: 전처럼', (await href(g, '[data-header-login]')) === '/login' && (await href(g, '[data-header-signup]')) === '/signup')

  // ── 2. 머리글 로그인을 눌러서 → 로그인 화면에 회사 이름
  await g.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  await g.locator('[data-header-login]').click()
  const lc = g.locator('[data-login-co]')
  await lc.waitFor({ timeout: 15000 }).catch(() => {})
  const lt = ((await lc.innerText().catch(() => '')) ?? '').replace(/\n+/g, ' / ').trim()
  ok("로그인 화면: 회사 이름 + '로그인하면 이 회사 공고로 돌아가요'", lt === '주식회사 테스트 / 로그인하면 이 회사 공고로 돌아가요' && (await lc.getAttribute('data-login-co')) === C1, lt)
  ok('로그인 칸에 돌아올 주소가 실림', (await g.locator('input[name=next]').first().inputValue().catch(() => '')) === CO)
  ok("로그인 화면 머리글: '로그인'은 빼고 '가입하기'만 (돌아올 주소 그대로)", (await g.locator('[data-header-login]').count()) === 0 && (await href(g, '[data-header-signup]')) === `/signup?next=${enc(CO)}`, await href(g, '[data-header-signup]'))
  ok('360px: 옆으로 안 밀림 (로그인)', await noSide(g))
  if (SHOTS) await g.waitForTimeout(700)
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/login-for-company.png`, clip: { x: 0, y: 0, width: 360, height: 470 } }).catch(() => {})

  // ── 3. 로그인 화면 머리글의 '가입하기' → 고르기 없이 아르바이트 가입 + 회사 이름
  await g.locator('[data-header-signup]').click()
  const sc = g.locator('[data-signup-co]')
  await sc.waitFor({ timeout: 15000 }).catch(() => {})
  const u3 = new URL(g.url())
  const st = ((await sc.innerText().catch(() => '')) ?? '').replace(/\n+/g, ' / ').trim()
  ok('유형을 묻지 않고 아르바이트 가입 화면으로', u3.pathname === '/signup' && u3.searchParams.get('type') === 'worker' && u3.searchParams.get('next') === CO && (await g.getByRole('heading', { name: '간편 가입' }).count()) === 1, g.url())
  ok("가입 화면: 회사 이름 + '가입하면 이 회사 공고로 돌아가요'", st === '주식회사 테스트 / 가입하면 이 회사 공고로 돌아가요', st)
  ok('가입 칸에 돌아올 주소가 실림', (await g.locator('input[name=next]').first().inputValue().catch(() => '')) === CO)
  ok("가입 화면 머리글: '가입하기'는 빼고 '로그인'만 (돌아올 주소 그대로)", (await g.locator('[data-header-signup]').count()) === 0 && (await href(g, '[data-header-login]')) === `/login?next=${enc(CO)}`, await href(g, '[data-header-login]'))
  ok('360px: 옆으로 안 밀림 (가입)', await noSide(g))
  if (SHOTS) await g.waitForTimeout(700)
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/signup-for-company.png`, clip: { x: 0, y: 0, width: 360, height: 470 } }).catch(() => {})
  // '유형 다시 고르기' → 고르는 화면에 머묾 (다시 튕기지 않음)
  await g.getByRole('link', { name: '← 유형 다시 고르기' }).click()
  await g.getByRole('heading', { name: '어떤 분이세요?' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('다시 고르기를 누르면 고르는 화면에 머묾', (await g.getByRole('heading', { name: '어떤 분이세요?' }).count()) === 1 && new URL(g.url()).searchParams.get('pick') === '1', g.url())

  // ── 4. 쉬는 회사 · 없는 회사 · 회사가 아닌 주소: 회사 표시 없음
  for (const [label, id] of [['쉬는 회사', C3], ['없는 회사', NONE]]) {
    await g.goto(`${D}/login?next=${enc(`/?co=${id}`)}`, { waitUntil: 'networkidle' })
    const noChip = (await g.locator('[data-login-co]').count()) === 0 && (await g.getByRole('heading', { name: '로그인' }).count()) === 1
    await g.goto(`${D}/signup?next=${enc(`/?co=${id}`)}`, { waitUntil: 'networkidle' })
    ok(`${label}: 로그인에 회사 표시 없음 · 가입은 고르는 화면 그대로`, noChip && (await g.getByRole('heading', { name: '어떤 분이세요?' }).count()) === 1, g.url())
  }
  await g.goto(`${D}/login?next=${enc('/me')}`, { waitUntil: 'networkidle' })
  ok('회사·공고가 아닌 곳에서 온 로그인: 표시 없음', (await g.locator('[data-login-co], [data-login-for]').count()) === 0)
  // 공고에서 온 로그인은 전처럼 공고 제목 (회사 표시와 겹치지 않음)
  await g.goto(`${D}/login?next=${enc(`/jobs/${J}`)}`, { waitUntil: 'networkidle' })
  ok('공고에서 온 로그인: 공고 제목만', (await g.locator('[data-login-for]').count()) === 1 && (await g.locator('[data-login-co]').count()) === 0)

  // ── 5. 다른 사이트로 보내는 주소는 머리글에도 실리지 않음
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example']) {
    await g.goto(`${D}/login?next=${enc(bad)}`, { waitUntil: 'networkidle' })
    const h = await href(g, '[data-header-signup]')
    ok(`바깥 주소(${bad})는 머리글 링크에 안 실림`, h === '/signup', h)
  }

  // ── 6. 이름이 긴 회사: 한 줄로 줄임
  await g.goto(`${D}/login?next=${enc(`/?co=${C2}`)}`, { waitUntil: 'networkidle' })
  const long = g.locator('[data-login-co]')
  await long.waitFor({ timeout: 15000 }).catch(() => {})
  ok('긴 회사 이름: 한 줄(줄임) · 옆으로 안 밀림', (await long.evaluate((el) => el.querySelector('b').getBoundingClientRect().height < 24 && el.getBoundingClientRect().height < 64).catch(() => false)) && (await noSide(g)))
  if (SHOTS) await g.waitForTimeout(700)
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/login-long-company.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})

  // ── 7. 회사 공고 모음: 이미 지원한 근무자에게 '내 지원' 한 줄
  const w = await pg(W)
  await w.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  const mineRow = w.locator('[data-company-mine]')
  const mt = ((await mineRow.innerText({ timeout: 8000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  ok("확정된 근무자: '내 지원 · 확정 1건' + '내 근무 →'", mt === '내 지원 · 확정 1건 내 근무 →' && (await mineRow.getAttribute('href')) === '/me', mt)
  ok('한 줄 · 누르기 쉬운 높이(40px 이상) · 옆으로 안 밀림', (await mineRow.evaluate((el) => { const r = el.getBoundingClientRect(); return r.height >= 40 && r.height < 52 }).catch(() => false)) && (await noSide(w)))
  ok('로그인한 사람 머리글에는 로그인·가입하기 없음', (await w.locator('[data-header-login], [data-header-signup]').count()) === 0)
  if (SHOTS) await w.waitForTimeout(700)
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/company-mine.png`, clip: { x: 0, y: 0, width: 360, height: 330 } }).catch(() => {})
  // 지원만 하고 기다리는 사람
  const ap = await pg(AP)
  await ap.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  const at = ((await ap.locator('[data-company-mine]').innerText({ timeout: 8000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  // 옆에 '문의' 버튼이 붙어 줄이 좁아져 '확정 대기' → '대기' (묶음 234)
  ok("확정을 기다리는 사람: '내 지원 · 대기 1건'", at === '내 지원 · 대기 1건 내 근무 →', at)
  // 이 회사에 지원한 적이 없으면 전처럼
  await w.goto(`${D}/?co=${C2}`, { waitUntil: 'networkidle' })
  ok("지원한 적 없는 회사: 전처럼 '내 근무 보기'", (await w.locator('[data-company-mine]').count()) === 0 && (await w.getByRole('link', { name: /님 내 근무 보기 →/ }).count()) === 1)
  // 다른 회사에 낸 지원은 이 회사 줄에 섞이지 않음 (회사2 화면에 회사1 확정이 안 보임)
  ok('다른 회사에 낸 지원은 섞이지 않음', !((await w.locator('main').innerText().catch(() => '')) ?? '').includes('확정 1건'))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})()
