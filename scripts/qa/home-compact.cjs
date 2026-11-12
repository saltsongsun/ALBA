// 로그인한 근무자 첫 화면: 큰 소개 배너 대신 한 줄 인사 + 내 근무 현황 → 공고 목록이 첫 화면에 보임
// node scripts/qa/home-compact.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const b = await chromium.launch()
  const errs = []
  const open = async (uid) => {
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: devices['Galaxy S9+'].userAgent })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('alba_install_hide_until', String(Date.now() + 86400000)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(`${D}/`)
    await p.waitForLoadState('networkidle')
    return p
  }
  const listTop = async (p) => (await p.locator('#jobs').boundingBox())?.y ?? 9999

  // 오늘 확정 근무가 있는 근무자
  const w = await open(W)
  ok('근무자: 소개 배너 없음', !(await see(w, '지원부터 정산까지', 800)))
  ok('근무자: 한 줄 인사', await see(w, '근무자님, 안녕하세요'))
  // (서명이 남았으면 같은 카드가 '출퇴근 전 서명이 남았어요' · 묶음 97)
  ok('오늘 근무 카드는 그대로', await see(w, /오늘 근무가 있어요|서명이 남았어요|지금 근무 중이에요|근무 종료를 아직 안 눌렀어요|서명·근무 종료가 남았어요/))
  ok('다른 근무가 없으면 지원 안내', await see(w, '함께하고 싶은 공고를 골라 지원해 보세요'))
  const y1 = await listTop(w)
  ok('공고 목록이 첫 화면에 보임', y1 < 740, `y=${Math.round(y1)}`)
  await w.getByRole('link', { name: /안녕하세요/ }).click()
  await w.waitForURL(/\/me$/, { timeout: 10000 }).catch(() => {})
  ok('인사 줄을 누르면 내 근무로', new URL(w.url()).pathname === '/me', w.url())

  // 확정을 기다리는 지원자
  const a = await open(AP)
  ok('대기 지원자: 확정 대기 건수', await see(a, '확정 대기 1건'))
  ok('대기 지원자: 공고 목록이 첫 화면에', (await listTop(a)) < 740)

  // 로그인 전: 소개 배너와 가입 버튼 그대로
  const n = await open(null)
  ok('로그인 전: 소개 배너', await see(n, '지원부터 정산까지'))
  ok('로그인 전: 간편 가입 버튼', await n.getByRole('link', { name: '간편 가입' }).isVisible())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
