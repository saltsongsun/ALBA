// 내 근무 화면 순서: 근무 날에는 '오늘의 근무'(출퇴근 버튼)가 계좌·사진 등록 안내보다 먼저, 근무 없는 날은 안내가 먼저
// node scripts/qa/me-order.cjs <working 앱> <working 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', NW = '44444444-0000-4000-8000-0000000000b1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
;(async () => {
  // 아직 지원·근무가 없는 회원 (사진 없음)
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: NW, name: '새회원', phone: '01077775555', photo_at: null, attendance: [], ratings: [] })
  await rest(`users?id=eq.${W}`, 'PATCH', { photo_at: null, bank_account_enc: null })

  const b = await chromium.launch()
  const errs = []
  const open = async (uid) => {
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: devices['Galaxy S9+'].userAgent })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('alba_install_hide_until', String(Date.now() + 86400000)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(`${D}/me`)
    await p.waitForLoadState('networkidle')
    return p
  }
  const y = async (p, t) => (await p.getByText(t, { exact: true }).first().boundingBox())?.y ?? -1

  // 근무 중인 날
  const p = await open(W)
  const today = await y(p, '오늘의 근무'), acct = await y(p, '급여 계좌를 등록해 주세요'), photo = await y(p, '얼굴 사진을 올려 주세요')
  ok('근무 날: 계좌·사진 안내가 보임', acct > 0 && photo > 0, `${acct}/${photo}`)
  ok('근무 날: 오늘의 근무가 안내보다 위', today > 0 && today < acct && today < photo, `${today} < ${acct}, ${photo}`)
  const btn = await p.getByRole('button', { name: '근무 종료' }).boundingBox()
  ok('근무 종료 버튼이 계좌 안내보다 위', !!btn && btn.y < acct, `${btn?.y} < ${acct}`)

  // 근무 없는 날
  const n = await open(NW)
  const t2 = await y(n, '오늘의 근무'), ph2 = await y(n, '얼굴 사진을 올려 주세요')
  ok('근무 없는 날: 사진 안내가 오늘의 근무보다 위', ph2 > 0 && t2 > 0 && ph2 < t2, `${ph2} < ${t2}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
