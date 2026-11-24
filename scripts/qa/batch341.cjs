// 묶음 341 (정기 개선 2026-11-21 20:35 KST)
// · 근무자 공고 화면 위 배지: 행사가 끝났는데 확정되지 않은 지원은 '지원완료' 대신 '미확정' (아래 결과 칸 · 내 근무 화면과 같은 말)
//   아직 행사 전이면 예전처럼 '지원완료'
// · 커뮤니티 놀이터 줄: 출석 칩('출석 전' / '🔥 n일째')이 붙으면 '· 퀴즈 · 랭킹'으로 짧게 — 360px에서 '…'로 잘리지 않음
//   칩이 없는 관리자는 예전처럼 '· 출석 · 운세 · 퀴즈 · 랭킹'
// node scripts/qa/batch341.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const P = 'bbbbbbbb-0000-4000-8000-0000003410b1'
const JE = 'cccccccc-0000-4000-8000-0000003410a1', JF = 'cccccccc-0000-4000-8000-0000003410a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 가입한 지 오래된 근무자 P · 어제 끝난 공고(JE)와 사흘 뒤 공고(JF)에 지원하고 결과를 기다리는 중
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  await rest('users', 'POST', { ...kb, id: P, name: '사사일', phone: '01034103411', nickname: '사사일', photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  for (const [id, title, d] of [[JE, '어제 끝난 안내', kday(-1)], [JF, '사흘 뒤 안내', kday(3)]]) {
    await rest('jobs', 'POST', { ...jb, id, title, status: 'open', start_date: d, end_date: d, start_time: '09:00:00', end_time: '18:00:00', applications: [], attendance: [], created_at: new Date().toISOString() })
    const [j] = await rest(`jobs?id=eq.${id}`)
    const { applications: _ja, attendance: _jt, ...jl } = j
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: id, user_id: P, status: 'applied', available_dates: null, position: null, message: null, created_at: new Date(Date.now() - 3 * 864e5).toISOString(), job: jl, user: { id: P, name: '사사일', phone: '01034103411' } })
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

  // ── 1. 끝난 행사 · 확정 안 됨 → 위 배지 '미확정'
  const p = await mk(P)
  await go(p, `/jobs/${JE}`)
  const badge = p.locator('[data-app-badge]')
  const head = one(await p.locator('h1').evaluate((h) => h.parentElement?.innerText ?? '').catch(() => ''))
  ok("끝난 행사: 위 배지 '미확정' · '지원완료' 없음", (await badge.getAttribute('data-app-badge')) === 'lapsed' && one(await badge.innerText()) === '미확정' && !head.includes('지원완료'), head.slice(0, 80))
  ok("아래 결과 칸도 '확정되지 않았어요' (같은 말)", (await p.locator('[data-app-result="lapsed"]').count()) === 1)
  ok('360px 옆으로 밀림 없음 (공고 화면)', await noSide(p))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/job-lapsed-badge.png` })

  // ── 2. 아직 행사 전 → 예전처럼 '지원완료'
  await go(p, `/jobs/${JF}`)
  // (정기 개선 2026-11-25 06:35) 배지를 누르면 '내 지원' 칸으로 — 끝에 작은 ↓
  ok("행사 전: 위 배지 '지원완료' (예전 그대로)", (await p.locator('[data-app-badge]').getAttribute('data-app-badge')) === 'applied' && /^지원완료( ↓)?$/.test(one(await p.locator('[data-app-badge]').innerText())))

  // ── 3. 커뮤니티 놀이터 줄: 출석 전 칩 + 짧은 글 · 잘리지 않음
  const cut = (pg) => pg.locator('[data-play-entry-text]').evaluate((e) => e.scrollWidth > e.clientWidth + 1)
  await go(p, '/community')
  const txt = one(await p.locator('[data-play-entry-text]').innerText())
  ok("출석 전: 칩 '출석 전' + '놀이터 · 퀴즈 · 랭킹'", (await p.locator('[data-play-checkin-todo]').count()) === 1 && txt === '놀이터 · 퀴즈 · 랭킹', txt)
  ok("360px에서 '…'로 잘리지 않음 (출석 전)", !(await cut(p)))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/play-entry-todo.png`, clip: { x: 0, y: 0, width: 360, height: 360 } })

  // 오늘 출석하면 '🔥 1일째' · 그래도 잘리지 않음
  await rest('community_checkins', 'POST', { user_id: P, day: kday(0) })
  await go(p, '/community')
  ok("출석 뒤: '🔥 1일째' 칩 · 글은 그대로 짧게 · 잘리지 않음", one(await p.locator('[data-play-streak]').innerText().catch(() => '')) === '🔥 1일째' && one(await p.locator('[data-play-entry-text]').innerText()) === '놀이터 · 퀴즈 · 랭킹' && !(await cut(p)))

  // ── 4. 관리자(출석 칩 없음): 예전처럼 전체 글
  const a = await mk(A)
  await go(a, '/community')
  const at = one(await a.locator('[data-play-entry-text]').innerText().catch(() => ''))
  ok("관리자: 칩 없이 '놀이터 · 출석 · 운세 · 퀴즈 · 랭킹'", (await a.locator('[data-play-checkin-todo], [data-play-streak]').count()) === 0 && at === '놀이터 · 출석 · 운세 · 퀴즈 · 랭킹', at)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
