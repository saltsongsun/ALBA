// 매일 저녁 자동 안내: 지난 근무의 종료를 깜빡한 근무자에게 '끝난 시각을 알려 주세요' (기록마다 한 번)
// node scripts/qa/forgot-remind.cjs <working 앱> <working 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [W_, MW] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const yesterday = day(-1)
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})` }
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MW}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const cron = () => fetch(`${W_}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } }).then((r) => r.json())
const forgotMsgs = async () => (await rest(`messages?thread_user_id=eq.${WK}`)).filter((m) => m.body.startsWith('⏰ 근무 종료 확인'))
;(async () => {
  // 오늘 근무 중인 기록은 안내 대상이 아님
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '09:00:00', end_time: '18:00:00' })
  let r = await cron()
  ok('오늘 근무 중이면 안내 안 함', r.forgot === 0, JSON.stringify(r))

  // 어제 시작하고 종료를 안 누름
  await rest(`attendance?job_id=eq.${J}`, 'PATCH', { work_date: yesterday, clock_in: `${yesterday}T00:00:00.000Z`, clock_out: null })
  r = await cron()
  ok('어제 종료 안 누름 → 근무자에게 안내', r.forgot === 1, JSON.stringify(r))
  const m = (await forgotMsgs())[0]
  ok('안내에 날짜와 할 일', !!m && m.body.includes(fmt(yesterday)) && m.body.includes('끝난 시각을 알려 주세요') && m.from_admin === true, m?.body.replace(/\n/g, ' / '))
  r = await cron()
  ok('두 번 불러도 한 번만', r.forgot === 0 && (await forgotMsgs()).length === 1, JSON.stringify(r))

  // 근무자: 문의함에 안내, 내 근무에는 끝난 시각 카드
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(WK), url: W_ }, { name: 'alba_roster', value: roster(WK), url: W_ }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`${W_}/me/chat?co=99999999-0000-4000-8000-000000000099`)
  ok('근무자 문의함에 안내', await p.getByText('⏰ 근무 종료 확인').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  await p.goto(`${W_}/me`)
  ok('내 근무: 끝난 시각 카드', await p.getByText('근무 종료를 누르지 않았어요').first().waitFor({ timeout: 8000 }).then(() => true, () => false))

  // 2주보다 오래된 기록은 안내하지 않음
  await rest(`attendance?job_id=eq.${J}`, 'PATCH', { id: 'eeeeeeee-0000-4000-8000-0000000000aa', work_date: day(-20), clock_in: `${day(-20)}T00:00:00.000Z` })
  r = await cron()
  ok('2주 지난 기록은 안내 안 함', r.forgot === 0, JSON.stringify(r))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
