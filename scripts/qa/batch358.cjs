// 묶음 358 (정기 개선 2026-11-23 06:35 KST · 다른 회사 합류·등록 들어가는 길 + 회사로 시작하기 칸 고르기 움직임)
// · 회사 설정 '관리자' 칸 맨 아래: '다른 회사도 맡나요? 이 계정 그대로 써요.' + [코드로 합류] [새 회사 등록]
//   - 내가 다른 회사에 낸 관리자 신청이 승인 전이면 '합류 승인을 기다리는 회사 n곳 ›' (→ 기다리는 화면 · 내 신청만 셈)
//   - 최고 관리자는 안 보임 (회사 관리 화면을 씀)
// · 회사로 시작하기(/start): 이미 관리자로 로그인했으면 '○○님 계정에 회사를 하나 더 만들어요.' (근무자·로그인 안 함은 없음)
//   - 두 칸 고르기: 흰 막대가 고른 칸으로 미끄러짐(0.2초) · 아래 내용 살짝 올라옴(0.25초) · 움직임 줄이기면 바로
// node scripts/qa/batch358.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-0000003580c2', C3 = '99999999-0000-4000-8000-0000003580c3'
const N = 'aaaaaaaa-0000-4000-8000-0000003580a1' // 최고 관리자 아닌 C1 관리자
const R = 'bbbbbbbb-0000-4000-8000-0000003580b1' // 다른 사람
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [au] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...au, id: N, name: '일반관리358', phone: '01035800001', is_super: false })
  await rest('users', 'POST', { ...au, id: R, name: '남358', phone: '01035800002', role: 'worker', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: '2026-10-01T00:00:00Z' })
  for (const [id, name] of [[C2, '둘째회사358'], [C3, '셋째회사358']]) await rest('companies', 'POST', { id, company_name: name, ceo_name: '대표', active: true, verified: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 일반 관리자: 회사 설정 관리자 칸 아래
  const n = await mk(N)
  await go(n, '/admin/settings')
  const more = n.locator('#admins [data-team-more]')
  await more.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'다른 회사도 맡나요? 이 계정 그대로 써요.'", one(await more.locator('p').first().innerText().catch(() => '')) === '다른 회사도 맡나요? 이 계정 그대로 써요.')
  ok('[코드로 합류] → /start?tab=join · [새 회사 등록] → /start', (await more.locator('[data-team-join]').getAttribute('href')) === '/start?tab=join' && (await more.locator('[data-team-new]').getAttribute('href')) === '/start')
  ok('두 버튼 한 줄 (같은 높이)', await more.evaluate((el) => { const [a, c] = el.querySelectorAll('[data-team-join], [data-team-new]'); const r1 = a.getBoundingClientRect(), r2 = c.getBoundingClientRect(); return Math.abs(r1.top - r2.top) < 2 && r1.height < 48 }))
  ok('신청 없으면 기다림 줄 없음', (await more.locator('[data-team-wait]').count()) === 0)
  ok('360px 옆으로 안 밀림 (설정)', await noSide(n))

  // 내 신청 1곳 + 다른 사람 신청 1곳 → 나는 1곳
  await rest('company_join_requests', 'POST', { company_id: C2, user_id: N, created_at: new Date(Date.now() - 3600e3).toISOString() })
  await rest('company_join_requests', 'POST', { company_id: C3, user_id: R, created_at: new Date(Date.now() - 3600e3).toISOString() })
  await go(n, '/admin/settings')
  const wait = n.locator('#admins [data-team-wait]')
  await wait.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'합류 승인을 기다리는 회사 1곳 ›' (내 신청만)", one(await wait.innerText().catch(() => '')) === '합류 승인을 기다리는 회사 1곳 ›', one(await wait.innerText().catch(() => '')))
  ok('→ 기다리는 화면', (await wait.getAttribute('href')) === '/start/wait')
  if (SHOTS) await n.locator('#admins').screenshot({ path: `${SHOTS}/settings-team-more.png` }).catch(() => {})

  // 누르면 합류 칸이 열린 회사로 시작하기
  await Promise.all([n.waitForURL((u) => u.pathname === '/start', { timeout: 15000 }).catch(() => {}), n.locator('[data-team-join]').click()])
  await n.waitForLoadState('networkidle')
  ok("[코드로 합류] → '기존 회사에 합류' 칸", new URL(n.url()).searchParams.get('tab') === 'join' && (await n.locator('nav[aria-label="가입 방법"] a[aria-current="page"]').innerText()) === '기존 회사에 합류')

  // ── 2. 최고 관리자: 안 보임
  const a = await mk(A)
  await go(a, '/admin/settings')
  await a.locator('#admins').waitFor({ timeout: 15000 }).catch(() => {})
  ok('최고 관리자는 안 보임', (await a.locator('#admins').count()) === 1 && (await a.locator('[data-team-more]').count()) === 0)

  // ── 3. 회사로 시작하기: 관리자 로그인 안내 + 칸 고르기 움직임
  await go(n, '/start')
  ok("관리자 로그인: '일반관리358님 계정에 회사를 하나 더 만들어요. …'", one(await n.locator('[data-start-signed]').innerText().catch(() => '')) === '일반관리358님 계정에 회사를 하나 더 만들어요. 회사 고르기로 바꿔 가며 써요.', one(await n.locator('[data-start-signed]').innerText().catch(() => '')))
  const pill = n.locator('[data-start-pill]')
  // Tailwind v4 translate-x는 transform이 아니라 translate 속성 → 실제 위치(왼쪽 끝)로 잼
  const tx = () => pill.evaluate((el) => el.getBoundingClientRect().left - el.parentElement.getBoundingClientRect().left - 4)
  const navBox = await n.locator('nav[aria-label="가입 방법"]').boundingBox()
  const pillBox = await pill.boundingBox()
  ok('흰 막대: 새 회사 등록 칸 (왼쪽 · 반 폭)', Math.abs(await tx()) < 1 && Math.abs(pillBox.width - (navBox.width / 2 - 6)) < 2, `${pillBox.width} / ${navBox.width}`)
  ok('흰 막대 0.2초로 미끄러짐', (await pill.evaluate((el) => getComputedStyle(el).transitionDuration)) === '0.2s')
  ok('아래 내용 올라옴 0.25초', JSON.stringify(await n.locator('[data-start-body]').evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])) === '["rise","0.25s"]')
  ok('360px 옆으로 안 밀림 (회사로 시작하기)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/start-new.png` })
  // 합류 칸으로: 같은 막대가 오른쪽으로 (화면을 새로 그리지 않고 옮겨 감)
  await pill.evaluate((el) => { el.dataset.same = '1' })
  await Promise.all([n.waitForURL((u) => u.searchParams.get('tab') === 'join', { timeout: 15000 }).catch(() => {}), n.locator('nav[aria-label="가입 방법"] a', { hasText: '기존 회사에 합류' }).click()])
  await n.waitForTimeout(500)
  const moved = await tx()
  ok('합류 칸을 누르면 막대가 오른쪽으로', moved > navBox.width / 2 - 10, String(moved))
  ok('같은 막대가 옮겨 감 (깜빡이지 않음)', (await n.locator('[data-start-pill][data-same="1"]').count()) === 1)
  ok('글자 색: 고른 칸 진하게', await n.evaluate(() => { const [x, y] = document.querySelectorAll('nav[aria-label="가입 방법"] a'); return getComputedStyle(x).color !== getComputedStyle(y).color && y.getAttribute('aria-current') === 'page' }))
  ok('합류 칸 내용 (관리자 이름 계정으로 신청)', one(await n.locator('[data-start-body]').innerText()).includes('일반관리358님 계정으로 신청해요'))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/start-join.png` })

  // 근무자·로그인 안 함: 계정 안내 없음 (막대는 있음)
  const w = await mk(W)
  await go(w, '/start')
  ok('근무자: 계정 안내 없음', (await w.locator('[data-start-signed]').count()) === 0 && (await w.locator('[data-start-pill]').count()) === 1)
  const g = await mk(null)
  await go(g, '/start')
  ok('로그인 안 함: 계정 안내 없음 · 담당자 칸 그대로', (await g.locator('[data-start-signed]').count()) === 0 && (await g.locator('input[name="phone"]').count()) === 1)

  // 움직임 줄이기: 바로
  const rm = await mk(N, { reducedMotion: 'reduce' })
  await go(rm, '/start?tab=join')
  const [td, ad] = await rm.evaluate(() => [parseFloat(getComputedStyle(document.querySelector('[data-start-pill]')).transitionDuration), parseFloat(getComputedStyle(document.querySelector('[data-start-body]')).animationDuration)])
  ok('움직임 줄이기: 막대·내용 바로', td < 0.05 && ad < 0.05, `${td} ${ad}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
