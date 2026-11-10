// 묶음 192 (정기 개선 2026-11-11 08:35 KST)
// · 관리자 대시보드 '확인할 일': 읽기만 하고 답하지 않은 문의가 있으면 '읽고 아직 답하지 않은 문의 n건' → 문의 목록의 '답장 전'만 모아 보기로
// · 누르는 영역 넓힘 (글자만 누르게 돼 있던 작은 링크 → 40px 이상):
//   내 근무 '곧 시작인데 아직 확정 전이에요' 줄 전체 · '오늘 예정된 근무가 없어요' 한 줄 카드 전체 · 없는 화면 '← 보던 화면으로' · 다른 회사 안내 카드의 '지금 회사 … 목록으로'
// node scripts/qa/batch192.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000192'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const M = 'aaaaaaaa-0000-4000-8000-000000019201', J2 = 'cccccccc-0000-4000-8000-000000000192'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000192${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const kstHm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const tall = (loc) => loc.first().evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 0)

;(async () => {
  const now = Date.now()
  const [w] = await rest(`users?id=eq.${W}`)
  let mid = 192000
  const thread = async (n, name, body, { read = true, ago = 0, admin = false } = {}) => {
    const user = { ...w, id: U(n), name, phone: `0101920000${n}`, photo_at: null, attendance: [], ratings: [] }
    await rest('users', 'POST', user)
    const at = new Date(now - ago * 864e5 - n * 60e3).toISOString()
    await rest('messages', 'POST', { id: ++mid, thread_user_id: U(n), sender_id: admin ? A : U(n), from_admin: admin, job_id: null, company_id: C1, body, read_at: read ? at : null, created_at: at, job: null, sender: { name: admin ? '관리자' : name }, user: { id: U(n), name, phone: user.phone, photo_at: null } })
  }
  await thread(1, '일번', '주차할 수 있나요?') // 읽음 · 답 안 함 → 셈
  await thread(2, '이번', '복장이 궁금해요') // 읽음 · 답 안 함 → 셈
  await thread(3, '삼번', '🕒 지각 알림\n약 10분 늦어요 (도착 예정 09:10)') // 알리기만 → 안 셈
  await thread(4, '사번', '식사가 제공되나요?', { ago: 8 }) // 8일 전 → 안 셈
  await thread(5, '오번', '확인했습니다.', { admin: true }) // 내가 답함 → 안 셈
  await thread(6, '육번', '몇 시까지 가면 되나요?', { read: false }) // 안 읽음 → '새 문의'에서 셈

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, { admin = false, company } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    const cookies = [{ name: 'alba_session', value: cookie(uid), url: D }]
    if (admin) cookies.push({ name: 'alba_roster', value: roster(uid), url: D })
    if (company) cookies.push({ name: 'hw_company', value: company, url: D })
    await ctx.addCookies(cookies)
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 대시보드 '확인할 일'
  const a = await pg(A, { admin: true })
  await a.goto(`${D}/admin`)
  const todo = a.locator('a[href="/admin/chat?noreply=1"]')
  await todo.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'읽고 아직 답하지 않은 문의 2건'", one(await todo.innerText().catch(() => '')).replace(' ›', '') === '읽고 아직 답하지 않은 문의 2건', one(await todo.innerText().catch(() => '')))
  ok("'새 문의'(안 읽음)와는 따로 셈 · 한 줄 · 옆으로 안 밀림", (await a.locator('a[href="/admin/chat"]', { hasText: '새 문의' }).count()) === 1 && (await tall(todo)) <= 56 && (await noSide(a)), String(await tall(todo)))
  if (SHOTS) { await todo.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await a.waitForTimeout(500); await a.screenshot({ path: `${SHOTS}/dashboard-todo.png` }).catch(() => {}) }
  await todo.click()
  await a.waitForURL((u) => u.pathname === '/admin/chat' && u.searchParams.get('noreply') === '1', { timeout: 15000 }).catch(() => {})
  await a.locator('[data-inbox-row]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const shown = await a.locator('[data-inbox-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-inbox-row').slice(-2)).sort())
  ok("누르면 문의 목록의 '답장 전' 2건만", JSON.stringify(shown) === JSON.stringify(['01', '02']) && one(await a.locator('[data-inbox-noreply-chip]').innerText()) === '답장 전 2', JSON.stringify(shown))
  // 답장하면 줄이 사라짐
  for (const n of [1, 2]) {
    await rest(`messages?thread_user_id=eq.${U(n)}`, 'DELETE')
    await rest('messages', 'POST', { id: ++mid, thread_user_id: U(n), sender_id: A, from_admin: true, job_id: null, company_id: C1, body: '확인했습니다.', read_at: null, created_at: new Date().toISOString(), job: null, sender: { name: '관리자' }, user: { id: U(n), name: 'x', phone: '01000000000', photo_at: null } })
  }
  await a.goto(`${D}/admin`)
  await a.locator('a[href="/admin/chat"]', { hasText: '새 문의' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('모두 답장하면 그 줄은 사라짐 (새 문의 줄은 그대로)', (await todo.count()) === 0 && (await a.locator('a[href="/admin/chat"]', { hasText: '새 문의' }).count()) === 1)

  // ── 2. 누르는 영역: 내 근무 (확정을 기다리는 지원자 · 23시간 뒤 시작)
  const at = now + 23 * 3600e3
  const patch = { start_date: kstDay(at), end_date: kstDay(at + 2 * 3600e3), start_time: `${kstHm(at)}:00`, end_time: `${kstHm(at + 2 * 3600e3)}:00`, status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
  const [app0] = await rest(`applications?id=eq.${AP_APP}`)
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { available_dates: null, status: 'applied', job: { ...app0.job, ...patch } })
  const p = await pg(AP)
  await p.goto(`${D}/me`)
  const soon = p.locator('[data-waiting-soon]'), compact = p.locator('[data-today-empty=compact]')
  await soon.waitFor({ timeout: 15000 }).catch(() => {})
  const sBox = await soon.evaluate((el) => ({ tag: el.tagName, h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), href: el.getAttribute('href') }))
  ok("'곧 시작인데 아직 확정 전이에요' 줄 전체가 누르는 곳 (40px 이상 · 카드 너비)", sBox.tag === 'A' && sBox.h >= 40 && sBox.w >= 280 && sBox.href === `/me/chat?job=${J}&ask=confirm`, JSON.stringify(sBox))
  const cBox = await compact.evaluate((el) => ({ tag: el.tagName, h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), href: el.getAttribute('href') }))
  ok("'오늘 예정된 근무가 없어요' 한 줄 카드 전체가 누르는 곳", cBox.tag === 'A' && cBox.h >= 40 && cBox.w === 328 && cBox.href === '/' && one(await compact.innerText()) === '오늘 예정된 근무가 없어요 다른 알바 보기 →', JSON.stringify(cBox))
  // 줄의 왼쪽(글자 없는 쪽)을 눌러도 문의로
  await soon.click({ position: { x: 20, y: sBox.h / 2 } })
  await p.waitForURL((u) => u.pathname === '/me/chat' && u.searchParams.get('ask') === 'confirm', { timeout: 15000 }).catch(() => {})
  ok('줄 왼쪽을 눌러도 문의 화면으로', new URL(p.url()).searchParams.get('ask') === 'confirm', p.url())

  // ── 3. 없는 화면 '← 보던 화면으로'
  await p.goto(`${D}/jobs/cccccccc-0000-4000-8000-000000019299`)
  const back = p.locator('[data-404] [data-back]')
  await back.waitFor({ timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(500) // 카드가 톡 나타나는 움직임(크기가 잠깐 작음)이 끝난 뒤에 잼
  const bh = await tall(back)
  ok("없는 화면 '← 보던 화면으로': 40px 이상", bh >= 40 && one(await back.innerText()) === '← 보던 화면으로' && (await noSide(p)), String(bh))

  // ── 4. 다른 회사 안내 카드의 '지금 회사 공고 목록으로'
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const [adm] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('jobs', 'POST', { ...j, id: J2, company_id: C2, title: '두번째 회사 행사', applications: [] })
  await rest('users', 'POST', { ...adm, id: M, name: '두회사관리자', phone: '01019200001', is_super: false })
  for (const company_id of [C1, C2]) await rest('company_members', 'POST', { company_id, user_id: M, role: 'admin', created_at: nowIso })
  const m = await pg(M, { admin: true, company: C1 })
  await m.goto(`${D}/admin/jobs/${J2}`)
  const card = m.locator('[data-other-company-job]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const lk = card.getByRole('link', { name: '지금 회사 공고 목록으로' })
  await m.waitForTimeout(500)
  const lh = await tall(lk)
  ok("다른 회사 안내 카드 '지금 회사 공고 목록으로': 40px 이상 · 카드 모양은 그대로", lh >= 40 && (await lk.getAttribute('href')) === '/admin/jobs' && (await tall(card.locator('.card'))) <= 330 && (await noSide(m)), `${lh} · 카드 ${await tall(card.locator('.card'))}`)
  if (SHOTS) { await m.waitForTimeout(450); await m.screenshot({ path: `${SHOTS}/other-card.png` }).catch(() => {}) }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
