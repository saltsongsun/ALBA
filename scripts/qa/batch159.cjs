// 묶음 159 (정기 개선 2026-11-09 09:35 · '30분 단위가 기본' 이어서 근무자 쪽)
// · 내 근무 '오늘 근무 완료' 카드: 30분 단위 등으로 빠진 시간이 있으면 '30분 단위 계산이라 25분은 빠졌어요' (1분 단위면 없음)
// · 지난 근무: 공고 줄 아래 '30분 단위 계산 · 25분 빠짐'
// · '오늘 약 n원'은 0에서 올라가며 보임 (움직임 줄이기면 바로)
// node scripts/qa/batch159.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', ATT = 'eeeeeeee-0000-4000-8000-000000000006', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wide = () => w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // 준비: 오늘 09:00~17:55 근무 끝 (휴게 30분 빼면 8시간 25분 · 30분 단위면 8시간 인정) · 서명할 서류 없음
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  const at = (hm) => new Date(`${today}T${hm}:00+09:00`).toISOString()
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { clock_in: at('09:00'), clock_out: at('17:55'), adj_in: null, adj_out: null, break_override: null })
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'signed' })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { round_unit: 30, pay_type: 'hourly', hourly_wage: 10320, break_mode: 'auto', early_clamp: false, allowance: 0, premium_enabled: false })

  // ── 1. 내 근무 '오늘 근무 완료'
  await w.goto(`${D}/me`)
  const gross = w.locator('[data-today-gross]')
  await gross.waitFor({ timeout: 15000 }).catch(() => {})
  const g0 = await gross.innerText().catch(() => '')
  const cut = w.locator('#today-work [data-round-cut]')
  ok("'30분 단위 계산이라 25분은 빠졌어요'", (await cut.innerText().catch(() => '')) === '30분 단위 계산이라 25분은 빠졌어요', await cut.innerText().catch(() => ''))
  ok('그 줄은 한 줄', await cut.evaluate((el) => el.getBoundingClientRect().height < 20).catch(() => false))
  await w.waitForFunction(() => document.querySelector('[data-today-gross]')?.textContent?.includes('82,560원'), null, { timeout: 5000 }).catch(() => {})
  const g1 = await gross.innerText().catch(() => '')
  ok("'오늘 약 82,560원 세전' (0에서 올라감)", g1.replace(/\s+/g, ' ').trim() === '오늘 약 82,560원 세전' && !g0.includes('82,560'), `${g0} → ${g1}`)
  ok('360px 옆으로 안 밀림 (내 근무)', await wide())
  if (SHOTS) await w.locator('#today-work').screenshot({ path: `${SHOTS}/done-cut.png` }).catch(() => {})

  // ── 2. 지난 근무: 공고 줄 아래
  await w.goto(`${D}/me/history`)
  const hc = w.locator('[data-round-cut]').first()
  await hc.waitFor({ timeout: 15000 }).catch(() => {})
  ok("지난 근무 '30분 단위 계산 · 25분 빠짐'", (await hc.innerText().catch(() => '')) === '30분 단위 계산 · 25분 빠짐', await hc.innerText().catch(() => ''))
  ok('360px 옆으로 안 밀림 (지난 근무)', await wide())

  // ── 3. 1분 단위면 두 곳 다 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { round_unit: 1 })
  await w.reload()
  await w.locator('[data-history-hero]').waitFor({ timeout: 15000 }).catch(() => {})
  const none1 = (await w.locator('[data-round-cut]').count()) === 0
  await w.goto(`${D}/me`)
  await gross.waitFor({ timeout: 15000 }).catch(() => {})
  ok('1분 단위: 빠진 시간 줄 없음 (내 근무·지난 근무)', none1 && (await w.locator('[data-round-cut]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
