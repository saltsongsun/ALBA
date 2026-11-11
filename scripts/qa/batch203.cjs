// 묶음 203 (정기 개선 2026-11-11 21:36 KST)
// · 지워졌거나 주소가 잘못된 공고 링크(단톡방에 남은 예전 링크): 안내 카드 아래에 '지금 지원받는 공고'를 바로 보여 줌
//   - 가까운 날짜부터 3개 · 더 있으면 '전체 보기 →' · 마감·전문가 의뢰·작성 중·오늘 근무가 끝난 공고는 빼고
//   - 로그인한 사람은 내 지원 상태도 함께 · 지원받는 공고가 없으면 안내 카드만 (전처럼)
// · 관리자 화면 아래의 없는 주소: 근무자용 '모집 중인 알바 · 내 근무' 화면 대신 관리자 메뉴를 그대로 둔 안내
// node scripts/qa/batch203.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003'
const GONE = 'cccccccc-0000-4000-8000-000000020399' // 없는 공고
const id = (n) => `cccccccc-0000-4000-8000-0000000203${String(n).padStart(2, '0')}`
const TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (plus = 0) => new Date(Date.now() + 9 * 3600e3 + plus * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

;(async () => {
  // 시각과 상관없이 지원할 수 있게: 기본 공고를 모레까지로
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: kst(2), status: 'open' })
  const [j1] = await rest(`jobs?id=eq.${J}`)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const list = (p) => p.locator('[data-404-jobs]')
  const cards = (p) => list(p).locator('a.card-link')

  // ── 1. 비회원이 지워진 공고 링크를 누름: 안내 카드 + 지금 지원받는 공고
  const g = await pg(null)
  await g.goto(`${D}/jobs/${GONE}`, { waitUntil: 'networkidle' })
  const nf = g.locator('[data-404]')
  await nf.waitFor({ timeout: 15000 }).catch(() => {})
  ok('안내 카드는 그대로 (찾는 화면이 없어요 · 모집 중인 알바 · 내 근무 · 보던 화면으로)', one(await nf.innerText().catch(() => '')).startsWith('찾는 화면이 없어요 주소가 바뀌었거나 지워진 공고일 수 있어요.') && (await g.getByRole('link', { name: '모집 중인 알바' }).count()) === 1 && (await nf.locator('[data-back]').count()) === 1)
  ok("아래에 '지금 지원받는 공고 1' + 그 공고 카드", one(await list(g).locator('h2').innerText().catch(() => '')) === '지금 지원받는 공고 1' && (await cards(g).count()) === 1 && (await cards(g).first().getAttribute('href')) === `/jobs/${J}` && (await cards(g).first().innerText()).includes(TITLE), one(await list(g).innerText().catch(() => '')).slice(0, 80))
  ok("1개뿐이면 '전체 보기' 없음", (await g.locator('[data-404-jobs-all]').count()) === 0)
  ok('머리글이 그대로 보임 (빈 화면이 아님) · 옆으로 안 밀림', (await g.locator('[data-app-header]').count()) === 1 && (await noSide(g)))
  await g.waitForTimeout(600)
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/dead-link-jobs.png`, fullPage: true }).catch(() => {})
  // 카드를 누르면 그 공고로
  await cards(g).first().click()
  await g.waitForURL((u) => new URL(u).pathname === `/jobs/${J}`, { timeout: 15000 }).catch(() => {})
  ok('카드를 누르면 그 공고 화면', new URL(g.url()).pathname === `/jobs/${J}`, g.url())

  // ── 2. 여러 개: 가까운 날짜부터 3개 + '전체 보기 →' · 뺄 것은 빼고
  const mk = (n, o) => rest('jobs', 'POST', { ...j1, id: id(n), applications: [], required_docs: [], ...o })
  await mk(1, { title: '사흘 뒤 무대 설치', start_date: kst(3), end_date: kst(3) })
  await mk(2, { title: '내일 주차 안내', start_date: kst(1), end_date: kst(1) })
  await mk(3, { title: '닷새 뒤 철거', start_date: kst(5), end_date: kst(5) })
  await mk(4, { title: '엿새 뒤 접수', start_date: kst(6), end_date: kst(6) })
  await mk(5, { title: '마감된 공고', start_date: kst(1), end_date: kst(1), status: 'closed' })
  await mk(6, { title: '전문가 음향 의뢰', start_date: kst(1), end_date: kst(1), audience: 'expert' })
  await mk(7, { title: '작성 중인 공고', start_date: kst(1), end_date: kst(1), status: 'draft' })
  await mk(8, { title: '오늘 새벽에 끝난 공고', start_date: kst(0), end_date: kst(0), start_time: '00:00', end_time: '00:01' })
  await g.goto(`${D}/jobs/${GONE}`, { waitUntil: 'networkidle' })
  await list(g).waitFor({ timeout: 15000 }).catch(() => {})
  const titles = await cards(g).evaluateAll((els) => els.map((el) => el.querySelector('h3, b, .font-bold')?.textContent?.trim() ?? el.textContent.trim().slice(0, 30)))
  const text = one(await list(g).innerText().catch(() => ''))
  ok("5개 중 가까운 날짜부터 3개 (오늘 → 내일 → 사흘 뒤) + '지금 지원받는 공고 5'", (await cards(g).count()) === 3 && one(await list(g).locator('h2').innerText()) === '지금 지원받는 공고 5' && text.indexOf(TITLE) >= 0 && text.indexOf(TITLE) < text.indexOf('내일 주차 안내') && text.indexOf('내일 주차 안내') < text.indexOf('사흘 뒤 무대 설치'), JSON.stringify(titles))
  ok('마감 · 전문가 의뢰 · 작성 중 · 오늘 근무가 끝난 공고는 안 보임', !/마감된 공고|전문가 음향 의뢰|작성 중인 공고|오늘 새벽에 끝난 공고|닷새 뒤 철거|엿새 뒤 접수/.test(text), text.slice(0, 120))
  ok("'전체 보기 →' → 공고 목록", (await g.locator('[data-404-jobs-all]').getAttribute('href').catch(() => '')) === '/#jobs' && one(await g.locator('[data-404-jobs-all]').innerText()) === '전체 보기 →')
  ok('카드가 차례로 나타남 (stagger) · 옆으로 안 밀림', (await list(g).locator('.stagger').count()) === 1 && (await noSide(g)))
  // 작성 중인 공고의 주소로 직접 와도 같은 화면 (공고 내용은 안 보임)
  await g.goto(`${D}/jobs/${id(7)}`, { waitUntil: 'networkidle' })
  ok('작성 중인 공고 주소: 없는 화면 + 지원받는 공고 (작성 중인 내용은 안 보임)', (await g.locator('[data-404]').count()) === 1 && (await cards(g).count()) === 3 && !one(await g.locator('main').innerText()).includes('작성 중인 공고'))

  // ── 3. 로그인한 사람: 내 지원 상태도 함께
  const ap = await pg(AP)
  await ap.goto(`${D}/jobs/${GONE}`, { waitUntil: 'networkidle' })
  await list(ap).waitFor({ timeout: 15000 }).catch(() => {})
  const mineCard = cards(ap).filter({ hasText: TITLE }).first()
  ok('지원한 공고에는 내 지원 상태 표시', (await mineCard.locator('.badge').allInnerTexts()).some((t) => /지원|대기|확정/.test(t)), (await mineCard.locator('.badge').allInnerTexts()).join(','))
  ok('아래 메뉴도 그대로 (로그인한 근무자)', (await ap.locator('a[href="/me"]:visible').count()) >= 1 && (await ap.locator('[data-app-header]').count()) === 1)
  await ap.waitForTimeout(600)
  if (SHOTS) await ap.screenshot({ path: `${SHOTS}/dead-link-member.png`, fullPage: true }).catch(() => {})
  // 보던 화면으로 (기존 동작 그대로)
  const w = await pg(W)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await w.goto(`${D}/jobs/${GONE}`, { waitUntil: 'networkidle' })
  await w.locator('[data-404] [data-back]').click()
  await w.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 15000 }).catch(() => {})
  ok("'← 보던 화면으로'는 전처럼 보던 화면으로", new URL(w.url()).pathname === '/me', w.url())

  // ── 4. 지원받는 공고가 하나도 없으면: 안내 카드만 (전처럼)
  for (const n of [1, 2, 3, 4]) await rest(`jobs?id=eq.${id(n)}`, 'PATCH', { status: 'closed' })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'closed' })
  await g.goto(`${D}/jobs/${GONE}`, { waitUntil: 'networkidle' })
  await g.locator('[data-404]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('지원받는 공고가 없으면 안내 카드만', (await g.locator('[data-404]').count()) === 1 && (await list(g).count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'open' })

  // ── 5. 관리자 화면 아래의 없는 주소: 관리자 메뉴를 그대로 둔 안내
  const a = await pg(A)
  for (const [label, path] of [['없는 메뉴', '/admin/nothing-here'], ['공고 아래 없는 주소', `/admin/jobs/${J}/zzz`], ['깊은 주소', '/admin/a/b/c']]) {
    await a.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await a.locator('[data-admin-404]').waitFor({ timeout: 15000 }).catch(() => {})
    ok(`관리자 ${label}: 관리자용 안내 + 메뉴 그대로 (근무자용 버튼 없음)`, (await a.locator('[data-admin-404]').count()) === 1 && (await a.locator('[data-404]').count()) === 0 && (await a.locator('a[href="/admin/jobs"]:visible').count()) >= 1 && (await a.getByRole('link', { name: '모집 중인 알바' }).count()) === 0 && (await a.getByRole('link', { name: '관리자 홈', exact: true }).count()) === 1, a.url())
  }
  ok('360px: 옆으로 안 밀림 (관리자 없는 화면)', await noSide(a))
  await a.waitForTimeout(500)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/admin-unknown.png` }).catch(() => {})
  await a.getByRole('link', { name: '관리자 홈', exact: true }).click()
  await a.waitForURL((u) => new URL(u).pathname === '/admin', { timeout: 15000 }).catch(() => {})
  ok("'관리자 홈'으로 돌아감", new URL(a.url()).pathname === '/admin', a.url())
  // 있는 관리자 화면은 그대로 열림
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  ok('있는 관리자 화면은 그대로', (await a.locator('[data-admin-404]').count()) === 0 && (await a.getByText(TITLE).count()) > 0)
  // 관리자가 아닌 사람: 없는 관리자 주소도 관리자 화면을 보여 주지 않음
  await w.goto(`${D}/admin/nothing-here`, { waitUntil: 'networkidle' })
  ok('근무자: 없는 관리자 주소 → 관리자 화면·안내 없음', (await w.locator('[data-admin-404]').count()) === 0 && !new URL(w.url()).pathname.startsWith('/admin'), w.url())
  await g.goto(`${D}/admin/nothing-here`, { waitUntil: 'networkidle' })
  ok('비회원: 없는 관리자 주소 → 로그인으로', (await g.locator('[data-admin-404]').count()) === 0 && new URL(g.url()).pathname === '/login', g.url())
  // 근무자 쪽의 그 밖의 없는 주소는 전처럼
  await w.goto(`${D}/nothing-here`, { waitUntil: 'networkidle' })
  ok('그 밖의 없는 주소는 전처럼 안내 카드', (await w.locator('[data-404]').count()) === 1 && (await list(w).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
