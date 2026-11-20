// 묶음 329 (정기 개선 2026-11-20 21:35 KST)
// · 관리자 근무자 상세 '근무 이력': 오늘 끝날 시각이 지났는데 종료를 안 누른 근무는 '근무 중' 대신
//   'HH:MM 끝 · 종료 안 누름' + '종료 넣기 →' (출퇴근 탭의 그 사람 줄로 바로) · 바뀐 근무 시간(sched_end)도 같은 기준
//   끝날 시각 전이면 예전처럼 '● 근무 중'
// · 주간 근무·주휴: 공고를 한 번도 안 올린 회사는 0원 칸·빈 목록 대신 한 줄 안내 + '+ 첫 공고 올리기' (임시저장만 있어도 같음)
//   공고가 있는 회사는 그대로 (이 주에 없어도 주 고르기·숫자 칸)
// node scripts/qa/batch329.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const sign = (p, pre = '') => `${p}.${createHmac('sha256', SECRET).update(pre + p).digest('base64url')}`
const cookie = (u) => sign(Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'))
const roster = (u) => sign(Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'roster:')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C1 = '99999999-0000-4000-8000-000000000099'
const WX = 'bbbbbbbb-0000-4000-8000-0000003290b1', WY = 'bbbbbbbb-0000-4000-8000-0000003290b2', WZ = 'bbbbbbbb-0000-4000-8000-0000003290b3'
const JO = 'cccccccc-0000-4000-8000-0000003290a1', JL = 'cccccccc-0000-4000-8000-0000003290a2'
const C2 = '99999999-0000-4000-8000-0000003290c2', A2 = 'aaaaaaaa-0000-4000-8000-0000003290a9', JD = 'cccccccc-0000-4000-8000-0000003290d1', JN = 'cccccccc-0000-4000-8000-0000003290d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const hm = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16)

;(async () => {
  const today = kday(0)
  // 자정 바로 뒤(00:06 전)·자정 바로 앞(23:58 뒤)엔 '끝남/안 끝남'이 시각에 따라 바뀌어 건너뜀
  const edge = hm() < '00:06' || hm() > '23:58'
  const [j0] = await rest(`jobs?id=eq.${J}`)
  // 오늘 00:00~00:05 공고(이미 끝남) · 00:00~23:59 공고(아직 안 끝남)
  const jo = { ...j0, id: JO, title: '새벽 짧은 행사', start_date: today, end_date: today, start_time: '00:00:00', end_time: '00:05:00', break_minutes: 0, applications: [], created_at: '2026-11-01T00:00:00Z' }
  const jl = { ...j0, id: JL, title: '하루 종일 행사', start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00', break_minutes: 0, applications: [], created_at: '2026-11-01T00:00:00Z' }
  await rest('jobs', 'POST', jo)
  await rest('jobs', 'POST', jl)
  const jobOf = { [JO]: jo, [JL]: jl }
  const [u] = await rest(`users?id=eq.${W}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  const startIso = new Date(`${today}T00:00:00+09:00`).toISOString()
  for (const [uid, name, phone, jid] of [[WX, '종료안눌러', '01032900001', JO], [WY, '아직근무중', '01032900002', JL], [WZ, '시간바뀜', '01032900003', JL]]) {
    await rest('users', 'POST', { ...ub, id: uid, name, phone, created_at: '2026-11-01T00:00:00Z' })
    await rest('applications', 'POST', { id: `dddddddd-0000-4000-8000-${uid.slice(-12)}`, job_id: jid, user_id: uid, status: 'approved', available_dates: null, job: jobOf[jid], user: { ...ub, id: uid, name, phone }, created_at: '2026-11-10T00:00:00Z' })
    await rest('attendance', 'POST', { id: `eeeeeeee-0000-4000-8000-${uid.slice(-12)}`, job_id: jid, user_id: uid, work_date: today, clock_in: startIso, clock_out: null, adj_in: null, adj_out: null, paid: false, sched_start: null, sched_end: uid === WZ ? '00:05:00' : null, created_at: startIso })
  }

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }
  const a = await mk(A)

  if (edge) ok('(자정 앞뒤라 시각 비교는 건너뜀)', true)
  else {
    // ── 1. 끝날 시각(00:05)이 지났는데 종료 안 누름: '종료 안 누름' + '종료 넣기 →'
    await go(a, `/admin/workers/${WX}#work-history`)
    const over = a.locator('[data-live-over]')
    ok("끝난 근무: '종료 넣기 →' (근무 중 표시 없음)", (await over.count()) === 1 && one(await over.textContent()) === '종료 넣기 →' && (await a.locator('[data-work-history] [data-live]').count()) === 0)
    ok("줄 아래: '00:05 끝 · 종료 안 누름'", one(await a.locator('[data-work-history] li').first().textContent()).includes('00:05 끝 · 종료 안 누름'))
    ok('누르는 곳: 그 공고 출퇴근 탭의 이 사람 줄', (await over.getAttribute('href')) === `/admin/jobs/${JO}?tab=att&date=${today}&fix=${WX}#att-${WX}`)
    ok('360px 옆으로 밀림 없음', await noSide(a))
    if (SHOTS) {
      await a.locator('[data-work-history]').scrollIntoViewIfNeeded()
      await a.screenshot({ path: `${SHOTS}/worker-over.png` })
    }
    await over.click()
    await a.waitForURL((x) => x.pathname === `/admin/jobs/${JO}` && x.searchParams.get('tab') === 'att', { timeout: 15000 }).catch(() => {})
    await a.waitForLoadState('networkidle')
    await a.locator(`[data-att-row="${WX}"]`).waitFor({ timeout: 15000 }).catch(() => {})
    ok('누르면 출퇴근 탭 · 그 사람 줄이 있음', new URL(a.url()).searchParams.get('fix') === WX && (await a.locator(`[data-att-row="${WX}"]`).count()) === 1, a.url())

    // ── 2. 아직 끝날 시각 전(23:59): 예전처럼 '● 근무 중'
    await go(a, `/admin/workers/${WY}#work-history`)
    ok("끝날 시각 전: '● 근무 중' 그대로 · 종료 넣기 없음", (await a.locator('[data-work-history] [data-live]').count()) === 1 && (await a.locator('[data-live-over]').count()) === 0 && one(await a.locator('[data-work-history] li').first().textContent()).includes('오늘 근무 중'))

    // ── 3. 근무 시간이 바뀐 사람(종료 00:05로 당김): 바뀐 시각 기준으로 '종료 안 누름'
    await go(a, `/admin/workers/${WZ}#work-history`)
    ok("바뀐 근무 시간 기준: '00:05 끝 · 종료 안 누름'", (await a.locator('[data-live-over]').count()) === 1 && one(await a.locator('[data-work-history] li').first().textContent()).includes('00:05 끝 · 종료 안 누름'))
  }

  // ── 4. 주간 근무·주휴: 공고를 한 번도 안 올린 회사
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼이구행사', seal_image: null, verified: true, created_at: new Date().toISOString() })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '삼이구대표', phone: '01032903299', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: new Date().toISOString() })
  const n = await mk(A2)
  await go(n, '/admin/weekly')
  const first = n.locator('[data-weekly-first]')
  ok("공고 없음: '아직 올린 공고가 없어요' 한 줄 안내", (await first.count()) === 1 && one(await first.textContent()).includes('아직 올린 공고가 없어요'))
  ok('0원 칸·주 고르기·빈 목록 없음 · 계산 방법은 접어 둔 채 그대로', (await n.locator('[data-weekly-tiles]').count()) === 0 && (await n.locator('[data-week-nav]').count()) === 0 && (await n.locator('[data-weekly-people]').count()) === 0 && (await n.locator('[data-weekly-rule]').count()) === 1)
  ok("'+ 첫 공고 올리기' → 새 공고", (await n.locator('[data-weekly-first-job]').getAttribute('href')) === '/admin/jobs/new')
  ok('360px 옆으로 밀림 없음 (주간)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/weekly-first.png` })
  // 임시저장 공고만 있으면 아직 같은 안내
  await rest('jobs', 'POST', { ...j0, id: JD, company_id: C2, company: { company_name: '삼이구행사' }, title: '임시저장 공고', status: 'draft', start_date: kday(20), end_date: kday(20), applications: [], created_at: new Date().toISOString() })
  await go(n, '/admin/weekly')
  ok('임시저장만 있으면 그대로 처음 안내', (await n.locator('[data-weekly-first]').count()) === 1)
  // 올린 공고가 생기면 (이 주가 아니어도) 예전 화면
  await rest('jobs', 'POST', { ...j0, id: JN, company_id: C2, company: { company_name: '삼이구행사' }, title: '다음 달 행사', status: 'open', start_date: kday(30), end_date: kday(30), applications: [], created_at: new Date().toISOString() })
  await go(n, '/admin/weekly')
  ok('올린 공고가 생기면 예전 화면 (주 고르기·숫자 칸)', (await n.locator('[data-weekly-first]').count()) === 0 && (await n.locator('[data-week-nav]').count()) === 1 && (await n.locator('[data-weekly-tiles]').count()) === 1)
  await go(a, '/admin/weekly')
  ok('테스트 회사: 예전 화면 그대로', (await a.locator('[data-weekly-first]').count()) === 0 && (await a.locator('[data-weekly-tiles]').count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
