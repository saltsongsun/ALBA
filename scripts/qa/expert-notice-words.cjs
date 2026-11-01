// 전문가 의뢰 알림 문구: 전문가 화면의 탭 이름('내 일')과 계약서 이름(용역계약서)으로 안내
// node scripts/qa/expert-notice-words.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const EX = 'eeeeeeee-0000-4000-8000-0000000000e5', JX = 'cccccccc-0000-4000-8000-0000000000e5', SVC = 'dddddddd-0000-4000-8000-0000000000e5'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: EX, name: '김음향', phone: '01088885555', member_type: 'expert', attendance: [], ratings: [] })
  await rest('doc_templates', 'POST', { id: SVC, kind: 'service', title: '용역계약서', body: '# 용역계약서\n\n{{근로자명}}', is_default: false, active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: JX, title: '개막식 음향 감독', audience: 'expert', tax_type: 'business', employment_insurance: false, applications: [], required_docs: [SVC], contract_method: 'app', start_date: day(2), end_date: day(2), company: { company_name: '주식회사 테스트' } })
  const msgs = async (prefix) => (await rest('messages')).filter((m) => m.thread_user_id === EX && m.body.startsWith(prefix))

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message))
    return p
  }

  // 전문가가 지원: '내 일'로 안내
  const e = await pg(EX)
  await e.goto(`${D}/jobs/${JX}`)
  await e.getByRole('button', { name: /의뢰 지원하기/ }).click()
  await e.getByRole('button', { name: '한 번 더 누르면 의뢰에 지원돼요' }).click()
  ok('지원 접수 안내: 확정되면 내 일에 표시', await see(e, '확정되면 내 일에 표시됩니다', 15000))

  // (가짜 DB는 화면에서 만든 지원에 회원 정보를 붙여 주지 않으므로 붙여 둠)
  const exUser = (await rest(`users?id=eq.${EX}`))[0]
  await rest(`applications?job_id=eq.${JX}&user_id=eq.${EX}`, 'PATCH', { user: exUser })

  // 관리자가 확정: 전문가에게 '의뢰가 확정됐어요' · '내 일'에서 서명
  const a = await pg(A)
  await a.goto(`${D}/admin/jobs/${JX}?tab=apps`)
  await a.waitForLoadState('networkidle')
  await a.locator('.sm\\:hidden .card', { hasText: '김음향' }).getByRole('button', { name: '확정', exact: true }).click()
  await a.waitForTimeout(2000)
  const ap = await msgs('✅ 의뢰가 확정됐어요')
  ok('확정 알림: ✅ 의뢰가 확정됐어요', ap.length === 1, (await rest('messages')).filter((m) => m.thread_user_id === EX).map((m) => m.body.split('\n')[0]).join(' | '))
  ok("확정 알림: 앱 ‘내 일’에서 서명", ap[0]?.body.includes('‘내 일’에서 서류에 서명'))

  // 종이 계약으로 바꾸고 계약서 안내 보내기: '용역계약서 작성 안내'
  await rest(`jobs?id=eq.${JX}`, 'PATCH', { contract_method: 'paper' })
  await a.goto(`${D}/admin/jobs/${JX}?tab=docs`)
  await a.waitForLoadState('networkidle')
  const nudge = a.getByRole('button', { name: /안 받은 \d+명 앱 안내/ }).first()
  await nudge.click()
  await a.getByRole('button', { name: /명에게 보낼까요/ }).first().click()
  await a.waitForTimeout(2000)
  const cn = await msgs('📝 용역계약서 작성 안내')
  ok('계약서 안내: 📝 용역계약서 작성 안내', cn.length === 1)
  ok('계약서 안내 본문도 용역계약서', cn[0]?.body.includes('용역계약서는 종이로 작성해요') && !cn[0]?.body.includes('근로계약서'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
