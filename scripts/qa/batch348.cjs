// 묶음 348 (정기 개선 2026-11-22 10:35 KST)
// · 서류 탭 '서명한 뒤 일정이 바뀐 서류 n건'이 둘 이상이면 '바뀐 n건 모두 재서명 요청' (두 번 눌러 확인)
//   → 그 서류들은 무효, 같은 서식의 새 서명 요청이 생기고(기록 남음), 서류 탭 '서명 안 한 n명'으로 돌아가 '앱 알림' 버튼이 번쩍
//   하나뿐이면 버튼 없음 (표의 '재서명'으로) · 다른 공고 서류는 건드리지 않음
// node scripts/qa/batch348.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', K = '33333333-0000-4000-8000-000000000011', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000003480a2'
const R1 = 'bbbbbbbb-0000-4000-8000-0000003480b1', R2 = 'bbbbbbbb-0000-4000-8000-0000003480b2', R3 = 'bbbbbbbb-0000-4000-8000-0000003480b3'
const D1 = 'dddddddd-0000-4000-8000-0000003480d1', D2 = 'dddddddd-0000-4000-8000-0000003480d2', D3 = 'dddddddd-0000-4000-8000-0000003480d3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()

;(async () => {
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  const { applications: _a, attendance: _t, ...jl } = job
  await rest('jobs', 'POST', { ...jl, id: J2, title: '다른 공고', applications: [], attendance: [], created_at: new Date().toISOString() })
  const [doc0] = await rest(`signed_docs?status=eq.signed&user_id=eq.${W}`)
  // R1 · R2: 이 공고(J) 72시간 전 서명 → 2시간 전 변경 알림 (바뀜 2건) / R3: 다른 공고(J2) 서류 (건드리지 않음)
  for (const [uid, name, did, jid] of [[R1, '사팔일', D1, J], [R2, '사팔이', D2, J], [R3, '사팔삼', D3, J2]]) {
    await rest('users', 'POST', { ...kb, id: uid, name, phone: '0103480' + uid.slice(-4), nickname: null, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: uid, status: 'approved', available_dates: null, position: null, message: null, contract_received_at: null, created_at: ago(200), job: jl, user: { id: uid, name, phone: '0' } })
    await rest('signed_docs', 'POST', { ...doc0, id: did, job_id: jid, user_id: uid, signed_at: ago(72), created_at: ago(73), worker: { name, phone: '0', birth_date: '1990-01-01', address: '서울' } })
    await rest('messages', 'POST', { id: 3480000 + Number(uid.slice(-1)), thread_user_id: uid, sender_id: A, from_admin: true, job_id: jid, body: `🔔 일정 변경\n안내의 내용이 바뀌었어요.\n시간: 09:00~18:00 → 10:00~19:00`, read_at: null, created_at: ago(2), job: { id: jid, title: 'x' }, sender: { name: '관리자' }, user: { id: uid, name, phone: '0' } })
  }

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(400) }

  const a = await mk(A)
  await go(a, `/admin/jobs/${J}?tab=docs`)
  const all = a.locator('[data-doc-stale-all] button')
  ok("'서명한 뒤 일정이 바뀐 서류 2건' + '바뀐 2건 모두 재서명 요청'", (await a.locator('[data-doc-stale]').getAttribute('data-doc-stale').catch(() => '')) === '2' && one(await all.innerText().catch(() => '')) === '바뀐 2건 모두 재서명 요청')
  if (SHOTS) {
    await a.locator('[data-doc-stale]').scrollIntoViewIfNeeded()
    await a.screenshot({ path: `${SHOTS}/stale-all.png` })
  }
  // 두 번 눌러 확인
  await all.click()
  await a.waitForTimeout(200)
  ok("한 번 누르면 '2건 모두 다시 받을까요?' (확인)", one(await all.innerText().catch(() => '')).includes('2건 모두 다시 받을까요?'))
  await all.click()
  await a.waitForURL((u) => u.searchParams.has('m') || u.hash === '#unsigned', { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForTimeout(600)
  const body = one(await a.locator('main').innerText().catch(() => ''))
  ok("결과 안내: '2명에게 다시 서명을 받을 서류를 만들었어요'", body.includes('2명에게 다시 서명을 받을 서류를 만들었어요'), body.slice(0, 120))
  const docs = await rest('signed_docs')
  const mine = (uid) => docs.filter((d) => d.user_id === uid)
  ok('R1 · R2: 예전 서류 무효 + 새 서명 요청 1건씩', [R1, R2].every((u) => mine(u).some((d) => d.status === 'void') && mine(u).filter((d) => d.status === 'pending' && d.job_id === J).length === 1), JSON.stringify([R1, R2].map((u) => mine(u).map((d) => [d.status, (d.job_id ?? '').slice(-4)]))))
  ok('다른 공고 서류(R3)는 그대로 (서명 완료)', mine(R3).length === 1 && mine(R3)[0].status === 'signed')
  const logs = (await rest('audit_logs')).filter((l) => l.action === 'doc.rerequest' && [D1, D2].includes(l.detail))
  ok('재서명 요청 기록 2건', logs.length === 2, String(logs.length))
  ok("'서명한 뒤 일정이 바뀐 서류' 칸은 사라짐", (await a.locator('[data-doc-stale]').count()) === 0)
  const flashed = await a.locator('#unsigned').evaluate((e) => !!e.querySelector('[data-flash]') || e.hasAttribute('data-flash')).catch(() => false)
  ok("'서명 안 한' 칸으로 돌아와 앱 알림 버튼이 번쩍", a.url().endsWith('#unsigned') && flashed, a.url())
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/after-all.png` })

  // ── 하나뿐이면 일괄 버튼 없음
  const R4 = 'bbbbbbbb-0000-4000-8000-0000003480b4'
  await rest('users', 'POST', { ...kb, id: R4, name: '사팔사', phone: '01034803484', nickname: null, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  await rest('signed_docs', 'POST', { ...doc0, id: 'dddddddd-0000-4000-8000-0000003480d4', job_id: J, user_id: R4, signed_at: ago(72), created_at: ago(73), worker: { name: '사팔사', phone: '0', birth_date: '1990-01-01', address: '서울' } })
  await rest('messages', 'POST', { id: 3480004, thread_user_id: R4, sender_id: A, from_admin: true, job_id: J, body: `🔔 일정 변경\n안내의 내용이 바뀌었어요.\n시간: 09:00~18:00 → 10:00~19:00`, read_at: null, created_at: ago(1), job: { id: J, title: 'x' }, sender: { name: '관리자' }, user: { id: R4, name: '사팔사', phone: '0' } })
  await go(a, `/admin/jobs/${J}?tab=docs`)
  ok('바뀐 서류가 하나면 일괄 버튼 없음 (표의 재서명으로)', (await a.locator('[data-doc-stale]').getAttribute('data-doc-stale').catch(() => '')) === '1' && (await a.locator('[data-doc-stale-all]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
