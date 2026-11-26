// 묶음 409 (정기 개선 2026-11-27 05:36 KST)
// 기능 · 근무자 '지난 근무' 날짜별 기록: 담당자가 시각을 고친 날은 '담당자가 고침 · 출근 06:00 → 09:00' (종료도 같은 모양)
//   · 접힌 제목에 '· 고친 날 n' · 고치지 않았거나 같은 분으로 저장된 기록에는 안 보임 (위 시각은 원래대로 고친 시각)
// 디자인 · 날짜별 기록을 펼치면 목록이 위에서 짧게 내려옴 (0.25초 · 움직임 줄이기면 바로)
// node scripts/qa/batch409.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const at = (d, hm) => new Date(`${d}T${hm}:00+09:00`).toISOString()

;(async () => {
  const y = kday(-1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y, end_date: kday(0), start_time: '09:00:00', end_time: '18:00:00' })
  const setAtt = (extra) => rest(`attendance?id=eq.${ATT}`, 'PATCH', { work_date: y, clock_in: at(y, '06:00'), clock_out: at(y, '18:00'), adj_in: null, adj_out: null, paid: false, ...extra })

  const b = await chromium.launch()
  const errs = []
  const open = async (reduce = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    await p.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
    const det = p.locator('[data-history-days]').first()
    await det.waitFor({ timeout: 15000 }).catch(() => {})
    return { p, det }
  }
  // 날짜별 기록 펼치기: 누른 뒤 열렸는지 확인 (막 켠 서버에서 화면 준비와 누름이 겹치면 한 번 더)
  const unfold = async (p, det) => {
    await det.locator('summary').click()
    await p.waitForTimeout(300)
    if (!(await det.evaluate((d) => d.open))) { await det.locator('summary').click(); await p.waitForTimeout(300) }
    return det.evaluate((d) => d.open)
  }

  // ── 1. 출근을 06:00 → 09:00로 고친 날
  await setAtt({ adj_in: at(y, '09:00') })
  let { p, det } = await open()
  ok("접힌 제목에 '· 고친 날 1'", one(await det.locator('summary').innerText().catch(() => '')).endsWith('· 고친 날 1'), one(await det.locator('summary').innerText().catch(() => '')))
  ok('제목을 누르면 펼쳐짐', await unfold(p, det))
  const ul = det.locator('ul').first()
  ok('펼치면 목록이 내려옴 (slide-down · 0.25초)', await ul.evaluate((el) => getComputedStyle(el).animationName === 'slide-down' && getComputedStyle(el).animationDuration === '0.25s').catch(() => false))
  const row = det.locator(`[data-history-day="${y}"]`)
  ok('위 시각은 고친 시각 (09:00~18:00)', one(await row.innerText().catch(() => '')).includes('09:00~18:00'), one(await row.innerText().catch(() => '')))
  ok("'담당자가 고침 출근 06:00 → 09:00'", one(await row.locator('[data-history-fixed]').innerText().catch(() => '')) === '담당자가 고침 출근 06:00 → 09:00', one(await row.locator('[data-history-fixed]').innerText().catch(() => '')))
  ok('360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) { await det.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); const bx = await det.boundingBox(); if (bx) await p.screenshot({ path: `${SHOTS}/history-fixed.png`, clip: { x: 0, y: Math.max(0, bx.y - 260), width: 360, height: Math.min(560, bx.height + 300) } }).catch(() => {}) }

  // ── 2. 출근·종료 둘 다 고친 날 (한 줄 · 넘치면 두 줄)
  await setAtt({ adj_in: at(y, '09:00'), adj_out: at(y, '17:30') })
  ;({ p, det } = await open())
  await unfold(p, det)
  const fixed2 = one(await det.locator(`[data-history-day="${y}"] [data-history-fixed]`).innerText().catch(() => ''))
  ok("'출근 06:00 → 09:00 · 종료 18:00 → 17:30'", fixed2 === '담당자가 고침 출근 06:00 → 09:00 · 종료 18:00 → 17:30', fixed2)
  ok('두 줄 안에 들어감 (360px)', await det.locator(`[data-history-day="${y}"] [data-history-fixed]`).evaluate((el) => el.getBoundingClientRect().height < 40).catch(() => false))
  ok('360px 옆으로 안 밀림 (둘 다 고침)', await noSide(p))

  // ── 3. 안 보이는 경우: 고치지 않음 · 같은 분으로 저장됨
  await setAtt({})
  ;({ p, det } = await open())
  ok('고치지 않은 기록: 제목에 고친 날 없음', !one(await det.locator('summary').innerText().catch(() => '')).includes('고친 날'))
  await unfold(p, det)
  ok('고치지 않은 기록: 고침 줄 없음', (await det.locator('[data-history-fixed]').count()) === 0)
  await setAtt({ adj_in: new Date(Date.parse(at(y, '06:00')) + 20e3).toISOString() })
  ;({ p, det } = await open())
  ok('같은 분으로 저장된 기록(06:00:20): 고침 줄 없음', !one(await det.locator('summary').innerText().catch(() => '')).includes('고친 날') && (await det.locator('[data-history-fixed]').count()) === 0)

  // ── 4. 움직임 줄이기: 목록 애니메이션 사실상 없음
  await setAtt({ adj_in: at(y, '09:00') })
  ;({ p, det } = await open(true))
  await unfold(p, det)
  ok('움직임 줄이기: 펼침 애니메이션 없음', await det.locator('ul').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) < 0.01).catch(() => false))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
