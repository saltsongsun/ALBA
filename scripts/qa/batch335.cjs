// 묶음 335 (정기 개선 2026-11-21 09:35 KST · 근무자 휴대폰: 이미 시작한 오늘 근무 · 첫 문의 설명)
// · 알바 찾기 공고 카드: 하루짜리 오늘 근무가 이미 시작했으면 '오늘' 대신 '● 오늘 · 진행 중' (작은 초록 점 · 지원은 그대로)
//   아직 시작 전이거나 여러 날 공고는 예전처럼 '오늘' · 움직임 줄이기면 점이 깜빡이지 않음
// · 문의 첫 화면 설명('궁금한 점을 남기면 … 확인하고 답장해 드려요')이 휴대폰에서 '…'로 잘리지 않고 두 줄까지
// · 360px 옆으로 밀림 없음
// node scripts/qa/batch335.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const JS = 'cccccccc-0000-4000-8000-0000003350a1', JL = 'cccccccc-0000-4000-8000-0000003350a2', JM = 'cccccccc-0000-4000-8000-0000003350a3'
const N = 'bbbbbbbb-0000-4000-8000-0000003350b1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const kmin = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 오늘 하루짜리 · 00:00 시작(이미 시작) / 23:58 시작(아직 전) · 오늘~내일 이틀짜리 00:00 시작
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const mk = (id, title, start_date, end_date, start_time, end_time) =>
    rest('jobs', 'POST', { ...jb, id, title, status: 'open', start_date, end_date, start_time, end_time, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mk(JS, '오늘 아침부터 하는 안내', kday(0), kday(0), '00:00', '23:59')
  await mk(JL, '오늘 밤늦게 하는 정리', kday(0), kday(0), '23:58', '23:59')
  await mk(JM, '오늘부터 이틀 하는 행사', kday(0), kday(1), '00:00', '23:59')
  // 문의가 하나도 없는 새 회원 (첫 문의 설명이 보이는 화면)
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  await rest('users', 'POST', { ...kb, id: N, name: '첫문의', phone: '01033503351', photo_at: null, careers: [], nickname: null, created_at: '2026-11-01T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const page = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }
  const card = (p, id) => p.locator(`a[href="/jobs/${id}"]`).first()
  // 자정 바로 앞(23:58~)이나 00:00 정각이면 시작 여부가 바뀌는 때라 건너뜀
  const m = kmin()
  const stable = m >= 1 && m < 23 * 60 + 57

  // ── 1. 알바 찾기: 이미 시작한 오늘 하루짜리 → '오늘 · 진행 중'
  const p = await page(N)
  await go(p, '/')
  await card(p, JS).waitFor({ timeout: 15000 }).catch(() => {})
  if (stable) {
    const st = card(p, JS).locator('[data-card-started]')
    ok("이미 시작한 오늘 하루 근무: '오늘 · 진행 중'", (await st.count()) === 1 && one(await st.innerText()) === '오늘 · 진행 중', one(await card(p, JS).innerText().catch(() => '')).slice(0, 60))
    ok('지원은 그대로 받음 (모집중 배지)', one(await card(p, JS).innerText()).includes('모집중'))
    ok("아직 시작 전 오늘 근무: 예전처럼 '오늘'", (await card(p, JL).locator('[data-card-started]').count()) === 0 && one(await card(p, JL).innerText()).startsWith('오늘'))
    ok("여러 날 공고(오늘 시작): 예전처럼 '오늘'", (await card(p, JM).locator('[data-card-started]').count()) === 0 && one(await card(p, JM).innerText()).startsWith('오늘'))
    ok('배지가 한 줄 (카드 머리줄 안)', await card(p, JS).locator('[data-card-started]').evaluate((e) => e.getBoundingClientRect().height < 26))
  } else ok('자정 무렵이라 시작 여부 확인은 건너뜀', true)
  ok('360px 옆으로 밀림 없음 (알바 찾기)', await noSide(p))
  if (SHOTS) {
    await card(p, JS).scrollIntoViewIfNeeded().catch(() => {})
    await p.screenshot({ path: `${SHOTS}/card-started.png` })
  }

  // ── 2. 움직임 줄이기: 점은 그대로, 깜빡이는 겹은 숨김
  if (stable) {
    const r = await page(N, { reducedMotion: 'reduce' })
    await go(r, '/')
    const ping = card(r, JS).locator('[data-card-started] span[aria-hidden] > span').first()
    ok('움직임 줄이기: 깜빡이는 겹 숨김', (await ping.evaluate((e) => getComputedStyle(e).display).catch(() => '')) === 'none')
  }

  // ── 3. 문의 첫 화면 설명: 잘리지 않음 (두 줄까지)
  await go(p, '/me/chat')
  const intro = p.locator('[data-chat-intro]')
  await intro.waitFor({ timeout: 15000 }).catch(() => {})
  const it = one(await intro.innerText().catch(() => ''))
  ok("첫 문의 설명 전체: '…확인하고 답장해 드려요.'", it.startsWith('궁금한 점을 남기면') && it.endsWith('확인하고 답장해 드려요.'), it)
  const fit = await intro.evaluate((e) => ({ cut: e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis', h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) }))
  ok("'…'로 잘리지 않음 · 두 줄 안", !fit.cut && fit.h <= fit.lh * 2 + 2, JSON.stringify(fit))
  ok('360px 옆으로 밀림 없음 (문의)', await noSide(p))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chat-intro.png` })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
