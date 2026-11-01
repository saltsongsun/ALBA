// 서류 화면(휴대폰): 서명란이 안 보이면 '서명하러 가기' 버튼, 여러 건이면 '서명할 서류 1/2'
// node scripts/qa/doc-jump.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002'
const DOC = 'dddddddd-0000-4000-8000-000000000004', DOC2 = 'dddddddd-0000-4000-8000-000000000005'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const b = await chromium.launch()
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p
  }
  const errs = []
  const tpl = (await rest(`signed_docs?id=eq.${DOC}`))[0].template_id
  await rest(`signed_docs?id=eq.${DOC2}`, 'PATCH', { status: 'pending', signed_at: null, body: null, template_id: tpl })
  const p = await pg(WK)
  await p.goto(`${D}/docs/${DOC}`)
  await p.waitForLoadState('networkidle')
  ok('여러 건: 서명할 서류 1/2', await see(p, '서명할 서류 1/2'))
  const jump = p.getByRole('button', { name: /서명하러 가기/ })
  const sigInView = () => p.locator('#sign canvas').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 })
  if (await sigInView()) console.log('SKIP  서명란이 처음부터 보임 (서류가 짧음)')
  else {
    ok('서명란이 안 보이면 서명하러 가기 버튼', await jump.waitFor({ timeout: 5000 }).then(() => true, () => false))
    const bb = await jump.boundingBox()
    const vh = p.viewportSize().height
    ok('버튼이 화면 안(아래 탭 위)에 떠 있음', !!bb && bb.y > vh / 2 && bb.y + bb.height <= vh, JSON.stringify(bb))
    await jump.click()
    await p.waitForTimeout(1200)
    ok('누르면 서명란으로', await sigInView())
    ok('서명란이 보이면 버튼 숨김', !(await jump.isVisible()))
  }
  // 관리자가 볼 때는 버튼·진행 표시 없음
  const a = await pg(A)
  await a.goto(`${D}/docs/${DOC}`)
  await a.waitForLoadState('networkidle')
  ok('관리자 화면엔 없음', !(await see(a, '서명할 서류', 1000)) && !(await a.getByRole('button', { name: /서명하러 가기/ }).isVisible()))
  // 한 건만 남으면 진행 표시 없음
  await rest(`signed_docs?id=eq.${DOC2}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await p.goto(`${D}/docs/${DOC}`)
  await p.waitForLoadState('networkidle')
  ok('한 건이면 진행 표시 없음', (await see(p, '근로자 서명')) && !(await see(p, '서명할 서류 1/', 1000)))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
