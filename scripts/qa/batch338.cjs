// 묶음 338 (정기 개선 2026-11-21 15:35 KST · 내 근무 '오늘 근무 확정 대기' 줄)
// · 오늘 근무가 이미 시작했는데 아직 확정 전이면 아래 줄도 'HH:MM에 시작했어요' (위 칸 '시작했는데 아직 확정 전이에요'와 같은 때 · 'HH:MM 시작'은 시작 전에만)
// · 그 줄을 누르면 그 공고 화면 (누름 반응 · '›') · 360px
// node scripts/qa/batch338.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const JS = 'cccccccc-0000-4000-8000-0000003380a1', JL = 'cccccccc-0000-4000-8000-0000003380a2'
const PS = '33333333-0000-4000-8000-0000003380b1', PL = '33333333-0000-4000-8000-0000003380b2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const kmin = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 오늘 하루짜리 공고 둘 (00:00 시작 = 이미 시작 · 23:58 시작 = 아직 전) · 각각 확정 대기 회원 한 명
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  for (const [jid, uid, title, st, phone] of [[JS, PS, '오늘 새벽부터 안내', '00:00', '01033803381'], [JL, PL, '오늘 밤 마감 정리', '23:58', '01033803382']]) {
    await rest('jobs', 'POST', { ...jb, id: jid, title, status: 'open', start_date: kday(), end_date: kday(), start_time: `${st}:00`, end_time: '23:59:00', applications: [], attendance: [], created_at: new Date().toISOString() })
    const [j] = await rest(`jobs?id=eq.${jid}`)
    const { applications: _ja, attendance: _jt, ...jl } = j
    await rest('users', 'POST', { ...kb, id: uid, name: `대기${st.slice(0, 2)}`, phone, created_at: '2026-11-01T00:00:00Z' })
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: uid, status: 'applied', available_dates: null, position: null, message: null, created_at: new Date(Date.now() - 3600e3).toISOString(), job: jl, user: { id: uid, name: `대기${st.slice(0, 2)}`, phone } })
  }

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }
  const m = kmin()
  const stable = m >= 1 && m < 23 * 60 + 57

  if (!stable) ok('자정 무렵이라 시작 여부 확인은 건너뜀', true)
  else {
    // ── 1. 이미 시작(00:00)한 오늘 근무 확정 대기: 'HH:MM에 시작했어요'
    const p = await mk(PS)
    await go(p, '/me')
    const row = p.locator('[data-today-empty="waiting"]')
    await row.waitFor({ timeout: 10000 }).catch(() => {})
    const head = one(await row.locator('[data-today-wait-start]').innerText().catch(() => ''))
    ok("이미 시작: '오늘 00:00에 시작했어요'", head === '오늘 00:00에 시작했어요' && (await row.getAttribute('data-today-wait-started')) === '', head)
    ok("아랫줄 '확정되면 바로 알려 드려요' 그대로 · 위 칸 '시작했는데 아직 확정 전이에요'와 같은 때", one(await row.innerText()).includes('확정되면 바로 알려 드려요') && (await p.locator('[data-waiting-soon="started"]').count()) === 1)
    ok("'확정 전이에요'는 화면에 한 번만", (one(await p.locator('main').textContent()).match(/확정 전이에요/g) ?? []).length === 1)
    ok("줄이 그 공고로 가는 링크 ('›')", (await row.getAttribute('href')) === `/jobs/${JS}` && one(await row.innerText()).endsWith('›'))
    ok('360px 옆으로 밀림 없음 · 줄 높이 그대로(두 줄 글)', (await noSide(p)) && (await row.evaluate((e) => e.getBoundingClientRect().height < 90)))
    if (SHOTS) {
      await row.evaluate((e) => e.scrollIntoView({ block: 'center' }))
      await p.waitForTimeout(300)
      await p.screenshot({ path: `${SHOTS}/today-waiting-started.png` })
    }
    await row.click()
    await p.waitForURL((u) => u.pathname === `/jobs/${JS}`, { timeout: 10000 }).catch(() => {})
    ok('누르면 그 공고 화면', new URL(p.url()).pathname === `/jobs/${JS}`)

    // ── 2. 아직 시작 전(23:58)인 오늘 근무 확정 대기: 예전처럼 'HH:MM 시작'
    const q = await mk(PL)
    await go(q, '/me')
    const row2 = q.locator('[data-today-empty="waiting"]')
    await row2.waitFor({ timeout: 10000 }).catch(() => {})
    const head2 = one(await row2.locator('[data-today-wait-start]').innerText().catch(() => ''))
    ok("시작 전: '오늘 23:58 시작' (예전 그대로)", head2 === '오늘 23:58 시작' && (await row2.getAttribute('data-today-wait-started')) === null, head2)
    ok('시작 전에도 줄을 누르면 그 공고', (await row2.getAttribute('href')) === `/jobs/${JL}`)
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
