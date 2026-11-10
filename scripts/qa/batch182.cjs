// 묶음 182 (정기 개선 2026-11-10 21:35 KST)
// · 출퇴근 탭: 위 숫자 칸(근무 중 · 종료 · 미출근)을 누르면 그 상태인 사람만 보임 — 한 번 더 누르거나 '전체 보기'로 돌아감
//   (사람이 많은 날 미출근자만 골라 연락하기 쉽게 · 얼굴 명단·출석 체크 보기에도 같이 걸림 · 배치·보기는 그대로 유지)
// · 관리자 공고 화면 탭 줄(지원자·출퇴근·정산·서류): 한참 내려가 있어도 위로 살짝 올리면 머리글 아래에 다시 나타남
//   (아래로 내리는 동안은 숨어서 화면을 차지하지 않음 · 제자리에 있을 땐 그대로)
// node scripts/qa/batch182.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const AP_APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const today = kstDay(Date.now())

  // 준비: 오늘 근무(시간에 상관없이 진행 중으로) · 근무자(근무 중) + 김지원(확정 · 아직 출근 전 = 미출근)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', available_dates: null })
  const base = `${D}/admin/jobs/${J}?tab=att&date=${today}`
  const names = async () => (await a.locator('.stagger.space-y-2:not(.hidden) > *').evaluateAll((els) => els.map((e) => (e.textContent.includes('김지원') ? '김지원' : e.textContent.includes('근무자') ? '근무자' : '?')))).filter((n) => n !== '?')
  const stat = (k) => a.locator(`[data-att-stat=${k}]`)

  // ── 1. 숫자 칸으로 거르기
  await a.goto(base)
  await stat('absent').waitFor({ timeout: 15000 }).catch(() => {})
  ok('처음엔 모두 보임 (2명)', (await names()).length === 2, JSON.stringify(await names()))
  ok("숫자 칸: 근무 중 1 · 종료 0 · 미출근 1 (누를 수 있음)", (await stat('working').innerText()).replace(/\s+/g, ' ').trim() === '근무 중 1' && (await stat('done').innerText()).replace(/\s+/g, ' ').trim() === '종료 0' && (await stat('absent').innerText()).replace(/\s+/g, ' ').trim() === '미출근 1', [await stat('working').innerText(), await stat('done').innerText(), await stat('absent').innerText()].map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '))
  await stat('absent').click()
  await a.waitForURL((u) => u.searchParams.get('st') === 'absent', { timeout: 15000 }).catch(() => {})
  const on = a.locator('[data-att-stat-on]')
  await on.waitFor({ timeout: 5000 }).catch(() => {})
  ok("'미출근'을 누르면 미출근자만 (김지원)", JSON.stringify(await names()) === JSON.stringify(['김지원']), JSON.stringify(await names()))
  ok("'미출근 1명만 보는 중 · 전체 보기' · 누른 칸에 표시", (await on.innerText()).replace(/\s+/g, ' ').trim() === '미출근 1명만 보는 중 전체 보기' && (await stat('absent').getAttribute('aria-current')) === 'true' && (await stat('working').getAttribute('aria-current')) === null, (await on.innerText()).replace(/\s+/g, ' ').trim())
  ok('한 줄 · 360px 옆으로 안 밀림', (await on.evaluate((el) => el.getBoundingClientRect().height < 44)) && (await noSide(a)))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/att-filter.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})
  // 보기를 바꿔도 거르기는 그대로 (얼굴 명단)
  await a.locator('[data-att-views] [data-view=faces]').click()
  await a.waitForURL((u) => u.searchParams.get('view') === 'faces' && u.searchParams.get('st') === 'absent', { timeout: 15000 }).catch(() => {})
  await a.locator('[data-faces-grid]').waitFor({ timeout: 5000 }).catch(() => {})
  const faceText = (await a.locator('[data-faces-grid]').innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok('얼굴 명단으로 바꿔도 미출근자만', new URL(a.url()).searchParams.get('st') === 'absent' && faceText.includes('김지원') && !faceText.includes('근무자'), faceText.slice(0, 60))
  await a.locator('[data-att-views] [data-view=list]').click()
  await a.waitForURL((u) => !u.searchParams.get('view') && u.searchParams.get('st') === 'absent', { timeout: 15000 }).catch(() => {})
  // 다른 칸을 누르면 그 상태로
  await stat('working').click()
  await a.waitForURL((u) => u.searchParams.get('st') === 'working', { timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(300)
  ok("'근무 중'을 누르면 근무 중인 사람만 (근무자)", JSON.stringify(await names()) === JSON.stringify(['근무자']), JSON.stringify(await names()))
  // 해당하는 사람이 없는 칸
  await stat('done').click()
  await a.waitForURL((u) => u.searchParams.get('st') === 'done', { timeout: 15000 }).catch(() => {})
  await a.getByText('종료인 사람이 없어요.').waitFor({ timeout: 5000 }).catch(() => {})
  ok("해당하는 사람이 없으면 '종료인 사람이 없어요.'", (await a.getByText('종료인 사람이 없어요.').count()) === 1 && (await names()).length === 0)
  // 같은 칸을 한 번 더 누르면 전체
  await stat('done').click()
  await a.waitForURL((u) => !u.searchParams.get('st'), { timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(300)
  ok('같은 칸을 한 번 더 누르면 전체로', (await names()).length === 2 && (await a.locator('[data-att-stat-on]').count()) === 0)
  // '전체 보기'로도 돌아감
  await stat('absent').click()
  await on.waitFor({ timeout: 5000 }).catch(() => {})
  await on.getByRole('link', { name: '전체 보기' }).click()
  await a.waitForURL((u) => !u.searchParams.get('st'), { timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(300)
  ok("'전체 보기'로도 돌아감", (await names()).length === 2)

  // ── 2. 탭 줄: 위로 올리면 다시 나타남
  const bar = a.locator('[data-job-tabs]')
  const mode = () => bar.getAttribute('data-reveal')
  await a.evaluate(() => window.scrollTo(0, 0))
  await a.waitForTimeout(250)
  ok('맨 위: 제자리 (rest)', (await mode()) === 'rest')
  // 아래로 끝까지 (여러 번에 나눠 — 실제 손가락처럼)
  await a.evaluate(async () => { const max = document.scrollingElement.scrollHeight - innerHeight; for (let y = 0; y <= max; y += 120) { window.scrollTo(0, y); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) } window.scrollTo(0, max) })
  await a.waitForTimeout(350)
  const hid = await bar.evaluate((el) => ({ m: el.dataset.reveal, op: getComputedStyle(el).opacity, inert: el.inert }))
  ok('아래로 내리면 숨음 (안 보이고 눌리지 않음)', hid.m === 'hidden' && hid.op === '0' && hid.inert === true, JSON.stringify(hid))
  // 위로 살짝
  await a.evaluate(async () => { for (let i = 0; i < 4; i++) { window.scrollBy(0, -40); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) } })
  await a.waitForTimeout(350)
  const shown = await bar.evaluate((el) => ({ m: el.dataset.reveal, op: getComputedStyle(el).opacity, top: Math.round(el.getBoundingClientRect().top), dur: getComputedStyle(el).transitionDuration, bg: getComputedStyle(el).backgroundColor }))
  ok('위로 살짝 올리면 머리글 아래에 다시 나타남', shown.m === 'shown' && shown.op === '1' && shown.top >= 50 && shown.top <= 60, JSON.stringify(shown))
  ok('움직임은 짧게 (0.2초) · 바탕이 있어 글자가 겹치지 않음', shown.dur.startsWith('0.2s') && !/rgba\(0, 0, 0, 0\)|transparent/.test(shown.bg), JSON.stringify(shown))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/tabs-reveal.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})
  // 나타난 탭 줄에서 바로 다른 탭으로
  await bar.getByRole('link', { name: '정산' }).click()
  await a.waitForURL((u) => u.searchParams.get('tab') === 'pay', { timeout: 15000 }).catch(() => {})
  ok('나타난 탭 줄에서 바로 정산 탭으로', new URL(a.url()).searchParams.get('tab') === 'pay', a.url())
  ok('360px 옆으로 안 밀림', await noSide(a))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
