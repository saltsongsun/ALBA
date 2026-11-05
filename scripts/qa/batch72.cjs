// 묶음 72: 근무자 명단 '알림 꺼짐' 표시·모아 보기 + PC 채팅 말풍선에 '오른쪽 클릭' 안내
// · 휴대폰 알림을 안 켠 근무자에게 '알림 꺼짐' 표시 · '알림 꺼짐' 칩으로 그 사람들만
// · PC(마우스)에서 말풍선에 올리면 '오른쪽 클릭 · 복사…' 작은 안내 → 눌러도 메뉴가 열림 · 휴대폰에서는 안 보임
// node scripts/qa/batch72.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = 'bbbbbbbb-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 근무자(W)만 알림 켬 · 김지원은 안 켬
  await rest('push_subscriptions', 'POST', { user_id: W, endpoint: 'https://push.example/abc', p256dh: 'x', auth: 'y' })
  const users = await rest('users')
  const kim = users.find((u) => u.name === '김지원')

  const b = await chromium.launch()
  const errs = []
  const pg = async (desktop) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무자 명단: 알림 꺼짐 ──
  const ad = await pg(false)
  await ad.goto(`${D}/admin/workers`)
  await ad.waitForLoadState('networkidle').catch(() => {})
  const card = (name) => ad.locator('.sm\\:hidden .card', { hasText: name })
  ok("알림 안 켠 김지원: '알림 꺼짐'", (await card('김지원').locator('[data-push-off]').count()) === 1)
  ok('알림 켠 근무자: 표시 없음', (await card('근무자').locator('[data-push-off]').count()) === 0)
  await ad.getByRole('link', { name: '알림 꺼짐' }).click()
  await ad.waitForURL(/f=nopush/, { timeout: 10000 }).catch(() => {})
  await ad.waitForLoadState('networkidle').catch(() => {})
  ok("'알림 꺼짐' 칩: 안 켠 사람만", (await card('김지원').count()) === 1 && (await card('근무자').count()) === 0, ad.url())
  ok('360px: 옆으로 안 밀림 (명단)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. PC 채팅: 말풍선에 올리면 '오른쪽 클릭' 안내 ──
  const pc = await pg(true)
  await pc.goto(`${D}/admin/chat/${W}`)
  const bubble = pc.locator('main [data-msg-menu]').first()
  await bubble.waitFor({ timeout: 10000 }).catch(() => {})
  const hint = bubble.locator('[data-msg-hint]')
  ok('PC: 올리기 전에는 안내 없음', !(await hint.isVisible()))
  await bubble.hover()
  await pc.waitForTimeout(200)
  ok("PC: 올리면 '오른쪽 클릭 · 복사…'", (await hint.isVisible()) && (await hint.innerText()).includes('오른쪽 클릭') && (await hint.innerText()).includes('복사'), await hint.innerText().catch(() => ''))
  await hint.click()
  ok('PC: 안내를 눌러도 메뉴가 열림', await pc.locator('[data-msg-actions]').isVisible().catch(() => false))
  await pc.keyboard.press('Escape')

  // 휴대폰에서는 안내 없음 (꾹 누르기)
  await ad.goto(`${D}/admin/chat/${W}`)
  const mb = ad.locator('main [data-msg-menu]').first()
  await mb.waitFor({ timeout: 10000 }).catch(() => {})
  ok('휴대폰: 안내 표시 없음', !(await mb.locator('[data-msg-hint]').isVisible()))
  void kim
  void AP

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
