// 묶음 411 (정기 개선 2026-11-27 09:36 KST)
// 기능 · 근무 중에 담당자가 출근 시각을 고치면 근무자 카드(내 근무 · 문의 채팅 시계)도 고친 시각으로
//   '근무 중 · 09:00 시작' + '담당자가 고침 출근 07:36 → 09:00' (경과 시간도 고친 시각부터 · 알림·지난 근무와 같은 말) · 안 고쳤으면 그대로
// 기능 · 출퇴근 탭: 1시간 넘게 일찍 찍힌 출근 배지 '조기 3시간 · 고치기 ›' → 그 사람 고치기 칸이 열림 ('출근을 09:00로 맞추기')
//   · 시작 전 근무를 급여에 안 넣는 공고 / 이미 고친 기록 / 지급한 기록은 그냥 배지
// 기능 · '🕒 근무 시각 고침' 알림 아래 '근무 내역·급여 보기' 버튼
// 디자인 · 고침 줄은 0.25초 톡 (움직임 줄이기면 바로) · 360px 옆으로 안 밀림
// node scripts/qa/batch411.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const at = (d, hm) => new Date(`${d}T${hm}:00+09:00`).toISOString()
const hm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid, reduce = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무 중 카드: 출근을 고친 시각으로 (오늘 근무 · 아직 종료 전)
  const today = kday(0)
  const minute = Math.floor(Date.now() / 60e3) * 60e3
  const inMs = minute - 150 * 60e3, adjMs = minute - 60 * 60e3
  // 오늘 하루 종일 근무로 (막 켠 서버의 시각과 상관없이 '근무 중' · 일찍 시작/종료 지남 안내가 끼지 않게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:01:00', end_time: '23:58:00', early_clamp: false })
  const setOpen = (extra = {}) => rest(`attendance?id=eq.${ATT}`, 'PATCH', { work_date: today, clock_in: new Date(inMs).toISOString(), clock_out: null, adj_in: null, adj_out: null, paid: false, ...extra })
  await setOpen({ adj_in: new Date(adjMs).toISOString() })
  const w = await ctxOf(W)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const banner = w.locator('#clock').first()
  await banner.waitFor({ timeout: 15000 }).catch(() => {})
  const bText = one(await banner.innerText().catch(() => ''))
  ok(`내 근무: '근무 중 · ${hm(adjMs)} 시작' (고친 시각)`, bText.includes(`근무 중 · ${hm(adjMs)} 시작`), bText.slice(0, 80))
  const fixed = banner.locator('[data-start-fixed]')
  ok(`'담당자가 고침 출근 ${hm(inMs)} → ${hm(adjMs)}'`, one(await fixed.innerText().catch(() => '')) === `담당자가 고침 출근 ${hm(inMs)} → ${hm(adjMs)}`, one(await fixed.innerText().catch(() => '')))
  const el = one(await banner.locator('[data-elapsed]').innerText().catch(() => ''))
  const elMin = (() => { const m = /(?:(\d+)시간\s*)?(\d+)분/.exec(el); return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : -1 })()
  ok('경과 시간도 고친 시각부터 (약 1시간)', elMin >= 58 && elMin <= 63, el)
  ok('고침 줄은 톡 (pop · 0.25초)', await fixed.evaluate((e) => getComputedStyle(e).animationName === 'pop' && getComputedStyle(e).animationDuration === '0.25s').catch(() => false))
  ok('한 줄 (360px · 높이 24px 아래)', await fixed.evaluate((e) => e.getBoundingClientRect().height < 24).catch(() => false))
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
  if (SHOTS) { await banner.scrollIntoViewIfNeeded(); await w.waitForTimeout(400); const bx = await banner.boundingBox(); if (bx) await w.screenshot({ path: `${SHOTS}/me-start-fixed.png`, clip: { x: 0, y: Math.max(0, bx.y - 20), width: 360, height: Math.min(260, bx.height + 40) } }).catch(() => {}) }

  // 문의 채팅 시계도 같은 모양 (담당자가 '근무 종료하러 가기' 버튼을 보낸 대화에만 시계가 붙음)
  await rest('messages', 'POST', { thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: '근무 종료 버튼은 아래에 있어요.\n::b:clock-out::', created_at: new Date().toISOString() })
  await w.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  const chatFixed = w.locator('[data-start-fixed]').first()
  await chatFixed.waitFor({ timeout: 8000 }).catch(() => {})
  ok('문의 채팅 시계에도 같은 고침 줄', one(await chatFixed.innerText().catch(() => '')) === `담당자가 고침 출근 ${hm(inMs)} → ${hm(adjMs)}`, one(await chatFixed.innerText().catch(() => '')))

  // 안 고쳤으면: 원래 시각 · 고침 줄 없음
  await setOpen()
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const b2 = one(await w.locator('#clock').first().innerText().catch(() => ''))
  ok(`안 고친 기록: '근무 중 · ${hm(inMs)} 시작' · 고침 줄 없음`, b2.includes(`근무 중 · ${hm(inMs)} 시작`) && (await w.locator('[data-start-fixed]').count()) === 0, b2.slice(0, 80))
  // 같은 분으로 저장된 보정(초만 다름)도 줄 없음
  await setOpen({ adj_in: new Date(inMs + 20e3).toISOString() })
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok('같은 분 보정: 고침 줄 없음', (await w.locator('[data-start-fixed]').count()) === 0)

  // 움직임 줄이기
  await setOpen({ adj_in: new Date(adjMs).toISOString() })
  const wr = await ctxOf(W, true)
  await wr.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok('움직임 줄이기: 고침 줄 바로', await wr.locator('[data-start-fixed]').first().evaluate((e) => parseFloat(getComputedStyle(e).animationDuration) < 0.01).catch(() => false))

  // ── 2. 출퇴근 탭: '조기 3시간 · 고치기 ›' → 고치기 칸
  const y = kday(-1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y, end_date: today, start_time: '09:00:00', end_time: '18:00:00', early_clamp: false })
  const setY = (extra = {}) => rest(`attendance?id=eq.${ATT}`, 'PATCH', { work_date: y, clock_in: at(y, '06:00'), clock_out: at(y, '18:00'), adj_in: null, adj_out: null, paid: false, ...extra })
  await setY()
  const a = await ctxOf(A)
  const attTab = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${y}`, { waitUntil: 'networkidle' }); return a.locator(`#att-${W}`) }
  let row = await attTab()
  const chip = row.locator('[data-att-early-fix]')
  ok("출퇴근 탭 배지: '조기 3시간 · 고치기 ›'", one(await chip.innerText().catch(() => '')) === '조기 3시간 · 고치기 ›', one(await chip.innerText().catch(() => '')))
  const href = (await chip.getAttribute('href').catch(() => '')) ?? ''
  ok('배지는 그 사람 고치기 칸으로 (그날 · fix)', href.includes('tab=att') && href.includes(`date=${y}`) && href.includes(`fix=${W}`) && href.endsWith(`#att-${W}`), href)
  ok('360px 옆으로 안 밀림 (출퇴근 탭)', await noSide(a))
  if (SHOTS) { await chip.scrollIntoViewIfNeeded(); await a.waitForTimeout(300); const bx = await row.boundingBox(); if (bx) await a.screenshot({ path: `${SHOTS}/att-early-chip.png`, clip: { x: 0, y: Math.max(0, bx.y), width: 360, height: Math.min(330, bx.height) } }).catch(() => {}) }
  await chip.click()
  await a.waitForURL((u) => u.searchParams.get('fix') === W, { timeout: 15000 }).catch(() => {})
  const form = a.locator('form[data-att-edit="open"]')
  await form.waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 고치기 칸이 열리고 '출근을 09:00로 맞추기 ›'", (await form.isVisible().catch(() => false)) && one(await form.locator('[data-early-fix]').innerText().catch(() => '')).endsWith('출근을 09:00로 맞추기 ›'))
  // 맞추고 저장 → 근무자 알림 아래 '근무 내역·급여 보기' 버튼
  const before = ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => (m.body ?? '').startsWith('🕒 근무 시각 고침')).length
  await form.locator('[data-early-fix]').click()
  await a.waitForTimeout(150)
  await form.locator('button[type="submit"]').first().click()
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForTimeout(500)
  const msgs = ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => (m.body ?? '').startsWith('🕒 근무 시각 고침'))
  ok("알림 끝에 '근무 내역·급여 보기' 버튼 줄", msgs.length === before + 1 && msgs[msgs.length - 1].body.endsWith('\n::b:history::'), JSON.stringify(msgs[msgs.length - 1]?.body))
  await w.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  const btn = w.getByRole('link', { name: /근무 내역·급여 보기/ }).last()
  ok("근무자 채팅: 알림 아래 '근무 내역·급여 보기' → 지난 근무", (await btn.isVisible().catch(() => false)) && ((await btn.getAttribute('href').catch(() => '')) ?? '').startsWith('/me/history'))
  ok('360px 옆으로 안 밀림 (근무자 채팅)', await noSide(w))

  // 그냥 배지인 경우: 이미 고친 기록 · 지급한 기록 · 시작 전 근무를 급여에 안 넣는 공고
  await setY({ adj_in: at(y, '09:00') })
  row = await attTab()
  ok('이미 고친 기록: 고치기 링크 없음', (await row.locator('[data-att-early-fix]').count()) === 0)
  await setY({ paid: true })
  row = await attTab()
  ok('지급한 기록: 고치기 링크 없음', (await row.locator('[data-att-early-fix]').count()) === 0)
  await setY()
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: true })
  row = await attTab()
  ok("'시작 전 근무 안 넣음' 공고: 링크 없이 '조기 3시간(미인정)'", (await row.locator('[data-att-early-fix]').count()) === 0 && one(await row.innerText().catch(() => '')).includes('조기 3시간(미인정)'))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: false })
  // 30분만 일찍: 링크 없이 '조기 30분'
  await setY({ clock_in: at(y, '08:30') })
  row = await attTab()
  ok("30분만 일찍: 링크 없이 '조기 30분'", (await row.locator('[data-att-early-fix]').count()) === 0 && one(await row.innerText().catch(() => '')).includes('조기 30분'))

  await setY()
  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
