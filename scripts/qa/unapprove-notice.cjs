// 확정한 근무자를 '대기로' 되돌리면: 근무자에게 "근무 확정이 취소됐어요" 알림 (확정된 줄 알고 현장에 나오지 않게)
// 이미 끝난 행사를 되돌릴 때는 알림 없음
// node scripts/qa/unapprove-notice.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const NOTE = '↩️ 근무 확정이 취소됐어요'
;(async () => {
  const notes = async () => (await rest('messages')).filter((m) => m.thread_user_id === W && m.body.startsWith(NOTE))
  const appW = (await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`))[0]
  ok('준비: 근무자 확정 상태', appW?.status === 'approved', appW?.status)

  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  const revert = async () => {
    await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
    await p.waitForLoadState('networkidle')
    await p.getByText(/^확정 \d+명$/).first().click().catch(() => {}) // 대기자가 있으면 확정 목록은 접혀 있음
    await p.getByRole('button', { name: '대기로', exact: true }).first().click()
    ok('대기로: 알림 간다고 한 번 더 확인', await see(p, '서명 취소·알림 가요 · 대기로?'))
    await p.getByRole('button', { name: '서명 취소·알림 가요 · 대기로?' }).click()
    await p.waitForTimeout(2000)
  }

  // 오늘 행사: 되돌리면 알림
  await revert()
  ok('대기로 바뀜', (await rest(`applications?id=eq.${appW.id}`))[0]?.status === 'applied')
  const n1 = await notes()
  ok('근무자 문의함에 확정 취소 안내 1건', n1.length === 1, String(n1.length))
  ok('안내에 공고 이름 · 나오지 않아도 된다는 말', n1[0]?.body.includes('경상남도 생활체육대축전') && n1[0]?.body.includes('현장에 나오지 않아도 돼요'))

  // 다시 확정 → 확정 안내
  await rest(`applications?id=eq.${appW.id}`, 'PATCH', { status: 'approved' })

  // 이미 끝난 행사: 되돌려도 알림 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day(-3), end_date: day(-3) })
  await revert()
  ok('끝난 행사도 대기로 바뀜', (await rest(`applications?id=eq.${appW.id}`))[0]?.status === 'applied')
  ok('끝난 행사는 알림 없음', (await notes()).length === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
