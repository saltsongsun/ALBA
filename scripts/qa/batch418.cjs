// 묶음 418 (정기 개선 2026-11-27 23:35 KST)
// 기능 · 출퇴근 탭 '근무시간 변경' 칸: 보낸 요청의 답 (동의·어려움·대기 + 막대) · 아직 답 안 한 이름 · '다시 알리기'
//   · 다시 알리기 → 답 안 한 확정자에게만 문의함 글 ('⏰ 근무시간 변경 · 답을 기다려요' — '🔔 일정 변경'이 아니라서 서명한 서류가 '일정 바뀜'이 되지 않음)
//   · 10분 안에 또 누르면 '방금 알렸어요' (알림이 쌓이지 않음) · 근무가 끝난 날(어제)은 다시 알리기 없음
//   · 다른 회사 공고의 답 기다림은 안 보이고 알림도 안 감 (그 회사 관리자에게는 보임 — 대조)
//   · 홈 할 일 '근무시간 변경 답 기다림' → 그 칸이 열린 채로 (#shift)
// 디자인 · 접어 둬도 제목 옆 '답 대기 n' · 막대 0.25초 채워짐 · 결과 한 줄 톡 (움직임 줄이기면 없음) · 360px 옆 스크롤 없음 · 어두운 화면 글씨 대비
// node scripts/qa/batch418.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { createHmac } = crypto
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000418'
const X = '41800000-0000-4000-8000-000000000001', Y = '41800000-0000-4000-8000-000000000002', Z = '41800000-0000-4000-8000-000000000003', M = '41800000-0000-4000-8000-000000000004'
const J2 = 'cccccccc-0000-4000-8000-000000041801'
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
  // 공고 J (우리 회사): 어제~모레 09:00~18:00 · 확정자 W + X + Y
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y, end_date: kday(2), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  const [w1] = await rest(`users?id=eq.${W}`)
  const [a1] = await rest(`users?id=eq.${A}`)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job
  const worker = async (id, name, phone) => {
    const u = { ...w1, id, name, phone, created_at: ago(300), photo_at: ago(300), attendance: [], ratings: [] }
    await rest('users', 'POST', u)
    return u
  }
  for (const [id, name, phone] of [[X, '엑스대기418', '01041800001'], [Y, '와이대기418', '01041800002']]) {
    const u = await worker(id, name, phone)
    await rest('applications', 'POST', { ...wApp, id: undefined, user_id: id, user: u, position: null, available_dates: null })
  }
  const chg = (o) => rest('shift_changes', 'POST', { id: crypto.randomUUID(), job_id: J, company_id: C1, start_time: '09:00:00', end_time: '19:00:00', prev_start: '09:00:00', prev_end: '18:00:00', reason: null, requested_by: A, answered_at: null, answered_by: null, answer_ip: null, created_at: ago(1), ...o })
  await chg({ user_id: W, work_date: tm, status: 'agreed', answered_at: ago(0.5), answered_by: W })
  await chg({ user_id: X, work_date: tm, status: 'superseded', created_at: ago(3) })
  await chg({ user_id: X, work_date: tm, status: 'pending' })
  await chg({ user_id: Y, work_date: tm, status: 'pending' })
  await chg({ user_id: X, work_date: y, status: 'pending', created_at: ago(30) })

  // 다른 회사 (격리상사418): 공고 J2 · 확정자 Z · Z도 내일 변경 답을 기다림 · 관리자 M (그 회사 대표만)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사418', join_code: 'ISO418', seal_image: null, company_address: null, created_at: ago(5) })
  await rest('users', 'POST', { ...a1, id: M, name: '격리관리자418', phone: '01041800004', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'owner', created_at: ago(5) })
  const zU = await worker(Z, '제트격리418', '01041800003')
  const j2 = { ...jl, id: J2, company_id: C2, company: { company_name: '격리상사418' }, title: '격리행사418', start_date: y, end_date: kday(2), start_time: '09:00:00', end_time: '18:00:00', status: 'open', created_at: ago(2) }
  await rest('jobs', 'POST', { ...j2, applications: [], attendance: [] })
  await rest('applications', 'POST', { ...wApp, id: 'ffffffff-0000-4000-8000-000000041801', job_id: J2, company_id: C2, user_id: Z, user: zU, job: j2, position: null, available_dates: null })
  await rest('shift_changes', 'POST', { id: crypto.randomUUID(), job_id: J2, company_id: C2, user_id: Z, work_date: tm, status: 'pending', start_time: '10:00:00', end_time: '19:00:00', prev_start: '09:00:00', prev_end: '18:00:00', reason: null, requested_by: M, created_at: ago(1) })

  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid, { dark = false, reduce = false, company = null } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript((d) => { try { if (d) localStorage.setItem('theme', 'dark'); sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, dark)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const att = async (p, date, open = true) => {
    await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${date}`, { waitUntil: 'networkidle' })
    const det = p.locator('details#shift')
    if (open) {
      await det.evaluate((d) => { d.open = true; d.scrollIntoView({ block: 'start' }) })
      await p.waitForTimeout(450) // 펼침 움직임이 끝난 뒤에 읽기
    }
    return det
  }
  const sent = async () => ((await rest(`messages?job_id=eq.${J}`)) ?? []).filter((m) => (m.body ?? '').startsWith(HEAD))

  const a = await ctxOf(A)
  // ── 1. 접혀 있어도 제목 옆 '답 대기 2'
  let det = await att(a, tm, false)
  const badge = det.locator('[data-shift-wait-badge]')
  ok("접힌 칸 제목 옆 '답 대기 2'", (await det.evaluate((d) => !d.open)) && (await badge.isVisible().catch(() => false)) && one(await badge.innerText().catch(() => '')) === '답 대기 2', one(await badge.innerText().catch(() => '')))
  const sumH = await det.locator('summary').evaluate((s) => s.getBoundingClientRect().height)
  ok('제목 줄이 한 줄 (배지가 밀리지 않음)', sumH < 48, String(sumH))
  // ── 2. 펼치면 동의·어려움·대기 + 막대 + 대기 이름 (다른 회사 사람 없음)
  await det.evaluate((d) => { d.open = true; d.scrollIntoView({ block: 'start' }) })
  await a.waitForTimeout(450)
  const panel = det.locator('[data-shift-answers]')
  const pt = one(await panel.innerText().catch(() => ''))
  ok("보낸 요청 답 '동의 1 · 어려움 0 · 대기 2'", pt.includes('동의 1 · 어려움 0 · 대기 2'), pt)
  const names = one(await det.locator('[data-shift-waiting]').innerText().catch(() => ''))
  ok('대기 이름: 엑스·와이 (동의한 근무자·다른 회사 사람은 없음)', names.includes('엑스대기418') && names.includes('와이대기418') && !names.includes('근무자,') && !names.includes('제트격리418'), names)
  const bar = await panel.locator('div[aria-hidden]').evaluate((e) => ({ name: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration, n: e.children.length }))
  ok('막대: 동의·대기 두 칸 · 0.25초 채워짐', bar.name === 'grow' && parseFloat(bar.dur) === 0.25 && bar.n === 2, JSON.stringify(bar))
  ok('360px 옆 스크롤 없음', await noSide(a))
  // (최고 관리자는 위 회사 고르기에 모든 회사 이름이 원래 보임 → 본문의 공고·사람 이름만 봄)
  ok('본문에 다른 회사 공고·사람 없음', !(await a.locator('main').innerText()).match(/격리행사418|제트격리418/))
  if (SHOTS) { await det.evaluate((e) => e.scrollIntoView({ block: 'start' })); await a.waitForTimeout(400); await a.screenshot({ path: `${SHOTS}/418-shift-answers.png` }) }

  // ── 3. 다시 알리기 → 답 안 한 두 사람에게만 · '🔔 일정 변경'은 새로 안 감
  const changeBefore = ((await rest(`messages?job_id=eq.${J}`)) ?? []).filter((m) => (m.body ?? '').startsWith('🔔 일정 변경')).length
  await panel.locator('[data-shift-remind] button').click()
  const res = panel.locator('[data-shift-reminded]')
  await res.waitFor({ timeout: 8000 }).catch(() => {})
  ok("결과 '✓ 2명에게 다시 알렸어요.'", one(await res.innerText().catch(() => '')) === '✓ 2명에게 다시 알렸어요.', one(await res.innerText().catch(() => '')))
  const ra = await res.evaluate((e) => ({ name: getComputedStyle(e).animationName, dur: getComputedStyle(e).animationDuration })).catch(() => ({}))
  ok('결과 한 줄 0.25초 톡', ra.name === 'pop' && parseFloat(ra.dur) === 0.25, JSON.stringify(ra))
  let m1 = await sent()
  const to = m1.map((m) => m.thread_user_id).sort()
  ok('엑스·와이에게만 갔음 (동의한 W · 다른 회사 Z 없음)', to.length === 2 && to.join() === [X, Y].sort().join(), JSON.stringify(to))
  ok('글: 공고 · 내일 날짜 · 09:00~18:00 → 09:00~19:00 · 내 근무에서 답', m1.every((m) => m.body.includes(jl.title) && m.body.includes('09:00~18:00 → 09:00~19:00') && m.body.includes("'내 근무'") && m.company_id === C1), m1[0]?.body)
  const changeAfter = ((await rest(`messages?job_id=eq.${J}`)) ?? []).filter((m) => (m.body ?? '').startsWith('🔔 일정 변경')).length
  ok("'🔔 일정 변경' 글은 새로 안 감 (서류 '일정 바뀜'이 생기지 않게)", changeAfter === changeBefore, `${changeBefore}→${changeAfter}`)
  const zMsgs = ((await rest(`messages?thread_user_id=eq.${Z}`)) ?? []).filter((m) => (m.body ?? '').startsWith(HEAD))
  ok('다른 회사 근무자 Z에게는 아무것도 안 감', zMsgs.length === 0)
  const logs = ((await rest('audit_logs')) ?? []).filter((l) => l.action === 'shift.remind')
  ok('기록: shift.remind · 우리 회사', logs.length === 1 && logs[0].company_id === C1, JSON.stringify(logs.map((l) => l.company_id)))

  // ── 4. 10분 안에 또 → '방금 알렸어요' · 더 안 감
  await panel.locator('[data-shift-remind] button').click()
  await a.waitForFunction(() => document.querySelector('[data-shift-reminded]')?.textContent?.includes('방금'), null, { timeout: 8000 }).catch(() => {})
  ok("10분 안에 또 누르면 '방금 알렸어요. 10분 뒤에 다시 보낼 수 있어요.'", one(await res.innerText().catch(() => '')) === '방금 알렸어요. 10분 뒤에 다시 보낼 수 있어요.', one(await res.innerText().catch(() => '')))
  ok('또 누른 뒤에도 2건 그대로', (await sent()).length === 2)

  // ── 5. 어제(근무가 끝난 날): 답 현황은 보이지만 다시 알리기 없음
  det = await att(a, y)
  const yp = one(await det.locator('[data-shift-answers]').innerText().catch(() => ''))
  ok("어제: '대기 1' 보이고 다시 알리기 버튼 없음", yp.includes('대기 1') && (await det.locator('[data-shift-remind]').count()) === 0, yp)

  // ── 6. 홈 할 일 → 칸이 열린 채로
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const todo = a.locator(`a[href*="/admin/jobs/${J}?tab=att"][href*="shift=1"]`).first()
  const href = await todo.getAttribute('href').catch(() => null)
  ok("홈 '근무시간 변경 답 기다림' → &shift=1#shift", !!href && href.endsWith('&shift=1#shift') && one(await todo.innerText().catch(() => '')).includes('근무시간 변경 답 기다림'), href ?? 'none')
  if (href) {
    await a.goto(D + href, { waitUntil: 'networkidle' })
    ok('그 링크로 가면 근무시간 변경 칸이 열려 있음', await a.locator('details#shift').evaluate((d) => d.open).catch(() => false))
  }

  // ── 7. 대조: 다른 회사 관리자 M은 자기 공고(J2)에서 Z만 보임 · 우리 공고 J는 못 봄
  const mp = await ctxOf(M, { company: C2 })
  await mp.goto(`${D}/admin/jobs/${J2}?tab=att&date=${tm}`, { waitUntil: 'networkidle' })
  const mdet = mp.locator('details#shift')
  await mdet.evaluate((d) => { d.open = true }).catch(() => {})
  await mp.waitForTimeout(450)
  const mt = one(await mdet.locator('[data-shift-waiting]').innerText().catch(() => ''))
  ok('대조: 격리상사418 관리자는 자기 공고에서 제트만 대기로 봄', mt.includes('제트격리418') && !mt.includes('엑스대기418'), mt)
  await mp.goto(`${D}/admin/jobs/${J}?tab=att&date=${tm}`, { waitUntil: 'networkidle' })
  ok('격리상사418 관리자는 우리 공고 J의 답 현황을 못 봄', (await mp.locator('[data-shift-answers]').count()) === 0 && !(await mp.locator('body').innerText()).includes('엑스대기418'))

  // ── 8. 어두운 화면: 대기 이름·배지 글씨 대비
  const dk = await ctxOf(A, { dark: true })
  det = await att(dk, tm)
  const cn = await contrast(det.locator('[data-shift-waiting]'))
  const cb = await contrast(det.locator('[data-shift-wait-badge]'))
  ok('어두운 화면: 대기 이름 대비 4.5 이상', cn >= 4.5, cn.toFixed(2))
  ok("어두운 화면: '답 대기' 배지 대비 4.5 이상", cb >= 4.5, cb.toFixed(2))
  if (SHOTS) { await det.evaluate((e) => e.scrollIntoView({ block: 'start' })); await dk.waitForTimeout(400); await dk.screenshot({ path: `${SHOTS}/418-dark-shift.png` }) }

  // ── 9. 움직임 줄이기: 막대·배지 움직임 없음
  const r = await ctxOf(A, { reduce: true })
  det = await att(r, tm)
  const rd = await det.locator('[data-shift-answers] div[aria-hidden]').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 9)
  const rb = await det.locator('[data-shift-wait-badge]').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 9)
  ok('움직임 줄이기: 막대·배지 움직임 없음', rd < 0.001 && rb < 0.001, `${rd} ${rb}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch418: ${fails} FAIL` : '== batch418: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
