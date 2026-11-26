// 묶음 405 (정기 개선 2026-11-26 23:35 KST)
// 기능 · 근무자 공고 화면(확정된 근무) 아래 버튼: 오늘 할 출퇴근이 없으면 '오늘 출퇴근하러 가기' 대신 '내 근무 보기'
//   (오늘 근무를 이미 마침 · 오늘이 내 근무일이 아님 · 기록 없이 오늘 근무 시간이 지남) — 근무 중이면 '근무 종료하러 가기' 그대로
// 디자인 · 오늘 마친 근무 줄은 '✓ 오늘 근무 끝 HH:MM~HH:MM' (초록 · 톡 0.25초) · 지난 날은 '✓ M/D(요일) 근무' 그대로
// node scripts/qa/batch405.cjs <default 앱> <default 가짜> <shots>
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
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const kstHm = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16)

;(async () => {
  const today = kday(0), tomorrow = kday(1)
  const hmNow = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16)
  // 오늘~내일 이틀 · 하루 종일 (시작함 · 아직 안 끝남)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: tomorrow, start_time: '00:00:00', end_time: '23:59:00' })
  const [app] = (await rest(`applications?job_id=eq.${J}`)).filter((a) => a.user_id === W)
  const att = (await rest(`attendance?user_id=eq.${W}`)).find((x) => x.work_date === today)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async () => { await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' }); await w.locator('#apply').waitFor({ timeout: 15000 }).catch(() => {}) }
  const btn = (name) => w.locator('#apply').getByRole('link', { name, exact: true })

  // ── 1. 근무 중: '근무 종료하러 가기' 그대로
  await open()
  ok("근무 중: '근무 종료하러 가기'", (await btn('근무 종료하러 가기').count()) === 1)

  // ── 2. 오늘 근무를 마침: '✓ 오늘 근무 끝 HH:MM~HH:MM' + '내 근무 보기'
  const inAt = new Date(Date.now() - 3 * 3600e3).toISOString(), outAt = new Date(Date.now() - 300e3).toISOString()
  if (att) await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: today, clock_in: inAt, clock_out: outAt })
  await open()
  const line = w.locator('[data-my-work]')
  ok("마친 뒤: '✓ 오늘 근무 끝 HH:MM~HH:MM'", one(await line.innerText().catch(() => '')) === `✓ 오늘 근무 끝 ${kstHm(inAt)}~${kstHm(outAt)}` && (await line.locator('[data-my-work-today]').count()) === 1, one(await line.innerText().catch(() => '')))
  ok('초록 · 톡 0.25초', await line.locator('[data-my-work-today]').evaluate((el) => getComputedStyle(el).animationName === 'pop' && getComputedStyle(el).animationDuration === '0.25s' && getComputedStyle(el.querySelector('span')).color !== getComputedStyle(el).color).catch(() => false))
  ok("마친 뒤 버튼: '내 근무 보기' ('오늘 출퇴근하러 가기' 아님)", (await btn('내 근무 보기').count()) === 1 && (await btn('오늘 출퇴근하러 가기').count()) === 0)
  ok('360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) { await w.locator('#apply').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await w.waitForTimeout(500); await w.screenshot({ path: `${SHOTS}/done-today.png` }).catch(() => {}) }

  // ── 3. 지난 날 근무만 있음 + 오늘 출근 전 (오늘도 근무일): 날짜 줄 그대로 + '오늘 출퇴근하러 가기'
  if (att) await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: kday(-1), clock_in: new Date(Date.now() - 26 * 3600e3).toISOString(), clock_out: new Date(Date.now() - 22 * 3600e3).toISOString() })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(-1) })
  await open()
  ok("지난 날 근무: '✓ M/D(요일) 근무' 그대로", /^✓ \d{1,2}\/\d{1,2}\(.\) 근무 /.test(one(await line.innerText().catch(() => ''))) && (await line.locator('[data-my-work-today]').count()) === 0, one(await line.innerText().catch(() => '')))
  ok(hmNow < '23:59' ? "오늘 출근 전(근무 시간 안): '오늘 출퇴근하러 가기'" : '자정 직전이라 건너뜀', hmNow >= '23:59' || (await btn('오늘 출퇴근하러 가기').count()) === 1)

  // ── 4. 오늘이 내 근무일이 아님 (근무일을 내일로만 고름): '내 근무 보기'
  if (app) await rest(`applications?id=eq.${app.id}`, 'PATCH', { available_dates: [tomorrow] })
  await open()
  ok("오늘이 내 근무일이 아니면: '내 근무 보기'", (await btn('내 근무 보기').count()) === 1 && (await btn('오늘 출퇴근하러 가기').count()) === 0)
  if (app) await rest(`applications?id=eq.${app.id}`, 'PATCH', { available_dates: null })

  // ── 5. 기록 없이 오늘 근무 시간이 지남: '내 근무 보기' (지난 시각으로 끝나게 · 자정 직후 1시 전이면 건너뜀)
  if (hmNow >= '01:00') {
    const endHm = new Date(Date.now() + 9 * 3600e3 - 30 * 60e3).toISOString().slice(11, 16)
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: `${endHm}:00` })
    await open()
    ok("기록 없이 오늘 근무 시간이 지남: '내 근무 보기'", (await btn('내 근무 보기').count()) === 1 && (await btn('오늘 출퇴근하러 가기').count()) === 0)
  } else ok('자정 직후라 근무 시간 지남 확인은 건너뜀', true)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
