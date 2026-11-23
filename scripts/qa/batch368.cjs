// 묶음 368 (정기 개선 2026-11-24 01:35 KST)
// · 근무자 내 근무 '오늘의 근무' 카드: 시작까지 3시간보다 많이 남았으면 회색 한 줄 'HH:MM 시작까지 n시간 m분'
//   (전엔 아무 말 없이 큰 '근무 시작' 버튼만 — 새벽·아침 일찍 열어도 아직 멀었다는 걸 바로 알게) · 3시간 안이면 예전처럼 파란 칸
// · 어색한 두 줄 정리: 놀이터 랭킹 점수 규칙(괄호 중간에서 꺾이지 않게 묶음마다 한 덩어리) · 회사 후기 빈 화면 '지난 근무' 링크 한 줄
// node scripts/qa/batch368.cjs <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString()
const kday = (ms) => kst(ms).slice(0, 10)
const hm = (ms) => kst(ms).slice(11, 16)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)
  // 오늘 근무 (출근 전 · 서류 서명 끝 · fresh 자료): 시작 시각을 바꿔 가며 '오늘의 근무' 카드를 봄
  const setStart = (startMs) =>
    rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(Date.now()), end_date: kday(Date.now()), start_time: `${hm(startMs)}:00`, end_time: `${hm(startMs + 4 * 3600e3)}:00`, status: 'open' })
  const openMe = async () => { await w.goto(`${D}/me`, { waitUntil: 'networkidle' }); await w.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 5시간 남음 (오늘 안일 때만 · 밤늦게 돌리면 시작이 내일이 되어 건너뜀)
  const far = Date.now() + 5 * 3600e3 + 5 * 60e3
  if (kday(far) === kday(Date.now()) && kday(far + 4 * 3600e3) === kday(Date.now())) {
    await setStart(far)
    await openMe()
    const line = w.locator('[data-start-far]')
    const t = one(await line.innerText().catch(() => ''))
    ok(`5시간 남음: 회색 한 줄 '${hm(far)} 시작까지 5시간 n분'`, new RegExp(`^${hm(far)} 시작까지 5시간( \\d+분)?$`).test(t) && (await line.evaluate((el) => el.classList.contains('text-sub'))), t)
    ok('한 줄 · 시계 선 아이콘 · 파란 칸은 없음', (await line.evaluate((el) => el.getBoundingClientRect().height < 26)) && (await line.locator('svg').count()) === 1 && (await w.locator('main').innerText()).split('시작까지').length === 2)
    ok("'근무 시작' 버튼은 그대로", (await w.getByRole('button', { name: '근무 시작' }).count()) >= 1)
    ok('360px 옆으로 안 밀림', await noSide(w))
    if (SHOTS) {
      await line.scrollIntoViewIfNeeded().catch(() => {})
      await w.waitForTimeout(300)
      await line.locator('xpath=ancestor::*[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/me-far.png` }).catch(() => {})
    }
  } else ok('(밤늦게 돌려서 5시간 뒤가 내일 → 이 칸은 건너뜀)', true)

  // ── 2. 1시간 남음: 예전처럼 파란 칸 '시작까지 1시간' · 회색 줄 없음
  const near = Date.now() + 60 * 60e3 + 30e3
  if (kday(near) === kday(Date.now()) && kday(near + 4 * 3600e3) === kday(Date.now())) {
    await setStart(near)
    await openMe()
    const t = one(await w.locator('main').innerText().catch(() => ''))
    ok("1시간 남음: 예전처럼 '시작까지 1시간' 파란 칸 · 회색 줄 없음", (await w.locator('[data-start-far]').count()) === 0 && t.includes(`${hm(near)} 시작까지 1시간`), t.slice(0, 80))
  } else ok('(밤늦게 돌려서 1시간 뒤 근무가 내일로 넘어감 → 건너뜀)', true)

  // ── 3. 놀이터 랭킹 점수 규칙: 묶음마다 한 줄 (괄호 중간에서 안 꺾임)
  await w.goto(`${D}/community/play`, { waitUntil: 'networkidle' })
  const rules = w.locator('[data-rank-rules]')
  const rt = one(await rules.innerText().catch(() => ''))
  ok('점수 규칙 내용 그대로', rt === '출석 10 · 근무 마침 20 · 글 5 · 댓글 2점 (글 3개 · 댓글 10개까지) · 월요일에 새로 시작', rt)
  const broken = await rules.locator('span.whitespace-nowrap').evaluateAll((els) => els.filter((el) => { const t = [...el.getClientRects()].map((r) => Math.round(r.top)); return Math.max(...t) - Math.min(...t) > 3 }).map((el) => el.textContent))
  ok("묶음 4개가 모두 한 줄 ('댓글 / 10개까지'처럼 안 꺾임)", (await rules.locator('span.whitespace-nowrap').count()) === 4 && broken.length === 0, broken.join(' | '))
  ok('360px 옆으로 안 밀림 (놀이터)', await noSide(w))
  if (SHOTS) await rules.screenshot({ path: `${SHOTS}/rank-rules.png` }).catch(() => {})

  // ── 4. 회사 후기 빈 화면: '지난 근무' 링크 한 줄
  await w.goto(`${D}/community/company/${C1}`, { waitUntil: 'networkidle' })
  const link = w.locator('main a[href="/me/history"]', { hasText: '지난 근무' })
  if ((await link.count()) > 0) {
    ok("'지난 근무' 링크가 두 줄로 안 갈라짐", await link.first().evaluate((el) => { const t = [...el.getClientRects()].map((r) => Math.round(r.top)); return t.length > 0 && Math.max(...t) - Math.min(...t) <= 3 }))
  } else ok('(후기가 있어 빈 화면 안내가 없음 → 건너뜀)', true)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
