// 묶음 347 (정기 개선 2026-11-22 08:35 KST)
// · 근무자 내 근무 '서명한 서류' 목록: 서명한 뒤에 그 공고의 '🔔 일정 변경'을 받은 서류는 '보기 →' 대신 '일정 바뀜 →' (누르면 그 서류 — 위에 바뀐 내용)
//   알림보다 늦게 서명한 서류는 예전처럼 '보기 →'
// · 확정 대기 첫 카드: 위에 진행 단계(지원 ✓ → 확정 …)가 보이면 '지원완료' 배지는 빼서 같은 말을 두 번 보이지 않게
//   (둘째 카드 · 진행 단계가 없는 경우 — 확정 근무가 있는 근무자 — 는 배지 그대로)
// node scripts/qa/batch347.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', K = '33333333-0000-4000-8000-000000000011', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003'
const P = 'bbbbbbbb-0000-4000-8000-0000003470b1'
const J2 = 'cccccccc-0000-4000-8000-0000003470a2', J3 = 'cccccccc-0000-4000-8000-0000003470a3', J4 = 'cccccccc-0000-4000-8000-0000003470a4'
const D2 = 'dddddddd-0000-4000-8000-0000003470d2', D3 = 'dddddddd-0000-4000-8000-0000003470d3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)

;(async () => {
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  await rest('users', 'POST', { ...kb, id: P, name: '사칠일', phone: '01034703471', nickname: null, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  const { applications: _a, attendance: _t, ...jb } = job
  const [doc0] = await rest(`signed_docs?status=eq.signed&user_id=eq.${W}`)
  // P: 확정 근무 둘(J2 · J3, 다음 주) — J2 서류는 72시간 전 서명 후 2시간 전 변경 알림(바뀜) / J3 서류는 1시간 전 서명(알림보다 늦음)
  //    지원만 한 공고 둘(J · J4) — 확정 대기 카드 두 장
  for (const [id, title, d] of [[J2, '다음 주 박람회 안내', kday(5)], [J3, '다음 주 콘서트 안내', kday(6)], [J4, '다음 달 축제 안내', kday(9)]]) {
    await rest('jobs', 'POST', { ...jb, id, title, status: 'open', start_date: d, end_date: d, start_time: '09:00:00', end_time: '18:00:00', applications: [], attendance: [], created_at: new Date().toISOString() })
  }
  for (const [jid, status] of [[J2, 'approved'], [J3, 'approved'], [J, 'applied'], [J4, 'applied']]) {
    const [j] = await rest(`jobs?id=eq.${jid}`)
    const { applications: _ja, attendance: _jt, ...jl } = j
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: P, status, available_dates: null, position: null, message: null, contract_received_at: null, created_at: ago(100), job: jl, user: { id: P, name: '사칠일', phone: '0' } })
  }
  for (const [id, jid, h] of [[D2, J2, 72], [D3, J3, 1]]) {
    await rest('signed_docs', 'POST', { ...doc0, id, job_id: jid, user_id: P, signed_at: ago(h), created_at: ago(h + 1), worker: { name: '사칠일', phone: '01034703471', birth_date: '1990-01-01', address: '서울' } })
    await rest('messages', 'POST', { id: 3470000 + h, thread_user_id: P, sender_id: A, from_admin: true, job_id: jid, body: `🔔 일정 변경\n안내의 내용이 바뀌었어요.\n시간: 09:00~18:00 → 10:00~19:00\n못 오게 되면 앱에서 담당자에게 알려 주세요.`, read_at: null, created_at: ago(2), job: { id: jid, title: 'x' }, sender: { name: '관리자' }, user: { id: P, name: '사칠일', phone: '0' } })
  }

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

  const p = await mk(P)
  await go(p, '/me')
  // ── 1. 서명한 서류 목록
  const rowOf = (id) => p.locator(`a[href="/docs/${id}"]`)
  const r2 = one(await rowOf(D2).innerText().catch(() => ''))
  const r3 = one(await rowOf(D3).innerText().catch(() => ''))
  ok("서명 뒤 일정이 바뀐 서류: '일정 바뀜 →'", (await rowOf(D2).locator('[data-my-doc-changed]').count()) === 1 && r2.includes('일정 바뀜 →') && !r2.includes('보기 →'), r2)
  ok("알림보다 늦게 서명한 서류: 예전처럼 '보기 →'", (await rowOf(D3).locator('[data-my-doc-changed]').count()) === 0 && r3.includes('보기 →'), r3)
  if (SHOTS) {
    await rowOf(D2).scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/me-docs-changed.png` })
  }
  await rowOf(D2).click()
  await p.waitForURL((u) => u.pathname === `/docs/${D2}`, { timeout: 15000 }).catch(() => {})
  await p.locator('[data-doc-changed]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("누르면 그 서류: 위에 '서명한 뒤에 일정이 바뀌었어요'", (await p.locator('[data-doc-changed]').count()) === 1)

  // ── 2. 확정 대기 (확정 근무가 없는 근무자 K: 지원만 둘 · J는 이미 지원, J4 하나 더)
  //    첫 카드는 진행 단계만 (배지 없음) · 둘째 카드는 배지 그대로
  const [j4] = await rest(`jobs?id=eq.${J4}`)
  const { applications: _j4a, attendance: _j4t, ...j4l } = j4
  await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J4, user_id: K, status: 'applied', available_dates: null, position: null, message: null, contract_received_at: null, created_at: ago(50), job: j4l, user: { id: K, name: '김지원', phone: '0' } })
  const kp = await mk(K)
  await go(kp, '/me')
  const cards = kp.locator('[data-waiting-app]')
  const c1 = one(await cards.nth(0).innerText().catch(() => ''))
  const c2 = one(await cards.nth(1).innerText().catch(() => ''))
  ok('확정 대기 카드 두 장', (await cards.count()) === 2, String(await cards.count()))
  ok("첫 카드: 진행 단계(지원 · 확정) 있고 '지원완료' 배지 없음", c1.includes('지원') && c1.includes('확정') && c1.includes('서명') && !c1.includes('지원완료'), c1.slice(0, 120))
  ok("둘째 카드: '지원완료' 배지 그대로", c2.includes('지원완료'), c2.slice(0, 120))
  if (SHOTS) {
    await cards.nth(0).scrollIntoViewIfNeeded()
    await kp.screenshot({ path: `${SHOTS}/me-waiting.png` })
  }
  ok('360px 옆으로 밀림 없음 (내 근무)', await kp.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 확정 근무가 있는 근무자(P)는 진행 단계가 없으니 배지 그대로
  await go(p, '/me')
  ok("확정 근무가 있는 근무자: 진행 단계 없음 → '지원완료' 배지 그대로", one(await p.locator('[data-waiting-app]').first().innerText().catch(() => '')).includes('지원완료'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
