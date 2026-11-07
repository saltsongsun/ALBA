// 묶음 105: 근로시간 일괄 조정 (사용자 요청 2026-11-07 "근로시간 선택해서 일괄조정 가능하게")
// · 출퇴근 탭 '여러 명 시간 한 번에 고치기' → 사람 고르기(모두 고르기) · '근로조건대로(09:00~18:00)' · 두 번 눌러 저장
// · 원래 기록은 두고 보정값으로 (다른 시각만) · 종료를 안 누른 사람은 넣은 시각으로 종료 · 지급 완료한 기록은 못 고름
// node scripts/qa/batch105.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const X = 'bbbbbbbb-0000-4000-8000-0000000000ec', Y = 'bbbbbbbb-0000-4000-8000-0000000000ed'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const at = (t) => new Date(`${today}T${t}:00+09:00`).toISOString()
const iso = (v) => (v ? new Date(v).toISOString() : null)

;(async () => {
  // 준비: 오늘 09:00~18:00 · 근무자(W) 09:12 출근·근무 중 · X 09:05~17:50 · Y 지급 완료
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '09:00:00', end_time: '18:00:00', status: 'closed' })
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: today, clock_in: at('09:12'), clock_out: null, adj_in: null, adj_out: null, paid: false })
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  for (const [id, name] of [[X, '엑스근무'], [Y, '와이지급']]) {
    const u = { ...w1, id, name, phone: `0107777${id.slice(-4)}`, created_at: new Date().toISOString() }
    await rest('users', 'POST', u)
    await rest('applications', 'POST', { ...wApp, id: undefined, user_id: id, user: u, position: null })
  }
  await rest('attendance', 'POST', { ...att, id: undefined, user_id: X, clock_in: at('09:05'), clock_out: at('17:50'), adj_in: null, adj_out: null, paid: false, note: null })
  await rest('attendance', 'POST', { ...att, id: undefined, user_id: Y, clock_in: at('09:30'), clock_out: at('16:00'), adj_in: null, adj_out: null, paid: true, note: null })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  const panel = a.locator('[data-bulk-adjust]')
  await panel.waitFor({ timeout: 10000 }).catch(() => {})
  await panel.locator('summary').click()
  await a.waitForTimeout(300)

  // ── 1. 고르기 ──
  const boxes = panel.locator('input[name=uid]')
  ok('그날 기록 3명 목록 · 지급 완료(와이지급)는 못 고름', (await boxes.count()) === 3 && (await panel.locator('label', { hasText: '와이지급' }).locator('input').isDisabled()) && (await panel.getByText('지급 완료').count()) >= 1)
  const submit = panel.getByRole('button', { name: /고칠 사람을 골라 주세요|시간 고치기/ })
  ok('아무도 안 고르면 저장 버튼 꺼짐', await submit.isDisabled())
  await panel.locator('[data-bulk-all]').click()
  ok("'모두 고르기' → 지급 완료 빼고 2명", (await panel.locator('input[name=uid]:checked').count()) === 2)
  await panel.locator('[data-bulk-contract]').click()
  ok("'근로조건대로' → 09:00 · 18:00 채움", (await panel.locator('input[name=in_time]').inputValue()) === '09:00' && (await panel.locator('input[name=out_time]').inputValue()) === '18:00')
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 두 번 눌러 저장 ──
  const go = panel.getByRole('button', { name: '고른 2명 시간 고치기' })
  await go.click()
  await panel.getByRole('button', { name: '한 번 더 누르면 2명 시간을 고쳐요' }).click()
  await a.getByText('2명 시간을 고쳤어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("'2명 시간을 고쳤어요. 정산 금액에 바로 반영돼요.'", (await a.getByText('2명 시간을 고쳤어요').count()) >= 1)
  const rows = await rest(`attendance?job_id=eq.${J}`)
  const r = (uid) => rows.find((x) => x.user_id === uid && x.work_date === today)
  ok('X: 09:05~17:50 → 보정 09:00~18:00 (원래 기록은 그대로)', iso(r(X).adj_in) === at('09:00') && iso(r(X).adj_out) === at('18:00') && iso(r(X).clock_in) === at('09:05'), JSON.stringify(r(X)))
  ok('근무 중이던 W: 18:00으로 종료 + 출근 09:00 보정', iso(r(W).clock_out) === at('18:00') && iso(r(W).adj_in) === at('09:00'), JSON.stringify(r(W)))
  ok('지급 완료 Y: 그대로', !r(Y).adj_in && !r(Y).adj_out && iso(r(Y).clock_out) === at('16:00'))
  ok("메모에 '일괄 시간 조정'", (r(X).note ?? '').includes('일괄 시간 조정 09:00~18:00'))

  // ── 3. 종료만 바꾸기 ──
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  await panel.locator('summary').click()
  await panel.locator('label', { hasText: '엑스근무' }).locator('input').check()
  await panel.locator('input[name=out_time]').fill('17:00')
  await panel.getByRole('button', { name: '고른 1명 시간 고치기' }).click()
  await panel.getByRole('button', { name: '한 번 더 누르면 1명 시간을 고쳐요' }).click()
  await a.getByText('1명 시간을 고쳤어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  const [x2] = (await rest(`attendance?job_id=eq.${J}`)).filter((x) => x.user_id === X)
  ok('종료만 17:00으로 (출근 보정 09:00은 그대로)', iso(x2.adj_out) === at('17:00') && iso(x2.adj_in) === at('09:00'), JSON.stringify(x2))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
