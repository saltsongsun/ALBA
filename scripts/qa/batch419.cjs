// 묶음 419 (정기 개선 2026-11-28 01:35 KST)
// 기능 · 근무자 '내 근무'의 '근무시간이 바뀌었어요' 칸: 요청마다 어느 회사인지 (🏢 회사 이름 — 여러 회사 일을 하는 근무자)
//   · 담당자가 그 요청 뒤에 '다시 알리기'를 보냈으면 '담당자가 답을 기다려요 · HH:MM' (그 공고 것만 · 요청보다 먼저 온 알림은 셈하지 않음)
//   · '다시 알리기' 글에 '근무시간 변경에 답하기' 버튼 (문의 채팅) → '내 근무'의 답하기 칸(#shift-ask)으로 · 휴대폰 알림도 그 칸으로
//   · 관리자 답장 버튼 목록에는 안 나옴 (자동 안내 전용)
// 디자인 · '아니요, 어려워요' 버튼이 360px에서 한 줄 (글은 그대로 · 옆 여백·글자만 조금 줄임)
//   · 바로 가기로 오면 칸 테두리 한 번 (0.3초) · '답을 기다려요' 줄 0.25초 톡 (움직임 줄이기면 둘 다 없음) · 한 줄 · 360px 옆 스크롤 없음 · 어두운 화면 대비
// node scripts/qa/batch419.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { createHmac } = crypto
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000419'
const J2 = 'cccccccc-0000-4000-8000-000000041901'
const HEAD = '⏰ 근무시간 변경 · 답을 기다려요'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const contrast = (el) => el.evaluate((e) => {
  const cv = document.createElement('canvas').getContext('2d')
  const rgba = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  let b = e; let bg; while (b) { const c = rgba(getComputedStyle(b).backgroundColor); if (c[3] > 128) { bg = c; break } b = b.parentElement }
  const fg = rgba(getComputedStyle(e).color); const L1 = lum(fg), L2 = lum(bg || [255, 255, 255])
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
})

