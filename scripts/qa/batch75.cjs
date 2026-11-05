// 묶음 75: 알림 2단계 — 전체 알림 듣기 / 최소 알림 듣기
// · 내 정보(근무자)·대시보드(관리자) 알림 칸에서 고름 · 기본은 전체 · 고르면 바로 저장(회원 정보 push_level)
// · 최소: 단체방 일반 메시지·커뮤니티·새 모집·단체 공지(관리자는 새 지원자)는 오지 않는다고 안내
// node scripts/qa/batch75.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무자: 내 정보 ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/profile`)
  const box = wk.locator('[data-push-settings] [data-push-level]')
  await box.waitFor({ timeout: 10000 }).catch(() => {})
  ok("기본은 '전체 알림 듣기'", (await box.getAttribute('data-push-level')) === 'all' && (await wk.locator('[data-level="all"]').getAttribute('aria-checked')) === 'true')
  await wk.locator('[data-level="min"]').click()
  await wk.getByText('최소 알림만 받아요').waitFor({ timeout: 8000 }).catch(() => {})
  const [w] = await rest(`users?id=eq.${W}`)
  ok("'최소 알림 듣기' 누르면 저장 (push_level=min)", w.push_level === 'min', String(w.push_level))
  await wk.reload()
  await box.waitFor({ timeout: 10000 }).catch(() => {})
  ok('다시 열어도 최소로 남음 · 빠지는 알림 안내', (await box.getAttribute('data-push-level')) === 'min' && (await wk.locator('[data-push-settings]').innerText()).includes('단체방 일반 메시지'))
  ok('360px: 옆으로 안 밀림 (내 정보)', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await wk.locator('[data-level="all"]').click()
  await wk.getByText('모든 알림을 받아요').waitFor({ timeout: 8000 }).catch(() => {})
  ok("다시 '전체'로", (await rest(`users?id=eq.${W}`))[0].push_level === 'all')

  // ── 2. 관리자: 대시보드 알림 칸 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin`)
  const abox = ad.locator('[data-push-settings] [data-push-level]')
  await abox.waitFor({ timeout: 10000 }).catch(() => {})
  ok('관리자 대시보드에도 알림 단계', (await abox.count()) === 1 && (await ad.locator('[data-push-settings]').innerText()).includes('새 지원자'))
  await ad.locator('[data-level="min"]').click()
  await ad.getByText('최소 알림만 받아요').waitFor({ timeout: 8000 }).catch(() => {})
  ok('관리자도 최소로 저장', (await rest(`users?id=eq.${A}`))[0].push_level === 'min')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
