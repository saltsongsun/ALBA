// 묶음 188 (정기 개선 2026-11-11 04:35 KST)
// · 여러 회사를 맡은 관리자: 지금 보는 회사가 아닌 회사의 외주 견적 요청 주소(업체가 견적을 냈다는 알림)를 열면
//   없는 화면 대신 '다른 회사 견적 요청이에요 · ○○ 화면에서 열기' — 누르면 회사를 바꾸고 그 요청을 엶
//   (공고·단체방·문의 대화에 이어 관리자 알림이 여는 화면 네 가지가 모두 됨 · 맡지 않은 회사 것은 예전처럼 없는 화면)
// · 근무자 쪽 '찾는 화면이 없어요': 흰 카드 + '← 보던 화면으로' (링크를 잘못 눌렀을 때 보던 화면으로 바로)
// node scripts/qa/batch188.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000188'
const M = 'aaaaaaaa-0000-4000-8000-000000018801', N = 'aaaaaaaa-0000-4000-8000-000000018802'
const R1 = 'dddddddd-0000-4000-8000-000000018801', R2 = 'dddddddd-0000-4000-8000-000000018802'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자', phone: '01018800001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자', phone: '01018800002', is_super: false })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })
  await rest('quote_requests', 'POST', { id: R1, company_id: C1, title: '첫 회사 무대 견적', details: null, due_date: null, job_id: null, status: 'open', created_by: A, created_at: nowIso })
  await rest('quote_requests', 'POST', { id: R2, company_id: C2, title: '두번째 회사 음향 견적', details: null, due_date: null, job_id: null, status: 'open', created_by: M, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    const cookies = []
    if (uid) cookies.push({ name: 'alba_session', value: cookie(uid), url: D })
    if (company) cookies.push({ name: 'hw_company', value: company, url: D })
    if (cookies.length) await ctx.addCookies(cookies)
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const view = (p, company) => p.context().addCookies([{ name: 'hw_company', value: company, url: D }])
  const card = (p) => p.locator('[data-other-company-job]')

  // ── 1. 첫 회사를 보는 중에 두 번째 회사 견적 요청 주소를 엶
  const m = await pg(M, C1)
  await m.goto(`${D}/admin/vendors/requests/${R2}`)
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok("없는 화면 대신 '다른 회사 견적 요청이에요 · 두번째기획 화면에서 열기'", (await card(m).locator('h1').innerText().catch(() => '')) === '다른 회사 견적 요청이에요' && one(await card(m).locator('button[type=submit]').innerText().catch(() => '')) === '두번째기획 화면에서 열기' && (await m.getByText('찾는 화면이 없어요').count()) === 0)
  ok("요청 제목은 아직 안 보임 · '지금 회사 외주 관리로'", (await m.getByText('두번째 회사 음향 견적').count()) === 0 && (await card(m).getByRole('link', { name: '지금 회사 외주 관리로' }).getAttribute('href')) === '/admin/vendors')
  ok('360px 옆으로 안 밀림', await noSide(m))
  if (SHOTS) { await m.waitForTimeout(450); await m.screenshot({ path: `${SHOTS}/request-card.png` }).catch(() => {}) }
  await card(m).locator('button[type=submit]').click()
  await m.getByText('두번째 회사 음향 견적').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 회사를 바꾸고 그 견적 요청이 열림', new URL(m.url()).pathname === `/admin/vendors/requests/${R2}` && (await m.getByText('두번째 회사 음향 견적').count()) >= 1, m.url())
  ok("'두번째기획 화면으로 바꿨어요' 안내", (await m.locator('[role=status]', { hasText: '두번째기획 화면으로 바꿨어요' }).count()) === 1)

  // ── 2. 바꿔서 여는 주소는 그 회사 요청일 때만
  await view(m, C1)
  await m.goto(`${D}/admin/vendors/requests/${R2}`)
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  await card(m).locator('input[name=open]').evaluate((el, v) => { el.value = v }, `/admin/vendors/requests/${R1}`) // 두번째기획으로 바꾸면서 첫 회사 요청을 열라고 함
  await card(m).locator('button[type=submit]').click()
  await m.waitForURL((u) => u.pathname === '/admin', { timeout: 15000 }).catch(() => {})
  ok('그 회사 요청이 아닌 주소면 홈으로', new URL(m.url()).pathname === '/admin', m.url())

  // ── 3. 맡지 않은 회사의 요청은 없는 화면 · 우리 회사 요청은 그대로
  const n = await pg(N, C1)
  await n.goto(`${D}/admin/vendors/requests/${R2}`)
  await n.locator('[data-admin-404]').waitFor({ timeout: 15000 }).catch(() => {})
  const nBody = one(await n.locator('body').innerText())
  ok('맡지 않은 회사 요청: 없는 화면 · 회사 이름·제목 안 보임', nBody.includes('찾는 화면이 없어요') && !nBody.includes('두번째기획') && !nBody.includes('음향 견적') && (await card(n).count()) === 0, nBody.slice(0, 80))
  await n.goto(`${D}/admin/vendors/requests/${R1}`)
  await n.getByText('첫 회사 무대 견적').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('우리 회사 요청은 그대로 열림', (await n.getByText('첫 회사 무대 견적').count()) >= 1 && (await card(n).count()) === 0)

  // ── 4. 근무자 쪽 없는 화면: 흰 카드 + 보던 화면으로
  const w = await pg(W)
  await w.goto(`${D}/me`)
  await w.locator('[data-app-header], header').first().waitFor({ timeout: 15000 }).catch(() => {})
  await w.goto(`${D}/jobs/cccccccc-0000-4000-8000-000000018899`)
  const nf = w.locator('[data-404]')
  await nf.waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForTimeout(450)
  const s = await nf.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, w: Math.round(el.getBoundingClientRect().width) })).catch(() => null)
  ok('없는 화면: 흰 카드 (360px에서 좌우 16px 여백)', !!s && s.bg === 'rgb(255, 255, 255)' && s.w === 328, JSON.stringify(s))
  ok("안내 · '모집 중인 알바' · '내 근무' 그대로", one(await nf.innerText()).startsWith('찾는 화면이 없어요 주소가 바뀌었거나 지워진 공고일 수 있어요.') && (await nf.getByRole('link', { name: '모집 중인 알바' }).getAttribute('href')) === '/' && (await nf.getByRole('link', { name: '내 근무', exact: true }).getAttribute('href')) === '/me')
  ok('옆으로 안 밀림', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/404.png` }).catch(() => {})
  await nf.locator('[data-back]').click()
  await w.waitForURL((u) => u.pathname === '/me', { timeout: 15000 }).catch(() => {})
  ok("'← 보던 화면으로': 보던 화면(내 근무)으로", new URL(w.url()).pathname === '/me', w.url())
  // 링크로 바로 들어와 보던 화면이 없으면 첫 화면으로
  const g = await pg('')
  await g.goto(`${D}/jobs/cccccccc-0000-4000-8000-000000018899`)
  await g.locator('[data-404]').waitFor({ timeout: 15000 }).catch(() => {})
  const hist = await g.evaluate(() => history.length)
  await g.locator('[data-404] [data-back]').click()
  await g.waitForURL((u) => u.pathname === '/', { timeout: 15000 }).catch(() => {})
  ok('보던 화면이 없으면 첫 화면으로', hist > 1 || new URL(g.url()).pathname === '/', `${hist} · ${g.url()}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
