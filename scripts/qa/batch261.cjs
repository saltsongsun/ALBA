// 묶음 261 (정기 개선 2026-11-15 11:35 KST)
// · 관리자 대시보드 '확인할 일': 오늘·내일 근무가 있는 공고에서 마지막 공지를 아직 안 읽은 확정자 '공지 안 읽음 · 공고 n명'
//   누르면 공고 화면의 '확정자에게 공지' 칸이 펼쳐진 채로 (안 읽은 사람 전화 · 문자 바로) · 다 읽으면 사라짐 · 며칠 뒤 공고는 안 셈
// · 그렇게 바로 왔을 때 공지 칸 테두리가 짧게 한 번 반짝 (0.3초 · 움직임 줄이기면 없음)
// node scripts/qa/batch261.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000261d2'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const notice = (id, job, text) => ({ id, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: job, body: `📢 공지\n${text}`, read_at: null, created_at: new Date().toISOString() })

;(async () => {
  // 오늘 공고 J에 공지 (근무자 안 읽음) · 사흘 뒤 공고 J2에도 공지 (안 읽음 — 확인할 일엔 안 나옴)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const jb = { ...base, id: J2, title: '사흘 뒤 박람회', start_date: kst(3), end_date: kst(3), created_at: new Date().toISOString() }
  await rest('jobs', 'POST', jb)
  await rest('applications', 'POST', { ...wApp, id: '11111111-0000-4000-8000-0000002610a2', job_id: J2, position: null, available_dates: null, job: jb })
  await rest('messages', 'POST', notice(926101, J, '점심은 12시 운영본부에서 받아요.'))
  await rest('messages', 'POST', notice(926102, J2, '사흘 뒤 집결 안내'))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 대시보드 확인할 일
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const todo = a.locator(`[data-todo="notice-${J}"]`)
  await todo.waitFor({ timeout: 15000 }).catch(() => {})
  const tt = one(await todo.innerText().catch(() => ''))
  ok("'공지 안 읽음 · 경상남도 … 1명'", tt.startsWith('공지 안 읽음 · 경상남도 생활체육대축전 행사장 안내 스태프') && /1\s*명/.test(tt), tt)
  ok('사흘 뒤 공고의 공지는 안 셈', (await a.locator(`[data-todo="notice-${J2}"]`).count()) === 0)
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await todo.evaluate((el) => el.closest('section, .card')?.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(400)
    const box = await todo.evaluate((el) => { const c = el.closest('section, .card') ?? el; const r = c.getBoundingClientRect(); return { y: r.y, h: r.height } })
    await a.screenshot({ path: `${SHOTS}/dashboard-notice-todo.png`, clip: { x: 0, y: Math.max(0, box.y - 8), width: 360, height: Math.min(300, box.h + 16) } }).catch(() => {})
  }

  // ── 2. 누르면 공지 칸이 펼쳐진 채로
  await todo.locator('a').first().click()
  await a.waitForURL((u) => u.pathname === `/admin/jobs/${J}`, { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle')
  const fold = a.locator('details#announce')
  await fold.waitFor({ timeout: 15000 }).catch(() => {})
  ok("공고 화면 '확정자에게 공지'가 펼쳐져 있음 · 안 읽은 사람 칩", (await fold.evaluate((el) => el.open).catch(() => false)) && (await fold.locator('[data-unread-person]').count()) === 1, a.url())
  ok('공지 칸이 화면 안에 보임', await fold.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 }).catch(() => false))
  ok('바로 왔을 때 테두리가 짧게 한 번 반짝 (0.3초)', await fold.evaluate((el) => el.hasAttribute('data-ring-once') && getComputedStyle(el).animationName === 'flash-ring' && getComputedStyle(el).animationDuration === '0.3s').catch(() => false))
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  ok('그냥 공고 화면을 열면 반짝임 없음 (접힌 채)', (await a.locator('details#announce').evaluate((el) => !el.open && !el.hasAttribute('data-ring-once')).catch(() => false)))

  // ── 3. 다 읽으면 사라짐
  await rest(`messages?id=eq.926101`, 'PATCH', { read_at: new Date().toISOString() })
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok('다 읽으면 확인할 일에서 사라짐', (await a.locator(`[data-todo="notice-${J}"]`).count()) === 0)

  // ── 4. 잘못된 견적 링크는 그대로 404 (로딩 화면을 먼저 보내면 200이 되므로 견적 화면엔 넣지 않음)
  const res = await fetch(`${D}/quote/tok-none-0000000000000000`).catch(() => null)
  ok('잘못된 견적 링크는 404 그대로', res?.status === 404, String(res?.status))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
