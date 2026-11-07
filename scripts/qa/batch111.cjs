// 묶음 111 (정기 개선 2026-11-07 04:35 · 디자인 원칙 "많은 정보도 심플하게")
// · 대시보드 새 소식 한 줄: '주휴수당이 정산에 자동으로 들어가요 (11/2 주부터) ›' → 주간 화면 · ×로 닫으면 이 휴대폰에서 다시 안 보임 (11/30까지)
// · 정산 탭 단순하게: 위 한 줄 '시급 10,320원 · 일용근로 2.7% · 고용보험' · 외주가 없으면 행사 비용 한 줄 + '외주 추가' · 세금 설명은 '세금 계산 방법'에 접어 둠
// node scripts/qa/batch111.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (scheme = 'light') => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', colorScheme: scheme })
    await ctx.addInitScript((sc) => { try { if (sc === 'dark') localStorage.setItem('theme', 'dark'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, scheme)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const a = await pg()

  // ── 1. 새 소식 한 줄 ──
  await a.goto(`${D}/admin`)
  const news = a.locator('[data-news="weekly-pay-2026-11"]')
  if (today <= '2026-11-30') {
    await news.waitFor({ timeout: 10000 }).catch(() => {})
    ok("새 소식: '주휴수당이 정산에 자동으로 들어가요 (11/2 주부터)' 한 줄", (await news.innerText().catch(() => '')).includes('주휴수당이 정산에 자동으로 들어가요 (11/2 주부터)') && (await news.evaluate((el) => el.getBoundingClientRect().height < 52)))
    if (SHOTS) await news.screenshot({ path: `${SHOTS}/news.png` }).catch(() => {})
    await news.locator('a').click()
    await a.waitForURL((u) => new URL(u).pathname === '/admin/weekly', { timeout: 10000 }).catch(() => {})
    ok('누르면 주간 근무 · 주휴 화면', new URL(a.url()).pathname === '/admin/weekly')
    await a.goto(`${D}/admin`)
    await news.waitFor({ timeout: 10000 }).catch(() => {})
    ok('보기만 하면 그대로 남음', (await news.count()) === 1)
    await news.locator('[data-news-close]').click()
    ok('×를 누르면 사라짐', (await news.count()) === 0)
    await a.reload()
    await a.locator('h1').first().waitFor({ timeout: 10000 }).catch(() => {})
    await a.waitForTimeout(500)
    ok('다시 열어도 안 보임 (이 휴대폰)', (await news.count()) === 0)
  } else ok('(11/30이 지나 새 소식은 안 보이는 게 맞음)', (await news.count()) === 0)

  // ── 2. 정산 탭 단순하게 ──
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  const rule = a.locator('[data-pay-rule]')
  await rule.waitFor({ timeout: 15000 }).catch(() => {})
  const rt = await rule.innerText().catch(() => '')
  ok("위 한 줄: '시급 10,320원 · 일용근로 2.7% · 고용보험'", rt.trim() === '시급 10,320원 · 일용근로 2.7% · 고용보험' && (await rule.evaluate((el) => el.getBoundingClientRect().height < 26)), JSON.stringify(rt))
  const cost = a.locator('[data-cost-compact]')
  ok("외주가 없으면 한 줄: '행사 비용 · 외주 없음' + 금액 + '외주 추가'", (await cost.innerText().catch(() => '')).includes('행사 비용 · 외주 없음') && (await cost.getByRole('link', { name: '외주 추가' }).getAttribute('href')) === `/admin/vendors?tab=quotes&job=${J}`)
  ok("'행사 비용 합계' 큰 카드 없음 (외주 없을 때)", (await a.getByText('행사 비용 합계').count()) === 0)
  const help = a.locator('[data-pay-help]')
  ok("세금 설명은 '세금 계산 방법'에 접혀 있음", (await help.evaluate((el) => !el.open)) && !(await a.getByText('소득세는 근무자별로').first().isVisible().catch(() => false)))
  await help.locator('summary').click()
  await a.waitForTimeout(300)
  ok('펼치면 세금·비용 설명이 다 있음', (await help.innerText()).includes('소득세는 근무자별로') && (await help.innerText()).includes('일 15만원 초과분 2.7%') && (await help.innerText()).includes('고용보험 0.9%'), JSON.stringify(await help.innerText()))
  ok('360px: 정산 탭 옆으로 안 밀림 (밝은 화면)', await wide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/pay.png`, fullPage: true })
  const dk = await pg('dark')
  await dk.goto(`${D}/admin/jobs/${J}?tab=pay`)
  await dk.locator('[data-pay-rule]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('360px: 정산 탭 옆으로 안 밀림 (어두운 화면)', (await dk.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await wide(dk)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
