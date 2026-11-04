// 관리자 문의함: 근무자의 현장 알림·요청 말풍선에서 처리할 화면(출퇴근·지원자 탭의 그 날짜)으로 바로
// node scripts/qa/chat-actions.cjs <working 앱> <working 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [W_, MW] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const [d0, d1] = [day(0), day(1)]
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})` }
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const post = (body, i) =>
  fetch(`${MW}/rest/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 900 + i, thread_user_id: WK, sender_id: WK, from_admin: false, job_id: J, body, read_at: null, created_at: new Date(Date.now() - (10 - i) * 1000).toISOString(), job: { id: J, title: '행사장 안내 스태프' }, sender: { name: '근무자' }, user: { id: WK, name: '근무자', phone: '01033334444' } }),
  })
;(async () => {
  await post(`🕒 지각 알림\n행사장 안내 스태프 · 약 10분 늦어요 (도착 예정 09:10)`, 1)
  await post(`⚠️ 근무일 취소\n행사장 안내 스태프 · ${fmt(d1)} 근무를 못 하게 됐어요. (남은 근무일: ${fmt(d0)})`, 2)
  await post(`⚠️ 확정 취소\n행사장 안내 스태프 · 근무를 취소했어요.`, 3)
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: W_ }, { name: 'alba_roster', value: roster(uid), url: W_ }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p
  }
  const a = await pg(A)
  await a.goto(`${W_}/admin/chat/${WK}`)
  await a.getByText('약 10분 늦어요').first().waitFor({ timeout: 8000 }).catch(() => {})
  const bubble = (t) => a.locator('li', { hasText: t })
  const hrefIn = (t) => bubble(t).getByRole('link', { name: /처리 →|채우기 →/ }).getAttribute('href').catch(() => null)
  ok('지각 알림 → 오늘 출퇴근 탭', (await hrefIn('약 10분 늦어요')) === `/admin/jobs/${J}?tab=att&date=${d0}`, await hrefIn('약 10분 늦어요'))
  ok('근무일 취소 → 그날 가능한 지원자', (await hrefIn('근무를 못 하게 됐어요')) === `/admin/jobs/${J}?tab=apps&day=${d1}`, await hrefIn('근무를 못 하게 됐어요'))
  ok('확정 취소 → 지원자 탭', (await hrefIn('근무를 취소했어요')) === `/admin/jobs/${J}?tab=apps`, await hrefIn('근무를 취소했어요'))
  ok('일반 문의에는 처리 링크 없음', (await bubble('집결 장소가 어디인가요').getByRole('link', { name: /처리 →|채우기 →/ }).count()) === 0)
  const tag = await bubble('약 10분 늦어요').getByRole('link', { name: /공고 보기/ }).getAttribute('href')
  ok('관리자: 공고 표시는 관리 화면으로', tag === `/admin/jobs/${J}`, tag)
  await bubble('근무를 못 하게 됐어요').getByRole('link', { name: '빈자리 채우기 →' }).click()
  await a.waitForURL(new RegExp(`tab=apps&day=${d1}`)).then(() => ok('누르면 그 화면으로 이동', true), () => ok('누르면 그 화면으로 이동', false, a.url()))

  // 근무자 화면: 처리 링크 없음, 공고 표시는 공고 페이지로
  const w = await pg(WK)
  await w.goto(`${W_}/me/chat?co=99999999-0000-4000-8000-000000000099`)
  await w.getByText('약 10분 늦어요').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('근무자: 처리 링크 없음', (await w.getByRole('link', { name: /처리 →|채우기 →/ }).count()) === 0)
  const wtag = await w.locator('li', { hasText: '약 10분 늦어요' }).getByRole('link', { name: /공고 보기/ }).getAttribute('href')
  ok('근무자: 공고 표시는 공고 페이지로', wtag === `/jobs/${J}`, wtag)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
