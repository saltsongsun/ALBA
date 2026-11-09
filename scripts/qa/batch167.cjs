// 묶음 167 (정기 개선 2026-11-10 03:35 KST)
// · 공고 카드(홈 공고 목록): 시급 아래 작은 한 줄 '하루 약 82,560원' (공고 화면의 '하루 약'과 같은 계산 · 수당 포함)
//   일급 공고는 이미 하루 금액이라 안 보임
// · 공고 화면 '하루 약 ○○원': 처음 열면 0에서 금액까지 빠르게 올라감 ('움직임 줄이기' 설정이면 바로)
// node scripts/qa/batch167.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const num = (t) => Number(String(t).replace(/[^0-9]/g, ''))

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => {
      try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {}
      // 공고 화면 '하루 약' 숫자가 바뀌는 모습을 기록 (올라가는지 확인)
      window.__seen = []
      document.addEventListener('DOMContentLoaded', () => {
        const rec = () => { const el = document.querySelector('[data-day-est] [data-value]'); if (el) window.__seen.push(el.textContent) }
        rec()
        new MutationObserver(rec).observe(document.body, { subtree: true, childList: true, characterData: true })
      })
    })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  // 수당 없는 시급 공고로 시작 (가짜 DB 기본)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { pay_type: 'hourly', allowance: 0, start_time: '09:00:00', end_time: '18:00:00' })

  // ── 1. 공고 화면: 0에서 올라가 최종 금액
  const g = await pg()
  await g.goto(`${D}/jobs/${J}`)
  const est = g.locator('[data-day-est]')
  await est.waitFor({ timeout: 15000 }).catch(() => {})
  await g.waitForTimeout(1200)
  const final = num(await est.innerText().catch(() => ''))
  const seen = (await g.evaluate(() => window.__seen)).map(num)
  ok("공고 화면 '하루 약 82,560원' (8시간 × 10,320원)", final === 82560, String(final))
  ok('처음 열면 0에서 올라감 (중간 숫자가 보임) · 끝은 원래 금액', seen.some((v) => v < final) && seen.at(-1) === final, seen.slice(0, 6).join(',') + '…')
  ok('360px 옆으로 안 밀림', await wide(g))

  // ── 2. 홈 공고 카드: 시급 아래 '하루 약 82,560원' (공고 화면과 같은 금액)
  await g.goto(`${D}/`)
  const day = g.locator('[data-card-day]').first()
  await day.waitFor({ timeout: 15000 }).catch(() => {})
  const dt = ((await day.innerText().catch(() => '')) ?? '').trim()
  ok("카드: '하루 약 82,560원'", dt === '하루 약 82,560원', dt)
  ok('카드 금액 = 공고 화면 금액', num(dt) === final)
  ok('카드 한 줄 · 360px 옆으로 안 밀림', (await day.evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)) && (await wide(g)))
  if (SHOTS) await g.locator('a.card-link').first().screenshot({ path: `${SHOTS}/card-day.png` }).catch(() => {})

  // ── 3. 수당이 있으면 수당까지 더한 금액 (공고 화면과 같게) · 360px에서 한 줄
  await rest(`jobs?id=eq.${J}`, 'PATCH', { allowance: 10000, allowance_label: '교통비' })
  await g.goto(`${D}/`)
  await day.waitFor({ timeout: 15000 }).catch(() => {})
  const dt2 = ((await day.innerText().catch(() => '')) ?? '').trim()
  ok("수당 1만원: 카드 '하루 약 92,560원'", dt2 === '하루 약 92,560원', dt2)
  ok('수당이 있어도 카드 한 줄 · 360px 옆으로 안 밀림', (await day.evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)) && (await wide(g)))
  await g.goto(`${D}/jobs/${J}`)
  await est.waitFor({ timeout: 15000 }).catch(() => {})
  await g.waitForTimeout(1200)
  ok('공고 화면도 92,560원', num(await est.innerText().catch(() => '')) === 92560)

  // ── 4. 움직임 줄이기: 바로 최종 금액 (올라가지 않음)
  const r = await pg({ reducedMotion: 'reduce' })
  await r.goto(`${D}/jobs/${J}`)
  await r.locator('[data-day-est]').waitFor({ timeout: 15000 }).catch(() => {})
  await r.waitForTimeout(900)
  const rs = (await r.evaluate(() => window.__seen)).map(num)
  ok("'움직임 줄이기'면 올라가지 않고 바로 92,560원", rs.length > 0 && rs.every((v) => v === 92560), rs.slice(0, 6).join(','))

  // ── 5. 일급 공고: 카드에 '하루 약' 줄 없음 (일급이 곧 하루 금액)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { pay_type: 'daily', daily_wage: 100000, allowance: 0 })
  await g.goto(`${D}/`)
  await g.locator('a.card-link').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("일급 공고: '일급 100,000원'만 · '하루 약' 줄 없음", (await g.locator('a.card-link').first().innerText()).includes('일급 100,000원') && (await g.locator('[data-card-day]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
