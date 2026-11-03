// 우리 회사 공고 모음 링크(/?co=회사id): 그 회사 공고만 · 다른 회사 공고 안 섞임 · 가입·로그인 뒤 이 화면으로
// · 관리자 공고 화면의 '공유하기'로 링크 복사 · 잘못된·쉬는 회사 주소는 전체 공고 · 360px에서 옆으로 안 밀림
// node scripts/qa/company-link.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', C3 = '99999999-0000-4000-8000-000000000097'
const J2 = 'cccccccc-0000-4000-8000-0000000000c2'
const T1 = '경상남도 생활체육대축전 행사장 안내 스태프', T2 = '두번째 회사 무대 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
// 공고 목록의 카드만 셈 (위의 '오늘 근무가 있어요' 바로가기는 빼고)
const cards = (p, t) => p.locator('#jobs ~ .stagger a.card-link', { hasText: t }).count()
const noSideScroll = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1)

;(async () => {
  // 회사1 = 해피워크가 확인한 회사, 회사2 = 확인 전
  await rest(`companies?id=eq.${C1}`, 'PATCH', { verified: true })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, verified: false, created_at: '2026-10-15T00:00:00Z' })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '쉬는회사', seal_image: null, active: false, created_at: '2026-10-16T00:00:00Z' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: '두번째컴퍼니' }, title: T2, applications: [], required_docs: [] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 처음 온 사람: 회사1 링크 → 회사1 공고만 ──
  const anon = await pg(null)
  await anon.goto(`${D}/?co=${C1}`)
  const sub = (p) => p.locator('[data-company-sub]').innerText().catch(() => '')
  ok('회사 이름과 안내', (await see(anon, '주식회사 테스트')) && (await anon.locator('[data-company-sub]').count()) === 1)
  ok('확인된 회사 표시 + 모집 중 공고 수', (await sub(anon)) === '✓ 확인된 회사 · 모집 중 1개', await sub(anon))
  const subBox = await anon.locator('[data-company-sub]').boundingBox()
  ok('360px: 안내 한 줄', !!subBox && subBox.height < 24, JSON.stringify(subBox))
  ok('회사1 공고 보임', (await cards(anon, T1)) === 1)
  ok('다른 회사 공고 안 보임', (await cards(anon, T2)) === 0)
  const signupHref = await anon.getByRole('link', { name: '간편 가입' }).getAttribute('href')
  ok('간편 가입 → 가입 뒤 이 회사 공고로 돌아옴', signupHref === `/signup?type=worker&next=${encodeURIComponent(`/?co=${C1}`)}`, signupHref)
  const loginHref = await anon.getByRole('link', { name: '로그인', exact: true }).last().getAttribute('href')
  ok('로그인 → 로그인 뒤 이 회사 공고로', loginHref === `/login?next=${encodeURIComponent(`/?co=${C1}`)}`, loginHref)
  const chip = await anon.getByRole('link', { name: '오늘·내일' }).getAttribute('href')
  ok('날짜 거르기도 이 회사 안에서', chip.includes(`co=${C1}`), chip)
  ok('360px: 옆으로 안 밀림', await noSideScroll(anon))
  await anon.getByRole('link', { name: '전체 공고' }).click()
  await anon.waitForURL((u) => !new URL(u).searchParams.get('co'), { timeout: 8000 }).catch(() => {})
  ok('전체 공고 → 모든 회사 공고', (await cards(anon, T1)) === 1 && (await cards(anon, T2)) === 1, anon.url())

  // ── 2. 회사2 링크 ──
  await anon.goto(`${D}/?co=${C2}`)
  ok('회사2 링크: 회사2 공고만', (await see(anon, '두번째컴퍼니')) && (await cards(anon, T2)) === 1 && (await cards(anon, T1)) === 0)
  ok('확인 전 회사: 확인 표시 없이 공고 수만', (await sub(anon)) === '모집 중 1개', await sub(anon))
  await rest(`jobs?id=eq.${J2}`, 'PATCH', { status: 'closed' })
  await anon.goto(`${D}/?co=${C2}`)
  ok('모집 마감만 남으면: 지금은 모집 중인 공고가 없어요', (await sub(anon)) === '지금은 모집 중인 공고가 없어요', await sub(anon))
  await rest(`jobs?id=eq.${J2}`, 'PATCH', { status: 'open' })

  // ── 3. 잘못된 주소·쉬는 회사는 그냥 전체 공고 ──
  for (const co of ['abc', C3, '99999999-0000-4000-8000-000000000001']) {
    await anon.goto(`${D}/?co=${encodeURIComponent(co)}`)
    ok(`잘못된·쉬는 회사(${co.slice(-4)}): 전체 공고, 회사 안내 없음`, (await cards(anon, T1)) === 1 && (await cards(anon, T2)) === 1 && (await anon.locator('[data-company-sub]').count()) === 0)
  }

  // ── 4. 가입 화면으로 가면 다음 주소가 실림 → 가입 후 이 회사 공고 ──
  await anon.goto(`${D}${signupHref}`)
  ok('가입 화면에 돌아올 주소 실림', (await anon.locator('input[name=next]').first().inputValue().catch(() => '')) === `/?co=${C1}`)

  // ── 5. 로그인한 근무자 ──
  const wk = await pg(W)
  await wk.goto(`${D}/?co=${C1}`)
  ok('근무자: 회사 안내 + 내 근무 버튼', (await sub(wk)).includes('모집 중') && (await see(wk, '근무자님 내 근무 보기 →')))
  ok('근무자: 가입·로그인 버튼 없음', (await wk.getByRole('link', { name: '간편 가입' }).count()) === 0)
  ok('근무자: 회사1 공고만', (await cards(wk, T1)) === 1 && (await cards(wk, T2)) === 0)

  // ── 6. 관리자: 공고 화면의 공유하기 → 우리 회사 링크 복사 ──
  const ad = await pg(A, { permissions: ['clipboard-read', 'clipboard-write'] })
  await ad.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) })
  await ad.goto(`${D}/admin/jobs`)
  ok('관리자 공고 화면: 공고 모음 링크 안내', (await see(ad, '우리 회사 공고 모음 링크')) && (await see(ad, '단톡방에 올려 두세요')))
  ok('관리자 360px: 옆으로 안 밀림', await noSideScroll(ad))
  await ad.getByRole('button', { name: '공유하기' }).click()
  ok('누르면 링크 복사됨', await see(ad, '링크 복사됨 ✓'))
  const copied = await ad.evaluate(() => navigator.clipboard.readText())
  ok('복사한 글: 회사 이름 + 우리 회사 링크', copied.includes('주식회사 테스트 모집 공고 모음') && copied.includes(`/?co=${C1}`), copied)
  await ad.goto(`${D}/admin/jobs?tab=past`)
  ok('지난 공고 탭에서는 안 보임', !(await see(ad, '우리 회사 공고 모음 링크', 800)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
