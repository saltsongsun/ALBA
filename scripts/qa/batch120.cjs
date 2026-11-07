// 묶음 120 (사용자 요청 2026-11-07 "인사이트 보고 개선해줘" — 지난 7일 이용 기록에서 막힌 곳)
// · 근무 시작: 현장 위치 확인에 막힌 근무자가 '근무 시작'만 예닐곱 번씩 누르고 '출근 확인 요청'은 거의 안 누름
//   → 두 번 연달아 막히면 큰 버튼이 '담당자에게 출근 확인 요청'으로 바뀜 · '위치 다시 확인하고 근무 시작'은 아래 작은 버튼
// · 로그인: 비밀번호가 틀리면 바로 아래 '비밀번호가 기억나지 않나요? 담당자에게 초기화 요청 · 고객센터 전화하기'
// · 채팅 말풍선: 휴대폰에서 짧게 두 번 톡톡 누르면 '꾹 누르면 복사·삭제 메뉴가 열려요'
// node scripts/qa/batch120.cjs <default 앱> <default 가짜> <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, F, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (base, p, method = 'GET', body) => fetch(`${base}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)) } return null }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (base, uid, extra = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...extra })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 근무 시작: 위치에 두 번 막히면 큰 버튼이 출근 확인 요청으로 (출근 전 · 현장 확인 필요 공고 · 현장에서 먼 곳) ──
  await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { gps_required: true, lat: 37.5, lng: 127.0 })
  const w = await pg(F, W, { geolocation: { latitude: 35.1, longitude: 129.0 }, permissions: ['geolocation'] })
  await w.goto(`${F}/me`)
  const main = w.locator('#today-work button[data-track]').first()
  await main.waitFor({ timeout: 15000 }).catch(() => {})
  ok("준비: 출근 전 '근무 시작'", (await main.innerText().catch(() => '')).includes('근무 시작'), await main.innerText().catch(() => ''))
  await main.click()
  await until(async () => (await w.locator('[data-arrive-ask]').count()) > 0)
  ok("한 번 막힘: 큰 버튼은 그대로 '근무 시작' + 아래 '출근 확인 요청' 칸", (await w.locator('[data-arrive-ask]').count()) === 1 && (await w.locator('[data-clock-stuck]').count()) === 0 && (await main.innerText()).includes('근무 시작'))
  await main.click()
  const stuck = w.locator('[data-clock-stuck]')
  await until(async () => (await stuck.count()) > 0)
  const big = stuck.locator('button[data-track="출근 확인 요청"]')
  ok("두 번 막힘: 큰 버튼이 '담당자에게 출근 확인 요청' (따로 있던 요청 칸은 없앰)", (await big.innerText().catch(() => '')).includes('담당자에게 출근 확인 요청') && (await w.locator('[data-arrive-ask]').count()) === 0)
  ok("'위치 다시 확인하고 근무 시작'은 아래 작은 버튼", (await stuck.locator('[data-retry-gps]').innerText().catch(() => '')).includes('위치 다시 확인하고 근무 시작'))
  ok('360px: 옆으로 안 밀림 (내 근무)', await wide(w))
  if (SHOTS) await stuck.screenshot({ path: `${SHOTS}/clock-stuck.png` }).catch(() => {})
  const before = (await rest(MF, `messages?thread_user_id=eq.${W}`)).length
  await big.click()
  await until(async () => (await w.locator('[data-arrive-wait]').count()) > 0)
  const after = await rest(MF, `messages?thread_user_id=eq.${W}`)
  ok("누르면 출근 확인 요청이 담당자에게 감 · '기다리는 중'", after.length === before + 1 && (await w.locator('[data-arrive-wait]').count()) === 1)

  // ── 2. 로그인: 비밀번호가 틀리면 바로 아래 도움말 ──
  const g = await pg(D)
  await g.goto(`${D}/login`)
  await g.locator('input[name=phone]').fill('01033334444')
  await g.locator('input[name=pin]').fill('135792')
  await g.getByRole('button', { name: '로그인' }).click()
  const help = g.locator('[data-login-forgot]')
  await help.waitFor({ timeout: 10000 }).catch(() => {})
  const ht = await help.innerText().catch(() => '')
  ok("틀리면 바로 아래 '비밀번호가 기억나지 않나요? … 비밀번호 초기화 …'", ht.includes('비밀번호가 기억나지 않나요?') && ht.includes('비밀번호 초기화'), ht.replace(/\n/g, ' | '))
  const tel = await help.locator('a[href^="tel:"]').getAttribute('href').catch(() => null)
  ok('고객센터 번호가 있으면 전화하기', tel === null || /^tel:\d{9,11}$/.test(tel), String(tel))
  ok('360px: 옆으로 안 밀림 (로그인)', await wide(g))
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/login-forgot.png` })

  // ── 3. 채팅 말풍선: 짧게 두 번 누르면 '꾹 누르면…' ──
  const c = await pg(D, W)
  await c.goto(`${D}/me/chat?co=${C}`)
  const bubble = c.locator('[aria-label^="메시지 메뉴 열기"]').first()
  await bubble.waitFor({ timeout: 15000 }).catch(() => {})
  await bubble.tap()
  await c.waitForTimeout(150)
  await bubble.tap()
  const toast = c.locator('[data-msg-toast]')
  await toast.waitFor({ timeout: 3000 }).catch(() => {})
  ok("말풍선을 짧게 두 번: '꾹 누르면 복사·삭제 메뉴가 열려요'", (await toast.innerText().catch(() => '')).includes('꾹 누르면 복사·삭제 메뉴가 열려요'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
