// 묶음 93: 지원자 '보류' (사용자 요청 "확정과 미선발 외에도 보류도 넣어줘 · 근무자에게는 따로 알림 가지 않게")
// · 공고 지원자 탭: 확정 · 보류 · 미선발 → 보류하면 '보류' 칸으로 따로 (보류 배지) · 위 줄에 '보류 n명' · '보류 풀기'로 다시 대기
// · 상태는 그대로 '지원'(applied) · 근무자에게 알림·문의함 기록 없음 · 근무자 화면에 '보류' 글자 없음
// · 보류에서 바로 확정 가능 (확정하면 보류 표시가 풀림) · 대시보드 확정 대기 카드에도 '보류' (누르면 카드가 빠짐)
// node scripts/qa/batch93.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const app = async () => (await rest(`applications?id=eq.${APP}`))[0]

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
  const msgsBefore = (await rest(`messages?thread_user_id=eq.${AP}`)).length
  const a = await pg(A)
  const card = () => a.locator('div.card', { hasText: '김지원' }).filter({ has: a.getByRole('button', { name: /확정/ }) }).first()

  // ── 1. 지원자 탭에서 보류 ──
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await card().waitFor({ timeout: 10000 }).catch(() => {})
  ok("대기 카드에 '확정 · 보류 · 미선발'", (await card().getByRole('button', { name: '보류', exact: true }).count()) === 1 && (await card().getByRole('button', { name: '미선발', exact: true }).count()) === 1)
  ok('360px: 버튼 줄 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await card().getByRole('button', { name: '보류', exact: true }).click()
  await a.getByText('보류 · 근무자에게는 알리지 않았어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("안내 '김지원님 보류 · 근무자에게는 알리지 않았어요'", (await a.getByText('김지원님 보류 · 근무자에게는 알리지 않았어요').count()) >= 1)
  const r1 = await app()
  ok('상태는 그대로 지원(applied) · 보류 시각 기록', r1.status === 'applied' && !!r1.held_at, JSON.stringify({ s: r1.status, h: r1.held_at }))
  ok('근무자에게 알림·문의함 기록 없음', (await rest(`messages?thread_user_id=eq.${AP}`)).length === msgsBefore)
  ok("위 줄에 '보류 1명' · 보류 칸에 따로", (await a.getByText(/대기 0명 · 보류 1명/).count()) >= 1 && (await a.locator('[data-app-group=보류]').count()) === 1)
  await a.locator('[data-app-group=보류] summary').click().catch(() => {})
  await a.waitForTimeout(400)
  ok("보류 카드: '보류' 배지 + '보류 풀기'", (await a.locator('[data-app-group=보류] [data-held]').count()) === 1 && (await a.locator('[data-app-group=보류]').getByRole('button', { name: '보류 풀기' }).count()) === 1)

  // ── 2. 근무자 화면엔 '보류'가 없음 ──
  const w = await pg(AP)
  await w.goto(`${D}/jobs/${J}`)
  await w.locator('main').waitFor()
  await w.waitForTimeout(600)
  ok("근무자 공고 화면에 '보류' 글자 없음 (그대로 검토 중)", !(await w.locator('main').innerText()).includes('보류'))

  // ── 3. 보류 풀기 → 다시 대기 ──
  await a.locator('[data-app-group=보류]').getByRole('button', { name: '보류 풀기' }).click()
  await a.getByText('보류를 풀었어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("'보류 풀기' → 다시 대기", !(await app()).held_at && (await a.getByText(/대기 1명/).count()) >= 1)

  // ── 4. 대시보드: 보류 → 확정 대기에서 빠짐 ──
  await a.goto(`${D}/admin`)
  const dcard = a.locator('div.card', { hasText: '김지원' }).filter({ has: a.getByRole('button', { name: '보류', exact: true }) }).first()
  await dcard.waitFor({ timeout: 10000 }).catch(() => {})
  ok("대시보드 확정 대기 카드에 '확정 · 보류 · 미선발' (한 줄)", (await dcard.count()) === 1 && (await dcard.getByRole('button', { name: '보류', exact: true }).evaluate((el) => el.getBoundingClientRect().height < 56)))
  await dcard.getByRole('button', { name: '보류', exact: true }).click()
  await a.getByText('보류 · 근무자에게는 알리지 않았어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForTimeout(500)
  ok('대시보드에서 보류하면 확정 대기 카드에서 빠짐', (await a.locator('div.card', { hasText: '김지원' }).filter({ has: a.getByRole('button', { name: '보류', exact: true }) }).count()) === 0 && !!(await app()).held_at)

  // ── 5. 보류에서 바로 확정 ── (오후 6시 뒤에 돌려도 '끝난 행사 · 확정?' 확인에 걸리지 않게 공고 날짜를 내일로)
  const tmr = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr })
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await a.locator('[data-app-group=보류] summary').click().catch(() => {})
  await a.waitForTimeout(400)
  await a.locator('[data-app-group=보류]').getByRole('button', { name: '확정', exact: true }).click()
  await a.waitForTimeout(1500)
  const r5 = await app()
  ok('보류에서 확정 → 확정 · 보류 표시 풀림', r5.status === 'approved' && !r5.held_at, JSON.stringify({ s: r5.status, h: r5.held_at }))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
