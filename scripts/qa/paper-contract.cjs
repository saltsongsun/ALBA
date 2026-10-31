const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
// 종이 근로계약서 출력 테스트: node scripts/qa/paper-contract.cjs <앱 주소> <가짜 Supabase 주소> <스크린샷 폴더>
const [B, M, SHOT] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const errs = []
;(async () => {
  await fetch(`${M}/rest/v1/jobs?id=eq.${J}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contract_method: 'paper' }) })
  const b = await chromium.launch()
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: B }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message.slice(0, 120))); return p
  }
  const a = await pg(A)
  await a.goto(`${B}/admin/jobs/${J}?tab=docs`)
  await a.getByRole('link', { name: /확정 1명 계약서 출력/ }).click()
  await a.getByText('1명 · 한 사람에 한 장').waitFor({ timeout: 8000 }).catch(() => {})
  await a.waitForURL(/\/print\/contract\//)
  const text = await a.locator('main').innerText()
  ok('출력 화면: 1명 · 한 장', text.includes('1명 · 한 사람에 한 장'))
  ok('서식 내용에 근무자 이름이 채워짐', /근무자/.test(text) && text.includes('계약서'))
  ok('사업주 정보·근로자 서명 칸', text.includes('상호: 주식회사 테스트') && text.includes('서명:') && text.includes('연락처: 010-3333-4444'))
  ok('인쇄 버튼', (await a.getByRole('button', { name: /인쇄/ }).count()) === 1)
  await a.screenshot({ path: `${SHOT}/paper.png`, fullPage: false })
  await a.goto(`${B}/print/contract/${J}?blank=1`)
  ok('빈 계약서 1장', (await a.locator('main').innerText()).includes('빈 계약서 1장'))
  await a.goto(`${B}/admin/jobs/${J}?tab=docs`)
  await a.getByRole('link', { name: '출력', exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('사람별 출력 링크', (await a.getByRole('link', { name: '출력', exact: true }).count()) === 1)
  const w = await pg(W)
  await w.goto(`${B}/print/contract/${J}`)
  ok('근무자는 열 수 없음', !w.url().includes('/print/contract'), w.url())
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
