// 묶음 222 (정기 개선 2026-11-12 22:36 KST)
// · 근무자 홈 '오늘 근무' 카드: 근무 중인데 예정 종료가 지났으면 '지금 근무 중이에요' 대신 '근무 종료를 아직 안 눌렀어요'
//   버튼 '종료 →'(톡) → 내 근무의 근무 종료 버튼으로 바로 (#clock) · 서명도 남았으면 '서명·근무 종료가 남았어요'
//   근무시간을 바꾼(연장한) 날은 바뀐 종료 시각 기준
// · 근무 중(종료 전)이면 카드 맨 아래 얇은 막대: 근무 시간이 얼마나 지났는지 (처음엔 0에서 짧게 차오름)
// node scripts/qa/batch222.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  // 오늘 0시~23:59 근무 · 근무자는 이미 근무 중(가짜 데이터) · 서류는 먼저 서명한 상태로
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  const docs = (await rest(`signed_docs?user_id=eq.${W}`)) ?? []
  const pendingDoc = docs.find((d) => d.status === 'pending')
  for (const d of docs) await rest(`signed_docs?id=eq.${d.id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  const [att] = await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)

  const b = await chromium.launch()
  const errs = []
  const mk = async (opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const p = await mk()
  const hero = p.locator('[data-today-hero]')
  const label = async () => one(await hero.locator('span.block').first().innerText().catch(() => ''))
  const open = async () => {
    await p.goto(`${D}/`, { waitUntil: 'networkidle' })
    await hero.waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 근무 중 (종료 전): 막대가 지난 만큼 차오름
  await open()
  const bar = hero.locator('[data-shift-bar]')
  ok("근무 중: '지금 근무 중이에요' · '출퇴근 →' (내 근무로)", (await label()) === '지금 근무 중이에요' && (await hero.innerText()).includes('출퇴근 →') && (await hero.getAttribute('href')) === '/me', await label())
  await p.waitForTimeout(600)
  const now = new Date(Date.now() + 9 * 3600e3)
  const expect = ((now.getUTCHours() * 60 + now.getUTCMinutes()) / (23 * 60 + 59)) * 100
  const pct = Number(await bar.getAttribute('data-shift-bar'))
  ok('카드 아래 막대: 근무 시간이 지난 만큼 (±2%)', (await bar.count()) === 1 && Math.abs(pct - expect) <= 2, `${pct} vs ${expect.toFixed(1)}`)
  const fill = await bar.evaluate((el) => {
    const f = el.firstElementChild, r = el.getBoundingClientRect(), c = el.closest('[data-today-hero]').getBoundingClientRect()
    return { w: f.getBoundingClientRect().width / r.width, inCard: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && Math.abs(r.bottom - c.bottom) < 1.5, tr: getComputedStyle(f).transitionDuration }
  })
  ok('막대는 카드 맨 아래 · 채운 폭 = 지난 정도 · 0.3초로 차오름', fill.inCard && Math.abs(fill.w * 100 - pct) <= 1.5 && fill.tr === '0.3s', JSON.stringify(fill))
  ok('360px 옆으로 안 밀림 (홈)', await noSide(p))
  if (SHOTS) {
    const bx = await hero.boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/shift-bar.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }

  // ── 2. 예정 종료가 지났는데 근무 중: '근무 종료를 아직 안 눌렀어요' → 종료 버튼으로
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '00:01:00' })
  await open()
  const go = hero.locator('span', { hasText: '종료 →' }).last()
  ok("종료 시각 지남: '근무 종료를 아직 안 눌렀어요' · '종료 →'", (await label()) === '근무 종료를 아직 안 눌렀어요' && (await go.count()) === 1 && (await hero.getAttribute('data-today-out-late')) === '', await label())
  ok('버튼이 한 번 톡 (눈에 띄게) · 막대는 없음', ((await go.getAttribute('class')) ?? '').includes('animate-bump') && (await bar.count()) === 0)
  ok("누르는 곳: 내 근무의 근무 종료 버튼 (/me#clock)", (await hero.getAttribute('href')) === '/me#clock')
  if (SHOTS) {
    const bx = await hero.boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/out-late.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }
  await hero.click()
  await p.waitForURL((u) => new URL(u).pathname === '/me' && new URL(u).hash === '#clock', { timeout: 15000 }).catch(() => {})
  const endBtn = p.getByRole('button', { name: '근무 종료' }).first()
  await endBtn.waitFor({ timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(800)
  ok('내 근무로 와서 근무 종료 버튼이 화면 안에 보임', await endBtn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }).catch(() => false))

  // ── 3. 서명도 남았으면: '서명·근무 종료가 남았어요' · 서명이 먼저
  if (pendingDoc) await rest(`signed_docs?id=eq.${pendingDoc.id}`, 'PATCH', { status: 'pending', signed_at: null })
  await open()
  ok("서명도 남았으면 '서명·근무 종료가 남았어요' · '서명 →' (서류로)", !pendingDoc || ((await label()) === '서명·근무 종료가 남았어요' && (await hero.innerText()).includes('서명 →') && (await hero.getAttribute('href')) === `/docs/${pendingDoc.id}`), await label())
  if (pendingDoc) await rest(`signed_docs?id=eq.${pendingDoc.id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })

  // ── 4. 근무시간을 늦게까지 바꾼(동의한) 날: 바뀐 종료 시각 기준이라 아직 근무 중
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { sched_start: '00:00:00', sched_end: '23:59:00' })
  await open()
  ok('근무시간을 23:59까지 바꾼 날: 아직 지금 근무 중이에요 (막대도 있음)', (await label()) === '지금 근무 중이에요' && (await bar.count()) === 1, await label())

  // ── 5. 움직임 줄이기: 막대가 바로 (차오르는 움직임 없음)
  const r = await mk({ reducedMotion: 'reduce' })
  await r.goto(`${D}/`, { waitUntil: 'networkidle' })
  const rbar = r.locator('[data-today-hero] [data-shift-bar]')
  await rbar.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'움직임 줄이기'면 막대가 움직이지 않음", (await rbar.evaluate((el) => getComputedStyle(el.firstElementChild).transitionProperty).catch(() => '')) === 'none')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
