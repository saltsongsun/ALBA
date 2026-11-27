// 묶음 417 (정기 개선 2026-11-27 21:36 KST)
// 기능 · 출퇴근 탭 '근무시간 변경 · 퇴근 연장' → 바꿀 근무자: '모두 풀기 / 모두 고르기' + 고른 수 ('2명' → '1/2명')
//   · 아무도 안 고르면 '바꿀 근무자를 한 명 이상 골라 주세요' + 보내기 버튼 잠김 (서버도 같은 확인)
//   · 고른 사람에게만 동의 요청이 감
// 디자인 · 어두운 화면에서 체크된 칩(바꿀 근무자 · 근무자 지원 날짜 칩)이 어두운 칸 + 밝은 글씨 (예전엔 진한 파랑 글씨로 거의 안 보임)
//   · 고른 수가 바뀌면 0.25초 톡 (움직임 줄이기면 없음) · 360px 옆 스크롤 없음
// node scripts/qa/batch417.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const X = '41700000-0000-4000-8000-000000000417', Q = '41700000-0000-4000-8000-000000000418'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const contrast = (el) => el.evaluate((e) => {
  const cv = document.createElement('canvas').getContext('2d')
  const rgba = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  let b = e; let bg; while (b) { const c = rgba(getComputedStyle(b).backgroundColor); if (c[3] > 128) { bg = c; break } b = b.parentElement }
  const fg = rgba(getComputedStyle(e).color); const L1 = lum(fg), L2 = lum(bg || [255, 255, 255])
  return { ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), bgLum: L2 }
})

