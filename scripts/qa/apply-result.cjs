// 지원 결과 화면: 모집이 마감되면 "결과를 곧 알려 드려요", 미선발이면 다른 공고 보기로 바로
// node scripts/qa/apply-result.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const app = (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]
  ok('준비: 김지원 지원 중', app?.status === 'applied')
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(AP), url: D }, { name: 'alba_roster', value: roster(AP), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  // 모집 중: 마감 안내 없음
  await p.goto(`${D}/me`)
  await p.waitForLoadState('networkidle')
  ok('모집 중: 확정 대기 카드', await see(p, '확정 대기'))
  ok('모집 중: 마감 안내 없음', !(await see(p, '모집 마감 · 결과를 곧 알려 드려요', 800)))

  // 모집 마감
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'closed' })
  await p.goto(`${D}/me`)
  ok('마감: 내 근무 확정 대기 카드에 "결과를 곧 알려 드려요"', await see(p, '모집 마감 · 결과를 곧 알려 드려요'))
  await p.goto(`${D}/jobs/${J}`)
  ok('마감: 공고에서도 결과 기다리는 중 안내', await see(p, '모집 마감 · 결과는 알림으로 알려 드려요'))
  ok('마감: 지원 취소는 그대로 가능', (await p.getByRole('button', { name: '지원 취소' }).count()) === 1)

  // 미선발
  await rest(`applications?id=eq.${app.id}`, 'PATCH', { status: 'rejected' })
  await p.goto(`${D}/jobs/${J}`)
  ok('미선발: 결과 안내', await see(p, '이번에는 함께하지 못하게 됐어요.'))
  const next = p.getByRole('link', { name: '모집 중인 다른 알바 보기 →' })
  ok('미선발: 다른 알바 보기 버튼 (첫 화면으로)', (await next.count()) === 1 && (await next.getAttribute('href')) === '/')
  ok('미선발: "내 근무 보기" 대신', (await p.getByRole('link', { name: '내 근무 보기' }).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
