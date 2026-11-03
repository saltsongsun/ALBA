// 공고 화면의 '계약서를 받지 않는 공고' 경고: 전문가 의뢰는 용역계약서 기준 (근로계약서가 없다고 잘못 경고하지 않게)
// node scripts/qa/expert-contract-warn.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const JX = 'cccccccc-0000-4000-8000-0000000000e3', SVC = 'dddddddd-0000-4000-8000-0000000000e3'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  // 용역계약서 서식 + 그 서식을 받는 전문가 의뢰
  await rest('doc_templates', 'POST', { id: SVC, kind: 'service', title: '용역계약서', body: '# 용역계약서\n\n{{근로자명}}', is_default: false, active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: JX, title: '개막식 음향 감독', audience: 'expert', tax_type: 'business', employment_insurance: false, applications: [], required_docs: [SVC], contract_method: 'app', start_date: day(2), end_date: day(2), company: { company_name: '주식회사 테스트' } })

  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  // 용역계약서를 받는 전문가 의뢰: 경고 없음
  await p.goto(`${D}/admin/jobs/${JX}`)
  await p.waitForLoadState('networkidle')
  ok('전문가 의뢰(용역계약서 있음): 근로계약서 경고 없음', !(await see(p, '근로계약서를 받지 않는', 800)))
  ok('전문가 의뢰(용역계약서 있음): 용역계약서 경고도 없음', !(await see(p, '용역계약서를 받지 않는', 800)))

  // 서식이 하나도 없는 전문가 의뢰: 용역계약서 기준으로 경고
  await rest(`jobs?id=eq.${JX}`, 'PATCH', { required_docs: [] })
  await p.goto(`${D}/admin/jobs/${JX}`)
  await p.waitForLoadState('networkidle')
  ok('전문가 의뢰(서식 없음): 용역계약서 경고', await see(p, '✍️ 용역계약서를 받지 않는 의뢰예요'))
  ok('버튼도 용역계약서 지정하기', (await p.getByRole('link', { name: '용역계약서 지정하기' }).count()) === 1)

  // 아르바이트 공고는 그대로 근로계약서 기준
  await rest(`jobs?id=eq.${J}`, 'PATCH', { required_docs: [] })
  await p.goto(`${D}/admin/jobs/${J}`)
  await p.waitForLoadState('networkidle')
  ok('알바 공고(서식 없음): 근로계약서 경고 그대로', await see(p, '✍️ 근로계약서를 받지 않는 공고예요'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