;(async () => {
  const today = kday(0)
  // 공고를 오늘~모레로 (이날만 바꾸기 가능) · 확정자 2명 (W + X)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: kday(2), start_time: '09:00:00', end_time: '18:00:00' })
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const u = { ...w1, id: X, name: '엑스바꿈', phone: '01041700417', created_at: new Date().toISOString() }
  await rest('users', 'POST', u)
  await rest('applications', 'POST', { ...wApp, id: undefined, user_id: X, user: u, position: null, available_dates: null })
  // 아직 지원 안 한 근무자 Q (날짜 칩 보려고)
  await rest('users', 'POST', { ...w1, id: Q, name: '큐지원전', phone: '01041700418', created_at: new Date().toISOString(), photo_at: new Date().toISOString(), attendance: [] })

  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid, { dark = false, reduce = false } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript((d) => { try { if (d) localStorage.setItem('theme', 'dark'); sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, dark)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const openShift = async (p) => {
    await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`, { waitUntil: 'networkidle' })
    const det = p.locator('details#shift')
    await det.evaluate((d) => { d.open = true; d.scrollIntoView({ block: 'start' }) })
    await det.locator('[data-shift-picked]').waitFor({ timeout: 5000 }).catch(() => {})
    return det
  }
  const a = await ctxOf(A)
  let det = await openShift(a)
  const count = () => det.locator('[data-shift-picked]')
  const all = () => det.locator('[data-shift-all]')
  const chips = () => det.locator('input[name="uid"]')
  const send = () => det.locator('button[type="submit"]').last()

  // ── 1. 처음엔 2명 모두 고름 · '모두 풀기'
  ok("처음: '바꿀 근무자 (2명)' · 칩 2개 모두 체크 · '모두 풀기'", one(await count().innerText().catch(() => '')) === '2명' && (await chips().count()) === 2 && (await det.locator('input[name="uid"]:checked').count()) === 2 && one(await all().innerText().catch(() => '')) === '모두 풀기', one(await count().innerText().catch(() => '')))
  // ── 2. 모두 풀기 → 0/2 · 안내 · 보내기 잠김
  await all().click()
  ok("'모두 풀기' → '0/2명' · 버튼 '모두 고르기'", one(await count().innerText()) === '0/2명' && one(await all().innerText()) === '모두 고르기' && (await det.locator('input[name="uid"]:checked').count()) === 0)
  ok("아무도 안 고르면 안내 + 보내기 잠김", (await det.locator('[data-shift-none]').isVisible().catch(() => false)) && (await send().isDisabled()))
  const an = await count().evaluate((el) => { const s = getComputedStyle(el); return { name: s.animationName, dur: s.animationDuration } })
  ok('고른 수가 바뀌면 0.25초 톡', an.name === 'pop' && parseFloat(an.dur) === 0.25, JSON.stringify(an))
  // ── 3. 한 명만 고름 → 1/2 · 안내 사라짐
  await det.locator(`label:has(input[value="${X}"])`).click()
  ok("한 명 고르면 '1/2명' · 안내 사라지고 보내기 열림", one(await count().innerText()) === '1/2명' && (await det.locator('[data-shift-none]').count()) === 0 && !(await send().isDisabled()))
  ok('360px 옆 스크롤 없음', await noSide(a))
  if (SHOTS) { await det.evaluate((e) => e.scrollIntoView({ block: 'start' })); await a.waitForTimeout(400); await a.screenshot({ path: `${SHOTS}/417-shift.png` }) }
  // ── 4. 보내기 → 고른 사람(X)에게만 동의 요청
  const before = ((await rest(`shift_changes?job_id=eq.${J}`)) ?? []).length
  await det.locator('button:has-text("+30분")').click() // 퇴근 30분 연장 (시간이 그대로면 보낼 사람이 없음)
  await send().click()
  await a.waitForTimeout(1500)
  const rows = ((await rest(`shift_changes?job_id=eq.${J}`)) ?? []).slice(before)
  ok('고른 사람에게만 동의 요청 (X만)', rows.length === 1 && rows[0].user_id === X, JSON.stringify(rows.map((r) => r.user_id)) + ' ' + one(await det.innerText().catch(() => '')).slice(-160))
  // ── 5. 모두 고르기 → 다시 2명
  det = await openShift(a)
  await all().click() // 모두 풀기
  await all().click() // 모두 고르기
  ok("'모두 고르기' → 다시 '2명'", one(await count().innerText()) === '2명' && (await det.locator('input[name="uid"]:checked').count()) === 2)

  // ── 6. 어두운 화면: 체크된 칩이 어두운 칸 + 밝은 글씨
  const dk = await ctxOf(A, { dark: true })
  det = await openShift(dk)
  const chip = det.locator(`label:has(input[value="${W}"])`)
  const c1 = await contrast(chip)
  ok('어두운 화면: 고른 근무자 칩 글씨가 잘 보임 (대비 4.5 이상 · 어두운 칸)', c1.ratio >= 4.5 && c1.bgLum < 0.1, `${c1.ratio.toFixed(2)} bg ${c1.bgLum.toFixed(2)}`)
  if (SHOTS) { await chip.scrollIntoViewIfNeeded(); await dk.waitForTimeout(300); await dk.screenshot({ path: `${SHOTS}/417-dark-shift.png` }) }
  // 근무자 지원 날짜 칩 (peer-checked)
  const q = await ctxOf(Q, { dark: true })
  await q.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  const dayBox = q.locator('input[name="dates"]').first()
  if (await dayBox.count()) {
    await dayBox.evaluate((e) => { if (!e.checked) e.click() })
    const span = dayBox.locator('xpath=following-sibling::span[1]')
    const c2 = await contrast(span)
    ok('어두운 화면: 고른 날짜 칩 글씨가 잘 보임 (대비 4.5 이상 · 어두운 칸)', c2.ratio >= 4.5 && c2.bgLum < 0.1, `${c2.ratio.toFixed(2)} bg ${c2.bgLum.toFixed(2)}`)
  } else ok('지원 날짜 칩 (여러 날 공고)', false, '없음')

  // ── 7. 움직임 줄이기: 톡 없음
  const r = await ctxOf(A, { reduce: true })
  det = await openShift(r)
  await all().click()
  const rd = await count().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration)).catch(() => 9)
  ok('움직임 줄이기: 고른 수 톡 없음', rd < 0.001, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch417: ${fails} FAIL` : '== batch417: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
