// 묶음 367 (정기 개선 2026-11-23 22:35 KST)
// · 근무자 공고 화면 (확정 · 근무 중인데 그날 종료 시각이 지남):
//   - '지금 근무 중 · HH:MM 시작'(초록 · 그대로) 바로 아래 'HH:MM 종료 · n 지났어요'(주황 · 지난 시간은 0.25초 톡) — 근무시간 변경에 동의했으면 그 종료 시각
//   - 아래 서명 바: '근무 시간이 끝났어요 · 서명이 아직 남았어요' (전엔 '지금 근무 중이에요')
//   - '근무 종료하러 가기'가 빨강으로 눈에 띄게 → 내 근무의 근무 종료 버튼(#clock)으로
//   - 종료 시각 전이면 예전 그대로 (주황 줄 없음 · 회색 버튼 → /me)
// · 모집 QR 화면: 주소는 한 줄 (회사 번호 중간에서 두 줄로 꺾이지 않게) · 인쇄하면 전체 주소 · QR은 열 때 살짝 톡
// node scripts/qa/batch367.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
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
  const now = Date.now()
  // 공고는 어제~내일 (자정 언저리에도 끝난 공고가 되지 않게) · 근무자는 서명 전(기본 자료) · 근무 중
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(now - 864e5), end_date: kday(now + 864e5), status: 'open' })
  // 근무시간 변경에 동의한 근무: 3시간 전 시작 · 30분 전 종료 (종료 시각이 지났는데 종료를 안 누름)
  const setShift = (s, e, inAt) => rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { work_date: kday(s), sched_start: `${hm(s)}:00`, sched_end: `${hm(e)}:00`, clock_in: new Date(inAt).toISOString(), clock_out: null, adj_in: null, adj_out: null })
  await setShift(now - 3 * 3600e3, now - 30 * 60e3, now - 3 * 3600e3)
  const [att] = await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)
  ok('(준비) 근무 중 · 그날 종료 30분 전에 지남', !!att?.clock_in && !att?.clock_out && att?.sched_end === `${hm(now - 30 * 60e3)}:00`, `${att?.work_date} ${att?.sched_start}~${att?.sched_end}`)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p) => { await p.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' }); await p.locator('[data-my-work]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 종료 시각이 지남
  const w = await mk(W)
  await open(w)
  const line = w.locator('[data-my-work]')
  const over = w.locator('[data-my-work-over]')
  ok("위 줄은 그대로 '지금 근무 중 · HH:MM 시작' (예정 종료가 지나도 일하는 중이면 근무 중 — 묶음 307)", (await line.getAttribute('data-my-work')) === 'working' && one(await line.innerText()) === `지금 근무 중 · ${hm(now - 3 * 3600e3)} 시작`, one(await line.innerText().catch(() => '')))
  const lt = one(await over.innerText().catch(() => ''))
  ok(`바로 아래 '${hm(now - 30 * 60e3)} 종료 · n분 지났어요' (근무시간 변경한 종료 시각)`, new RegExp(`^${hm(now - 30 * 60e3)} 종료 · (3[0-2]분|\\d+시간( \\d+분)?) 지났어요$`).test(lt), lt)
  ok('주황 · 한 줄', (await over.evaluate((el) => el.classList.contains('text-amber-700'))) && (await over.evaluate((el) => el.getBoundingClientRect().height < 26)))
  const pop = await over.locator('span.inline-block').evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration]).catch(() => [])
  ok('지난 시간은 0.25초 톡', JSON.stringify(pop) === '["pop","0.25s"]', JSON.stringify(pop))
  const note = one(await w.locator('[data-sticky-note]').textContent().catch(() => ''))
  ok("아래 서명 바: '근무 시간이 끝났어요 · 서명이 아직 남았어요'", note === '근무 시간이 끝났어요 · 서명이 아직 남았어요', note)
  const go = w.locator('[data-end-go="over"]')
  ok("'근무 종료하러 가기' 빨강 → 내 근무 근무 종료 버튼(#clock)", (await go.count()) === 1 && one(await go.innerText()) === '근무 종료하러 가기' && (await go.getAttribute('href')) === '/me#clock' && ((await go.getAttribute('class')) ?? '').includes('btn-danger'))
  ok("서명 버튼은 그대로 (파랑 '서류 서명하기')", (await w.locator('[data-sign-cta]').count()) === 1 && ((await w.locator('[data-sign-cta]').getAttribute('class')) ?? '').includes('btn-primary'))
  ok('360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) {
    await w.locator('#apply').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
    await w.waitForTimeout(600)
    await w.locator('#apply').screenshot({ path: `${SHOTS}/job-over.png` }).catch(() => {})
  }
  await Promise.all([w.waitForURL((u) => u.pathname === '/me', { timeout: 15000 }).catch(() => {}), go.click()])
  ok('누르면 내 근무 #clock', new URL(w.url()).pathname === '/me' && new URL(w.url()).hash === '#clock', w.url())

  // 움직임 줄이기
  const rm = await mk(W, { reducedMotion: 'reduce' })
  await open(rm)
  const rd = await rm.locator('[data-my-work-over] span.inline-block').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  // ── 2. 종료 시각 전이면 예전 그대로
  await setShift(now - 3600e3, now + 3600e3, now - 40 * 60e3)
  await open(w)
  ok("종료 전: '지금 근무 중 · HH:MM 시작'만 (주황 줄 없음)", (await line.getAttribute('data-my-work')) === 'working' && one(await line.innerText()) === `지금 근무 중 · ${hm(now - 40 * 60e3)} 시작` && (await over.count()) === 0, one(await line.innerText().catch(() => '')))
  ok("종료 전: 서명 바 '지금 근무 중이에요 · 서명이 아직 남았어요'", one(await w.locator('[data-sticky-note]').textContent().catch(() => '')) === '지금 근무 중이에요 · 서명이 아직 남았어요')
  const plain = w.getByRole('link', { name: '근무 종료하러 가기' })
  ok("종료 전: '근무 종료하러 가기'는 회색 → 내 근무", (await w.locator('[data-end-go]').count()) === 0 && (await plain.getAttribute('href')) === '/me' && ((await plain.getAttribute('class')) ?? '').includes('btn-gray'))

  // ── 3. 모집 QR 화면
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/poster`, { waitUntil: 'networkidle' })
  const u = a.locator('[data-poster-url]')
  const ut = (await u.innerText().catch(() => '')).trim()
  ok('주소 한 줄 (말줄임) · 앞의 http:// 빼고', (await u.evaluate((el) => el.getBoundingClientRect().height < 20)) && !ut.startsWith('http') && ut.endsWith(`/?co=${C1}`), ut)
  ok('누르고 있으면 전체 주소 (title)', /^https?:\/\/.+\/\?co=/.test((await u.getAttribute('title')) ?? ''))
  const qa = await a.locator('[data-poster-qr]').evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])
  ok('QR은 열 때 0.25초 톡', JSON.stringify(qa) === '["pop","0.25s"]', JSON.stringify(qa))
  ok('360px 옆으로 안 밀림 (QR)', await noSide(a))
  if (SHOTS) await a.locator('[data-poster]').screenshot({ path: `${SHOTS}/poster.png` }).catch(() => {})
  await a.emulateMedia({ media: 'print' })
  const ws = await u.evaluate((el) => getComputedStyle(el).whiteSpace)
  ok('인쇄하면 전체 주소 (줄바꿈 허용)', ws === 'normal', ws)
  await a.emulateMedia({ media: 'screen' })
  const rp = await mk(A, { reducedMotion: 'reduce' })
  await rp.goto(`${D}/admin/jobs/poster`, { waitUntil: 'networkidle' })
  const rq = await rp.locator('[data-poster-qr]').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: QR 바로', rq < 0.05, String(rq))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
