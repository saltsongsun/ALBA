// 묶음 52: 저장하지 않은 변경 안내 — 회사 설정·내 정보(계좌·연락)를 고치면 아래 탭 위에 '저장하지 않은 변경이 있어요 · 저장'
//          · 원래대로 되돌리면 사라짐 · 그 상태로 다른 화면 링크를 누르면 한 번 멈추고 '한 번 더 누르면 저장 없이 나가요'
//          · 바의 '저장'으로 저장하면 사라지고 그다음엔 바로 이동 · 두 번 누르면 저장 없이 나감 · 360px
// node scripts/qa/batch52.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', CO = '99999999-0000-4000-8000-000000000099'
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
  const bar = (p) => p.locator('[data-unsaved]')
  const barText = (p) => bar(p).innerText().catch(() => '')

  // ── 1. 회사 설정 ──
  const a = await pg(A)
  await a.goto(`${D}/admin/settings`)
  const phone = a.locator('input[name=company_phone]')
  await phone.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  ok('처음엔 저장 바 없음', (await bar(a).count()) === 0)
  const orig = await phone.inputValue()
  await phone.fill(orig + '9')
  await bar(a).waitFor({ timeout: 5000 }).catch(() => {})
  ok("고치면 '저장하지 않은 변경이 있어요' + 저장", (await barText(a)).includes('저장하지 않은 변경이 있어요') && (await bar(a).getByRole('button', { name: '저장' }).count()) === 1)
  const box = await bar(a).boundingBox()
  const tab = await a.locator('[data-admin-tabbar]').boundingBox()
  ok('바는 아래 탭 위에 (겹치지 않음)', !!box && !!tab && box.y + box.height <= tab.y + 12, JSON.stringify({ bar: box && Math.round(box.y + box.height), tab: tab && Math.round(tab.y) }))
  ok('360px: 옆으로 안 밀림 (저장 바)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await phone.fill(orig)
  await a.waitForTimeout(300)
  ok('원래대로 되돌리면 사라짐', (await bar(a).count()) === 0)

  // 고친 채로 다른 화면 링크 → 한 번 멈춤
  await phone.fill(orig + '9')
  await bar(a).waitFor({ timeout: 5000 }).catch(() => {})
  const jobsLink = a.locator('[data-admin-tabbar] a[href="/admin/jobs"]')
  await jobsLink.click()
  await a.waitForTimeout(600)
  ok("다른 화면 링크: 한 번은 멈추고 '한 번 더 누르면 저장 없이 나가요'", new URL(a.url()).pathname === '/admin/settings' && (await barText(a)).includes('한 번 더 누르면 저장 없이 나가요'))

  // 바의 저장 → 저장되고 바가 사라짐 → 이제 바로 이동
  await bar(a).getByRole('button', { name: '저장' }).click()
  await bar(a).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  const [co] = await rest(`companies?id=eq.${CO}`)
  ok('바의 저장: 저장되고 바가 사라짐', (await bar(a).count()) === 0 && co?.company_phone === orig + '9', co?.company_phone)
  await jobsLink.click()
  await a.waitForURL((u) => new URL(u).pathname === '/admin/jobs', { timeout: 10000 }).catch(() => {})
  ok('저장한 뒤엔 링크가 바로 이동', new URL(a.url()).pathname === '/admin/jobs', a.url())

  // 두 번 누르면 저장 없이 나감
  await a.goto(`${D}/admin/settings`)
  await phone.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  await phone.fill('0299998888')
  await bar(a).waitFor({ timeout: 5000 }).catch(() => {})
  await jobsLink.click()
  await a.waitForTimeout(300)
  await jobsLink.click()
  await a.waitForURL((u) => new URL(u).pathname === '/admin/jobs', { timeout: 10000 }).catch(() => {})
  const [co2] = await rest(`companies?id=eq.${CO}`)
  ok('두 번 누르면 저장 없이 나감 (값은 그대로)', new URL(a.url()).pathname === '/admin/jobs' && co2?.company_phone === orig + '9', co2?.company_phone)
  await rest(`companies?id=eq.${CO}`, 'PATCH', { company_phone: orig })

  // ── 2. 근무자 내 정보 ──
  const w = await pg(W)
  await w.goto(`${D}/me/profile`)
  const addr = w.locator('#address')
  await addr.waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForLoadState('networkidle').catch(() => {})
  ok('내 정보: 처음엔 저장 바 없음', (await bar(w).count()) === 0)
  await addr.fill('서울 중구 세종대로 110')
  await bar(w).waitFor({ timeout: 5000 }).catch(() => {})
  ok('내 정보: 주소를 고치면 저장 바', (await barText(w)).includes('저장하지 않은 변경이 있어요'))
  const wb = await bar(w).boundingBox()
  const nav = await w.locator('nav[data-bottom-nav]').boundingBox()
  ok('내 정보: 바는 아래 탭 위에', !!wb && !!nav && wb.y + wb.height <= nav.y + 12)
  await bar(w).getByRole('button', { name: '저장' }).click()
  await bar(w).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  const [u] = await rest(`users?id=eq.${W}`)
  ok('내 정보: 바의 저장으로 저장', (await bar(w).count()) === 0 && u?.address === '서울 중구 세종대로 110', u?.address)
  ok('360px: 옆으로 안 밀림 (내 정보)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
