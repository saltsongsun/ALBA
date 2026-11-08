// 묶음 148 (정기 개선 2026-11-08 22:35)
// · 여러 명 고르기 막대에 '보류' (지원자 탭 · 대시보드): 고른 사람을 한 번에 보류 · 근무자에게는 알림 없음 · 상태는 그대로 대기
//   보류한 사람은 지원자 탭 '보류' 칸으로, 대시보드 '확정 대기'에서는 빠짐
// · 막대는 아래에서 짧게(0.25초) 올라오고, Esc를 누르면 고른 것이 모두 풀림
// node scripts/qa/batch148.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const AP_APP = '11111111-0000-4000-8000-000000000012'
const X = '33333333-0000-4000-8000-0000000014f1', Y = '33333333-0000-4000-8000-0000000014f2'
const XA = '11111111-0000-4000-8000-0000000014f1', YA = '11111111-0000-4000-8000-0000000014f2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const app = async (id) => (await rest(`applications?id=eq.${id}`))[0]

;(async () => {
  const [apApp] = await rest(`applications?id=eq.${AP_APP}`)
  for (const [id, aid, name] of [[X, XA, '보류하나'], [Y, YA, '보류둘']]) {
    await rest('applications', 'POST', { ...apApp, id: aid, user_id: id, user: { ...apApp.user, id, name }, held_at: null, status: 'applied', created_at: new Date().toISOString() })
  }
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 지원자 탭: 둘 골라 보류
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  const group = a.locator('[data-app-group="대기"]').first()
  await group.waitFor({ timeout: 15000 }).catch(() => {})
  await group.locator(`input[name="app"][value="${XA}"]`).check()
  const bar = a.locator('[data-bulk-bar]')
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  const anim = await bar.evaluate((el) => el.getAnimations().map((x) => `${x.animationName}:${x.effect.getTiming().duration}`).join(','))
  ok('막대가 아래에서 0.25초 동안 올라옴', /slide-up:250/.test(anim), anim)
  // Esc: 고른 것 풀기
  await a.keyboard.press('Escape')
  await a.waitForTimeout(150)
  ok('Esc → 고른 것 풀리고 막대 사라짐', (await bar.count()) === 0 && !(await group.locator(`input[value="${XA}"]`).isChecked()))
  await group.locator(`input[name="app"][value="${XA}"]`).check()
  await group.locator(`input[name="app"][value="${YA}"]`).check()
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  const hold = bar.locator('[data-bulk-hold]')
  ok("막대에 '보류'", (await hold.innerText().catch(() => '')) === '보류')
  ok('막대 첫 줄이 한 줄 (보류·선택 해제가 꺾이지 않음)', await bar.evaluate((el) => el.firstElementChild.getBoundingClientRect().height < 34), String(await bar.evaluate((el) => el.firstElementChild.getBoundingClientRect().height)))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/bulk-hold.png` })
  const before = (await rest(`messages?thread_user_id=eq.${X}`)).length
  await Promise.all([a.waitForURL(/m=/, { timeout: 15000 }).catch(() => {}), hold.click()])
  const m = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok("'2명 보류 · 근무자에게는 알리지 않았어요' (한 번에 · 두 번 안 물음)", m === '2명 보류 · 근무자에게는 알리지 않았어요', m)
  const [x, y, ap] = [await app(XA), await app(YA), await app(AP_APP)]
  ok('고른 둘은 보류(상태는 그대로 대기) · 안 고른 사람은 그대로', !!x.held_at && !!y.held_at && x.status === 'applied' && y.status === 'applied' && !ap.held_at)
  ok('근무자에게 알림·문의함 기록 없음', (await rest(`messages?thread_user_id=eq.${X}`)).length === before)
  ok('기록(audit)에 남음', (await rest('audit_logs')).some((r) => JSON.stringify(r).includes('application.hold_selected')))
  await a.waitForTimeout(300)
  const held = a.locator('[data-app-group="보류"]').first()
  ok("지원자 탭 '보류 2명' 칸으로", (await held.innerText().catch(() => '')).includes('보류 2명'))

  // ── 2. 대시보드: 보류한 사람은 확정 대기에서 빠짐 · 남은 사람 보류
  await rest(`applications?id=eq.${YA}`, 'PATCH', { held_at: null })
  await a.goto(`${D}/admin`)
  const pend = a.locator('#pending')
  await pend.waitFor({ timeout: 15000 }).catch(() => {})
  ok('대시보드: 보류한 사람(보류하나)은 확정 대기에 없음', !(await pend.innerText()).includes('보류하나') && (await pend.innerText()).includes('보류둘'))
  await pend.locator(`input[name="app"][value="${YA}"]`).first().check()
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  await Promise.all([a.waitForURL(/m=/, { timeout: 15000 }).catch(() => {}), bar.locator('[data-bulk-hold]').click()])
  ok("대시보드에서도 보류 → '1명 보류 · …' · 대시보드로", decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '').startsWith('1명 보류') && new URL(a.url()).pathname === '/admin')
  ok('보류한 사람은 확정 대기에서 빠짐', !!(await app(YA)).held_at && !(await a.locator('#pending').innerText()).includes('보류둘'))
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
