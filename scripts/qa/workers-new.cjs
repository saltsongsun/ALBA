// 근무자 명단: 최근 7일 안에 가입한 회원에 '🆕 새 가입' 표시 · '🆕 새로 가입'으로 모아 보기
// node scripts/qa/workers-new.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const NEW = '44444444-0000-4000-8000-0000000000c1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  // 어제 가입한 회원 (기존 회원은 10/1 가입)
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: NEW, name: '새친구', phone: '01066665555', created_at: new Date(Date.now() - 86400e3).toISOString(), attendance: [], ratings: [] })

  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const card = (name) => p.locator('.sm\\:hidden .card', { hasText: name })

  await p.goto(`${D}/admin/workers`)
  await p.waitForLoadState('networkidle')
  ok('새 회원 카드에 🆕 새 가입', (await card('새친구').getByText('🆕 새 가입').count()) === 1)
  ok('예전 회원에는 표시 없음', (await card('김지원').getByText('🆕 새 가입').count()) === 0)

  await p.getByRole('link', { name: '🆕 새로 가입' }).click()
  await p.waitForURL(/f=new/, { timeout: 10000 }).catch(() => {})
  await p.waitForLoadState('networkidle')
  ok('새로 가입: 새 회원만', (await card('새친구').count()) === 1 && (await card('김지원').count()) === 0, p.url())
  ok('새로 가입: 1명', await see(p, '근무자 1명'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
