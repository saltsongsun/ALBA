// 전문가 화면 문구: 의뢰 지원 '한마디'는 전문가용 예시(경험·장비·포트폴리오), '내 일' 빈 화면은 전문가 의뢰 목록으로
// node scripts/qa/pro-apply-words.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', NW = '44444444-0000-4000-8000-0000000000a1', J = 'cccccccc-0000-4000-8000-000000000003'
const EX = 'eeeeeeee-0000-4000-8000-0000000000e1', JX = 'cccccccc-0000-4000-8000-0000000000e2'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  // 전문가 회원 · 전문가 의뢰 (가짜 DB에 직접)
  const [w] = await rest(`users?id=eq.${W}`)
  // 아직 아무 공고에도 지원하지 않은 아르바이트 회원
  await rest('users', 'POST', { ...w, id: NW, name: '새알바', phone: '01077776666', member_type: 'worker', photo_at: '2026-10-29T00:00:00Z', attendance: [], ratings: [] })
  await rest('users', 'POST', { ...w, id: EX, name: '김음향', phone: '01088887777', member_type: 'expert', specialty: '음향,조명', intro: '공연 음향 7년', photo_at: '2026-10-29T00:00:00Z', attendance: [], ratings: [] })
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: JX, title: '개막식 음향 감독', audience: 'expert', tax_type: 'business', employment_insurance: false, applications: [], required_docs: [], start_date: day(2), end_date: day(2), company: { company_name: '주식회사 테스트' } })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // 전문가: 의뢰 지원 칸
  const ex = await pg(EX)
  await ex.goto(`${D}/jobs/${JX}`)
  await ex.waitForLoadState('networkidle')
  ok('전문가 의뢰: 경력·장비 한마디', await see(ex, '경력·장비 한마디 (선택)'))
  ok('전문가 예시 문구', ((await ex.locator('#message').getAttribute('placeholder')) ?? '').includes('장비 지참'))
  ok('전문가 빠른 문구 (장비·포트폴리오)', (await ex.getByRole('button', { name: '+ 장비 지참 가능' }).count()) === 1 && (await ex.getByRole('button', { name: '+ 포트폴리오 있어요' }).count()) === 1)
  ok('알바용 문구는 없음', (await ex.getByRole('button', { name: '+ 체력 자신 있어요' }).count()) === 0)
  await ex.getByRole('button', { name: '+ 장비 지참 가능' }).click()
  await ex.getByRole('button', { name: '+ 비슷한 행사 경험' }).click()
  ok('누르면 한마디 칸에 들어감', (await ex.locator('#message').inputValue()) === '장비 지참 가능, 비슷한 행사 경험', await ex.locator('#message').inputValue())
  // 전문가: '내 일' 빈 화면
  await ex.goto(`${D}/me`)
  ok('전문가 내 일: 오늘의 일', await see(ex, '오늘의 일'))
  ok('전문가 빈 화면 문구', await see(ex, '오늘 예정된 일이 없어요'))
  ok('전문가: 의뢰 목록으로 가는 링크', (await ex.getByRole('link', { name: '모집 중인 의뢰 보기 →' }).getAttribute('href')) === '/pro')

  // 아르바이트: 그대로
  const ap = await pg(NW)
  await ap.goto(`${D}/jobs/${J}`)
  await ap.waitForLoadState('networkidle')
  ok('알바 공고: 한마디 · 알바 문구 그대로', (await see(ap, '한마디 (선택)')) && (await ap.getByRole('button', { name: '+ 체력 자신 있어요' }).count()) === 1)
  ok('알바 공고: 전문가 문구 없음', (await ap.getByRole('button', { name: '+ 장비 지참 가능' }).count()) === 0)
  await ap.goto(`${D}/me`)
  ok('알바 빈 화면: 모집 중인 알바 보기', (await ap.getByRole('link', { name: '모집 중인 알바 보기 →' }).getAttribute('href')) === '/')
  ok('알바: 오늘의 근무', await see(ap, '오늘의 근무'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
