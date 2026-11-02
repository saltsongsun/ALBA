// 임금명세서·근무확인서: 관리자는 그 공고에 지원했거나 일한 사람 것만 열림
// (회사 관리자가 주소에 다른 회원 id를 넣어 그 사람의 주소·생년월일·계좌를 보지 못하게)
// node scripts/qa/payslip-scope.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const OUT = '44444444-0000-4000-8000-0000000000d1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  // 이 공고와 아무 관계 없는 회원 (주소·계좌 있음)
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: OUT, name: '남의회원', phone: '01090909090', address: '부산 해운대구 비밀로 1', attendance: [], ratings: [] })

  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  for (const kind of ['payslip', 'cert']) {
    await p.goto(`${D}/print/${kind}/${J}/${OUT}`)
    await p.waitForLoadState('networkidle')
    ok(`${kind}: 관계없는 회원은 열리지 않음`, (await see(p, '찾는 화면이 없어요')) && !(await see(p, '남의회원', 500)) && !(await see(p, '비밀로', 500)))
    await p.goto(`${D}/print/${kind}/${J}/${W}`)
    await p.waitForLoadState('networkidle')
    ok(`${kind}: 이 공고에서 일한 사람은 열림`, (await see(p, kind === 'payslip' ? '근무자' : '근무확인서')) && !(await see(p, '찾는 화면이 없어요', 500)))
  }
  // 지원만 한 사람(김지원)도 명세서는 열림
  await p.goto(`${D}/print/payslip/${J}/${AP}`)
  await p.waitForLoadState('networkidle')
  ok('지원한 사람은 열림', (await see(p, '김지원')) && !(await see(p, '찾는 화면이 없어요', 500)))

  // 근무자 본인은 자기 것 그대로
  const wc = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await wc.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const wp = await wc.newPage()
  await wp.goto(`${D}/print/payslip/${J}/${W}`)
  ok('근무자 본인 명세서는 그대로', (await see(wp, '근무자')) && !(await see(wp, '찾는 화면이 없어요', 500)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
