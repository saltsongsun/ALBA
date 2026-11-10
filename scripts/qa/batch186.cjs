// 묶음 186 (정기 개선 2026-11-11 02:35 KST)
// · 여러 회사를 맡은 관리자의 문의 대화: 그 사람이 내가 맡은 다른 회사로 보낸 새 문의가 있으면 '다른 회사로 온 새 문의 · ○○ n' — 누르면 회사를 바꿔 그 대화를 엶
//   (알림을 눌렀는데 지금 보는 회사가 달라 새 글이 안 보이거나 '없는 화면'이 뜨던 것 · 지금 회사와 관계없는 사람이면 '다른 회사로 온 문의예요' 카드)
//   (내가 맡지 않은 회사의 문의는 예전처럼 없는 화면 · 바꿔서 여는 주소는 그 회사와 주고받은 글이 있는 사람일 때만)
// · 관리자 화면의 없는 주소: 메뉴·회사 고르기는 그대로 두고 '← 뒤로 · 관리자 홈' (예전: 근무자용 '모집 중인 알바 · 내 근무'만 있는 빈 화면)
//   여러 회사를 맡았으면 '다른 회사 자료라면 위에서 회사를 바꿔 보세요' 한 줄
// node scripts/qa/batch186.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000186'
const M = 'aaaaaaaa-0000-4000-8000-000000018601', N = 'aaaaaaaa-0000-4000-8000-000000018602'
const X = 'bbbbbbbb-0000-4000-8000-000000018603' // 두 번째 회사에만 문의한 사람
const NOBODY = 'bbbbbbbb-0000-4000-8000-000000018699', NOJOB = 'cccccccc-0000-4000-8000-000000018699'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  // 준비: 두 번째 회사 · 관리자 M(두 회사 모두) · 관리자 N(첫 회사만) — 둘 다 최고 관리자가 아님
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자', phone: '01018600001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자', phone: '01018600002', is_super: false })
  await rest('users', 'POST', { ...w, id: X, name: '다른회사문의자', phone: '01018600003' })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })
  const msg = (id, user, name, body) => rest('messages', 'POST', { id, thread_user_id: user, sender_id: user, from_admin: false, job_id: null, company_id: C2, body, read_at: null, created_at: nowIso, job: null, sender: { name }, user: { id: user, name, phone: '01000000000' } })
  // 근무자(첫 회사와 대화가 있음)가 두 번째 회사로도 문의 2건 · X는 두 번째 회사에만 1건
  await msg(186001, W, '근무자', '두번째 회사에 여쭤봐요')
  await msg(186002, W, '근무자', '내일 주차 되나요?')
  await msg(186003, X, '다른회사문의자', '지원하고 싶어요')

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: company, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const view = (p, company) => p.context().addCookies([{ name: 'hw_company', value: company, url: D }])
  const banner = (p) => p.locator('[data-thread-other]')
  const card = (p) => p.locator('[data-other-company-job]')

  // ── 1. 첫 회사를 보는 중: 근무자와의 대화에 '다른 회사로 온 새 문의'
  const m = await pg(M, C1)
  await m.goto(`${D}/admin/chat/${W}`)
  await banner(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok("대화 위에 '다른 회사로 온 새 문의 · 두번째기획 2'", one(await banner(m).innerText().catch(() => '')) === '다른 회사로 온 새 문의 두번째기획 2', one(await banner(m).innerText().catch(() => '')))
  ok('지금 회사 대화는 그대로 · 다른 회사 글 내용은 안 보임', (await m.getByText('촉석문 앞 운영본부 천막입니다.').count()) >= 1 && (await m.getByText('내일 주차 되나요?').count()) === 0)
  ok('한 줄 · 360px 옆으로 안 밀림', (await banner(m).evaluate((el) => el.getBoundingClientRect().height <= 56).catch(() => false)) && (await noSide(m)), String(await banner(m).evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => '')))
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/thread-other.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})
  await banner(m).locator('button[type=submit]').click()
  await m.getByText('내일 주차 되나요?').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 회사를 바꾸고 그 대화가 열림', new URL(m.url()).pathname === `/admin/chat/${W}` && (await m.getByText('내일 주차 되나요?').count()) >= 1 && (await m.getByText('두번째 회사에 여쭤봐요').count()) >= 1 && (await m.getByText('촉석문 앞 운영본부 천막입니다.').count()) === 0, m.url())
  ok("'두번째기획 화면으로 바꿨어요' 안내", (await m.getByText('두번째기획 화면으로 바꿨어요').count()) >= 1)
  // 읽고 나면 줄이 사라짐 (양쪽 모두 읽음)
  await m.goto(`${D}/admin/chat/${W}`)
  await m.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('두 회사 글을 다 읽으면 줄 없음', (await banner(m).count()) === 0)
  await view(m, C1)
  await m.goto(`${D}/admin/chat/${W}`)
  await m.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('첫 회사로 돌아와도 줄 없음 (읽은 글은 세지 않음)', (await banner(m).count()) === 0 && (await m.getByText('촉석문 앞 운영본부 천막입니다.').count()) >= 1)

  // ── 2. 지금 회사와 관계없는 사람(두 번째 회사에만 문의): 없는 화면 대신 카드
  await m.goto(`${D}/admin/chat/${X}`)
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok("'다른 회사로 온 문의예요 · 두번째기획 화면에서 열기'", (await card(m).locator('h1').innerText().catch(() => '')) === '다른 회사로 온 문의예요' && one(await card(m).locator('button[type=submit]').innerText().catch(() => '')) === '두번째기획 화면에서 열기' && (await m.getByText('찾는 화면이 없어요').count()) === 0)
  ok("이름·글 내용은 아직 안 보임 · '지금 회사 문의 목록으로'", (await m.getByText('다른회사문의자').count()) === 0 && (await m.getByText('지원하고 싶어요').count()) === 0 && (await card(m).getByRole('link', { name: '지금 회사 문의 목록으로' }).getAttribute('href')) === '/admin/chat')
  if (SHOTS) { await m.waitForTimeout(450); await m.screenshot({ path: `${SHOTS}/thread-card.png` }).catch(() => {}) }
  await card(m).locator('button[type=submit]').click()
  await m.getByText('지원하고 싶어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 그 회사에서 대화가 열림', new URL(m.url()).pathname === `/admin/chat/${X}` && (await m.getByText('지원하고 싶어요').count()) >= 1 && (await m.getByText('다른회사문의자').count()) >= 1, m.url())

  // ── 3. 바꿔서 여는 주소는 그 회사와 주고받은 글이 있는 사람일 때만
  await view(m, C1)
  await m.goto(`${D}/admin/chat/${X}`)
  await card(m).waitFor({ timeout: 15000 }).catch(() => {})
  await card(m).locator('input[name=open]').evaluate((el, v) => { el.value = v }, `/admin/chat/${NOBODY}`)
  await card(m).locator('button[type=submit]').click()
  await m.waitForURL((u) => u.pathname === '/admin', { timeout: 15000 }).catch(() => {})
  ok('그 회사와 글이 없는 사람 주소면 홈으로', new URL(m.url()).pathname === '/admin', m.url())

  // ── 4. 내가 맡지 않은 회사의 문의: 없는 화면 (회사 이름도 안 보임) — 이제 메뉴는 그대로
  const n = await pg(N, C1)
  await n.goto(`${D}/admin/chat/${X}`)
  const nf = (p) => p.locator('[data-admin-404]')
  await nf(n).waitFor({ timeout: 15000 }).catch(() => {})
  const nBody = one(await n.locator('body').innerText())
  ok('맡지 않은 회사 문의: 없는 화면 · 회사 이름·글 안 보임', nBody.includes('찾는 화면이 없어요') && !nBody.includes('두번째기획') && !nBody.includes('지원하고 싶어요') && (await card(n).count()) === 0, nBody.slice(0, 90))
  await n.goto(`${D}/admin/chat/${W}`)
  await n.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('한 회사만 맡은 관리자: 다른 회사 문의 줄 없음', (await banner(n).count()) === 0 && (await n.getByText('촉석문 앞 운영본부 천막입니다.').count()) >= 1)

  // ── 5. 관리자 화면의 없는 주소: 메뉴는 그대로 + 뒤로 · 관리자 홈
  await n.goto(`${D}/admin/jobs`)
  await n.locator('[data-admin-tabbar]').waitFor({ timeout: 15000 }).catch(() => {})
  await n.goto(`${D}/admin/jobs/${NOJOB}`)
  await nf(n).waitFor({ timeout: 15000 }).catch(() => {})
  ok('없는 공고: 머리글·아래 메뉴는 그대로', (await nf(n).count()) === 1 && (await n.locator('[data-app-header]').count()) === 1 && (await n.locator('[data-admin-tabbar]').count()) === 1)
  ok("안내 + '← 뒤로' · '관리자 홈' (근무자용 버튼 없음)", one(await nf(n).innerText()).startsWith('찾는 화면이 없어요 지워졌거나 주소가 바뀌었을 수 있어요.') && (await nf(n).getByRole('link', { name: '관리자 홈' }).getAttribute('href')) === '/admin' && (await nf(n).locator('[data-back]').count()) === 1 && (await n.getByRole('link', { name: '모집 중인 알바' }).count()) === 0, one(await nf(n).innerText()))
  ok('한 회사만 맡았으면 회사 바꾸기 안내 없음', (await n.locator('[data-admin-404-hint]').count()) === 0)
  ok('360px 옆으로 안 밀림 (없는 화면)', await noSide(n))
  if (SHOTS) { await n.waitForTimeout(450); await n.screenshot({ path: `${SHOTS}/admin-404.png` }).catch(() => {}) }
  await nf(n).locator('[data-back]').click()
  await n.waitForURL((u) => u.pathname === '/admin/jobs', { timeout: 15000 }).catch(() => {})
  ok("'← 뒤로'는 보던 화면으로", new URL(n.url()).pathname === '/admin/jobs', n.url())
  // 여러 회사를 맡은 관리자에겐 한 줄 더
  await m.goto(`${D}/admin/jobs/${NOJOB}`)
  await nf(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok("여러 회사: '다른 회사 자료라면 위에서 회사를 바꿔 보세요.'", one(await m.locator('[data-admin-404-hint]').innerText().catch(() => '')) === '다른 회사 자료라면 위에서 회사를 바꿔 보세요.' && (await m.locator('[data-app-header] select').count()) === 1)
  if (SHOTS) { await m.waitForTimeout(450); await m.screenshot({ path: `${SHOTS}/admin-404-multi.png` }).catch(() => {}) }
  // 근무자 쪽 없는 화면은 예전 그대로
  const wk = await pg(W, C1)
  await wk.goto(`${D}/jobs/${NOJOB}`)
  await wk.getByText('찾는 화면이 없어요').waitFor({ timeout: 15000 }).catch(() => {})
  ok('근무자 쪽 없는 화면은 그대로 (모집 중인 알바 · 내 근무)', (await wk.getByRole('link', { name: '모집 중인 알바' }).count()) === 1 && (await wk.locator('[data-admin-404]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
