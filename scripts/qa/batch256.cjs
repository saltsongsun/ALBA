// 묶음 256 (정기 개선 2026-11-15 04:35 KST)
// · 근무자 홈 카드의 담당자 공지 · 일정 변경 칸에 '✓ 확인했어요' — 문의함을 안 열어도 그 글 하나만 읽음으로
//   (홈 카드에서 공지를 다 보고 문의함은 안 여는 사람이 담당자 화면 '읽음 n/m'에서 계속 안 읽음으로 남던 것)
//   누르면 '새' 대신 '✓ 확인함'이 톡 · 버튼은 사라짐 · 다른 글(담당자 일반 답장 등)은 그대로 안 읽음
// · 담당자 공고 화면 '확정자에게 공지' 표가 바로 '모두 읽음'
// node scripts/qa/batch256.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000256d2'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const msg = (id, ago, body) => ({ id, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J2, body, read_at: null, created_at: new Date(Date.now() - ago).toISOString() })

;(async () => {
  // 준비: 우리 회사 내일 공고 J2 · 근무자 확정 · 공지 (안 읽음)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const jb = { ...base, id: J2, title: '내일 박람회 안내', start_date: kst(1), end_date: kst(1), required_docs: [], created_at: new Date().toISOString() }
  await rest('jobs', 'POST', jb)
  await rest('applications', 'POST', { ...wApp, id: '11111111-0000-4000-8000-0000002560a2', job_id: J2, position: null, available_dates: null, job: jb })
  await rest('messages', 'POST', msg(925601, 20 * 60e3, '📢 공지\n내일 집결은 08:30 정문이에요.'))

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, admin) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(admin ? [{ name: 'alba_roster', value: roster(uid), url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)
  const card = w.locator('[id^="work-"]', { has: w.locator(`a[href="/jobs/${J2}"]`) })
  const box = card.locator('[data-job-notice]')
  const ackBtn = box.getByRole('button', { name: '✓ 확인했어요' })

  // ── 1. 안 읽은 공지: '새' + [✓ 확인했어요]
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  ok("안 읽은 공지: '새' + [✓ 확인했어요]", (await box.getAttribute('data-job-notice')) === 'new' && (await box.locator('[data-notice-new]').count()) === 1 && (await ackBtn.count()) === 1)
  ok('버튼은 칸 오른쪽 아래 · 360px 옆으로 안 밀림', await ackBtn.evaluate((el) => { const r = el.getBoundingClientRect(), c = el.closest('[data-job-notice]').getBoundingClientRect(); return c.right - r.right < 20 && r.bottom <= c.bottom }).catch(() => false) && (await noSide(w)))
  if (SHOTS) {
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await w.waitForTimeout(400)
    await card.screenshot({ path: `${SHOTS}/notice-ack-before.png` }).catch(() => {})
  }

  // ── 2. 누르면 그 글만 읽음 · '✓ 확인함' 톡 · 버튼 사라짐
  await ackBtn.click()
  await box.locator('[data-notice-acked]').waitFor({ timeout: 15000 }).catch(() => {})
  const acked = box.locator('[data-notice-acked]')
  ok("'✓ 확인함' (방금 · 톡) · '새' 없음 · 버튼 없음", (await box.getAttribute('data-job-notice')) === 'read' && one(await acked.textContent().catch(() => '')) === '✓ 확인함' && (await acked.getAttribute('data-notice-acked')) === 'just' && ((await acked.getAttribute('class')) ?? '').includes('animate-pop') && (await box.locator('[data-notice-new]').count()) === 0 && (await ackBtn.count()) === 0)
  const ms = await rest(`messages?thread_user_id=eq.${W}`)
  ok('그 공지만 읽음 (담당자의 다른 답장은 그대로 안 읽음)', !!ms.find((m) => m.id === 925601)?.read_at && ms.find((m) => m.id === 2)?.read_at === null, JSON.stringify(ms.filter((m) => m.from_admin).map((m) => [m.id, !!m.read_at])))
  ok('주소는 그대로 /me (문의함으로 안 넘어감)', new URL(w.url()).pathname === '/me')
  if (SHOTS) {
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await w.waitForTimeout(400)
    await card.screenshot({ path: `${SHOTS}/notice-ack-after.png` }).catch(() => {})
  }

  // ── 3. 담당자 공고 화면: '모두 읽음'
  const a = await mk(A, true)
  await a.goto(`${D}/admin/jobs/${J2}?tab=apps`, { waitUntil: 'networkidle' })
  const badge = a.locator('details', { hasText: '확정자에게 공지' }).locator('[data-notice-read-count]')
  await badge.waitFor({ timeout: 15000 }).catch(() => {})
  ok("담당자 '확정자에게 공지' 표: '모두 읽음'", one(await badge.innerText().catch(() => '')) === '모두 읽음', one(await badge.innerText().catch(() => '')))

  // ── 4. 일정 변경 칸도 같은 버튼
  await rest('messages', 'POST', msg(925602, 60e3, '🔔 일정 변경\n내일 박람회 안내의 내용이 바뀌었어요.\n집결: 없음 → 정문 앞 안내 천막'))
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const note = card.locator('[data-change-note]')
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  const noteBtn = note.getByRole('button', { name: '✓ 확인했어요' })
  ok("안 읽은 변경: [✓ 확인했어요]", (await note.getAttribute('data-change-note')) === 'new' && (await noteBtn.count()) === 1)
  await noteBtn.click()
  await note.locator('[data-notice-acked]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 '✓ 확인함' · 그 변경 글 읽음", (await note.getAttribute('data-change-note')) === 'read' && !!(await rest(`messages?thread_user_id=eq.${W}`)).find((m) => m.id === 925602)?.read_at)

  // ── 5. 오래전에 읽은 공지는 조용히 '✓ 확인함' (톡 없음)
  await rest(`messages?id=eq.925601`, 'PATCH', { read_at: new Date(Date.now() - 3600e3).toISOString() })
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  const old = box.locator('[data-notice-acked]')
  ok("한참 전에 읽은 공지: '✓ 확인함' (톡 없음)", one(await old.textContent().catch(() => '')) === '✓ 확인함' && !((await old.getAttribute('class')) ?? '').includes('animate-pop'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
