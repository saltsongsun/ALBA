// 묶음 135 (정기 개선 2026-11-08 07:35)
// · 관리자 공고 화면: 지원자·출퇴근·정산·서류 탭을 바꾸면 맨 위(큰 제목 카드)로 올라가 매번 다시 내려야 하던 것
//   → 탭 줄(#tabs)로 바로 (탭과 내용이 화면 위쪽에)
// node scripts/qa/batch135.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  const tabs = a.locator('[data-job-tabs]')
  await tabs.waitFor({ timeout: 15000 })
  const top0 = await tabs.evaluate((el) => Math.round(el.getBoundingClientRect().top))
  ok('준비: 처음엔 탭 줄이 큰 제목 카드 아래 (화면 아래쪽)', top0 > 400, String(top0))
  for (const [label, key] of [['정산', 'pay'], ['출퇴근', 'att'], ['서류', 'docs']]) {
    await tabs.getByRole('link', { name: new RegExp(`^${label}`) }).click()
    await a.waitForURL((u) => new URL(u).searchParams.get('tab') === key, { timeout: 10000 }).catch(() => {})
    await a.waitForTimeout(700)
    const r = await tabs.evaluate((el) => ({ t: Math.round(el.getBoundingClientRect().top), end: scrollY + innerHeight >= document.scrollingElement.scrollHeight - 2, y: Math.round(scrollY) }))
    // 내용이 짧아 더 내려갈 수 없으면 맨 끝까지 내려간 것으로 인정 (맨 위로 올라가지만 않으면 됨)
    ok(`'${label}' 탭: 바뀐 내용과 탭 줄이 화면 위쪽에 (맨 위로 올라가지 않음)`, new URL(a.url()).searchParams.get('tab') === key && r.t >= 0 && (r.t < 160 || (r.end && r.y > 300)), JSON.stringify(r))
  }
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/tabs-after.png` }).catch(() => {})
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
