// 묶음 324 (정기 개선 2026-11-20 11:35 KST)
// · 지난 근무: 달마다 금액 옆 '복사' — 그 달 근무 기록을 글로 (회사 · 공고 / 날짜 · n일 · 시간 · 실수령 · 지급완료/지급 전 / 합계)
//   화면에 보이는 숫자 그대로 · 오늘 근무 중(아직 계산 전)인 것은 빼고, 그런 것만 있는 달은 버튼 없음
//   누르면 '복사됨 ✓' (짧게 튀어나옴 · 움직임 줄이기면 바로) · 360px 한 줄
// node scripts/qa/batch324.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000324a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 전에 끝난 행사 (W가 9시간 일함 · 지급 전)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J2, title: '가을 축제 주차 안내', status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  const [j2] = await rest(`jobs?id=eq.${J2}`)
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000032401', job_id: J2, job: j2, user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: D })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)
  await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  await w.waitForTimeout(500)
  const sec = w.locator('section', { has: w.locator(`[data-history-job="${J2}"]`) }).first()
  const copy = sec.locator('[data-month-head]').getByRole('button', { name: '복사' })
  ok("지난 근무가 있는 달: 금액 옆 '복사'", (await copy.count()) === 1)
  ok('달 제목 줄이 한 줄 (360px · 옆으로 밀림 없음)', (await sec.locator('[data-month-head]').evaluate((el) => el.getBoundingClientRect().height < 40)) && (await noSide(w)))
  if (SHOTS) {
    await sec.locator('[data-month-head]').scrollIntoViewIfNeeded()
    await w.screenshot({ path: `${SHOTS}/history-copy.png` })
  }
  await copy.click()
  const done = await sec.getByText('복사됨 ✓').waitFor({ timeout: 3000 }).then(() => true, () => false)
  const clip = await w.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok("누르면 '복사됨 ✓'", done)
  const ym = kday(-3)
  ok('첫 줄: n년 n월 근무 기록', clip.split('\n')[0] === `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월 근무 기록`, clip.split('\n')[0])
  ok('회사 · 공고 줄', clip.includes('· 주식회사 테스트 · 가을 축제 주차 안내'))
  ok('날짜 · 1일 · 시간 · 실수령 · 지급 전 (화면 숫자 그대로)', await (async () => {
    const shown = one(await sec.locator(`[data-history-job="${J2}"] .text-lg`).first().textContent())
    const line = clip.split('\n').find((l) => l.includes('실수령') && !l.startsWith('합계')) ?? ''
    return /1일/.test(line) && line.includes(`실수령 ${shown}`) && line.endsWith('지급 전')
  })(), clip.replace(/\n/g, ' / '))
  ok('마지막 줄: 합계 실수령', /^합계 실수령 [\d,]+원$/.test(clip.split('\n').pop()), clip.split('\n').pop())
  // 오늘 근무 중(아직 계산 전)인 공고는 복사 글에 없음 · 그런 것만 있는 달은 버튼 없음
  const liveSec = w.locator('section', { has: w.locator(`[data-history-job="${J}"]`) }).first()
  if ((await liveSec.count()) && (await liveSec.locator('[data-live-shift]').count())) {
    const same = (await liveSec.locator(`[data-history-job="${J2}"]`).count()) > 0
    if (same) ok('오늘 근무 중인 공고는 복사 글에 없음', !clip.includes('경상남도 생활체육대축전'))
    else ok("오늘 근무 중인 것만 있는 달: '복사' 없음", (await liveSec.locator('[data-month-head] button').count()) === 0)
  }
  // 움직임 줄이기: 바로 '복사됨 ✓'
  const r = await mk(W, { reducedMotion: 'reduce' })
  await r.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  const rsec = r.locator('section', { has: r.locator(`[data-history-job="${J2}"]`) }).first()
  await rsec.locator('[data-month-head]').getByRole('button', { name: '복사' }).click()
  ok("움직임 줄이기에서도 '복사됨 ✓'이 바로 보임", await rsec.getByText('복사됨 ✓').waitFor({ timeout: 2000 }).then(() => true, () => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
