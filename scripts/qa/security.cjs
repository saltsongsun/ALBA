// 보안 보강 테스트: 로그인 무차별 대입·계정 존재 숨김·IP 제한·봇 함정·쉬운 비밀번호·헤더
const { chromium, devices } = require('playwright')
const { createHmac, scryptSync, randomBytes } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const hash = (pin) => { const salt = randomBytes(16); return `s1:${salt.toString('base64')}:${scryptSync(pin, salt, 32).toString('base64')}` }
const [B, M] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${M}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const errs = []
;(async () => {
  const b = await chromium.launch()
  const ctxFor = async (ip, uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR', extraHTTPHeaders: { 'x-forwarded-for': ip } })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: B }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 150)))
    return p
  }
  const tryLogin = async (p, phone, pin, honey) => {
    await p.goto(`${B}/login`)
    await p.locator('input[name=phone]').fill(phone)
    await p.locator('input[name=pin]').fill(pin)
    if (honey) await p.locator('input[name=website]').evaluate((el) => (el.value = 'http://spam.example'))
    await p.locator('form button[type=submit]').first().click()
    const msg = p.locator('form [role=status]').first()
    await msg.waitFor({ timeout: 8000 }).catch(() => {})
    return (await msg.textContent().catch(() => '')) ?? ''
  }

  // 1) 같은 계정 5번 틀리면 잠김 + 남은 횟수로 계정 존재를 드러내지 않음
  const p1 = await ctxFor('10.0.0.1')
  const first = await tryLogin(p1, '010-7777-8888', '111111')
  ok('틀린 비밀번호: 횟수 없이 같은 안내', /맞지 않습니다/.test(first) && !/\(\d\/5\)/.test(first), first)
  const unknown = await tryLogin(p1, '010-9999-0000', '111111')
  ok('없는 번호도 똑같은 안내 (가입 여부 숨김)', unknown === first, unknown)
  let last = ''
  for (let i = 0; i < 4; i++) last = await tryLogin(p1, '010-7777-8888', '111111')
  ok('5번째 실패에 잠김 (10분)', /10분 동안 로그인이 잠겼습니다/.test(last), last)
  const u = (await rest(`users?id=eq.${AP}`))[0]
  ok('실패 횟수는 쌓이고 잠금 시각 기록', u.failed_logins === 5 && !!u.locked_until)
  // 잠금이 풀린 뒤 또 5번 틀리면 더 길게
  await rest(`users?id=eq.${AP}`, 'PATCH', { locked_until: new Date(Date.now() - 1000).toISOString() })
  for (let i = 0; i < 5; i++) last = await tryLogin(p1, '010-7777-8888', '111111')
  ok('두 번째 잠금은 30분으로 늘어남', /30분 동안 로그인이 잠겼습니다/.test(last), last)

  // 2) 봇 함정 칸을 채우면 거절 (비밀번호가 맞아도)
  await rest(`users?id=eq.${WK}`, 'PATCH', { pin_hash: hash('738291'), failed_logins: 0, locked_until: null })
  const p2 = await ctxFor('10.0.0.2')
  const honey = await tryLogin(p2, '010-3333-4444', '738291', true)
  ok('봇 함정 칸이 채워지면 로그인 거절', /맞지 않습니다/.test(honey), honey)
  await tryLogin(p2, '010-3333-4444', '738291')
  await p2.waitForURL(/\/me/, { timeout: 8000 }).then(() => ok('사람은 정상 로그인', true), () => ok('사람은 정상 로그인', false, p2.url()))

  // 3) 한 IP에서 여러 계정을 돌아가며 시도하면 IP 단위로 막음
  const p3 = await ctxFor('10.0.0.3')
  for (let i = 0; i < 20; i++) await tryLogin(p3, `010-5555-${String(1000 + i)}`, '111111')
  const blocked = await tryLogin(p3, '010-3333-4444', '738291')
  ok('IP에서 실패 20번 넘으면 맞는 비밀번호도 잠시 막음', /시도가 너무 많아요/.test(blocked), blocked)
  const p4 = await ctxFor('10.0.0.4')
  await tryLogin(p4, '010-3333-4444', '738291')
  await p4.waitForURL(/\/me/, { timeout: 8000 }).then(() => ok('다른 IP의 사람은 영향 없음', true), () => ok('다른 IP의 사람은 영향 없음', false))

  // 4) 비밀번호 바꾸기: 쉬운 번호 거절, 현재 비밀번호 맞혀 보기 제한
  const p5 = await ctxFor('10.0.0.5', WK)
  const changePin = async (cur, next) => {
    await p5.goto(`${B}/me/profile`)
    const f = p5.locator('form', { has: p5.locator('input[name=current]') })
    if (!(await f.locator('input[name=current]').isVisible())) await p5.getByText('비밀번호 변경').first().click()
    await f.locator('input[name=current]').fill(cur)
    await f.locator('input[name=pin]').fill(next)
    await f.locator('input[name=pin2]').fill(next)
    await f.locator('button[type=submit]').click()
    const m = f.locator('[role=status]').first()
    await m.waitFor({ timeout: 8000 }).catch(() => {})
    return (await m.textContent().catch(() => '')) ?? ''
  }
  ok('쉬운 새 비밀번호(123456) 거절', /연속된 숫자/.test(await changePin('738291', '123456')))
  ok('생년월일 비밀번호(900101) 거절', /생년월일/.test(await changePin('738291', '900101')))
  for (let i = 0; i < 5; i++) await changePin('000999', '583920')
  ok('현재 비밀번호 5번 틀리면 15분 막음', /여러 번 틀렸어요/.test(await changePin('738291', '583920')))

  // 5) 보안 헤더·로봇 차단
  const h = (await fetch(`${B}/`)).headers
  ok('HSTS', /max-age=\d+/.test(h.get('strict-transport-security') ?? ''))
  ok('CSP: 다른 사이트에 끼워 넣기·폼 가로채기 막음', /frame-ancestors 'none'/.test(h.get('content-security-policy') ?? '') && /form-action 'self'/.test(h.get('content-security-policy') ?? ''))
  ok('공개 공고 화면은 검색 허용', !(h.get('x-robots-tag') ?? ''))
  const ha = (await fetch(`${B}/admin`, { redirect: 'manual' })).headers
  ok('관리자 화면은 로봇 수집 금지', /noindex/.test(ha.get('x-robots-tag') ?? ''))
  const robots = await (await fetch(`${B}/robots.txt`)).text()
  ok('robots.txt에 개인정보 화면 차단', /Disallow: \/admin/.test(robots) && /Disallow: \/me/.test(robots))
  const cron = await fetch(`${B}/api/cron/remind`, { headers: { 'user-agent': 'vercel-cron/1.0' } })
  ok('전날 안내: 비밀값 없으면 거절', cron.status === 401)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
