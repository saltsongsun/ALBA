// 묶음 346 (정기 개선 2026-11-22 06:35 KST)
// · 서명한 서류 화면: 서명한 뒤에 그 공고의 '🔔 일정 변경' 알림을 받았으면 위에 '서명한 뒤에 일정이 바뀌었어요'(바뀐 내용 이전 → 이후 · 톡)
//   근무자: '담당자가 다시 서명을 부탁하면 새 서류에 서명해 주세요' / 담당자: '공고 서류 탭에서 재서명 →'(#doc-stale)
//   변경 알림이 서명보다 먼저였으면 · 다른 공고 알림이면 없음
// · 근무자 서명 서류 화면의 인쇄 버튼: 파란 큰 버튼 → 흰 작은 버튼 '🖨 PDF 저장' (담당자 화면은 그대로)
// node scripts/qa/batch346.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', K = '33333333-0000-4000-8000-000000000011', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003'
const P = 'bbbbbbbb-0000-4000-8000-0000003460b1', Q = 'bbbbbbbb-0000-4000-8000-0000003460b2'
const DP = 'dddddddd-0000-4000-8000-0000003460d1', DQ = 'dddddddd-0000-4000-8000-0000003460d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()

;(async () => {
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  for (const [id, name, phone] of [[P, '사육일', '01034603461'], [Q, '사육이', '01034603462']]) {
    await rest('users', 'POST', { ...kb, id, name, phone, nickname: null, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  }
  const { applications: _a, attendance: _t, ...jl } = job
  const [doc0] = await rest(`signed_docs?status=eq.signed&user_id=eq.${W}`)
  // P: 72시간 전 서명 → 2시간 전 변경 알림 (바뀜) / Q: 1시간 전 서명 ← 2시간 전 변경 (해당 없음)
  for (const [uid, name, id, h] of [[P, '사육일', DP, 72], [Q, '사육이', DQ, 1]]) {
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: uid, status: 'approved', available_dates: null, position: null, message: null, contract_received_at: null, created_at: ago(200), job: jl, user: { id: uid, name, phone: '0' } })
    await rest('signed_docs', 'POST', { ...doc0, id, user_id: uid, signed_at: ago(h), created_at: ago(h + 1), worker: { name, phone: '01034603461', birth_date: '1990-01-01', address: '서울' } })
    await rest('messages', 'POST', { id: 3460000 + h, thread_user_id: uid, sender_id: A, from_admin: true, job_id: J, body: `🔔 일정 변경\n${job.title}의 내용이 바뀌었어요.\n시간: 09:00~18:00 → 10:00~19:00\n장소: 광장 → 실내 체육관\n못 오게 되면 앱에서 담당자에게 알려 주세요.`, read_at: null, created_at: ago(2), job: { id: J, title: job.title }, sender: { name: '관리자' }, user: { id: uid, name, phone: '0' } })
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
  const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 근무자 P: 서명 뒤 일정 바뀜 안내
  const p = await mk(P)
  await go(p, `/docs/${DP}`)
  const note = p.locator('[data-doc-changed]')
  const t = one(await note.innerText().catch(() => ''))
  ok("근무자: '서명한 뒤에 일정이 바뀌었어요' + 바뀐 내용 두 줄", t.startsWith('서명한 뒤에 일정이 바뀌었어요') && (await p.locator('[data-doc-changed-rows] li').count()) === 2 && t.includes('시간 09:00~18:00 → 10:00~19:00') && t.includes('장소 광장 → 실내 체육관'), t.slice(0, 140))
  ok("근무자 안내: '담당자가 다시 서명을 부탁하면 새 서류에 서명해 주세요' (관리자 링크 없음)", t.includes('담당자가 다시 서명을 부탁하면 새 서류에 서명해 주세요') && (await p.locator('[data-doc-changed-admin]').count()) === 0)
  const popAn = await p.locator('[data-doc-changed-rows] li b').first().evaluate((e) => ({ an: getComputedStyle(e).animationName, d: parseFloat(getComputedStyle(e).animationDuration) }))
  ok('바뀐 값 톡 (pop 0.25초)', popAn.an === 'pop' && Math.abs(popAn.d - 0.25) < 0.01, JSON.stringify(popAn))
  ok('맨 위 서명 시각 줄은 그대로', (await p.locator('[data-doc-signed]').count()) === 1)
  const pb = p.locator('button', { hasText: 'PDF 저장' }).first()
  const pbCls = (await pb.getAttribute('class').catch(() => '')) ?? ''
  ok("근무자 인쇄 버튼: 흰 작은 버튼 'PDF 저장'", pbCls.includes('btn-white') && !pbCls.includes('btn-primary') && one(await pb.innerText()) === 'PDF 저장', pbCls)
  ok('360px 옆으로 밀림 없음 (서류 화면)', await noSide(p))
  if (SHOTS) {
    await p.waitForTimeout(400)
    await p.screenshot({ path: `${SHOTS}/doc-changed-worker.png`, clip: { x: 0, y: 0, width: 360, height: 520 } })
  }

  // ── 2. 근무자 Q: 변경 알림보다 늦게 서명 → 없음
  const q = await mk(Q)
  await go(q, `/docs/${DQ}`)
  ok('알림 뒤에 서명한 서류: 안내 없음', (await q.locator('[data-doc-changed]').count()) === 0 && (await q.locator('[data-doc-signed]').count()) === 1)

  // ── 3. 원래 근무자(W) 서류: 이 근무자에게 온 변경 알림 없음 → 없음 (다른 사람 알림이 섞이지 않음)
  const w = await mk(W)
  await go(w, '/docs/dddddddd-0000-4000-8000-000000000005')
  ok('다른 근무자에게 간 알림은 해당 없음', (await w.locator('[data-doc-changed]').count()) === 0)

  // ── 4. 담당자가 P 서류를 열면: 같은 안내 + '공고 서류 탭에서 재서명 →'
  const a = await mk(A)
  await go(a, `/docs/${DP}`)
  const link = a.locator('[data-doc-changed-admin]')
  ok("담당자: '공고 서류 탭에서 재서명 →' (#doc-stale)", (await link.getAttribute('href').catch(() => '')) === `/admin/jobs/${J}?tab=docs#doc-stale`)
  ok("담당자 인쇄 버튼은 예전 그대로 (파란 '인쇄 / PDF 저장')", (await a.locator('button.btn-primary', { hasText: '인쇄 / PDF 저장' }).count()) === 1)

  // ── 5. 움직임 줄이기: 톡 없음
  const r = await mk(P, { reducedMotion: 'reduce' })
  await go(r, `/docs/${DP}`)
  const rd = await r.locator('[data-doc-changed-rows] li b').first().evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 1)
  ok('움직임 줄이기: 바로 (거의 0초)', rd < 0.01, String(rd))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
