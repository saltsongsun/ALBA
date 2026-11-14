// 묶음 255 (정기 개선 2026-11-15 02:35 KST)
// · 근무자 홈 예정 근무 카드: 담당자가 공고를 고쳐 '🔔 일정 변경'이 오면 무엇이 어떻게 바뀌었는지 바로
//   ('시간 09:00~18:00 → 10:00~18:00' · '집결 없음 → 정문 앞 안내 천막' — 예전 값은 줄 긋고 새 값은 굵게)
//   (예전: '🔔 …에 일정이 바뀌었어요 · 공고에서 확인'만 있어 공고에 들어가 찾아야 했음)
// · 근무시간 변경 요청 알림('근무시간이 A → B으로')도 같은 모양 · 알 수 없는 모양이면 '공고에서 확인해 주세요'
// · 안 읽은 변경엔 '새' (톡) · 누르면 그 회사 문의함 (읽으면 사라짐) · 목록 카드에선 카드 전체 너비 (좁은 왼쪽 칸에서 두 줄로 꺾이지 않게)
// node scripts/qa/batch255.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000255d2'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 준비: 우리 회사 내일 공고 J2 (집결 없음) · 근무자 확정
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const jb = { ...base, id: J2, title: '내일 박람회 안내', start_date: kst(1), end_date: kst(1), meeting_point: null, required_docs: [], created_at: new Date().toISOString() }
  await rest('jobs', 'POST', jb)
  await rest('applications', 'POST', { ...wApp, id: '11111111-0000-4000-8000-0000002550a2', job_id: J2, position: null, available_dates: null, job: jb })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, admin) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 관리자가 공고를 고침: 시작 09:00 → 10:00 · 집결 없음 → 정문 앞 안내 천막 (알림 켜짐)
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/${J2}/edit`, { waitUntil: 'networkidle' })
  await a.locator('input[name=start_time]').evaluate((el) => (el.value = '10:00'))
  await a.locator('input[name=meeting_point]').evaluate((el) => (el.value = '정문 앞 안내 천막'))
  await a.getByRole('button', { name: '공고 저장' }).click()
  await a.getByText(/바뀐 내용을 알렸어요/).first().waitFor({ timeout: 15000 }).catch(() => {})
  const msg = (await rest(`messages?thread_user_id=eq.${W}`)).find((m) => m.job_id === J2 && m.body.startsWith('🔔 일정 변경'))
  ok('근무자에게 🔔 일정 변경 (시간 · 집결 줄)', !!msg && msg.body.includes('시간: 09:00~18:00 → 10:00~18:00') && msg.body.includes('집결: 없음 → 정문 앞 안내 천막'), msg?.body.split('\n').slice(1, 4).join(' / '))

  // ── 2. 근무자 홈 예정 카드: 바뀐 것이 바로
  const w = await mk(W)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const card = w.locator('[id^="work-"]', { has: w.locator(`a[href="/jobs/${J2}"]`) })
  const note = card.locator('[data-change-note]')
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  const rows = (await note.locator('[data-change-row]').allTextContents()).map(one)
  ok("바뀐 것 두 줄: '시간 09:00~18:00 → 10:00~18:00' · '집결 없음 → 정문 앞 안내 천막'", JSON.stringify(rows) === JSON.stringify(['시간 09:00~18:00 → 10:00~18:00', '집결 없음 → 정문 앞 안내 천막']), JSON.stringify(rows))
  ok('예전 값은 줄 긋고 (s) 새 값은 굵게 (b)', one(await note.locator('[data-change-row] s').first().textContent().catch(() => '')) === '09:00~18:00' && one(await note.locator('[data-change-row] b').first().textContent().catch(() => '')) === '10:00~18:00')
  ok("'공고에서 확인'만 쓰던 줄 없음", !one(await note.locator('a').first().textContent()).includes('공고에서 확인'))
  ok("안 읽음: '새' (톡)", (await note.getAttribute('data-change-note')) === 'new' && ((await note.locator('[data-notice-new]').getAttribute('class').catch(() => '')) ?? '').includes('animate-pop'))
  const hs = await note.evaluate((el) => [...el.querySelector('a').children].map((c) => Math.round(c.getBoundingClientRect().height)))
  ok('줄마다 한 줄 (360px)', hs.every((h) => h < 24), JSON.stringify(hs))
  ok('360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) {
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await w.waitForTimeout(400)
    await card.screenshot({ path: `${SHOTS}/upcoming-change.png` }).catch(() => {})
  }

  // ── 3. 누르면 그 회사 문의함 → 읽으면 '새' 없음
  ok('변경 칸을 누르면 그 회사 문의함으로 (?co=)', (await note.locator('a').first().getAttribute('href')) === `/me/chat?co=${C1}`, await note.locator('a').first().getAttribute('href'))
  await note.locator('a').first().click()
  await w.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {})
  await w.locator('[data-chat-intro]').waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForLoadState('networkidle')
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  ok("읽은 뒤: '새' 없음", (await note.getAttribute('data-change-note')) === 'read' && (await note.locator('[data-notice-new]').count()) === 0)

  // ── 4. 근무시간 변경 요청 알림 모양도 같은 줄로
  await rest('messages', 'POST', { id: 925501, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J2, body: `🔔 일정 변경\n내일 박람회 안내 · 전체 일정 근무시간이 10:00~18:00 → 11:00~19:00으로 바뀌었어요.\n계속 근무하실 수 있는지 앱 '내 근무'에서 알려 주세요.`, read_at: null, created_at: new Date().toISOString() })
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  const rows2 = (await note.locator('[data-change-row]').allTextContents()).map(one)
  ok("근무시간 변경 요청: '시간 10:00~18:00 → 11:00~19:00'", JSON.stringify(rows2) === JSON.stringify(['시간 10:00~18:00 → 11:00~19:00']), JSON.stringify(rows2))

  // ── 5. 알 수 없는 모양이면 '공고에서 확인해 주세요'
  await rest('messages', 'POST', { id: 925502, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J2, body: '🔔 일정 변경\n자세한 건 공고를 봐 주세요.', read_at: null, created_at: new Date(Date.now() + 1000).toISOString() })
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  ok("모양을 모르면 '공고에서 확인해 주세요'", (await note.locator('[data-change-row]').count()) === 0 && one(await note.locator('a').first().textContent()).endsWith('공고에서 확인해 주세요'), one(await note.locator('a').first().textContent()))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