;(async () => {
  const y = kday(-1), tm = kday(1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y, end_date: kday(2), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const { applications: _a, attendance: _t, ...jl } = job
  // W는 두 회사 일을 함: 격리상사419 공고 J2에도 확정
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사419', join_code: 'ISO419', seal_image: null, company_address: null, created_at: ago(5) })
  const j2 = { ...jl, id: J2, company_id: C2, company: { company_name: '격리상사419' }, title: '격리행사419', start_date: y, end_date: kday(2), start_time: '10:00:00', end_time: '19:00:00', status: 'open', created_at: ago(2) }
  await rest('jobs', 'POST', { ...j2, applications: [], attendance: [] })
  await rest('applications', 'POST', { ...wApp, id: 'ffffffff-0000-4000-8000-000000041901', job_id: J2, company_id: C2, job: j2, position: null, available_dates: null })
  // 두 회사에서 내일 근무시간 변경 답을 기다림
  const chg = (o) => rest('shift_changes', 'POST', { id: crypto.randomUUID(), user_id: W, work_date: tm, status: 'pending', reason: null, requested_by: A, answered_at: null, answered_by: null, answer_ip: null, ...o })
  await chg({ job_id: J, company_id: C1, start_time: '09:00:00', end_time: '19:00:00', prev_start: '09:00:00', prev_end: '18:00:00', created_at: ago(2) })
  await chg({ job_id: J2, company_id: C2, start_time: '10:00:00', end_time: '20:00:00', prev_start: '10:00:00', prev_end: '19:00:00', created_at: ago(1) })
  // 요청보다 먼저 온 '다시 알리기'(예전 요청 것) — 셈하지 않아야 함
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: `${HEAD}\n옛 요청\n::b:shift::`, created_at: ago(3), read_at: null })

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
  const entryOf = (p, title) => p.locator('#shift-ask > div.rounded-xl').filter({ hasText: title })

  // ── 1. 두 요청 · 회사 이름 · 아직 '답을 기다려요' 없음 (옛 알림은 셈하지 않음)
  const w = await ctxOf(W)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const sec = w.locator('section#shift-ask')
  ok("'근무시간이 바뀌었어요' 칸 (#shift-ask) · 요청 2개", (await sec.count()) === 1 && (await sec.locator(':scope > div.rounded-xl').count()) === 2)
  const e1 = one(await entryOf(w, jl.title).innerText().catch(() => ''))
  const e2 = one(await entryOf(w, '격리행사419').innerText().catch(() => ''))
  ok('요청마다 회사 이름: 주식회사 테스트 / 격리상사419', e1.includes('🏢 주식회사 테스트') && !e1.includes('격리상사419') && e2.includes('🏢 격리상사419') && !e2.includes('주식회사 테스트'), `${e1.slice(0, 80)} | ${e2.slice(0, 80)}`)
  ok("요청보다 먼저 온 다시 알리기는 '답을 기다려요'로 안 셈", (await w.locator('[data-shift-asked]').count()) === 0)

  // ── 2. 관리자 '다시 알리기' → 글에 버튼 · 근무자 칸에 '담당자가 답을 기다려요 · HH:MM' (그 공고만)
  const a = await ctxOf(A)
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${tm}&shift=1`, { waitUntil: 'networkidle' })
  await a.waitForTimeout(450)
  await a.locator('[data-shift-remind] button').click()
  await a.waitForFunction(() => document.querySelector('[data-shift-reminded]')?.textContent?.includes('다시 알렸어요'), null, { timeout: 8000 }).catch(() => {})
  const sent = ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => (m.body ?? '').startsWith(HEAD) && m.created_at > ago(0.1))
  ok("다시 알리기 글: '근무시간 변경에 답하기' 버튼 줄 (::b:shift::) · 우리 회사 문의함", sent.length === 1 && sent[0].body.includes('::b:shift::') && sent[0].company_id === C1, JSON.stringify(sent.map((m) => m.body)))
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const asked = w.locator('[data-shift-asked]')
  const at = one(await asked.innerText().catch(() => ''))
  ok("'담당자가 답을 기다려요 · HH:MM' 한 줄 (그 공고 요청에만)", (await asked.count()) === 1 && /^담당자가 답을 기다려요 · \d\d:\d\d$/.test(at) && (await entryOf(w, jl.title).locator('[data-shift-asked]').count()) === 1, at)
  const ah = await asked.evaluate((e) => ({ h: e.getBoundingClientRect().height, name: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration }))
  ok('한 줄 높이 · 0.25초 톡', ah.h < 22 && ah.name === 'pop' && parseFloat(ah.dur) === 0.25, JSON.stringify(ah))
  ok('360px 옆 스크롤 없음', await noSide(w))
  const bh = await w.locator('[data-shift-answer-btns]').first().evaluate((g) => [...g.querySelectorAll('button')].map((x) => Math.round(x.getBoundingClientRect().height)))
  ok("답 버튼 두 개 같은 높이 · '아니요, 어려워요' 한 줄", bh.length === 2 && bh[0] === bh[1] && bh[1] < 56, JSON.stringify(bh))
  if (SHOTS) { await sec.evaluate((e) => e.scrollIntoView({ block: 'start' })); await w.waitForTimeout(400); await w.screenshot({ path: `${SHOTS}/419-me-shift.png` }) }

  // ── 3. 문의 채팅: 버튼 → 답하기 칸으로
  await w.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  const btn = w.locator('[data-chat-button="shift"]').last()
  const label = one(await btn.innerText().catch(() => ''))
  const href = await btn.getAttribute('href').catch(() => null)
  ok("채팅에 '근무시간 변경에 답하기' 버튼 → /me#shift-ask", label.includes('근무시간 변경에 답하기') && href === '/me#shift-ask', `${label} ${href}`)
  if (SHOTS) { await btn.scrollIntoViewIfNeeded().catch(() => {}); await w.waitForTimeout(300); await w.screenshot({ path: `${SHOTS}/419-chat-button.png` }) }
  await btn.click().catch(() => {})
  await w.waitForURL(/\/me#shift-ask$/, { timeout: 8000 }).catch(() => {})
  await w.waitForTimeout(800)
  const inView = await w.locator('section#shift-ask').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 }).catch(() => false)
  ok('버튼을 누르면 내 근무의 답하기 칸이 화면에 보임', w.url().endsWith('/me#shift-ask') && inView, w.url())

  // ── 4. 바로 가기로 오면 칸 테두리 한 번 (0.3초)
  const w2 = await ctxOf(W)
  await w2.goto(`${D}/me#shift-ask`, { waitUntil: 'networkidle' })
  const ring = await w2.locator('section#shift-ask').evaluate((e) => ({ name: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration }))
  ok('#shift-ask로 오면 테두리 0.3초 한 번', ring.name === 'flash-ring' && parseFloat(ring.dur) === 0.3, JSON.stringify(ring))

  // ── 5. 관리자 답장 버튼 목록에는 없음 (자동 안내 전용)
  await a.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  await a.locator('[data-button-toggle]').first().click().catch(() => {})
  await a.waitForTimeout(300)
  const opts = await a.locator('[data-button-option]').evaluateAll((els) => els.map((e) => e.getAttribute('data-button-option')))
  ok("관리자 버튼 목록에 'shift' 없음 (다른 버튼은 그대로)", opts.length > 0 && !opts.includes('shift') && !opts.includes('coming') && opts.includes('clock-in'), JSON.stringify(opts))

  // ── 6. 어두운 화면 대비 · 움직임 줄이기
  const dk = await ctxOf(W, { dark: true })
  await dk.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const cr = await contrast(dk.locator('[data-shift-asked]'))
  ok("어두운 화면: '답을 기다려요' 글씨 대비 4.5 이상", cr >= 4.5, cr.toFixed(2))
  const r = await ctxOf(W, { reduce: true })
  await r.goto(`${D}/me#shift-ask`, { waitUntil: 'networkidle' })
  const rd = await r.locator('[data-shift-asked]').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 9)
  const rr = await r.locator('section#shift-ask').evaluate((e) => getComputedStyle(e).animationName).catch(() => '?')
  ok('움직임 줄이기: 톡·테두리 없음', rd < 0.001 && rr !== 'flash-ring', `${rd} ${rr}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch419: ${fails} FAIL` : '== batch419: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
