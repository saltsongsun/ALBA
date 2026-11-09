// 묶음 165 (정기 개선 2026-11-10 01:35 · 대시보드 '끝난 행사' 확인을 공고 지원자 탭에도)
// · 지원자 탭: 마지막 날 근무까지 끝난 행사면 요약 줄에 '끝난 행사' · 확정은 '끝난 행사 · 확정?' 한 번 더
//   '대기 n명 모두 확정'도 '끝난 행사 · n명 모두 확정?' · 여러 명 골라 확정은 '끝난 행사 n명 · 확정?'
// · 근무 시간 안이면 예전 그대로
// node scripts/qa/batch165.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const kst = new Date(Date.now() + 9 * 3600e3)
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  const open = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=apps`); await a.getByText(/확정 \d+ \/ 모집/).first().waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 끝난 행사 (오늘 00:00~00:30 · 마지막 날)
  if (mins < 35) console.log('SKIP  00:35 전이라 끝난 행사 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:30:00' })
    await open()
    ok("요약 줄에 '끝난 행사'", (await a.locator('[data-apps-ended]').innerText().catch(() => '')) === '끝난 행사')
    // 한 사람 확정: 한 번 더
    const card = a.locator('form', { has: a.locator('button', { hasText: '확정' }) }).filter({ hasNot: a.locator('text=모두 확정') }).locator('button[data-confirm]').first()
    await card.click()
    await a.waitForTimeout(300)
    ok("확정 첫 누름: '끝난 행사 · 확정?' (아직 대기)", (await card.innerText()).trim() === '끝난 행사 · 확정?' && (await rest(`applications?id=eq.${APP}`))[0]?.status === 'applied', await card.innerText())
    // 모두 확정: 한 번 더
    await open()
    const all = a.locator('button[data-confirm]', { hasText: '모두 확정' }).first()
    await all.click()
    await a.waitForTimeout(300)
    ok("'대기 1명 모두 확정' 첫 누름: '끝난 행사 · 1명 모두 확정?'", (await all.innerText()).trim() === '끝난 행사 · 1명 모두 확정?' && (await rest(`applications?id=eq.${APP}`))[0]?.status === 'applied', await all.innerText())
    ok('360px 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  }

  // ── 2. 근무 시간 안 (끝 23:59): 표시 없음
  if (mins >= 23 * 60 + 58) console.log('SKIP  23:58 넘어 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
    await open()
    ok("근무 시간 안: '끝난 행사' 없음", (await a.locator('[data-apps-ended]').count()) === 0)
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
