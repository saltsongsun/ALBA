// 묶음 235 (정기 개선 2026-11-13 14:35 KST)
// · 대기 지원자의 남은 근무일이 오늘뿐인데 오늘 근무가 이미 시작함 (대시보드 대기 카드 · 지원자 탭 카드)
//   '⏰ 오늘 00:00에 이미 시작했어요 · 확정 전에 전화로 확인' 주황 한 줄 · 확정은 한 번 더 ('이미 시작 · 확정?')
//   여러 명 골라 확정해도 '이미 시작 n명 · 확정?' · 겹침·인원·주휴처럼 다른 까닭이 있으면 확인 문구는 그쪽 (주황 줄은 그대로)
//   아직 시작 전이거나 내일 근무도 남았으면 표시 없음 · 한 번에 확정 (지원 날짜는 지금 공고 날짜 안의 것만 봄)
// · 디자인: 카드가 '전화로 확인'을 권할 때는 전화 버튼이 꽉 찬 초록 (다음에 누를 곳이 바로 보이게 · 처음 한 번 톡)
// node scripts/qa/batch235.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const LINE = '⏰ 오늘 00:00에 이미 시작했어요 · 확정 전에 전화로 확인'

;(async () => {
  const now = new Date(Date.now() + 9 * 3600e3)
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  // 오늘 23:58 넘으면 '근무 중' 시간이 거의 없어 생략 (근무 끝 23:59)
  if (mins >= 23 * 60 + 57) { console.log('SKIP  23:57 넘어 확인 생략'); console.log('ALL PASSED'); process.exit(0) }
  const today = kst(0)
  const status = async () => (await rest(`applications?id=eq.${APP}`))?.[0]?.status
  const reset = () => rest(`applications?id=eq.${APP}`, 'PATCH', { status: 'applied', available_dates: [today], held_at: null })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const card = a.locator('#pending .card', { has: a.locator('[data-dash-decide]') }).first()
  const dash = async () => { await a.goto(`${D}/admin`); await card.waitFor({ timeout: 15000 }).catch(() => {}) }
  const appsCard = () => a.locator('[data-app-started]').first().locator('xpath=ancestor::div[.//button[@data-confirm or normalize-space()="확정"]][1]')
  const openApps = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=apps`); await a.getByText(/확정 \d+ \/ 모집/).first().waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 대시보드: 오늘(마지막 날) 00:00 시작 · 23:59 끝 · 지원 날짜 오늘뿐 → 이미 시작
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await reset()
  await dash()
  const warn = card.locator('[data-pending-started]')
  ok(`대기 카드에 '${LINE}'`, one(await warn.innerText().catch(() => '')) === LINE, one(await warn.innerText().catch(() => '')))
  const fit = await warn.evaluate((el) => ({ cut: el.scrollWidth > el.clientWidth + 1, h: Math.round(el.getBoundingClientRect().height) })).catch(() => ({}))
  ok('주황 줄은 한 줄 · 잘리지 않음 · 360px 옆으로 안 밀림', fit.cut === false && fit.h < 30 && (await noSide(a)), JSON.stringify(fit))
  const call = card.locator('a[href^="tel:"]').first()
  ok("전화 버튼이 꽉 찬 초록 ('전화로 확인'할 곳이 바로 보임)", (await call.getAttribute('data-call-urgent')) === '' && ((await call.getAttribute('class')) ?? '').includes('bg-emerald-600'))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/started-pending.png` }).catch(() => {})
  const approve = card.locator('[data-dash-decide] form').first().locator('button')
  await approve.click()
  await a.waitForTimeout(300)
  ok("확정 첫 누름: '이미 시작 · 확정?' (아직 대기)", one(await approve.innerText()) === '이미 시작 · 확정?' && (await status()) === 'applied', one(await approve.innerText()))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/started-armed.png` }).catch(() => {})
  await approve.click()
  let st = 'applied'
  for (let i = 0; i < 20 && st === 'applied'; i++) { await a.waitForTimeout(300); st = await status() }
  ok('한 번 더 누르면 확정됨', st === 'approved', st)

  // 여러 명 골라 확정: '이미 시작 2명 · 확정?'
  await reset()
  const [ap] = await rest(`applications?id=eq.${APP}`)
  const AP2 = '11111111-0000-4000-8000-000000002350', U2 = 'bbbbbbbb-0000-4000-8000-000000002350'
  await rest('applications', 'POST', { ...ap, id: AP2, user_id: U2, user: { ...ap.user, id: U2, name: '대기둘', phone: '01023500002' }, status: 'applied', held_at: null, available_dates: [today], created_at: new Date().toISOString() })
  await dash()
  const boxes = a.locator('#pending input[name=app]:visible')
  await boxes.first().waitFor({ timeout: 15000 }).catch(() => {})
  const warns = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute('data-warn')))
  ok("고르기 칸에 '이미 시작' 까닭", warns.length >= 2 && warns.every((w) => w === '이미 시작'), JSON.stringify(warns))
  for (const box of await boxes.all()) await box.check()
  const bar = a.locator('[data-bulk-bar]')
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  await a.waitForTimeout(350)
  const go = bar.locator('button[data-confirm]').last()
  await go.click()
  await a.waitForTimeout(300)
  ok("여러 명 확정: '이미 시작 2명 · 확정?' (아직 대기)", one(await go.innerText()).includes('이미 시작 2명 · 확정?') && (await status()) === 'applied', one(await go.innerText()))
  await rest(`applications?id=eq.${AP2}`, 'PATCH', { status: 'cancelled' })

  // ── 2. 지원자 탭 카드: 같은 줄 · 같은 확인
  await reset()
  await openApps()
  const appWarn = a.locator('[data-app-started]').first()
  ok(`지원자 카드에 '${LINE}'`, one(await appWarn.innerText().catch(() => '')) === LINE, one(await appWarn.innerText().catch(() => '')))
  const ac = appsCard()
  ok('지원자 카드 전화 버튼도 꽉 찬 초록', (await ac.locator('a[href^="tel:"][data-call-urgent]').count()) === 1)
  const appBtn = ac.locator('button[data-confirm]').first()
  await appBtn.click()
  await a.waitForTimeout(300)
  ok("지원자 탭 확정 첫 누름: '이미 시작 · 확정?' (아직 대기)", one(await appBtn.innerText()) === '이미 시작 · 확정?' && (await status()) === 'applied', one(await appBtn.innerText()))
  ok('360px 옆으로 안 밀림 (지원자 탭)', await noSide(a))
  if (SHOTS) await ac.screenshot({ path: `${SHOTS}/started-apps.png` }).catch(() => {})

  // ── 3. 내일 근무도 남음 (오늘~내일 · 지원 날짜 전체): 표시 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: kst(1) })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { available_dates: null })
  await dash()
  ok('내일 근무도 남은 지원자: 주황 줄·초록 전화 없음', (await card.locator('[data-pending-started]').count()) === 0 && (await card.locator('[data-call-urgent]').count()) === 0)

  // 행사 날짜가 내일로 바뀜 (지원 날짜는 오늘로 남음): 지금 공고 날짜만 보므로 표시 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(1), end_date: kst(1) })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { available_dates: [today] })
  await dash()
  ok('행사가 내일로 바뀐 지원자 (지원 날짜는 오늘): 표시 없음', (await card.locator('[data-pending-started]').count()) === 0 && (await card.locator('[data-call-urgent]').count()) === 0)

  // ── 4. 아직 시작 전 (오늘 23:58 시작): 표시 없음 · 한 번에 확정
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '23:58:00', end_time: '23:59:00' })
  await reset()
  await dash()
  ok('시작 전: 주황 줄·초록 전화 없음', (await card.locator('[data-pending-started]').count()) === 0 && (await card.locator('[data-call-urgent]').count()) === 0)
  const first = card.locator('[data-dash-decide] form').first().locator('button')
  await first.click()
  st = 'applied'
  for (let i = 0; i < 20 && st === 'applied'; i++) { await a.waitForTimeout(300); st = await status() }
  ok('시작 전: 한 번 누르면 바로 확정', st === 'approved', st)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
