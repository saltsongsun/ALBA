// 묶음 365 (정기 개선 2026-11-23 20:35 KST · 공고 서류 탭: 서명 안 하고 일한 사람 빨갛게)
// · '서명 안 한 n명' 옆에 그중 이미 일한(출근 기록 있는) 사람 수 '· 일함 n' (빨강 · 0.25초 톡 · 움직임 줄이기면 바로)
// · 표: 서명 전인데 일한 사람은 '서명 대기 · 일함' (빨강) · 아직 안 일한 사람은 예전처럼 '서명 대기' (주황)
// node scripts/qa/batch365.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const W2 = 'bbbbbbbb-0000-4000-8000-0000003650b2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // W: 오늘 출근 기록 있음 + 서명 대기 (기본 자료) · W2: 확정 + 서명 대기 · 출근 기록 없음
  const [wu] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...wu, id: W2, name: '안일한365', phone: '01036500002' })
  const [app0] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const { id: _pi, company_id: _pc, user: _u, ...appBase } = app0
  await rest('applications', 'POST', { ...appBase, id: 'ffffffff-0000-4000-8000-0000003650f2', user_id: W2, user: { ...(app0.user ?? {}), id: W2, name: '안일한365', phone: '01036500002' }, status: 'approved', held_at: null })
  const [d0] = await rest('signed_docs?id=eq.dddddddd-0000-4000-8000-000000000004')
  ok('(준비) 근무자 서류는 서명 대기', d0?.status === 'pending' && d0?.user_id === W)
  const { id: _i, company_id: _dc, ...docBase } = d0
  await rest('signed_docs', 'POST', { ...docBase, id: 'dddddddd-0000-4000-8000-0000003650d2', user_id: W2, status: 'pending' })
  const atts = (await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)) ?? []
  if (!atts.length) {
    const [anyAtt] = (await rest('attendance?limit=1')) ?? []
    const { id: _ai, company_id: _ac, ...attBase } = anyAtt ?? {}
    await rest('attendance', 'POST', { ...attBase, id: 'eeeeeeee-0000-4000-8000-0000003650e1', job_id: J, user_id: W, work_date: kday(0), clock_in: new Date(Date.now() - 3600e3).toISOString(), clock_out: null })
  }
  ok('(준비) W는 출근 기록 있음 · W2는 없음', ((await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)) ?? []).length > 0 && ((await rest(`attendance?job_id=eq.${J}&user_id=eq.${W2}`)) ?? []).length === 0)

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
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }

  const a = await mk(A)
  await go(a, `/admin/jobs/${J}?tab=docs`)
  const tools = a.locator('[data-unsigned-tools]')
  await tools.waitFor({ timeout: 15000 }).catch(() => {})
  const head = one(await tools.locator('b').first().innerText().catch(() => ''))
  ok("'서명 안 한 2명 · 일함 1'", head === '서명 안 한 2명 · 일함 1', head)
  const tag = tools.locator('[data-unsigned-worked]')
  ok('일함 n: 빨강 · 0.25초 톡', (await tag.evaluate((el) => el.classList.contains('text-rose-600'))) && JSON.stringify(await tag.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])) === '["pop","0.25s"]')
  // 표
  const rowOf = (name) => a.locator('table tbody tr', { hasText: name })
  const wBadge = rowOf('근무자').locator('[data-doc-worked]')
  ok("일한 사람: '서명 대기 · 일함' (빨강)", one(await wBadge.first().innerText().catch(() => '')) === '서명 대기 · 일함' && (await wBadge.first().evaluate((el) => el.classList.contains('text-rose-700'))))
  ok("아직 안 일한 사람: 예전처럼 '서명 대기' (주황)", (await rowOf('안일한365').locator('[data-doc-worked]').count()) === 0 && one(await rowOf('안일한365').locator('a.badge').first().innerText().catch(() => '')) === '서명 대기')
  ok('배지 한 줄 (꺾이지 않음)', await wBadge.first().evaluate((el) => el.getClientRects().length === 1))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await tools.screenshot({ path: `${SHOTS}/unsigned-worked.png` }).catch(() => {})
    await a.locator('table').first().screenshot({ path: `${SHOTS}/docs-table.png` }).catch(() => {})
  }
  // 누르면 그 서류
  await Promise.all([a.waitForURL((u) => u.pathname.startsWith('/docs/'), { timeout: 15000 }).catch(() => {}), wBadge.first().click()])
  ok('빨간 배지를 누르면 그 서류', new URL(a.url()).pathname === '/docs/dddddddd-0000-4000-8000-000000000004', a.url())

  // 움직임 줄이기
  const rm = await mk(A, { reducedMotion: 'reduce' })
  await go(rm, `/admin/jobs/${J}?tab=docs`)
  const rd = await rm.locator('[data-unsigned-worked]').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
