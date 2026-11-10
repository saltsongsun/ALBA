// 만 18세 미만 지원자: 야간(22~06시)·하루 7시간 초과 공고면 표시하고 확정할 때 한 번 더 확인
// node scripts/qa/minor-limits.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const teen = `${new Date().getUTCFullYear() - 16}-01-15`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const card = () => p.locator('.sm\\:hidden .card', { hasText: '김지원' })
  const status = async () => (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0].status

  // 만 16세 지원자 · 09~18시(휴게 빼고 8시간)
  await rest(`users?id=eq.${AP}`, 'PATCH', { birth_date: teen })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('연소자 · 7시간 초과 표시', await see(p, '🌙 7시간 초과 근무 제한'))
  await card().getByRole('button', { name: '확정', exact: true }).click()
  ok('확정 누르면 한 번 더 확인', await see(p, '연소자 7시간 초과 · 확정?'))
  ok('첫 누름엔 확정 안 됨', (await status()) === 'applied')
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await p.getByRole('button', { name: /대기 \d+명 모두 확정/ }).click()
  ok('모두 확정도 연소자 포함 확인', await see(p, /연소자 1명\(7시간 초과\) 포함 · 확정\?/))

  // 밤 11시까지: 야간도 함께
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:00:00' })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('야간·7시간 초과 표시', await see(p, '🌙 야간·7시간 초과 근무 제한'))

  // 성인이면 표시 없음
  await rest(`users?id=eq.${AP}`, 'PATCH', { birth_date: '1990-01-01' })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  const adultName = await card().first().waitFor({ timeout: 8000 }).then(() => true, () => false)
  const adultWarn = await p.evaluate(() => [...document.querySelectorAll('span,p')].map((e) => e.innerText).filter((x) => x.includes('근무 제한')))
  ok('성인은 제한 표시 없음', adultName && adultWarn.length === 0, JSON.stringify(adultWarn))

  // 연소자라도 낮 6시간 근무면 바로 확정
  await rest(`users?id=eq.${AP}`, 'PATCH', { birth_date: teen })
  // (날짜는 내일로 — 오후 4시가 지난 뒤에 돌려도 '끝난 근무 확정 확인'에 걸리지 않게)
  const tmr = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr, start_time: '10:00:00', end_time: '16:00:00' })
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('낮 6시간: 연소자 표시만, 제한 없음', (await see(p, '연소자')) && !(await see(p, '근무 제한', 1000)))
  await card().getByRole('button', { name: '확정', exact: true }).click()
  await p.waitForTimeout(1500)
  ok('바로 확정됨', (await status()) === 'approved')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
