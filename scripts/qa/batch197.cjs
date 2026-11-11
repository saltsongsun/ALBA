// 묶음 197 (정기 개선 2026-11-11 13:35 KST)
// · 여러 회사를 맡은 관리자: 다른 회사의 '오늘 행사 n'·'내일 행사 n'도 알려 줌 (지금까진 새 문의·확정 대기만)
//   - 관리자 홈 안내 칩 '회사명 오늘 행사 1' (오늘 것이 없으면 '내일 행사 1') → 누르면 그 회사로
//   - 문의·대기가 없고 행사만 있으면 제목은 '다른 회사 행사' · 회사 고르기의 빨간 점은 안 켬 (목록에는 '· 오늘 행사 1')
//   - 끝난·취소한·임시 저장 공고는 안 셈 · 내가 맡지 않은 회사는 안 보임
// · 전문가·외주 화면(홈 · 견적·대금): 화면을 옮길 때 그 화면 모양의 회색 자리
// node scripts/qa/batch197.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000019702', C3 = '99999999-0000-4000-8000-000000019703'
const M = 'aaaaaaaa-0000-4000-8000-000000019701' // 첫 회사와 두번째기획만 맡은 관리자 (세번째상사는 안 맡음)
const JT = 'cccccccc-0000-4000-8000-000000019701', JM = 'cccccccc-0000-4000-8000-000000019702', JX = 'cccccccc-0000-4000-8000-000000019703'
const JD = 'cccccccc-0000-4000-8000-000000019704', JO = 'cccccccc-0000-4000-8000-000000019705', J3 = 'cccccccc-0000-4000-8000-000000019706'
const P = 'bbbbbbbb-0000-4000-8000-000000019702'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), nowIso = new Date().toISOString()
  const today = kstDay(now), tmr = kstDay(now + 864e5), yest = kstDay(now - 864e5)
  // 준비: 두번째기획(내가 맡음) · 세번째상사(안 맡음) · 관리자 M은 첫 회사와 두번째기획만
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const [a0] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '세번째상사', seal_image: null, created_at: nowIso })
  await rest('users', 'POST', { ...a0, id: M, name: '두회사관리자', phone: '01019700001', is_super: false })
  for (const company_id of [C1, C2]) await rest('company_members', 'POST', { company_id, user_id: M, role: 'admin', created_at: nowIso })
  const job = (id, company_id, title, patch) => rest('jobs', 'POST', { ...j, id, company_id, title, status: 'open', applications: [], ...patch })
  // 두번째기획: 내일 시작 1 + (세지 않는 것) 어제 끝남 · 내일이지만 취소 · 오늘이지만 임시 저장
  await job(JM, C2, '내일 행사', { start_date: tmr, end_date: tmr })
  await job(JO, C2, '어제 끝난 행사', { start_date: yest, end_date: yest })
  await job(JX, C2, '취소한 행사', { start_date: tmr, end_date: tmr, status: 'cancelled' })
  await job(JD, C2, '임시 저장', { start_date: today, end_date: today, status: 'draft' })
  // 세번째상사(내가 안 맡음): 오늘 행사
  await job(J3, C3, '남의 회사 행사', { start_date: today, end_date: today })
  // 첫 회사 공고는 모레로 (첫 회사 쪽 숫자가 섞이지 않게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kstDay(now + 2 * 864e5), end_date: kstDay(now + 2 * 864e5) })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, path) => { await p.goto(D + path); await p.waitForLoadState('networkidle').catch(() => {}) }

  // ── 1. 내일 행사만 있는 다른 회사
  const m = await pg(M)
  const card = m.locator('[data-other-companies]')
  const text = () => card.innerText().then(one, () => '')
  const opt = (c) => m.locator(`header select[name=company] option[value="${c}"]`).innerText().then(one, () => '')
  await open(m, '/admin')
  ok("문의·대기 없이 행사만: '다른 회사 행사 · 두번째기획 내일 행사 1' (끝난·취소·임시 저장은 안 셈)", (await text()) === '다른 회사 행사 두번째기획 내일 행사 1', await text())
  ok('새로 온 일이 아니라 회사 고르기의 빨간 점은 안 켬', (await m.locator('header [data-other-unread]').count()) === 0)
  ok("회사 고르기 목록: '두번째기획 · 내일 행사 1'", (await opt(C2)) === '두번째기획 · 내일 행사 1', await opt(C2))
  ok('내가 맡지 않은 회사(세번째상사)는 안내·목록 어디에도 없음', !(await text()).includes('세번째상사') && (await m.locator(`header select[name=company] option[value="${C3}"]`).count()) === 0)
  ok('한 줄 · 360px 옆으로 안 밀림', (await card.locator('button').first().evaluate((el) => el.getBoundingClientRect().height < 40).catch(() => false)) && (await noSide(m)))

  // ── 2. 오늘 진행하는 행사가 생기면 '오늘 행사'가 먼저 (내일 것은 줄임)
  await job(JT, C2, '오늘 행사', { start_date: today, end_date: today })
  await open(m, '/admin')
  ok("오늘 행사가 있으면 '두번째기획 오늘 행사 1' (내일 것은 그 회사에 가서 봄)", (await text()) === '다른 회사 행사 두번째기획 오늘 행사 1' && (await card.locator('[data-other-tomorrow]').count()) === 0, await text())
  ok("회사 고르기 목록: '두번째기획 · 오늘 행사 1'", (await opt(C2)) === '두번째기획 · 오늘 행사 1', await opt(C2))
  if (SHOTS) { await m.waitForTimeout(400); await m.screenshot({ path: `${SHOTS}/1-other-today.png` }) }

  // ── 3. 새 문의도 오면: 제목이 '다른 회사에 새 문의' · 점 켜짐 · 칩에 함께
  await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, job_id: null, company_id: C2, body: '오늘 주차 되나요?', read_at: null, created_at: nowIso })
  await open(m, '/admin')
  ok("문의도 있으면 '다른 회사에 새 문의 · 두번째기획 문의 1 오늘 행사 1' + 빨간 점", (await text()) === '다른 회사에 새 문의 두번째기획 문의 1 오늘 행사 1' && (await m.locator('header [data-other-unread]').count()) === 1, await text())
  ok('함께여도 한 줄 · 360px 옆으로 안 밀림', (await card.locator('button').first().evaluate((el) => el.getBoundingClientRect().height < 40).catch(() => false)) && (await noSide(m)))
  if (SHOTS) { await m.waitForTimeout(400); await m.screenshot({ path: `${SHOTS}/2-other-inquiry-today.png` }) }

  // ── 4. 누르면 그 회사로 → 그 회사 홈에 오늘 행사가 보임
  await card.getByRole('button', { name: /두번째기획/ }).click()
  await m.waitForFunction((c2) => document.querySelector('header select[name=company]')?.value === c2, C2, { timeout: 15000 }).catch(() => {})
  await m.waitForLoadState('networkidle').catch(() => {})
  ok('누르면 그 회사 홈으로 (오늘 행사가 보임)', (await m.locator('header select[name=company]').inputValue()) === C2 && (await m.locator('main').innerText()).includes('오늘 행사'))
  ok('그 회사에서 보면 원래 회사는 행사가 모레라 안내에 없음', !(await m.locator('[data-other-companies]').innerText().catch(() => '')).includes('행사'))

  // ── 5. 회사를 하나만 맡으면 안내 없음
  await rest(`company_members?user_id=eq.${M}&company_id=eq.${C2}`, 'DELETE')
  await open(m, '/admin')
  ok('회사를 하나만 맡으면 다른 회사 안내 없음', (await m.locator('[data-other-companies]').count()) === 0)

  // ── 6. 전문가·외주 화면: 옮길 때 그 화면 모양의 회색 자리
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '소리나라', phone: '01019700002', member_type: 'vendor', created_at: nowIso })
  const p = await pg(P)
  await open(p, '/pro')
  const watch = () => p.evaluate(() => { window.__skel = []; new MutationObserver(() => { document.querySelectorAll('[data-skeleton]').forEach((s) => window.__skel.push(s.getAttribute('data-skeleton'))) }).observe(document.body, { childList: true, subtree: true }) })
  await watch()
  await p.locator('a[href="/pro/money"]').last().click()
  await p.getByRole('heading', { name: '견적 · 대금' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok("견적·대금으로 갈 때: 그 화면 모양 회색 자리", (await p.evaluate(() => window.__skel)).includes('pro-money'), JSON.stringify(await p.evaluate(() => [...new Set(window.__skel)])))
  // (방금 본 화면으로 돌아갈 때는 저장해 둔 화면이 바로 떠서 회색 자리가 없음 → 홈은 견적·대금에서 처음 갈 때로 확인)
  const p2 = await pg(P)
  await open(p2, '/pro/money')
  await p2.evaluate(() => { window.__skel = []; new MutationObserver(() => { document.querySelectorAll('[data-skeleton]').forEach((s) => window.__skel.push(s.getAttribute('data-skeleton'))) }).observe(document.body, { childList: true, subtree: true }) })
  await p2.locator('nav a[href="/pro"]').last().click()
  await p2.waitForFunction(() => location.pathname === '/pro' && !!document.querySelector('[data-mode="pro"] h1'), null, { timeout: 15000 }).catch(() => {})
  ok('전문가·외주 홈으로 갈 때: 큰 카드 모양 회색 자리', (await p2.evaluate(() => window.__skel)).includes('pro'), JSON.stringify(await p2.evaluate(() => [...new Set(window.__skel)])))
  ok('360px: 옆으로 안 밀림 (전문가·외주 화면)', await noSide(p))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
