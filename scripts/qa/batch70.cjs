// 묶음 70: 공고별 지급총액 (관리자)
// · 공고 화면 위쪽: '지급총액 N원 · 세전 · M명' (정산 탭 합계와 같은 값) → 누르면 정산 탭 · 모두 지급하면 '지급 완료'
// · 공고 목록: 휴대폰 카드 '지급총액 N원 (세전 · M명)' · 넓은 표 '지급총액' 칸 · 기록 없는 공고는 표시 없음/'-'
// node scripts/qa/batch70.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000a7', J2 = 'cccccccc-0000-4000-8000-0000000000a7'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const num = (s) => Number(String(s).replace(/[^\d]/g, ''))

;(async () => {
  // 준비: 오늘 09:00~18:00 근무 마침(W) + 09:00~13:00(W2, 새 확정자) · 출퇴근 기록 없는 공고 J2
  const today = kstDate()
  const at = (hm) => new Date(`${today}T${hm}:00+09:00`).toISOString()
  const atts = await rest('attendance')
  const att = atts.find((a) => a.job_id === J && a.user_id === W)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_in: at('09:00'), clock_out: at('18:00') })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: W2, name: '반나절', attendance: [], ratings: [] })
  await rest('attendance', 'POST', { ...att, id: 'eeeeeeee-0000-4000-8000-0000000000a7', user_id: W2, clock_in: at('09:00'), clock_out: at('13:00'), user: { ...att.user, id: W2, name: '반나절' } })
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: J2, title: '기록 없는 다음 주 행사', start_date: kstDate(new Date(Date.now() + 7 * 86400e3)), end_date: kstDate(new Date(Date.now() + 7 * 86400e3)), applications: [] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (desktop = false) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const ad = await pg()

  // ── 1. 정산 탭 합계 (기준값) ──
  await ad.goto(`${D}/admin/jobs/${J}?tab=pay`)
  const totalRow = ad.locator('tr', { hasText: '합계 2명' }).first()
  await totalRow.waitFor({ timeout: 10000 }).catch(() => {})
  const cells = await totalRow.locator('td').allInnerTexts()
  const payGross = num(cells[3] ?? '')
  ok('정산 탭: 2명 지급총액이 0보다 큼', payGross > 0, cells.join(' | '))

  // ── 2. 공고 화면 위쪽 ──
  const head = ad.locator('[data-job-wage]')
  const headText = (await head.innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("공고 화면: '지급총액 N원 · 세전 · 2명' (정산 탭과 같은 값)", num(headText.match(/지급총액 ([\d,]+)원/)?.[1] ?? '') === payGross && headText.includes('세전 · 2명'), headText)
  ok('누르면 정산 탭', (await head.getAttribute('href')) === `/admin/jobs/${J}?tab=pay`)
  ok('360px: 옆으로 안 밀림 (공고 화면)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 공고 목록 (휴대폰 카드) ──
  await ad.goto(`${D}/admin/jobs`)
  await ad.locator(`a[href="/admin/jobs/${J}"]`).first().waitFor({ timeout: 10000 }).catch(() => {})
  const card = (await ad.locator(`a[href="/admin/jobs/${J}"] [data-job-wage]`).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("목록 카드: '지급총액 N원 (세전 · 2명)'", num(card.match(/지급총액 ([\d,]+)원/)?.[1] ?? '') === payGross && card.includes('(세전 · 2명)'), card)
  ok('기록 없는 공고: 지급총액 표시 없음', (await ad.locator(`a[href="/admin/jobs/${J2}"] [data-job-wage]`).count()) === 0)
  ok('360px: 옆으로 안 밀림 (공고 목록)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 넓은 화면 표 ──
  const wide = await pg(true)
  await wide.goto(`${D}/admin/jobs`)
  const row = (id) => wide.locator('tr', { has: wide.locator(`a[href="/admin/jobs/${id}"]`) })
  await row(J).waitFor({ timeout: 10000 }).catch(() => {})
  ok("표에 '지급총액' 칸", (await wide.locator('th', { hasText: '지급총액' }).count()) === 1)
  const cellText = (await row(J).locator('[data-job-wage-cell]').innerText()).replace(/\s+/g, ' ')
  ok('표: 이 공고 지급총액 = 정산 탭 · 세전 · 2명', num(cellText.match(/([\d,]+)원/)?.[1] ?? '') === payGross && cellText.includes('세전 · 2명'), cellText)
  ok("표: 기록 없는 공고는 '-'", (await row(J2).locator('[data-job-wage-cell]').innerText()).trim() === '-')

  // ── 5. 모두 지급하면 '지급 완료' ──
  for (const a of (await rest('attendance')).filter((x) => x.job_id === J)) await rest(`attendance?id=eq.${a.id}`, 'PATCH', { paid: true, paid_at: new Date().toISOString() })
  await ad.goto(`${D}/admin/jobs/${J}`)
  ok("모두 지급: '지급 완료'", (await ad.locator('[data-job-wage]').innerText().catch(() => '')).includes('지급 완료'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
