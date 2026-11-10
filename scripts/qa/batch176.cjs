// 묶음 176 (정기 개선 2026-11-10 13:35 KST)
// · 확정 근무 취소 칸('근무를 못 하게 됐어요'): 24시간 안에 시작하면 '시작까지 n시간 남았어요 / 갑자기 빠지면 대신할 사람을 구하기 어려워요'
//   + '먼저 담당자에게 전화하기' (이미 시작한 날이면 '오늘 이미 시작한 근무예요') · 하루보다 멀면 안 보임
// · 고르는 칩(취소 사유·커뮤니티 말머리·외주 업체 고르기): 고르면 톡 (짧게 · '움직임 줄이기'면 안 움직임)
// node scripts/qa/batch176.cjs <default 앱> <default 가짜> <shots>
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
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kstHm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const box = w.locator('[data-cancel-soon]')
  const openCancel = async () => {
    await w.goto(`${D}/jobs/${J}`)
    const s = w.locator('summary', { hasText: '근무를 못 하게 됐어요' })
    await s.waitFor({ timeout: 15000 }).catch(() => {})
    await s.click().catch(() => {})
    await w.waitForTimeout(300)
  }
  const text = async () => ((await box.innerText().catch(() => '')) ?? '').replace(/\n+/g, ' / ').trim()
  // 근무 기록은 지움 (이미 출근한 근무는 취소 칸 대상이 아니어도 확인은 같음)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')

  // ── 1. 오늘 3시간 뒤 시작: 남은 시간 + 전화
  const start = Math.ceil((Date.now() + 180 * 60e3) / 60e3) * 60e3
  if (kstDay(start) !== kstDay(Date.now()) || kstDay(start + 3600e3) !== kstDay(Date.now())) {
    console.log('SKIP  자정 가까워 3시간 뒤 시작 확인 생략')
  } else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kstDay(Date.now()), end_date: kstDay(Date.now()), start_time: `${kstHm(start)}:00`, end_time: `${kstHm(start + 3600e3)}:00` })
    await openCancel()
    const t = await text()
    ok("'시작까지 3시간 남았어요 / 갑자기 빠지면 대신할 사람을 구하기 어려워요 / 먼저 담당자에게 전화하기'", /^시작까지 3시간( 1분)? 남았어요 \/ 갑자기 빠지면 대신할 사람을 구하기 어려워요 \/ 먼저 담당자에게 전화하기$/.test(t), t)
    ok('전화 버튼은 tel: 번호', /^tel:\d{9,11}$/.test((await box.locator('[data-cancel-call]').getAttribute('href').catch(() => '')) ?? ''), await box.locator('[data-cancel-call]').getAttribute('href').catch(() => ''))
    ok('두 줄 각각 한 줄 · 360px 옆으로 안 밀림', (await box.evaluate((el) => [...el.querySelectorAll('b.block, span.block')].every((c) => c.getBoundingClientRect().height < 24))) && (await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
    if (SHOTS) await box.locator('xpath=ancestor::form[1]').screenshot({ path: `${SHOTS}/cancel-soon.png` }).catch(() => {})
    // 사유 칩을 고르면 톡
    const chip = w.locator('form label:has(input[name=reason]) span').first()
    await chip.click()
    ok('사유 칩을 고르면 톡 (pop)', (await chip.evaluate((el) => getComputedStyle(el).animationName)) === 'pop')
  }

  // ── 2. 이미 시작한 날: '오늘 이미 시작한 근무예요'
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kstDay(Date.now()), end_date: kstDay(Date.now()), start_time: '00:00:00', end_time: '23:59:00' })
  await openCancel()
  ok("이미 시작했으면 '오늘 이미 시작한 근무예요'", (await text()).startsWith('오늘 이미 시작한 근무예요 / 갑자기 빠지면 대신할 사람을 구하기 어려워요'), await text())

  // ── 3. 3일 뒤 시작: 안 보임
  const d3 = kstDay(Date.now() + 3 * 864e5)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d3, end_date: d3, start_time: '09:00:00', end_time: '18:00:00' })
  await rest(`applications?id=eq.11111111-0000-4000-8000-000000000008`, 'PATCH', { available_dates: null })
  await openCancel()
  ok('하루보다 멀면 안 보임', (await w.locator('summary', { hasText: '근무를 못 하게 됐어요' }).count()) === 1 && (await box.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
