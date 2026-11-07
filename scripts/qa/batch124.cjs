// 묶음 124 (정기 개선 2026-11-07 16:35 · 이용 기록: '오늘의 근무' 카드 제목을 여러 번 누름 · 시각 정정에서 '아직 오지 않은 시각이에요'를 보낸 뒤에야 봄)
// · 내 근무 '오늘의 근무' 카드 제목을 누르면 공고로 (다음 근무 카드와 같게, 제목 옆 ›)
// · 시각 정정 요청: 고르는 대로 바로 확인 — 아직 오지 않은 시각·종료보다 늦은 출근은 노란 알림 + 보내기 막힘,
//   기록된 시각 그대로면 '실제 시각으로 바꿔 주세요' (조용한 안내 · 보내기 막힘)
// node scripts/qa/batch124.cjs <working 앱> <working 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString()
const today = kst(Date.now()).slice(0, 10)
const hm = (ms) => kst(ms).slice(11, 16)
const minute = (ms) => Math.floor(ms / 60e3) * 60e3
const midnight = Date.parse(`${today}T00:00:00+09:00`)
const now = minute(Date.now())
const inT = Math.max(midnight + 60e3, now - 120 * 60e3)
const outT = minute(inT + (now - inT) / 3)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  if (now - inT < 6 * 60e3) { console.log('SKIP  자정 직후라 시각을 고를 수 없음'); console.log('ALL PASSED'); process.exit(0) }
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`attendance?job_id=eq.${J}`, 'PATCH', { work_date: today, clock_in: new Date(inT).toISOString(), clock_out: new Date(outT).toISOString(), adj_in: null, adj_out: null, note: null, paid: false })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wide = () => w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 오늘의 근무 카드 제목 → 공고 ──
  await w.goto(`${D}/me`)
  const title = w.locator('#today-work [data-today-title]').first()
  await title.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'오늘의 근무' 제목이 공고 링크 (제목 옆 ›)", (await title.getAttribute('href').catch(() => '')) === `/jobs/${J}` && (await title.innerText().catch(() => '')).trim().endsWith('›'))
  ok('360px: 옆으로 안 밀림 (내 근무)', await wide())
  await title.click()
  await w.waitForURL((u) => new URL(u).pathname === `/jobs/${J}`, { timeout: 10000 }).catch(() => {})
  ok('누르면 공고 화면', new URL(w.url()).pathname === `/jobs/${J}`, w.url())

  // ── 2. 시각 정정: 고르는 대로 바로 확인 ──
  await w.goto(`${D}/me`)
  await w.getByRole('button', { name: '시각이 잘못 찍혔나요? 정정 요청' }).click()
  const send = w.getByRole('button', { name: '정정 요청 보내기' })
  const hint = w.locator('[data-fix-hint]')
  await hint.waitFor({ timeout: 5000 }).catch(() => {})
  ok("처음엔 기록된 시각 그대로: '실제 시각으로 바꿔 주세요' (조용한 안내) · 보내기 막힘", (await hint.getAttribute('data-fix-hint')) === 'note' && (await hint.innerText()).includes('실제 시각으로 바꿔 주세요') && (await send.isDisabled()))
  const later = now + 30 * 60e3
  if (kst(later).slice(0, 10) === today) {
    await w.locator('input[name=time]').fill(hm(later))
    await w.waitForTimeout(150)
    ok("아직 오지 않은 시각: 노란 알림 '아직 오지 않은 시각이에요 · 지금 HH:MM' · 보내기 막힘", (await hint.getAttribute('data-fix-hint')) === 'warn' && (await hint.innerText()).includes('아직 오지 않은 시각이에요') && (await send.isDisabled()), await hint.innerText().catch(() => ''))
    if (SHOTS) await w.locator('form:has([data-fix-hint])').screenshot({ path: `${SHOTS}/fix-hint.png` }).catch(() => {})
  } else console.log('SKIP  자정 직전이라 미래 시각 확인은 건너뜀')
  await w.locator('input[name=time]').fill(hm(now - 60e3))
  await w.waitForTimeout(150)
  ok('맞는 시각이면 알림 없이 보내기 가능', (await hint.count()) === 0 && !(await send.isDisabled()))
  ok('360px: 옆으로 안 밀림 (정정 요청)', await wide())
  await send.click()
  ok('보내면 요청됨', await w.getByText(`종료 ${hm(now - 60e3)}(으)로 정정을 요청했어요`).first().waitFor({ timeout: 8000 }).then(() => true, () => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
