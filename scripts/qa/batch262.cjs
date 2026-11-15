// 묶음 262 (정기 개선 2026-11-15 13:35 KST)
// · 근무자 홈 오늘 근무 카드: 공고에 적힌 휴게·식사를 바로 ('휴게 12:00~13:00 점심' · '식사 점심 도시락 제공')
//   (근무자 문의에 '쉬는 시간이 언제인가요?'가 많음 — 공고까지 안 들어가도 보이게 · 담당자가 적은 그대로, 계산하지 않음)
//   근무 중이고 지금이 휴게 시간이면 '지금 휴게 시간 · 13:00까지' (초록 점 · 움직임 줄이기면 멈춤) · 근무 중이 아니면 그냥 휴게 줄
// · 다음 근무 큰 카드에도 휴게·식사 한 줄씩 · 조건이 없으면 줄 없음
// node scripts/qa/batch262.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kstHM = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const setJob = async (patch) => {
  await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
  for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
}

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async () => { await p.goto(`${D}/me`, { waitUntil: 'networkidle' }) }

  // ── 1. 근무 중 · 휴게 시간이 아닐 때: 공고에 적힌 그대로
  const now = Date.now()
  const later = { s: kstHM(now + 3 * 3600e3), e: kstHM(now + 4 * 3600e3) }
  const crosses = kstDay(now + 4 * 3600e3) !== kstDay(now) || later.s > later.e
  const brkLater = crosses ? '00:01~00:02 점심' : `${later.s}~${later.e} 점심`
  await setJob({ conditions: [{ label: '휴게 시간', value: brkLater }, { label: '식사', value: '점심 도시락 제공' }] })
  await open()
  const brk = p.locator('[data-break]').first()
  await brk.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`오늘 근무 카드: '휴게 ${brkLater}' · '식사 점심 도시락 제공'`, one(await brk.textContent().catch(() => '')) === `휴게 ${brkLater}` && one(await p.locator('[data-meal]').first().textContent().catch(() => '')) === '식사 점심 도시락 제공', one(await brk.textContent().catch(() => '')))
  ok('휴게 시간이 아니면 지금 휴게 표시 없음', (await p.locator('[data-break-now]').count()) === 0)
  const hs = await p.locator('[data-break], [data-meal]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  ok('줄마다 한 줄 · 360px 옆으로 안 밀림', hs.length >= 2 && hs.every((h) => h < 24) && (await noSide(p)), JSON.stringify(hs))

  // ── 2. 근무 중 · 지금 휴게 시간: '지금 휴게 시간 · HH:MM까지'
  const win = { s: kstHM(now - 10 * 60e3), e: kstHM(now + 20 * 60e3) }
  if (win.s < win.e && kstDay(now - 10 * 60e3) === kstDay(now + 20 * 60e3)) {
    await setJob({ conditions: [{ label: '휴게 시간', value: `${win.s}~${win.e} 점심` }, { label: '식사', value: '점심 도시락 제공' }] })
    await open()
    const nowLi = p.locator('[data-break-now]').first()
    await nowLi.waitFor({ timeout: 15000 }).catch(() => {})
    ok(`지금 휴게 시간: '지금 휴게 시간 · ${win.e}까지' (초록 점 깜빡)`, one(await nowLi.textContent().catch(() => '')) === `지금 휴게 시간 · ${win.e}까지` && ((await nowLi.locator('span').first().getAttribute('class')) ?? '').includes('animate-pulse'), one(await nowLi.textContent().catch(() => '')))
    if (SHOTS) {
      await nowLi.evaluate((el) => el.closest('.card')?.scrollIntoView({ block: 'start' }))
      await p.waitForTimeout(400)
      const bx = await nowLi.evaluate((el) => { const u = el.closest('ul').getBoundingClientRect(); return { y: u.y, h: u.height } })
      await p.screenshot({ path: `${SHOTS}/today-break-now.png`, clip: { x: 0, y: Math.max(0, bx.y - 150), width: 360, height: Math.min(330, bx.h + 190) } }).catch(() => {})
    }
    // 근무를 마쳤으면 (근무 중 아님) 그냥 휴게 줄
    await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { clock_out: new Date().toISOString() })
    await open()
    ok('근무 중이 아니면 지금 휴게 표시 대신 그냥 휴게 줄', (await p.locator('[data-break-now]').count()) === 0 && (await p.locator('[data-break]').count()) >= 1)
  } else {
    console.log('SKIP  지금 휴게 시간 (자정 무렵이라 건너뜀)')
  }

  // ── 3. 조건이 없으면 줄 없음
  await setJob({ conditions: [] })
  await open()
  ok('휴게·식사 조건이 없으면 줄 없음', (await p.locator('[data-break], [data-break-now], [data-meal]').count()) === 0)

  // ── 4. 다음 근무 큰 카드 (오늘 근무가 없는 날)
  const tmr = kstDay(now + 864e5)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await setJob({ start_date: tmr, end_date: tmr, conditions: [{ label: '쉬는 시간', value: '12:30~13:30' }, { label: '점심', value: '도시락 제공' }] })
  await open()
  const hero = p.locator('[data-next-work]')
  await hero.waitFor({ timeout: 15000 }).catch(() => {})
  ok("다음 근무 카드: '휴게 12:30~13:30' · '식사 도시락 제공'", one(await hero.locator('[data-next-break]').textContent().catch(() => '')) === '휴게 12:30~13:30' && one(await hero.locator('[data-next-meal]').textContent().catch(() => '')) === '식사 도시락 제공')
  if (SHOTS) {
    await hero.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await p.waitForTimeout(400)
    await hero.screenshot({ path: `${SHOTS}/next-break-meal.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
