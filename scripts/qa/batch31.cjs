// 묶음 31: 새 회사 '시작하기' — 첫 공고를 올리고 아직 지원이 없으면 공고 모음 링크를 대시보드에서 바로 복사·공유
//          관리자 빈 화면은 해요체 + 다음 할 일
// node scripts/qa/batch31.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', J2 = 'cccccccc-0000-4000-8000-0000000000f2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 6000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

;(async () => {
  // 막 가입한 회사2 (대표 A2 혼자, 공고·지원 없음)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null, company_address: null, verified: false, created_at: '2026-11-01T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '이대표', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A2), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const share = p.locator('[data-start-share]')

  // 1) 공고가 아직 없으면 링크 칸 없음 (먼저 공고부터)
  await p.goto(`${D}/admin`)
  await p.locator('[data-start-steps]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('공고가 없으면 링크 칸 없음', (await share.count()) === 0)
  ok('빈 화면: 오늘 행사 없음 → 공고 보기 (해요체)', (await see(p, '오늘 진행하는 행사가 없어요')) && (await see(p, '공고 보기 →')))
  ok('빈 화면: 확정 대기 없음 → 링크 공유하기', (await see(p, '확정을 기다리는 지원자가 없어요')) && (await see(p, '공고 모음 링크 공유하기 →')))
  ok("예전 '~습니다' 문구 없음", !(await see(p, /없습니다/, 800)))

  // 2) 첫 공고를 올리면: 시작하기 안에 링크 복사·공유
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: '새내기행사' }, title: '가을 축제 안내', applications: [], required_docs: [] })
  await p.reload()
  await share.waitFor({ timeout: 10000 }).catch(() => {})
  ok('첫 공고 뒤: 시작하기 안에 링크 칸', (await share.count()) === 1 && (await p.locator('[data-start-steps] [data-start-share]').count()) === 1)
  await share.getByRole('button', { name: '링크 복사' }).click()
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok('링크 복사: 우리 회사 공고 모음 주소', clip.endsWith(`/?co=${C2}`), clip)
  ok('복사됨 ✓ 표시', await see(p, '복사됨 ✓', 2000))
  ok('공유하기 버튼', (await share.getByRole('button', { name: '공유하기' }).count()) === 1)
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // 3) 지원이 들어오면 링크 칸은 사라짐 (근무자 모으기 완료)
  const [ap] = await rest(`applications?job_id=eq.${J}`)
  await rest('applications', 'POST', { ...ap, id: '11111111-0000-4000-8000-0000000000f2', job_id: J2, company_id: C2, user_id: W, status: 'applied' })
  await p.reload()
  await p.locator('h1', { hasText: '현황' }).waitFor({ timeout: 10000 }).catch(() => {})
  ok('지원이 들어오면 링크 칸 사라짐', (await share.count()) === 0)

  // 4) 관리자 문의함 빈 화면 해요체
  await p.goto(`${D}/admin/chat`)
  ok('문의함 빈 화면: 해요체', (await see(p, '아직 들어온 문의가 없어요')) || (await p.locator('a[href^="/admin/chat/"]').count()) > 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
