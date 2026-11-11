// 묶음 196 (정기 개선 2026-11-11 12:36 KST)
// · 근무 전날 '못 가요': 내 근무의 예정 카드 '내일 갈게요' 옆 → 공고의 '근무를 못 하게 됐어요' 칸이 열려 있고 테두리로 표시
//   (하루 안에 시작이라 '먼저 담당자에게 전화하기'가 함께 보임) · 확인한 뒤에도 '못 가게 됐어요'로 같은 곳
// · 관리자 홈: 내일 시작하는 공고 카드에 "· 내일 ‘갈게요’ n명" (다 눌렀으면 초록 · 내일 시작이 아니면 없음)
// · 관리자 공고 화면: 모두 눌렀으면 전날 안내 칸이 초록 바탕
// node scripts/qa/batch196.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), tomorrow = kstDay(now + 864e5)
  // 준비: 공고를 내일 하루로 · 확정자 둘 (근무자 · 김지원) · 오늘 근무 기록은 지움
  const setJob = async (patch) => {
    await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
    for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  }
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', available_dates: null })
  // 시작은 '내일 · 지금 시각보다 조금 이른 때' → 언제 돌려도 하루(24시간) 안에 시작 (예전에는 09:00으로 고정이라 자정~오전 9시에 돌리면 24시간이 넘었음)
  const nowMin = Math.floor(((now + 9 * 3600e3) % 864e5) / 60000)
  const startMin = Math.max(0, Math.min(nowMin - 30, 14 * 60)) // 늦어도 14:00 (끝나는 시각이 같은 날 안에 들게)
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
  await setJob({ start_date: tomorrow, end_date: tomorrow, start_time: hm(startMin), end_time: hm(startMin + 9 * 60), status: 'open' })
  // (가짜 데이터: 공고에 붙어 있는 지원 상태 목록도 확정 둘로 맞춤 — 관리자 홈의 '확정 n명'이 이것을 셈)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { applications: [{ status: 'approved' }, { status: 'approved' }] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/${name}.png` }) } }
  const open = async (p, path) => { await p.goto(D + path); await p.waitForLoadState('networkidle').catch(() => {}) }

  // ── 1. 관리자 홈: 아직 아무도 안 눌렀을 때
  const a = await pg(A)
  const dash = a.locator(`a[href="/admin/jobs/${J}"]`, { has: a.locator('[data-dash-coming]') })
  const dc = dash.locator('[data-dash-coming]')
  await open(a, '/admin')
  ok("관리자 홈 공고 카드: '· 내일 ‘갈게요’ 0명' (회색)", one(await dc.innerText().catch(() => '')) === '· 내일 ‘갈게요’ 0명' && (await dc.getAttribute('class').catch(() => '')).includes('text-mute'), one(await dc.innerText().catch(() => '')))
  ok("'확정 n/m명 · 내일 갈게요'는 한 줄 · 360px 옆으로 안 밀림", (await dc.evaluate((el) => el.parentElement.getBoundingClientRect().height < 30).catch(() => false)) && (await noSide(a)))

  // ── 2. 근무자: '못 가요' → 공고의 '근무를 못 하게 됐어요' 칸이 열림
  const w = await pg(W)
  await open(w, '/me')
  const ask = w.locator('[data-coming="ask"]')
  const cant = ask.locator('[data-coming-cant]')
  ok("예정 카드: '못 가요'가 '내일 갈게요' 옆에 (→ 공고의 취소 칸)", one(await cant.innerText().catch(() => '')) === '못 가요' && (await cant.getAttribute('href').catch(() => '')) === `/jobs/${J}?cant=1#cant`, await cant.getAttribute('href').catch(() => ''))
  await w.waitForTimeout(500)
  ok('한 줄에 나란히 · 둘 다 높이 40px 이상', await ask.evaluate((el) => { const l = el.querySelector('[data-coming-cant]').getBoundingClientRect(), r = el.querySelector('button').getBoundingClientRect(); return Math.abs(l.top - r.top) < 2 && l.height >= 40 && r.height >= 40 && l.right <= r.left }).catch(() => false))
  ok('360px: 옆으로 안 밀림 (내 근무)', await noSide(w))
  await ask.scrollIntoViewIfNeeded().catch(() => {})
  await shot(w, '1-worker-ask')
  await cant.click()
  await w.waitForURL(/cant=1/, { timeout: 10000 }).catch(() => {})
  await w.waitForLoadState('networkidle').catch(() => {})
  const box = w.locator('details#cant')
  await w.waitForFunction(() => document.querySelector('details#cant')?.hasAttribute('data-hash-focus'), null, { timeout: 5000 }).catch(() => {})
  ok("공고: '근무를 못 하게 됐어요' 칸이 열려 있고 테두리로 표시", (await box.evaluate((el) => el.open && el.hasAttribute('data-hash-focus')).catch(() => false)))
  ok('그 칸이 화면 안에 보임 (찾아 내려가지 않아도 됨)', await box.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 80 }).catch(() => false))
  ok("하루 안에 시작: '먼저 담당자에게 전화하기'가 함께 보임", (await box.locator('[data-cancel-soon]').count()) === 1 && (await box.locator('[data-cancel-call]').isVisible().catch(() => false)))
  ok('360px: 옆으로 안 밀림 (공고)', await noSide(w))
  await shot(w, '2-job-cant')
  // 그냥 공고를 열면 예전처럼 접혀 있음
  await open(w, `/jobs/${J}`)
  ok("바로 가기가 아니면 접혀 있음 (예전 그대로)", await w.locator('details#cant').evaluate((el) => !el.open && !el.hasAttribute('data-hash-focus')).catch(() => false))

  // ── 3. 근무자가 '내일 갈게요' → 확인 줄에 '못 가게 됐어요'
  await open(w, '/me')
  await ask.locator('button').click()
  const done = w.locator('[data-coming="done"]')
  await done.waitFor({ timeout: 10000 }).catch(() => {})
  ok("확인한 뒤: '✓ 내일 출근 확인함 · 시각' + '못 가게 됐어요' (같은 곳으로)", /^✓ 내일 출근 확인함 · \d{2}:\d{2} 못 가게 됐어요$/.test(one(await done.innerText().catch(() => ''))) && (await done.locator('[data-coming-cant]').getAttribute('href').catch(() => '')) === `/jobs/${J}?cant=1#cant`, one(await done.innerText().catch(() => '')))
  await w.waitForTimeout(500)
  ok("확인 줄은 한 줄 · '못 가게 됐어요' 누르는 높이 40px 이상", await done.evaluate((el) => el.getBoundingClientRect().height < 56 && el.querySelector('[data-coming-cant]').getBoundingClientRect().height >= 40).catch(() => false))
  await done.scrollIntoViewIfNeeded().catch(() => {})
  await shot(w, '3-worker-done')

  // ── 4. 관리자: 한 명 누름 → 주황 · 둘 다 누름 → 초록 (공고 화면의 칸도 초록 바탕)
  await open(a, '/admin')
  ok("관리자 홈: '· 내일 ‘갈게요’ 1명' (주황)", one(await dc.innerText().catch(() => '')) === '· 내일 ‘갈게요’ 1명' && (await dc.getAttribute('class').catch(() => '')).includes('text-amber-600'), one(await dc.innerText().catch(() => '')))
  await dash.scrollIntoViewIfNeeded().catch(() => {})
  await shot(a, '4-admin-home')
  await open(a, `/admin/jobs/${J}`)
  const card = a.locator('[data-remind-read]')
  ok('공고 화면: 아직 다 안 눌렀으면 회색 바탕', (await card.getAttribute('data-coming-all')) === null && (await card.getAttribute('class')).includes('bg-bg'))
  const ap = await pg(AP)
  await open(ap, '/me')
  await ap.locator('[data-coming="ask"] button').click()
  await ap.locator('[data-coming="done"]').waitFor({ timeout: 10000 }).catch(() => {})
  await open(a, '/admin')
  ok("둘 다 누르면 '· 내일 ‘갈게요’ 2명' (초록)", one(await dc.innerText().catch(() => '')) === '· 내일 ‘갈게요’ 2명' && (await dc.getAttribute('class').catch(() => '')).includes('text-emerald-600'), one(await dc.innerText().catch(() => '')))
  await open(a, `/admin/jobs/${J}`)
  ok("공고 화면: 모두 눌렀으면 초록 바탕 + '모두 온대요'", (await card.getAttribute('data-coming-all')) === '' && (await card.getAttribute('class')).includes('bg-emerald-50') && one(await card.innerText()).includes('모두 온대요'), one(await card.innerText().catch(() => '')))
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await shot(a, '5-admin-all')

  // ── 5. 내일 시작이 아니면 관리자 홈에 그 말이 없음
  const day2 = kstDay(now + 2 * 864e5)
  await setJob({ start_date: day2, end_date: day2 })
  await open(a, '/admin')
  ok('모레 시작 공고: 카드에 갈게요 수 없음', (await a.locator('[data-dash-coming]').count()) === 0 && (await a.locator(`a[href="/admin/jobs/${J}"]`).count()) > 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
