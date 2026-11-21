// 묶음 345 (정기 개선 2026-11-22 04:35 KST)
// · 서류 메뉴(서명 받은 서류): 서명한 뒤에 그 공고의 '🔔 일정 변경' 알림을 받은 근무자의 서류 줄에 '일정 바뀜 ›'
//   → 누르면 그 공고 서류 탭 '서명한 뒤 일정이 바뀐 서류' 칸으로 가서 번쩍. 공고 묶음 요약에도 '· 일정 바뀜 n'
//   늦게 서명한 서류 · 다른 회사 공고(우리 목록에 안 보임)는 해당 없음
// · 공고 묶음을 펼치면 서류 줄이 0.2초 내려오며 나타남 (움직임 줄이기면 바로)
// node scripts/qa/batch345.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003'
const P = 'bbbbbbbb-0000-4000-8000-0000003450b1', Q = 'bbbbbbbb-0000-4000-8000-0000003450b2', R = 'bbbbbbbb-0000-4000-8000-0000003450b3'
const OTHER = '99999999-0000-4000-8000-0000003450c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()

;(async () => {
  const [job] = await rest(`jobs?id=eq.${J}`)
  const CO = job.company_id
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  for (const [id, name, phone] of [[P, '사오일', '01034503451'], [Q, '사오이', '01034503452'], [R, '사오삼', '01034503453']]) {
    await rest('users', 'POST', { ...kb, id, name, phone, nickname: null, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  }
  const { applications: _a, attendance: _t, ...jl } = job
  const [doc0] = await rest(`signed_docs?status=eq.signed&user_id=eq.${W}`)
  for (const [uid, name, signedH] of [[P, '사오일', 1], [Q, '사오이', 72], [R, '사오삼', 72]]) {
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: uid, status: 'approved', available_dates: null, position: null, message: null, contract_received_at: null, created_at: ago(200), job: jl, user: { id: uid, name, phone: '01034503451' } })
    await rest('signed_docs', 'POST', { ...doc0, id: crypto.randomUUID(), user_id: uid, signed_at: ago(signedH), created_at: ago(signedH + 1), worker: { name, phone: '01034503451', birth_date: '1990-01-01', address: '서울' } })
  }
  // 다른 회사의 다른 공고 (Q가 거기서 받은 변경 알림은 이 공고와 상관없음 — DB에서 알림의 회사는 공고를 따라감)
  const JO = 'cccccccc-0000-4000-8000-0000003450a9'
  await rest('jobs', 'POST', { ...jl, id: JO, company_id: OTHER, title: '다른 회사 행사', applications: [], attendance: [], created_at: new Date().toISOString() })
  const change = (id, uid, co, h, jobId = J) => rest('messages', 'POST', { id, thread_user_id: uid, sender_id: A, from_admin: true, company_id: co, job_id: jobId, body: `🔔 일정 변경\n${job.title}의 내용이 바뀌었어요.\n시간: 09:00~18:00 → 10:00~19:00\n장소: 광장 → 실내 체육관\n못 오게 되면 앱에서 담당자에게 알려 주세요.`, read_at: null, created_at: ago(h), job: { id: J, title: job.title }, sender: { name: '관리자' }, user: { id: uid, name: 'x', phone: '0' } })
  // R: 72시간 전 서명 → 2시간 전 변경 알림 = 바뀜 / P: 1시간 전 서명 ← 2시간 전 변경 = 아님 / Q: 72시간 전 서명, 변경 알림은 다른 회사 공고 것 = 아님
  // (기본 근무자 W는 같은 서류 칸에 서명 대기가 함께 있어 표에서 대기가 보이므로 쓰지 않음 · 변경 알림 없음 = 해당 없음)
  await change(3450001, R, CO, 2)
  await change(3450002, P, CO, 2)
  await change(3450003, Q, OTHER, 2, JO)


  // 다른 회사 공고(JO)에도 서명한 서류 + 그 뒤 변경 알림 (우리 서류 메뉴에는 안 보여야 함)
  await rest('signed_docs', 'POST', { ...doc0, id: crypto.randomUUID(), job_id: JO, user_id: Q, signed_at: ago(72), created_at: ago(73), worker: { name: '사오이', phone: '0', birth_date: '1990-01-01', address: '서울' } })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(400) }
  const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 서류 메뉴: 공고 묶음 요약 + 줄 표시
  const a = await mk(A)
  await go(a, '/admin/docs')
  const group = a.locator(`[data-docs-job="${J}"]`)
  await group.waitFor({ timeout: 10000 }).catch(() => {})
  ok("공고 묶음 요약: '· 일정 바뀜 1'", (await group.locator('[data-docs-job-stale]').getAttribute('data-docs-job-stale').catch(() => '')) === '1' && one(await group.locator('summary').innerText()).includes('일정 바뀜 1'), one(await group.locator('summary').innerText().catch(() => '')))
  const marks = a.locator('[data-doc-row-stale]')
  const markRow = one(await marks.first().evaluate((e) => e.closest('li')?.innerText ?? '').catch(() => ''))
  ok("'일정 바뀜 ›' 줄: 1개 · 사오삼 (늦게 서명한 사오일 · 알림 없는 근무자는 없음)", (await marks.count()) === 1 && markRow.startsWith('사오삼'), markRow.slice(0, 60))
  ok('다른 회사 공고의 서류는 우리 목록에 없음', (await a.locator(`[data-docs-job="cccccccc-0000-4000-8000-0000003450a9"]`).count()) === 0 && !one(await a.locator('main').innerText()).includes('다른 회사 행사'))
  const list = await group.locator('[data-docs-job-list]').evaluate((e) => ({ an: getComputedStyle(e).animationName, d: parseFloat(getComputedStyle(e).animationDuration) })).catch(() => ({}))
  ok('펼친 서류 줄: 0.2초 내려오며 (slide-down)', list.an === 'slide-down' && Math.abs(list.d - 0.2) < 0.01, JSON.stringify(list))
  // '일정 바뀜 1'이 두 줄로 끊기지 않음
  const staleRects = await group.locator('[data-docs-job-stale]').evaluate((e) => [...e.getClientRects()].map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)])).catch(() => [])
  ok("'· 일정 바뀜 1'은 한 줄 (끊기지 않음)", new Set(staleRects.map((r) => r[1])).size === 1, JSON.stringify(staleRects))
  ok('360px 옆으로 밀림 없음 (서류 메뉴)', await noSide(a))
  if (SHOTS) {
    await marks.first().scrollIntoViewIfNeeded()
    await a.waitForTimeout(300)
    await a.screenshot({ path: `${SHOTS}/docs-menu-stale.png` })
  }

  // ── 2. 누르면 그 공고 서류 탭의 '서명한 뒤 일정이 바뀐 서류' 칸으로 · 번쩍
  const href = (await marks.first().getAttribute('href')) ?? ''
  ok("링크: 그 공고 서류 탭 #doc-stale", href === `/admin/jobs/${J}?tab=docs#doc-stale`, href)
  await marks.first().click()
  await a.waitForURL((u) => u.pathname === `/admin/jobs/${J}`, { timeout: 15000 }).catch(() => {})
  await a.locator('#doc-stale').waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForTimeout(300)
  const flashed = await a.locator('#doc-stale').evaluate((e) => e.hasAttribute('data-flash')).catch(() => false)
  const inView = await a.locator('#doc-stale').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }).catch(() => false)
  ok("도착: '서명한 뒤 일정이 바뀐 서류 1건' 칸이 화면에 · 번쩍", flashed && inView && one(await a.locator('#doc-stale').innerText()).includes('서명한 뒤 일정이 바뀐 서류 1건'), JSON.stringify({ flashed, inView }))

  // ── 3. 서명 대기만 보기에서는 표시 없음 (서명 완료 서류만 해당)
  await go(a, '/admin/docs?status=pending')
  ok("'서명 대기'만 볼 때: 일정 바뀜 표시 없음", (await a.locator('[data-doc-row-stale]').count()) === 0)

  // ── 4. 움직임 줄이기: 펼침 바로
  const r = await mk(A, { reducedMotion: 'reduce' })
  await go(r, '/admin/docs')
  const rd = await r.locator(`[data-docs-job="${J}"] [data-docs-job-list]`).evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 1)
  ok('움직임 줄이기: 서류 줄 바로 (거의 0초)', rd < 0.01, String(rd))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
