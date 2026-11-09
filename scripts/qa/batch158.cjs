// 묶음 158 (정기 개선 2026-11-09 08:35 · '30분 단위가 기본' 이어서)
// · 관리자 정산 탭 '인정시간': 절사 단위 때문에 빠진 시간을 바로 아래 작게 '−25분 절사' (휴게 뺀 실제 근무 − 인정시간 · 금액 계산은 그대로)
//   1분 단위면 표시 없음
// · 근무자 공고 '급여 자세히' 펼침 표시: 앞 화살표 하나만 (뒤의 ⌄까지 두 개였음)
// node scripts/qa/batch158.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // 준비: 근무자가 09:00~17:55 일함 → 휴게 30분 빼면 8시간 25분 · 30분 단위면 8시간 인정 (25분 절사)
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  const at = (hm) => new Date(`${today}T${hm}:00+09:00`).toISOString()
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { clock_in: at('09:00'), clock_out: at('17:55'), adj_in: null, adj_out: null, break_override: null })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { round_unit: 30, pay_type: 'hourly', break_mode: 'auto', early_clamp: false })

  // ── 1. 정산 탭: '8시간' + '−25분 절사'
  const a = await pg(A)
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  const row = a.locator('tr', { has: a.locator(`a[href="/admin/workers/${W}"]`) }).first()
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  const cut = row.locator('[data-round-cut]')
  const cell = cut.locator('xpath=..')
  const ct = (await cell.innerText().catch(() => '')).replace(/\n/g, ' | ')
  ok("30분 단위: 인정시간 '8시간' 아래 '−25분 절사'", ct === '8시간 | −25분 절사', ct)
  ok('절사 줄 한 줄', await cut.evaluate((el) => el.getBoundingClientRect().height < 20).catch(() => false))
  if (SHOTS) await row.screenshot({ path: `${SHOTS}/pay-cut.png` }).catch(() => {})

  // 1분 단위면 표시 없음 · 그대로 8시간 25분
  await rest(`jobs?id=eq.${J}`, 'PATCH', { round_unit: 1 })
  await a.reload()
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("1분 단위: 절사 표시 없음 · '8시간 25분'", (await row.locator('[data-round-cut]').count()) === 0 && (await row.innerText()).includes('8시간 25분'))

  // ── 2. 근무자 공고 '급여 자세히': 펼침 표시 하나
  const w = await pg(W)
  await w.goto(`${D}/jobs/${J}`)
  const sum = w.locator('[data-pay-more] summary')
  await sum.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'… 자세히' 뒤에 ⌄ 없음 (앞 화살표 하나)", !(await sum.innerText()).includes('⌄') && (await sum.innerText()).trim().endsWith('자세히'), await sum.innerText())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
