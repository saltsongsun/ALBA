// 묶음 233 (정기 개선 2026-11-13 12:36 KST)
// · 작은 글자 링크·접기 제목: 보이는 크기·자리는 그대로, 누르는 곳만 위아래 10px 넓힘 ('tap')
//   '← 뒤로' 링크 전부 · '지난 근무 전체 →' · '지도 ↓' · 회사 줄 · '휴게·공제·지급일 자세히' · '점수 얻는 법' · '날짜별 기록'
//   · '문의하기 →' · '커뮤니티 →' · 관리자 '본 가입자…' · '근무시간 변경' · '귀가 조치'
// · 출퇴근 탭 빠른 별점: 별 하나하나를 손가락 크기(26×32)로 · 전화·문자와 한 줄('평가' 글자는 빼고 읽어 주기용 이름만) · 저장되면 별 위에 '✓ n점'이 잠깐 톡 (자리는 안 차지함)
// node scripts/qa/batch233.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

/** 글자 위·아래 8px 바깥을 눌러도 그 링크·제목이 눌리는지 (보이는 높이는 그대로인지) */
async function reach(p, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const x = r.left + Math.min(r.width / 2, 20)
    const hit = (y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)) }
    const after = getComputedStyle(el, '::after')
    return { up: hit(r.top - 8), down: hit(r.bottom + 8), h: Math.round(r.height), inset: after.top }
  }).catch((e) => ({ err: String(e).slice(0, 80) }))
}

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const check = async (p, label, loc) => {
    const r = await reach(p, loc)
    ok(`${label}: 글자 위·아래 8px 바깥도 눌림 (보이는 높이 ${r.h}px 그대로)`, r.up && r.down && r.inset === '-10px', JSON.stringify(r))
  }

  // ── 1. 근무자 화면
  const w = await mk(W)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await check(w, "내 근무 '지난 근무 전체 →'", w.locator('a[href="/me/history"]', { hasText: '지난 근무 전체' }))
  await check(w, "레벨 카드 '점수 얻는 법'", w.locator('[data-xp-rules] summary'))
  await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  await check(w, "지난 근무 '← 내 근무'", w.locator('main a', { hasText: '← 내 근무' }).first())
  await w.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  await check(w, "내 정보 '문의하기 →'", w.locator('[data-ask-info]'))
  await check(w, "내 정보 '커뮤니티 →'", w.locator('a[href="/community"]', { hasText: '커뮤니티 →' }))
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  await check(w, "공고 '지도 ↓'", w.locator('[data-venue-link]'))
  await check(w, '공고 회사 줄', w.locator('[data-company-line]'))
  await check(w, "공고 '휴게·공제·지급일 자세히'", w.locator('[data-pay-more] > summary'))
  // 실제로 글자 7px 위를 눌러도 지도까지 내려감
  const venue = w.locator('[data-venue-link]')
  const bx = await venue.boundingBox()
  if (bx) await w.mouse.click(bx.x + 6, bx.y - 7)
  await w.waitForTimeout(400)
  ok("'지도 ↓' 글자 7px 위를 눌러도 지도로 (#venue)", new URL(w.url()).hash === '#venue', w.url())
  ok('360px 옆으로 안 밀림 (공고)', await noSide(w))

  // ── 2. 관리자 출퇴근 탭: 빠른 별점
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(0), end_date: kst(0), start_time: '00:00:00', end_time: '23:59:00' })
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/${J}?tab=att`, { waitUntil: 'networkidle' })
  const rate = a.locator('[data-quick-rate]').first()
  await rate.waitFor({ timeout: 15000 }).catch(() => {})
  const sizes = await rate.locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  ok('별 5개가 손가락 크기 (26×32 이상)', sizes.length === 5 && sizes.every(([x, y]) => x >= 26 && y >= 32), JSON.stringify(sizes))
  // 전화·문자 버튼과 한 줄 (별이 커져도 아래로 떨어지지 않게)
  const oneLine = await rate.evaluate((el) => { const row = el.closest('div'); const btn = row.querySelector('a, button'); return Math.abs(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - (btn.getBoundingClientRect().top + btn.getBoundingClientRect().height / 2)) < 6 })
  ok('별점이 전화·문자 버튼과 같은 줄 (360px)', oneLine)
  await check(a, "공고 화면 '← 공고 목록'", a.locator('main a', { hasText: '← 공고 목록' }).first())
  const rowH0 = await rate.evaluate((el) => el.parentElement.parentElement.getBoundingClientRect().height)
  // 가짜 데이터에 이미 4점이 있어 다른 점수(2점)로 바꿔 봄
  await rate.getByRole('button', { name: '2점' }).click()
  const saved = rate.locator('[data-rate-saved]')
  const shown = await saved.locator('span').waitFor({ timeout: 8000 }).then(() => true, () => false)
  ok("누르면 별 위에 '✓ 2점'이 톡 · 별 2개만 채워짐", shown && (await saved.innerText()).trim() === '✓ 2점' && (await rate.locator('button.text-amber-400').count()) === 2, (await saved.innerText().catch(() => '')).trim())
  const rowH1 = await rate.evaluate((el) => el.parentElement.parentElement.getBoundingClientRect().height)
  ok("'✓ 2점'은 자리를 차지하지 않음 (줄 높이 그대로)", Math.abs(rowH1 - rowH0) < 1, `${rowH0} → ${rowH1}`)
  if (SHOTS) {
    const r = await rate.evaluate((el) => { const x = el.parentElement.parentElement.getBoundingClientRect(); return { y: x.top, h: x.height } })
    await a.screenshot({ path: `${SHOTS}/quick-rate.png`, clip: { x: 0, y: Math.max(0, r.y - 24), width: 360, height: r.h + 36 } }).catch(() => {})
  }
  const rows = ((await rest('worker_ratings')) ?? []).filter((x) => x.user_id === W && x.job_id === J && x.rater_id === A)
  ok('2점으로 저장됨', rows.some((x) => x.score === 2), JSON.stringify(rows.map((x) => x.score)))
  await a.waitForTimeout(2200)
  ok("'✓ 2점'은 잠깐 뒤 사라짐", (await saved.locator('span').count()) === 0)
  ok('360px 옆으로 안 밀림 (출퇴근 탭)', await noSide(a))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
