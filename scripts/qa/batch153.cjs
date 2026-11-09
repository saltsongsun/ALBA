// 묶음 153 (정기 개선 2026-11-09 03:38)
// · 근무 시작 한 시간도 더 전에 '근무 시작'을 누르면: '한 번 더 누르면 시작' + '시작까지 n시간 남았어요 / 현장에 왔으면 한 번 더 눌러 주세요'
//   (집에서 실수로 눌러 출근이 찍히지 않게) · 5초 지나면 원래대로 · 한 번 더 누르면 그대로 시작
// · 앱 설치 안내창: 로그인한 사람에게만 저절로 (처음 온 사람은 공고부터 보게) · 로그인하면 그대로
// node scripts/qa/batch153.cjs <default 앱> <default 가짜> <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, F, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (base, p, method = 'GET', body) => fetch(`${base}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)) } return null }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (base, uid, { install = false } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript((install) => {
      try {
        sessionStorage.setItem('photo-prompt-later', '1')
        sessionStorage.setItem('clockout-prompt-later', String(Date.now()))
        localStorage.setItem('push-nudge-later', String(Date.now()))
        if (!install) localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5))
      } catch {}
    }, install)
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무 시작 한 시간도 더 전: 한 번 더 묻기 (오늘 23:30 시작 · 위치 확인 없음)
  const nowKst = new Date(Date.now() + 9 * 3600e3)
  const minsKst = nowKst.getUTCHours() * 60 + nowKst.getUTCMinutes()
  if (minsKst >= 22 * 60 + 25) {
    console.log('SKIP  22:25가 지나 시작 한 시간 전 확인 생략')
  } else {
    await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { start_time: '23:30:00', end_time: '23:59:00', gps_required: false, lat: null, lng: null })
    const w = await pg(F, W)
    await w.goto(`${F}/me`)
    const main = w.locator('#today-work button[data-track]').first()
    await main.waitFor({ timeout: 15000 }).catch(() => {})
    ok("준비: 출근 전 '근무 시작'", (await main.innerText().catch(() => '')).includes('근무 시작'), await main.innerText().catch(() => ''))
    const atts = async () => (await rest(MF, `attendance?user_id=eq.${W}`)).length
    const before = await atts()
    const note = w.locator('[data-early-start]')
    await main.click()
    await note.waitFor({ timeout: 3000 }).catch(() => {})
    ok("첫 누름: '한 번 더 누르면 시작'", (await main.innerText()).trim() === '한 번 더 누르면 시작', await main.innerText())
    const t = (await note.innerText().catch(() => '')).replace(/\n/g, ' / ')
    ok("'시작까지 n시간 m분 남았어요 / 현장에 왔으면 한 번 더 눌러 주세요'", /^시작까지 \d+시간( \d+분)? 남았어요 \/ 현장에 왔으면 한 번 더 눌러 주세요$/.test(t), t)
    ok('출근은 아직 안 찍힘', (await atts()) === before)
    ok('안내 두 줄 각각 한 줄 · 360px 옆으로 안 밀림', (await note.evaluate((el) => [...el.children].every((c) => c.getBoundingClientRect().height < 24))) && (await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
    await w.waitForTimeout(500)
    ok('안내가 아래 탭 줄에 가리지 않음', await note.evaluate((el) => { const r = el.getBoundingClientRect(), nav = document.querySelector('[data-bottom-nav]')?.getBoundingClientRect(); return r.top >= 0 && (!nav || r.bottom <= nav.top) }))
    if (SHOTS) await w.screenshot({ path: `${SHOTS}/early-start.png` }).catch(() => {})
    // 가만히 두면 원래대로
    await w.waitForTimeout(5400)
    ok("5초 지나면 원래대로 '근무 시작' · 안내 사라짐", (await main.innerText()).trim() === '근무 시작' && (await note.count()) === 0)
    // 다시 누르고 한 번 더 → 시작
    await main.click()
    await note.waitFor({ timeout: 3000 }).catch(() => {})
    await main.click()
    ok('한 번 더 누르면 그대로 시작 (출근 기록)', !!(await until(async () => (await atts()) === before + 1)))
  }

  // ── 2. 앱 설치 안내창: 처음 온 사람(로그인 전)에겐 저절로 안 뜸 · 로그인하면 뜸
  const sheet = (p) => p.getByRole('dialog', { name: '앱 설치 안내' })
  const g = await pg(D, null, { install: true })
  await g.goto(`${D}/`)
  await g.waitForLoadState('networkidle').catch(() => {})
  await g.waitForTimeout(1500)
  ok('로그인 전 첫 화면: 설치 안내창 안 뜸', (await sheet(g).count()) === 0)
  const s = await pg(D, W, { install: true })
  await s.goto(`${D}/`)
  ok('로그인한 근무자 홈: 설치 안내창 그대로 뜸', await sheet(s).waitFor({ timeout: 8000 }).then(() => true, () => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
