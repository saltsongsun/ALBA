// 묶음 157 (정기 개선 2026-11-09 07:35 · 사용자 요청 '30분 단위가 기본단위' 뒤 이어서)
// · 근무자 공고 화면 '급여 자세히': 시급 공고가 1분 단위가 아니면 '계산 · 30분 단위 (30분 미만은 빼요)' (지원 전에 알 수 있게)
// · 관리자 새 공고 '근무시간 절사': 고르는 대로 예시가 바뀜 '8시간 25분 일하면 → 8시간 인정' (10분이면 8시간 20분 · 1분이면 그대로)
// node scripts/qa/batch157.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
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
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 근무자 공고 화면: 1분 단위면 안내 없음 · 30분 단위면 '계산' 줄
  const w = await pg(W)
  const more = w.locator('[data-pay-more]')
  await rest(`jobs?id=eq.${J}`, 'PATCH', { round_unit: 1, pay_type: 'hourly' })
  await w.goto(`${D}/jobs/${J}`)
  await w.locator('[data-wage-box]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("1분 단위 공고: '계산' 줄 없음", !(await more.innerText().catch(() => '')).includes('계산'))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { round_unit: 30 })
  await w.reload()
  await more.waitFor({ timeout: 15000 }).catch(() => {})
  await more.evaluate((el) => { el.open = true })
  const row = more.locator('dl > div', { hasText: '계산' })
  const rt = await row.evaluate((el) => [...el.children].map((c) => c.textContent.trim()).join(' | ')).catch((e) => 'ERR ' + e.message.slice(0, 200))
  ok("30분 단위 공고: '계산 | 30분 단위 (30분 미만은 빼요)'", rt === '계산 | 30분 단위 (30분 미만은 빼요)', JSON.stringify(rt))
  ok('그 줄은 한 줄 · 요약 줄도 한 줄', (await row.locator('dd').evaluate((el) => { const h = el.getBoundingClientRect().height; return h > 0 && h < 24 })) && (await more.locator('summary').evaluate((el) => el.getBoundingClientRect().height < 24)))
  ok('360px 옆으로 안 밀림 (공고)', await wide(w))
  if (SHOTS) await w.locator('[data-wage-box]').screenshot({ path: `${SHOTS}/job-round.png` }).catch(() => {})

  // ── 2. 관리자 새 공고: 절사 단위를 고르는 대로 예시
  const a = await pg(A)
  await a.goto(`${D}/admin/jobs/new`)
  const sel = a.locator('select[name=round_unit]').first()
  const ex = a.locator('[data-round-example]').first()
  await ex.waitFor({ timeout: 15000 }).catch(() => {})
  const txt = async () => (await ex.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  ok("기본(30분): '8시간 25분 일하면 → 8시간 인정'", (await txt()) === '8시간 25분 일하면 → 8시간 인정', await txt())
  await sel.selectOption('10')
  ok("10분 단위: '→ 8시간 20분 인정'", (await txt()) === '8시간 25분 일하면 → 8시간 20분 인정', await txt())
  await sel.selectOption('15')
  ok("15분 단위: '→ 8시간 15분 인정'", (await txt()) === '8시간 25분 일하면 → 8시간 15분 인정', await txt())
  await sel.selectOption('1')
  ok("1분 단위: '→ 그대로 인정'", (await txt()) === '8시간 25분 일하면 → 그대로 인정', await txt())
  ok('예시는 두 줄까지 · 360px 옆으로 안 밀림', (await ex.evaluate((el) => el.getBoundingClientRect().height < 40)) && (await wide(a)))
  await sel.selectOption('30')
  if (SHOTS) await sel.locator('xpath=ancestor::div[contains(@class,"grid")][1]').screenshot({ path: `${SHOTS}/form-round.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
