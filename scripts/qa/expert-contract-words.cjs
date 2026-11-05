// 종이·전자계약(모두싸인 등)으로 받는 전문가 의뢰: 어디서나 '근로계약서'가 아니라 '용역계약서'로 (근로자로 오해하지 않게)
// node scripts/qa/expert-contract-words.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const EX = 'eeeeeeee-0000-4000-8000-0000000000e4', JX = 'cccccccc-0000-4000-8000-0000000000e4', AX = '55555555-0000-4000-8000-0000000000e4'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  // 전문가 회원 · 종이 계약 전문가 의뢰(모레) · 확정 (계약서 아직 안 받음)
  const [w] = await rest(`users?id=eq.${W}`)
  const ex = { ...w, id: EX, name: '김음향', phone: '01088886666', member_type: 'expert', photo_at: '2026-10-29T00:00:00Z', attendance: [], ratings: [] }
  await rest('users', 'POST', ex)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const jx = { ...j, id: JX, title: '개막식 음향 감독', audience: 'expert', tax_type: 'business', employment_insurance: false, applications: [{ status: 'approved' }], required_docs: [], contract_method: 'paper', start_date: day(1), end_date: day(1), company: { company_name: '주식회사 테스트' } }
  await rest('jobs', 'POST', jx)
  await rest('applications', 'POST', { id: AX, job_id: JX, user_id: EX, status: 'approved', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: new Date().toISOString(), created_at: new Date().toISOString(), user: ex, job: jx })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message))
    return p
  }

  // 전문가 화면
  const e = await pg(EX)
  await e.goto(`${D}/me`)
  await e.waitForLoadState('networkidle')
  ok('전문가 내 일: 용역계약서 종이 작성 안내', await see(e, '📝 용역계약서 현장에서 종이로 작성'))
  ok('전문가 내 일: 근로계약서라는 말 없음', !(await see(e, '근로계약서', 800)))
  await e.goto(`${D}/jobs/${JX}`)
  await e.waitForLoadState('networkidle')
  // 서류 줄: 이름 아래 작은 글씨로 받는 방법
  await e.locator('[data-doc-lines]').waitFor({ timeout: 8000 }).catch(() => {})
  const docLine = (await e.locator('[data-doc-lines]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  ok('의뢰 화면 서류: 용역계약서 · 현장에서 종이로 작성', docLine.startsWith('용역계약서') && docLine.includes('현장에서 종이로 작성'), docLine)

  // 관리자 화면
  const a = await pg(A)
  await a.goto(`${D}/admin/jobs/${JX}`)
  await a.waitForLoadState('networkidle')
  ok('관리자 의뢰 화면: 📝 용역계약서 종이 · 받음', await see(a, /📝 용역계약서 종이 · 받음/))
  await a.goto(`${D}/admin/jobs/${JX}?tab=docs`)
  await a.waitForLoadState('networkidle')
  ok('관리자 서류 탭: 📝 용역계약서 · 종이(서면)로 받기', await see(a, '📝 용역계약서 · 종이(서면)로 받기'))
  ok('관리자 서류 탭: 근로기준법 안내 대신 용역계약 안내', (await see(a, '용역계약서는 일을 시작하기 전에')) && !(await see(a, '근로기준법 제17조', 800)))
  await a.goto(`${D}/admin`)
  await a.waitForLoadState('networkidle')
  ok('대시보드 확인할 일: 용역계약서 미수령', await see(a, '용역계약서 미수령 · 개막식 음향 감독'))

  // 아르바이트 공고는 그대로 근로계약서
  await rest(`jobs?id=eq.${J}`, 'PATCH', { contract_method: 'paper' })
  await a.goto(`${D}/admin/jobs/${J}?tab=docs`)
  await a.waitForLoadState('networkidle')
  ok('알바 공고 서류 탭: 근로계약서 그대로', await see(a, '📝 근로계약서 · 종이(서면)로 받기'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
