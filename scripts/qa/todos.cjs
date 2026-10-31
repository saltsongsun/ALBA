// 관리자 대시보드 '확인할 일' 테스트: node scripts/qa/todos.cjs <default 앱> <default 가짜 Supabase> <fresh 앱> <fresh 가짜 Supabase>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, F, MF] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const send = (m, path, method, body) => fetch(`${m}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const yesterday = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10)
const errs = []
;(async () => {
  const b = await chromium.launch()
  const pg = async (base) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: base }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message.slice(0, 120))); return p
  }
  const a = await pg(D)
  await a.goto(`${D}/admin`)
  ok('할 일이 없으면 카드 없음', (await a.getByText('✅ 확인할 일').count()) === 0)
  // 어제 근무인데 종료 안 누름 + 연장 확인 요청 + 시간 변경 답 대기 + 종이 계약서 미수령
  await send(MD, `attendance?job_id=eq.${J}`, 'PATCH', { work_date: yesterday, ot_status: 'pending', ot_by: 'worker', ot_minutes: 30 })
  await send(MD, 'shift_changes', 'POST', { job_id: J, user_id: W, work_date: null, start_time: '10:00', end_time: '19:00', prev_start: '09:00', prev_end: '18:00', status: 'pending' })
  await send(MD, `jobs?id=eq.${J}`, 'PATCH', { contract_method: 'paper' })
  await a.reload()
  const card = a.locator('section', { hasText: '✅ 확인할 일' })
  const text = (await card.innerText().catch(() => '')) || ''
  ok('근무 종료 안 누름', /근무 종료 안 누름/.test(text))
  ok('연장 근무 확인 요청', /연장 근무 확인 요청/.test(text))
  ok('근무시간 변경 답 기다림', /근무시간 변경 답 기다림/.test(text))
  ok('근로계약서 미수령', /근로계약서 미수령/.test(text))
  await card.getByRole('link', { name: /근무 종료 안 누름/ }).click()
  await a.waitForURL(new RegExp(`tab=att&date=${yesterday}`)).then(() => ok('누르면 그 날짜 출퇴근 화면', true), () => ok('누르면 그 날짜 출퇴근 화면', false, a.url()))
  // 오늘 출근 확인 요청 (fresh: 출근 전)
  await send(MF, 'messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, job_id: J, body: '📍 출근 확인 요청\n테스트 · 09:05에 현장에 도착했는데 위치 확인이 안 돼요', read_at: null })
  const f = await pg(F)
  await f.goto(`${F}/admin`)
  ok('출근 확인 요청', await f.getByText(/출근 확인 요청 · /).first().isVisible().catch(() => false))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
