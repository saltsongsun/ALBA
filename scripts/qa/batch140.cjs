// 묶음 140 (사용자 요청 2026-11-08 "인사이트 확인하고 개선해줘")
// · 위치에 막힌 횟수를 화면을 다시 열어도 기억 (오늘·이 공고 · 이 창에서만): 한 번 막힌 뒤 홈·문의를 다녀와 다시 누르다 또 막히면
//   바로 큰 버튼이 '담당자에게 출근 확인 요청' (인사이트: 근무 시작만 6분 동안 6번 · 화면을 오갈 때마다 횟수가 0으로)
// · 앱 아이콘으로 열 때(/me?app=1) 관리자는 관리자 화면부터 · 근무자는 내 근무 그대로 · '근무자 화면으로 보기' 중이면 그대로
// node scripts/qa/batch140.cjs <default 앱> <default 가짜> <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, F, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (base, p, method = 'GET', body) => fetch(`${base}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)) } return null }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (base, uid, extra = {}, cookies = []) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...extra })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }, ...cookies.map((c) => ({ ...c, url: base }))])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 위치에 막힌 횟수 기억 (fresh: 출근 전 · 현장 확인 필요 · 먼 곳) ──
  await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { gps_required: true, lat: 37.5, lng: 127.0, start_time: '00:00:00', end_time: '23:59:00' })
  const w = await pg(F, W, { geolocation: { latitude: 35.1, longitude: 129.0 }, permissions: ['geolocation'] })
  await w.goto(`${F}/me`)
  const main = w.locator('#today-work button[data-track]').first()
  await main.waitFor({ timeout: 15000 }).catch(() => {})
  await main.click()
  await until(async () => (await w.locator('[data-arrive-ask]').count()) > 0)
  ok('한 번 막힘: 아직 큰 버튼은 근무 시작', (await w.locator('[data-clock-stuck]').count()) === 0)
  // 홈에 갔다가 다시 내 근무 (화면을 새로 엶)
  await w.goto(`${F}/`)
  await w.goto(`${F}/me`)
  await main.waitFor({ timeout: 15000 }).catch(() => {})
  await main.click()
  const stuck = w.locator('[data-clock-stuck]')
  await until(async () => (await stuck.count()) > 0)
  ok("다시 열고 또 막히면 바로 '담당자에게 출근 확인 요청' (횟수를 기억)", (await stuck.locator('button[data-track="출근 확인 요청"]').innerText().catch(() => '')).includes('담당자에게 출근 확인 요청'))
  if (SHOTS) await stuck.screenshot({ path: `${SHOTS}/stuck-after-reload.png` }).catch(() => {})
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 앱 아이콘으로 열기 (/me?app=1) ──
  const man = await fetch(`${D}/manifest.webmanifest`).then((r) => r.json()).catch(() => ({}))
  ok("앱 시작 주소 '/me?app=1'", man.start_url === '/me?app=1', String(man.start_url))
  const a = await pg(D, A)
  await a.goto(`${D}/me?app=1`)
  await a.waitForURL((u) => new URL(u).pathname.startsWith('/admin'), { timeout: 10000 }).catch(() => {})
  ok('관리자: 앱으로 열면 관리자 화면', new URL(a.url()).pathname === '/admin', a.url())
  await a.goto(`${D}/me`)
  ok('관리자: 주소로 /me를 열면(앱 아이콘 아님) 그대로 내 근무', new URL(a.url()).pathname === '/me', a.url())
  const av = await pg(D, A, {}, [{ name: 'hw-view', value: 'worker' }])
  await av.goto(`${D}/me?app=1`)
  ok("관리자 '근무자 화면으로 보기' 중이면 앱으로 열어도 내 근무", new URL(av.url()).pathname === '/me', av.url())
  const ww = await pg(D, W)
  await ww.goto(`${D}/me?app=1`)
  ok('근무자: 앱으로 열면 내 근무 그대로', new URL(ww.url()).pathname === '/me' && (await ww.locator('#today-work').count()) === 1, ww.url())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
