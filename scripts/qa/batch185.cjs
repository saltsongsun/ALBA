// 묶음 185 (정기 개선 2026-11-11 01:35 KST)
// · 여러 회사를 맡은 관리자: 지금 보는 회사가 아닌 회사의 공고·단체방 주소(알림·공유 링크)를 열면
//   '찾는 화면이 없어요' 대신 '다른 회사 공고예요 · ○○ 화면에서 열기' — 누르면 회사를 바꾸고 보려던 탭 그대로 엶
//   (내가 맡지 않은 회사의 공고는 예전처럼 없는 화면 · 회사 이름도 안 보임 · 바꿔서 여는 주소는 그 회사 공고일 때만)
// · 단체방 입력 칸: 글을 쓰기 시작하면 이모티콘·@ 버튼이 '›' 하나로 접혀 입력 칸이 넓어짐 ('›'를 누르면 다시 펼침 · 다 지우거나 보내면 처음대로)
// node scripts/qa/batch185.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000185'
const J2 = 'cccccccc-0000-4000-8000-000000000185'
const M = 'aaaaaaaa-0000-4000-8000-000000018501', N = 'aaaaaaaa-0000-4000-8000-000000018502'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), nowIso = new Date().toISOString()
  // 준비: 두 번째 회사 + 그 회사 공고 · 관리자 M(두 회사 모두) · 관리자 N(첫 회사만) — 둘 다 최고 관리자가 아님
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const span = { start_date: kstDay(now - 864e5), end_date: kstDay(now + 864e5), start_time: '00:00:00', end_time: '23:59:00' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', span)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('jobs', 'POST', { ...j, ...span, id: J2, company_id: C2, title: '두번째 회사 행사', status: 'open', applications: [] })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자', phone: '01018500001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자', phone: '01018500002', is_super: false })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const card = (p) => p.locator('[data-other-company-job]')
  const openBtn = (p) => card(p).locator('button[type=submit]')

  // ── 1. 첫 회사를 보는 중에 두 번째 회사 공고 주소를 엶 (알림 링크처럼 탭까지)
  const m = await pg(M, C1)
  await m.goto(`${D}/admin/jobs/${J2}?tab=apps`)
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok("없는 화면 대신 '다른 회사 공고예요'", (await card(m).locator('h1').innerText().catch(() => '')) === '다른 회사 공고예요' && (await m.getByText('찾는 화면이 없어요').count()) === 0)
  ok("지금 보는 회사 · 열 회사가 보임", one(await m.locator('[data-other-company-now]').innerText().catch(() => '')) === '지금은 주식회사 테스트 화면이에요' && one(await openBtn(m).innerText().catch(() => '')) === '두번째기획 화면에서 열기', `${one(await m.locator('[data-other-company-now]').innerText().catch(() => ''))} / ${one(await openBtn(m).innerText().catch(() => ''))}`)
  ok('버튼 한 줄 · 360px 옆으로 안 밀림', (await openBtn(m).evaluate((el) => el.getBoundingClientRect().height <= 56).catch(() => false)) && (await noSide(m)))
  ok('그 공고 내용은 아직 안 보임 (제목)', (await m.getByText('두번째 회사 행사').count()) === 0)
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/other-company.png` }).catch(() => {})
  await openBtn(m).click()
  await m.waitForURL((u) => u.pathname === `/admin/jobs/${J2}`, { timeout: 15000 }).catch(() => {})
  await m.getByText('두번째 회사 행사').first().waitFor({ timeout: 15000 }).catch(() => {})
  const u1 = new URL(m.url())
  ok('누르면 회사를 바꾸고 그 공고가 열림 (보려던 탭 그대로)', u1.pathname === `/admin/jobs/${J2}` && u1.searchParams.get('tab') === 'apps' && (await m.getByText('두번째 회사 행사').count()) >= 1, m.url())
  ok("'두번째기획 화면으로 바꿨어요' 안내", (await m.getByText('두번째기획 화면으로 바꿨어요').count()) >= 1)
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/other-company-opened.png` }).catch(() => {})

  // ── 2. 이제 두 번째 회사를 보는 중: 첫 회사 공고·단체방도 같은 안내
  await m.goto(`${D}/admin/jobs/${J}`)
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok('반대쪽도: 지금은 두번째기획 · 주식회사 테스트 화면에서 열기', one(await m.locator('[data-other-company-now]').innerText().catch(() => '')) === '지금은 두번째기획 화면이에요' && one(await openBtn(m).innerText().catch(() => '')) === '주식회사 테스트 화면에서 열기')
  ok("'지금 회사 공고 목록으로' → 공고 목록", (await card(m).getByRole('link', { name: '지금 회사 공고 목록으로' }).getAttribute('href')) === '/admin/jobs')
  await m.goto(`${D}/admin/chat/room/${J}`)
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok("단체방 주소도: '다른 회사 단체방이에요'", (await card(m).locator('h1').innerText().catch(() => '')) === '다른 회사 단체방이에요')
  await openBtn(m).click()
  await m.waitForURL((u) => u.pathname === `/admin/chat/room/${J}`, { timeout: 15000 }).catch(() => {})
  await m.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 그 회사 단체방이 열림', new URL(m.url()).pathname === `/admin/chat/room/${J}` && (await m.locator('textarea[name=body]').count()) === 1, m.url())

  // ── 3. 바꿔서 여는 주소는 그 회사 공고일 때만 (주소를 바꿔 보내도 다른 곳으로 안 감)
  await m.goto(`${D}/admin/jobs/${J2}`) // 지금은 첫 회사 화면
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  await card(m).locator('input[name=open]').evaluate((el, v) => { el.value = v }, `/admin/jobs/${J}`) // 두번째기획으로 바꾸면서 첫 회사 공고를 열라고 함
  await openBtn(m).click()
  await m.waitForURL((u) => u.pathname === '/admin', { timeout: 15000 }).catch(() => {})
  ok('그 회사 공고가 아닌 주소면 홈으로 (회사만 바뀜)', new URL(m.url()).pathname === '/admin', m.url())
  await m.goto(`${D}/admin/jobs/${J}`) // 지금은 두번째기획 화면
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  await card(m).locator('input[name=open]').evaluate((el) => { el.value = 'https://example.com/admin/jobs/x' })
  await openBtn(m).click()
  await m.waitForURL((u) => u.pathname === '/admin', { timeout: 15000 }).catch(() => {})
  ok('바깥 주소로는 안 감', new URL(m.url()).origin === new URL(D).origin && new URL(m.url()).pathname === '/admin', m.url())

  // ── 4. 내가 맡지 않은 회사의 공고: 예전처럼 없는 화면 (회사 이름도 안 보임)
  const n = await pg(N, C1)
  await n.goto(`${D}/admin/jobs/${J2}?tab=apps`)
  await n.getByText('찾는 화면이 없어요').waitFor({ timeout: 15000 }).catch(() => {})
  const nBody = one(await n.locator('body').innerText())
  ok('맡지 않은 회사 공고: 없는 화면 · 회사 이름 안 보임', nBody.includes('찾는 화면이 없어요') && !nBody.includes('두번째기획') && (await card(n).count()) === 0, nBody.slice(0, 80))
  await n.goto(`${D}/admin/chat/room/${J2}`)
  await n.getByText('찾는 화면이 없어요').waitFor({ timeout: 15000 }).catch(() => {})
  ok('맡지 않은 회사 단체방도 없는 화면', (await n.getByText('찾는 화면이 없어요').count()) === 1 && (await card(n).count()) === 0)
  // 우리 회사 공고는 그대로 열림
  await n.goto(`${D}/admin/jobs/${J}`)
  await n.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('우리 회사 공고는 그대로', (await n.locator('[data-job-tabs]').count()) === 1 && (await card(n).count()) === 0)

  // ── 5. 단체방 입력 칸: 쓰기 시작하면 넓어짐
  await rest(`job_chat?job_id=eq.${J}`, 'DELETE')
  const w = await pg(W)
  await w.goto(`${D}/me/chat/room/${J}`)
  const box = w.locator('textarea[name=body]')
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForLoadState('networkidle').catch(() => {})
  const sticker = w.locator('[data-sticker-toggle]'), at = w.locator('[data-mention-toggle]'), more = w.locator('[data-tools-toggle]')
  const width = () => box.evaluate((el) => Math.round(el.getBoundingClientRect().width))
  const w0 = await width()
  ok('비어 있을 땐 이모티콘·@ 버튼 그대로', (await sticker.count()) === 1 && (await at.count()) === 1 && (await more.count()) === 0)
  await box.pressSequentially('안녕하세요')
  await more.waitFor({ timeout: 5000 }).catch(() => {})
  const w1 = await width()
  ok("쓰기 시작하면 두 버튼이 '›' 하나로 접히고 입력 칸이 넓어짐 (+60px 이상)", (await more.count()) === 1 && (await sticker.count()) === 0 && (await at.count()) === 0 && w1 - w0 >= 60, `${w0}px → ${w1}px`)
  ok('쓰던 글·커서는 그대로 (자판 안 닫힘)', (await box.inputValue()) === '안녕하세요' && (await box.evaluate((el) => document.activeElement === el)))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/composer-wide.png`, clip: { x: 0, y: 440, width: 360, height: 300 } }).catch(() => {})
  await more.click()
  await sticker.waitFor({ timeout: 5000 }).catch(() => {})
  ok("'›'를 누르면 다시 펼쳐짐 (글 그대로 · 커서 그대로)", (await sticker.count()) === 1 && (await at.count()) === 1 && (await more.count()) === 0 && (await box.inputValue()) === '안녕하세요' && (await box.evaluate((el) => document.activeElement === el)) && (await width()) === w0, `${await width()}px`)
  await box.fill('')
  await box.pressSequentially('가')
  await more.waitFor({ timeout: 5000 }).catch(() => {})
  ok('다 지우고 다시 쓰면 또 접힘', (await more.count()) === 1 && (await sticker.count()) === 0)
  // 접힌 채로도 '@'를 치면 부를 사람 줄
  await box.fill('')
  await box.pressSequentially('내일 봬요 @')
  await w.locator('[data-mention-list]').waitFor({ timeout: 5000 }).catch(() => {})
  ok("접힌 채로 '@'를 쳐도 부를 사람 줄이 뜸", (await more.count()) === 1 && (await w.locator('[data-mention-list]').count()) === 1)
  await box.press('Escape')
  await box.fill('내일 봬요')
  await box.press('Enter')
  await w.getByText('내일 봬요').first().waitFor({ timeout: 15000 }).catch(() => {})
  await sticker.waitFor({ timeout: 10000 }).catch(() => {})
  ok('보내면 처음대로 (버튼 두 개 · 입력 칸 비움)', (await sticker.count()) === 1 && (await at.count()) === 1 && (await more.count()) === 0 && (await box.inputValue()) === '' && (await rest(`job_chat?job_id=eq.${J}`)).some((x) => x.body === '내일 봬요'))
  ok('360px 옆으로 안 밀림 (단체방)', await noSide(w))
  // 1:1 문의(버튼 하나)는 그대로
  await w.goto(`${D}/me/chat?job=${J}`)
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForLoadState('networkidle').catch(() => {})
  await box.pressSequentially('문의드려요')
  await w.waitForTimeout(300)
  ok('1:1 문의는 그대로 (접지 않음)', (await sticker.count()) === 1 && (await more.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
