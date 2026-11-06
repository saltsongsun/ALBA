// 묶음 87: 행사 마지막 날 근무자가 모두 퇴근하면 자동으로 '행사 종료' (사용자 요청 "아르바이트 전원 퇴근하면 행사종료해줘")
// · 마지막 날이 아니면 그대로 · 아직 근무 중인 사람이 있으면 그대로 · 안 온 확정자가 있으면 예정 종료 시각이 지난 뒤에만
// · 관리자가 '미종료 일괄 종료'로 마지막 사람을 끝내면 안내에 '모두 퇴근해서 행사를 종료했어요' · 되돌리기는 '모집 열기'
// node scripts/qa/batch87.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const X = 'bbbbbbbb-0000-4000-8000-0000000000e7', Y = 'bbbbbbbb-0000-4000-8000-0000000000e8'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms = 0) => new Date(Date.now() + 9 * 3600e3 + ms).toISOString().slice(0, 10)
const today = kst(), tomorrow = kst(86_400_000)
const status = async () => (await rest(`jobs?id=eq.${J}`))[0]?.status

;(async () => {
  // 준비: 확정자 X(근무 중)·Y(아직 안 옴) 추가, 공고는 하루 종일 (00:00~23:59)
  const [w1] = await rest(`users?id=eq.${W}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [wAtt] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  for (const [id, name, phone] of [[X, '퇴근엑스', '01077770871'], [Y, '안온와이', '01077770872']]) {
    const u = { ...w1, id, name, phone, created_at: new Date().toISOString() }
    await rest('users', 'POST', u)
    await rest('applications', 'POST', { ...wApp, id: undefined, user_id: id, user: u })
  }
  await rest('attendance', 'POST', { ...wAtt, id: undefined, user_id: X, clock_in: new Date().toISOString(), clock_out: null })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00', end_date: tomorrow })
  // (가짜 데이터의 근무자는 서명 안 한 서류가 있어 근무 버튼이 숨어 있음 → 서명한 것으로)
  await rest(`signed_docs?user_id=eq.${W}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  // 근무자 화면에서 근무 종료 (두 번 눌러야 종료)
  const clockOut = async (p) => {
    await p.goto(`${D}/me`)
    const btn = p.getByRole('button', { name: '근무 종료', exact: true })
    await btn.waitFor({ timeout: 10000 })
    await btn.click()
    await p.getByRole('button', { name: '한 번 더 누르면 종료' }).click()
    await p.getByText('근무를 종료했어요').waitFor({ timeout: 10000 }).catch(() => {})
  }

  // ── 1. 마지막 날이 아니면 그대로 ──
  const w = await pg(W)
  await clockOut(w)
  ok('여러 날 행사의 중간 날: 모두 퇴근해도 그대로', (await rest(`attendance?id=eq.${wAtt.id}`))[0]?.clock_out && (await status()) === 'open')

  // ── 2. 마지막 날, 아직 근무 중인 사람이 있으면 그대로 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: today })
  await rest(`attendance?id=eq.${wAtt.id}`, 'PATCH', { clock_out: null })
  await clockOut(w)
  ok('마지막 날이어도 아직 근무 중인 사람(X)이 있으면 그대로', (await status()) === 'open')

  // ── 3. 모두 퇴근했지만 안 온 확정자(Y)가 있고 예정 종료(23:59) 전이면 그대로 ──
  const x = await pg(X)
  await clockOut(x)
  ok('안 온 확정자가 있으면 예정 종료 시각 전엔 그대로', (await status()) === 'open')

  // ── 4. 예정 종료가 지난 뒤 마지막 사람을 관리자가 일괄 종료 → 행사 종료 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '00:01:00' })
  const [xAtt] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${X}`)
  await rest(`attendance?id=eq.${xAtt.id}`, 'PATCH', { clock_out: null })
  const a = await pg(A)
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  const bulk = a.getByRole('button', { name: '미종료 일괄 종료' })
  await bulk.waitFor({ timeout: 10000 })
  await bulk.click()
  await a.getByRole('button', { name: /명 종료할까요\?/ }).click()
  await a.getByText('모두 퇴근해서 행사를 종료했어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("관리자 안내: '… 모두 퇴근해서 행사를 종료했어요'", (await a.getByText('모두 퇴근해서 행사를 종료했어요').count()) >= 1)
  ok("공고 상태가 '행사 종료'(done)로", (await status()) === 'done')
  await a.goto(`${D}/admin/jobs/${J}`)
  await a.locator('[data-job-more] summary').click()
  await a.getByRole('button', { name: '모집 열기' }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("되돌리기: 더보기에 '모집 열기'", await a.getByRole('button', { name: '모집 열기' }).isVisible())

  // ── 5. 모두 같은 날 다 퇴근 (안 온 사람 없음) → 근무자 종료만으로도 바로 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'closed', end_time: '23:59:00' })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${Y}`, 'PATCH', { status: 'cancelled' })
  await rest(`attendance?id=eq.${wAtt.id}`, 'PATCH', { clock_out: null })
  await clockOut(w)
  ok('확정자 모두 왔다가 마지막 사람이 퇴근하면 바로 행사 종료 (예정 종료 전이어도)', (await status()) === 'done')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
