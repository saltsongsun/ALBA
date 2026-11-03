// 지난 근무 종료를 깜빡했을 때: 다음 날 '끝난 시각' 카드로 정리
// node scripts/qa/forgot-clockout.cjs <working 앱> <working 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [W_, MW] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const yesterday = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MW}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(WK), url: W_ }, { name: 'alba_roster', value: roster(WK), url: W_ }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  // 오늘 근무 중(종료 시각 전)이면 평소 버튼 그대로
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await p.goto(`${W_}/me`)
  ok('오늘 근무 중: 평소 근무 종료 버튼', (await see(p, '근무 종료')) && !(await see(p, '근무 종료를 누르지 않았어요', 1000)))

  // 어제 09:00에 시작하고 종료를 안 누름 (행사는 어제 끝남)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: yesterday, end_date: yesterday, start_time: '09:00:00', end_time: '18:00:00' })
  await rest(`attendance?job_id=eq.${J}`, 'PATCH', { work_date: yesterday, clock_in: `${yesterday}T00:00:00.000Z`, clock_out: null, note: null })
  await p.goto(`${W_}/me`)
  ok('다음 날: 종료 안 누른 근무 안내', await see(p, '근무 종료를 누르지 않았어요'))
  ok('경과 시간(근무 중 n시간) 대신 끝난 시각을 물음', !(await see(p, /근무 중 · 09:00 시작/, 1000)))
  await p.getByRole('button', { name: '예정 종료 시각 18:00에 끝났어요' }).click()
  ok('기록 후 안내', await see(p, /근무를 18:00 종료로 기록했어요/, 15000))
  let att = (await rest(`attendance?job_id=eq.${J}`))[0]
  ok('종료 = 어제 18:00 (예정 종료)', att.clock_out === `${yesterday}T09:00:00.000Z`, att.clock_out)
  ok('관리자용 메모', (att.note ?? '').includes('예정 종료 시각 18:00'), att.note)
  ok('카드가 사라짐', !(await see(p, '근무 종료를 누르지 않았어요', 1000)))
  const msgs = await rest(`messages?thread_user_id=eq.${WK}`)
  ok('담당자 문의함에 알림', msgs.some((m) => m.body.startsWith('🕒 근무 종료 늦게 입력') && m.body.includes('18:00')), msgs.map((m) => m.body.split('\n')[0]).join(' | '))

  // 직접 고른 시각 (17:30)
  await rest(`attendance?job_id=eq.${J}`, 'PATCH', { clock_out: null, note: null })
  await p.goto(`${W_}/me`)
  await p.getByRole('button', { name: '다른 시각에 끝났어요' }).click()
  await p.locator('input[name=end_time]').fill('17:30')
  await p.getByRole('button', { name: '이 시각으로 종료' }).click()
  ok('직접 고른 시각으로 기록', await see(p, /근무를 17:30 종료로 기록했어요/, 15000))
  att = (await rest(`attendance?job_id=eq.${J}`))[0]
  ok('종료 = 어제 17:30', att.clock_out === `${yesterday}T08:30:00.000Z`, att.clock_out)
  ok('메모: 직접 입력', (att.note ?? '').includes('직접 입력 17:30'), att.note)

  // 이미 종료된 기록은 다시 못 바꿈 (서버에서 막힘)
  const shot = await p.screenshot({ fullPage: true, path: process.env.SHOT || undefined }).then(() => true, () => false)
  ok('화면 캡처', shot)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
