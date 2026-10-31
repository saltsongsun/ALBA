// 퇴근 연장을 또 할 때: 그날 바뀐 종료 시각부터 더하는지
// node scripts/qa/extend-base.cjs <working 앱> <working 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [W_, MW] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const send = (path, method, body) => fetch(`${MW}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'] })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: W_ }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${W_}/admin/jobs/${J}?tab=att&shift=1`)
  await p.getByRole('button', { name: '+1시간' }).click()
  ok('처음: 18:00에서 +1시간 = 19:00', (await p.locator('input[name=end_time]').inputValue()) === '19:00')
  // 19:00까지 연장에 동의한 상태
  await send('shift_changes', 'POST', { job_id: J, user_id: WK, work_date: today, start_time: '09:00:00', end_time: '19:00:00', prev_start: '09:00:00', prev_end: '18:00:00', status: 'agreed' })
  await send(`attendance?job_id=eq.${J}`, 'PATCH', { sched_start: '09:00:00', sched_end: '19:00:00' })
  await p.goto(`${W_}/admin/jobs/${J}?tab=att&shift=1`)
  ok('지금 종료 시각 표시', await p.getByText('지금 종료 19:00에서').waitFor({ timeout: 8000 }).then(() => true, () => false))
  await p.getByRole('button', { name: '+1시간' }).click()
  ok('또 연장: 19:00에서 +1시간 = 20:00', (await p.locator('input[name=end_time]').inputValue()) === '20:00')
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
