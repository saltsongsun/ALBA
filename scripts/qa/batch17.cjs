// 묶음 17: 공고 목록 카드 '🤝 동료 N명 지원'(그 사람이 나에게 보여 주기로 한 경우만 · 한쪽으로만) · 함께 일한 사람 '나에게 보여 준 동료의 지원 공고'
// node scripts/qa/batch17.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 운영자 전체 스위치: 이 기능은 처음엔 꺼져 있음 → 켜고 시작
  await rest('audit_logs', 'POST', { actor_id: 'aaaaaaaa-0000-4000-8000-000000000001', action: 'feature.coworkers', detail: 'on', created_at: new Date().toISOString() })
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  await rest('attendance', 'POST', { job_id: J, user_id: AP, work_date: new Date().toISOString().slice(0, 10), clock_in: new Date().toISOString() })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const chip = () => w.locator(`a.card-link[href="/jobs/${J}"] [data-card-pals]`)

  await w.goto(`${D}/`)
  ok('동료 없으면 카드에 표시 없음', (await chip().count()) === 0)
  // 내가 새벽스태프에게 보여 줘도 새벽스태프의 지원은 안 보임
  await rest('coworker_links', 'POST', { from_id: W, to_id: AP })
  await w.reload()
  ok('내가 보여 준 것만으로는 상대 지원 표시 없음', (await chip().count()) === 0)
  // 새벽스태프가 나에게 보여 주기로 함 → 보임
  await rest('coworker_links', 'POST', { from_id: AP, to_id: W })
  await w.reload()
  ok("상대가 나에게 보여 줌: 카드에 '🤝 동료 1명 지원'", (await chip().count()) === 1 && (await chip().innerText()).includes('동료 1명'))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  await w.goto(`${D}/community/coworkers`)
  const sec = w.locator('[data-pal-jobs]')
  await sec.waitFor({ timeout: 10000 }).catch(() => {})
  ok('함께 일한 사람: 동료가 지원한 공고 + 별명', (await sec.count()) === 1 && (await sec.innerText()).includes('생활체육대축전') && (await sec.innerText()).includes('새벽스태프'))
  ok('실명 없음', !(await sec.innerText()).includes('김지원'))
  await rest(`applications?user_id=eq.${AP}&job_id=eq.${J}`, 'PATCH', { status: 'cancelled' })
  await w.reload()
  await w.locator('[data-coworker-list]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('동료가 지원 취소하면 사라짐', (await w.locator('[data-pal-jobs]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
