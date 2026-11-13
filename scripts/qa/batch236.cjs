// 묶음 236 (정기 개선 2026-11-13 16:39 KST)
// · 오늘 근무가 이미 시작한 뒤 확정된 사람(오늘 날짜에 지원): 확정 알림 맨 앞에
//   '⏰ 오늘 근무는 00:00에 이미 시작했어요. 아직 현장이 아니면 바로 와 주시고 ‘내 근무’에서 도착 시간을 알려 주세요.'
//   시작 전 확정·내일 근무는 전과 같은 알림
// · 내 근무 카드: 시작 뒤에 확정됐으면 빨간 '시작 · n시간 지났어요' 대신 차분한 '00:00 시작 뒤에 확정됐어요 · 오는 중이면 도착 시간을 알려 주세요'
//   '가는 중이에요 · 도착 시간 알리기' 버튼을 눈에 띄게 (확정 알림이 가리키는 곳) · 원래 확정돼 있던 사람은 그대로 빨강
// node scripts/qa/batch236.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003', APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const LINE = '⏰ 오늘 근무는 00:00에 이미 시작했어요. 아직 현장이 아니면 바로 와 주시고 ‘내 근무’에서 도착 시간을 알려 주세요.'

;(async () => {
  const now = new Date(Date.now() + 9 * 3600e3)
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  if (mins >= 23 * 60 + 57) { console.log('SKIP  23:57 넘어 확인 생략'); console.log('ALL PASSED'); process.exit(0) }
  const today = kst(0)
  const status = async () => (await rest(`applications?id=eq.${APP}`))?.[0]?.status
  // 이 사람에게 온 확정 알림 (가짜 DB는 정렬을 안 해서 직접 고름)
  const approvedMsgs = async () => ((await rest(`messages?thread_user_id=eq.${AP}`)) ?? []).filter((m) => m.from_admin && String(m.body).startsWith('✅ 근무가 확정됐어요'))

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 오늘 00:00 시작(23:59 끝) 근무에 지금 확정 → 알림 맨 앞에 '이미 시작' 줄
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { status: 'applied', available_dates: [today], held_at: null, decided_at: null })
  const before = (await approvedMsgs()).length
  const a = await mk(A)
  await a.goto(`${D}/admin`)
  const card = a.locator('#pending .card', { has: a.locator('[data-dash-decide]') }).first()
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const approve = card.locator('[data-dash-decide] form').first().locator('button')
  await approve.click()
  await a.waitForTimeout(300)
  await approve.click()
  let st = 'applied'
  for (let i = 0; i < 25 && st !== 'approved'; i++) { await a.waitForTimeout(300); st = await status() }
  ok('대시보드에서 두 번 눌러 확정됨', st === 'approved', st)
  let msgs = []
  for (let i = 0; i < 15 && msgs.length <= before; i++) { await a.waitForTimeout(300); msgs = await approvedMsgs() }
  const lines = String(msgs.at(-1)?.body ?? '').split('\n')
  ok(`확정 알림 둘째 줄(제목 다음): '${LINE}'`, msgs.length === before + 1 && lines[1] === LINE, lines.slice(0, 2).join(' / '))

  // ── 2. 근무자 내 근무: 차분한 안내 + 눈에 띄는 '도착 시간 알리기'
  const w = await mk(AP)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const late = w.locator('[data-start-late]').first()
  await late.waitFor({ timeout: 15000 }).catch(() => {})
  ok("빨간 '지났어요' 대신 '00:00 시작 뒤에 확정됐어요 · 오는 중이면 도착 시간을 알려 주세요'", (await late.getAttribute('data-start-late')) === 'after-confirm' && one(await late.innerText()) === '⏰ 00:00 시작 뒤에 확정됐어요 오는 중이면 도착 시간을 알려 주세요' && ((await late.getAttribute('class')) ?? '').includes('bg-amber-50'), one(await late.innerText().catch(() => '')))
  const fit = await late.evaluate((el) => [...el.querySelectorAll('b, span.block')].map((x) => Math.round(x.getBoundingClientRect().height)))
  ok('두 줄 모두 한 줄씩 (360px)', fit.length === 2 && fit.every((h) => h <= 22), JSON.stringify(fit))
  const lateBtn = w.locator('[data-late-open]').first()
  ok("'가는 중이에요 · 도착 시간 알리기'가 눈에 띄게 (주황 테두리)", (await lateBtn.getAttribute('data-late-stress')) === '' && ((await lateBtn.getAttribute('class')) ?? '').includes('ring-amber-300') && one(await lateBtn.innerText()).includes('가는 중이에요 · 도착 시간 알리기'))
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
  if (SHOTS) {
    const bx = await w.locator('[data-start-late]').first().locator('xpath=ancestor::div[contains(@class,"card")][1]').boundingBox().catch(() => null)
    if (bx) await w.screenshot({ path: `${SHOTS}/late-confirmed-me.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(bx.height + 16, 720) } }).catch(() => {})
  }
  await lateBtn.click()
  ok("누르면 '언제쯤 도착해요?' 고르기", await w.getByText('언제쯤 도착해요?').first().waitFor({ timeout: 5000 }).then(() => true, () => false))

  // ── 3. 시작 전에 확정돼 있던 사람: 그대로 빨간 '시작 · n 지났어요' · 버튼은 회색
  await rest(`applications?id=eq.${APP}`, 'PATCH', { decided_at: new Date(Date.now() - 2 * 86400e3).toISOString() })
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const late2 = w.locator('[data-start-late]').first()
  await late2.waitFor({ timeout: 15000 }).catch(() => {})
  ok("미리 확정된 사람: 빨간 '00:00 시작 · … 지났어요' 그대로", (await late2.getAttribute('data-start-late')) !== 'after-confirm' && one(await late2.innerText()).startsWith('⚠️ 00:00 시작 ·') && ((await late2.getAttribute('class')) ?? '').includes('bg-rose-50'), one(await late2.innerText().catch(() => '')))
  ok("미리 확정된 사람: '도착 시간 알리기'는 회색 그대로", (await w.locator('[data-late-stress]').count()) === 0 && ((await w.locator('[data-late-open]').first().getAttribute('class')) ?? '').includes('btn-gray'))

  // ── 4. 내일 근무에 확정: 알림에 '이미 시작' 줄 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(1), end_date: kst(1), start_time: '09:00:00', end_time: '18:00:00' })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { status: 'applied', available_dates: [kst(1)], decided_at: null })
  const before2 = (await approvedMsgs()).length
  await a.goto(`${D}/admin`)
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  await card.locator('[data-dash-decide] form').first().locator('button').click()
  st = 'applied'
  for (let i = 0; i < 25 && st !== 'approved'; i++) { await a.waitForTimeout(300); st = await status() }
  msgs = []
  for (let i = 0; i < 15 && msgs.length <= before2; i++) { await a.waitForTimeout(300); msgs = await approvedMsgs() }
  const body2 = String(msgs.at(-1)?.body ?? '')
  ok("내일 근무 확정: 한 번에 확정 · 알림에 '이미 시작' 줄 없음 (둘째 줄은 공고 제목)", st === 'approved' && msgs.length === before2 + 1 && !body2.includes('이미 시작했어요') && body2.split('\n')[1]?.includes('행사장 안내 스태프'), body2.split('\n').slice(0, 2).join(' / '))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
