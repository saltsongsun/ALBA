// 묶음 62: 관리자 문의 검색
// · 이름 · 전화번호(숫자 3자리 이상) · 주고받은 메시지 내용으로 1:1 대화 찾기 (내용으로 찾으면 그 말을 '찾은 말'로 보여 줌)
// · 단체방은 공고 이름으로 · 결과 수 안내 · 없으면 안내 + 검색 지우기 · '안 읽음' 칩도 검색을 유지
// node scripts/qa/batch62.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000e2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 두 번째 근무자 김출석(010-5656-7878)의 문의 2개 · W(근무자, 010-3333-4444)는 기본 문의
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: W2, name: '김출석', phone: '01056567878', attendance: [], ratings: [] })
  const user = { id: W2, name: '김출석', phone: '01056567878', photo_at: null }
  const t = (min) => new Date(Date.now() - min * 60e3).toISOString()
  await rest('messages', 'POST', { thread_user_id: W2, sender_id: W2, from_admin: false, company_id: CO, job_id: null, body: '우비 챙겨 가야 하나요?', read_at: null, created_at: t(40), user })
  await rest('messages', 'POST', { thread_user_id: W2, sender_id: W2, from_admin: false, company_id: CO, job_id: null, body: '그리고 주차는 어디에 하나요?', read_at: t(1), created_at: t(30), user })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const ad = await ctx.newPage()
  ad.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const threads = () => ad.locator('a[href^="/admin/chat/"]:not([href^="/admin/chat/room"]):not([href$="/export"])')
  const search = async (q) => {
    await ad.goto(`${D}/admin/chat`)
    await ad.locator('[data-chat-search] input[name=q]').fill(q)
    await ad.locator('[data-chat-search] input[name=q]').press('Enter')
    await ad.waitForURL(/q=/, { timeout: 10000 }).catch(() => {})
    await ad.locator('[data-chat-search-result]').waitFor({ timeout: 10000 }).catch(() => {})
  }

  await ad.goto(`${D}/admin/chat`)
  ok('검색 칸이 있음', (await ad.locator('[data-chat-search] input[name=q]').count()) === 1)
  const total = await threads().count()
  ok('처음엔 모든 대화 (2명)', total === 2, String(total))

  // ── 1. 이름으로 ──
  await search('김출석')
  ok('이름: 김출석 대화 1개', (await threads().count()) === 1 && (await threads().first().getAttribute('href')) === `/admin/chat/${W2}`)
  ok("결과 안내: '대화 1개'", (await ad.locator('[data-chat-search-result]').innerText()).includes('대화 1개'))
  ok('이름으로 찾으면 단체방은 안 보임 (이름 안 맞음)', (await ad.locator('section[aria-label="단체방"]').count()) === 0)

  // ── 2. 메시지 내용으로 ──
  await search('우비')
  const snip = await ad.locator('[data-chat-snippet]').first().innerText()
  ok("내용: '우비'가 들어간 대화 + 그 말을 '찾은 말'로", (await threads().count()) === 1 && snip.includes('찾은 말') && snip.includes('우비 챙겨 가야 하나요?'), snip)

  // ── 3. 전화번호로 ──
  await search('3333-4444')
  ok('번호: 근무자(010-3333-4444) 대화', (await threads().count()) === 1 && (await threads().first().getAttribute('href')) === `/admin/chat/${W}`)

  // ── 4. 단체방 이름으로 ──
  await search('생활체육')
  ok('단체방 이름으로 찾기', (await ad.locator(`section[aria-label="단체방"] a[href="/admin/chat/room/${J}"]`).count()) === 1)

  // ── 5. 없으면 안내 + 지우기 ──
  await search('없는말쿵')
  ok('없으면 안내', (await ad.getByText('‘없는말쿵’에 맞는 대화가 없어요').count()) === 1)
  await ad.getByRole('link', { name: '검색 지우기' }).click()
  await ad.waitForURL((u) => !u.search.includes('q='), { timeout: 10000 }).catch(() => {})
  ok('검색 지우기 → 다시 모든 대화', (await threads().count()) === total)

  // ── 6. '안 읽음' 칩도 검색을 유지 ──
  await search('김출석')
  const unreadHref = await ad.getByRole('link', { name: /안 읽음/ }).getAttribute('href')
  ok("'안 읽음' 칩이 검색어를 유지", unreadHref.includes('unread=1') && decodeURIComponent(unreadHref).includes('q=김출석'), unreadHref)
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
