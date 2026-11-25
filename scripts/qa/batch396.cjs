// 묶음 396 (정기 개선 2026-11-26 03:35 KST)
// 기능 · 근무자 명단 카드 '계좌 미등록 ›' → 그 근무자 화면의 '계좌 등록 요청' 버튼으로 바로 (가운데로 오고 번쩍임)
//   · 우리 회사 지원자(활동 중)만 링크 · 지원 안 한 회원 · 쉬는 회원은 글자만 (요청 버튼이 없는 곳으로 보내지 않음)
//   · 넓은 화면 표도 같은 링크 · 누르기 쉬운 크기 · 한 줄 (끝 글자만 내려가지 않음)
// 디자인 · 정산 탭 '파일 열림 · n분 뒤 잠김' 줄이 칸 너비를 다 씀 (막대가 짧게 끊기지 않음) · 360px 옆으로 안 밀림 · 움직임 줄이기면 테두리만
// node scripts/qa/batch396.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec = 600) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const U3 = 'bbbbbbbb-0000-4000-8000-000000039603'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)

;(async () => {
  const today = kday(0)
  const [w] = await rest(`users?id=eq.${W}`)
  const keep = { bank_account_enc: w.bank_account_enc ?? null, active: w.active }
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, active: true })
  // 우리 회사에 지원한 적 없는 회원 (계좌 없음)
  if (!(await rest(`users?id=eq.${U3}`)).length) await rest('users', 'POST', { ...w, id: U3, name: '지원안함396', phone: '01039600003', bank_account_enc: null, active: true, attendance: [], ratings: [], created_at: new Date().toISOString() })
  // 정산 탭: 오늘 근무를 마친 기록이 있어야 정산 도구가 보임
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { clock_in: `${today}T00:00:00Z`, clock_out: `${today}T04:00:00Z`, paid: false })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { width = 360, reducedMotion, sec = 600 } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width, height: 740 }, locale: 'ko-KR', ...(width > 600 ? { isMobile: false, hasTouch: false } : {}), ...(reducedMotion ? { reducedMotion } : {}) })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(sec ? [{ name: 'alba_roster', value: roster(uid, sec), url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const cardOf = (p, uid) => p.locator('.card', { has: p.locator(`a[href="/admin/workers/${uid}"]`) }).first()

  // ── 1. 명단 카드: 우리 회사 지원자 → 링크 ──
  const a = await mk(A)
  await a.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  const wc = cardOf(a, W)
  await wc.waitFor({ timeout: 15000 }).catch(() => {})
  const link = wc.locator('[data-roster-noaccount]')
  ok("우리 회사 지원자 카드: '계좌 미등록 ›' 링크 → 근무자 화면 #account-ask", (await link.count()) === 1 && (await link.getAttribute('href').catch(() => '')) === `/admin/workers/${W}#account-ask` && one(await link.innerText().catch(() => '')) === '미등록 ›', await link.getAttribute('href').catch(() => ''))
  ok('링크 글자가 한 줄 (› 만 내려가지 않음)', (await link.evaluate((el) => el.getClientRects().length).catch(() => 0)) === 1)
  // 누르기 쉬운 크기: 글자 위 8px 지점을 눌러도 링크
  const hit = await link.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top - 7); return !!t && (t === el || el.contains(t)) }).catch(() => false)
  ok('누르는 자리가 글자보다 넓음 (위로 7px도 링크)', hit)
  ok('명단 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await wc.scrollIntoViewIfNeeded().catch(() => {})
    await wc.screenshot({ path: `${SHOTS}/roster-card.png` }).catch(() => {})
  }
  // 지원 안 한 회원: 글자만
  const uc = cardOf(a, U3)
  ok('지원 안 한 회원 카드: 링크 없이 글자만', (await uc.count()) === 1 && (await uc.locator('[data-roster-noaccount]').count()) === 0 && one(await uc.innerText().catch(() => '')).includes('계좌 미등록'), one(await uc.innerText().catch(() => '')).slice(-40))

  // ── 2. 링크를 누르면: 근무자 화면, 요청 버튼이 가운데로 오고 번쩍임 ──
  await link.click()
  await a.waitForURL((u) => u.pathname === `/admin/workers/${W}` && u.hash === '#account-ask', { timeout: 15000 }).catch(() => {})
  const btn = a.locator('[data-account-ask] button')
  await a.locator('[data-account-ask] button[data-flash]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("근무자 화면으로 감 · '계좌 등록 요청' 버튼이 번쩍임", a.url().endsWith(`/admin/workers/${W}#account-ask`) && (await btn.getAttribute('data-flash').catch(() => null)) !== null && /계좌 등록 요청|다시 요청/.test(await btn.innerText().catch(() => '')), a.url())
  await a.waitForTimeout(400)
  const mid = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); return (r.top + r.height / 2) / innerHeight }).catch(() => -1)
  ok('버튼이 화면 가운데 근처', mid > 0.25 && mid < 0.75, mid.toFixed(2))
  ok('근무자 화면 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/detail-flash.png` }).catch(() => {})
  await a.waitForTimeout(3400)
  ok('잠시 뒤 번쩍임 꺼짐', (await btn.getAttribute('data-flash').catch(() => '')) === null)
  // 움직임 줄이기: 퍼지는 움직임 없이 테두리만
  const rm = await mk(A, { reducedMotion: 'reduce' })
  await rm.goto(`${D}/admin/workers/${W}#account-ask`, { waitUntil: 'networkidle' })
  const rb = rm.locator('[data-account-ask] button[data-flash]')
  await rb.waitFor({ timeout: 10000 }).catch(() => {})
  const rs = await rb.evaluate((el) => { const s = getComputedStyle(el); return { an: s.animationName, ol: s.outlineStyle } }).catch(() => ({}))
  ok('움직임 줄이기: 움직임 없이 테두리만', rs.an === 'none' && rs.ol === 'solid', JSON.stringify(rs))

  // ── 3. 쉬는 회원(우리 회사 지원자여도): 요청 버튼이 없으니 글자만 ──
  await rest(`users?id=eq.${W}`, 'PATCH', { active: false })
  await a.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  const wc2 = cardOf(a, W)
  await wc2.waitFor({ timeout: 15000 }).catch(() => {})
  ok('쉬는 회원 카드: 링크 없이 글자만', (await wc2.count()) === 1 && (await wc2.locator('[data-roster-noaccount]').count()) === 0 && one(await wc2.innerText().catch(() => '')).includes('계좌 미등록'))
  await rest(`users?id=eq.${W}`, 'PATCH', { active: true })

  // ── 4. 넓은 화면 표도 같은 링크 ──
  const pc = await mk(A, { width: 1280 })
  await pc.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  const row = pc.locator('table tr', { has: pc.locator(`a[href="/admin/workers/${W}"]`) }).first()
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("넓은 화면 표: '미등록 ›' 링크 (지원 안 한 회원은 글자만)", (await row.locator(`[data-roster-noaccount][href="/admin/workers/${W}#account-ask"]`).count()) === 1 && (await pc.locator('table tr', { has: pc.locator(`a[href="/admin/workers/${U3}"]`) }).locator('[data-roster-noaccount]').count()) === 0)

  // ── 5. 정산 탭 '파일 열림' 줄이 칸 너비를 다 씀 ──
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' })
  const open = a.locator('[data-files-open]')
  await open.waitFor({ timeout: 15000 }).catch(() => {})
  const fill = await open.evaluate((el) => el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width).catch(() => -1)
  ok("정산 탭 '파일 열림' 줄이 칸 너비를 다 씀", fill > 0.97, fill.toFixed(2))
  const bar = await open.locator('[data-roster-time-bar]').evaluate((el) => el.parentElement.getBoundingClientRect().width).catch(() => 0)
  ok('막대 길이가 넉넉함 (120px 이상)', bar >= 120, String(Math.round(bar)))
  ok('정산 탭 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await open.locator('xpath=..').screenshot({ path: `${SHOTS}/pay-open-full.png` }).catch(() => {})

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await rest(`users?id=eq.${W}`, 'PATCH', keep)
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
