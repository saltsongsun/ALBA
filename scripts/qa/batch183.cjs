// 묶음 183 (정기 개선 2026-11-10 22:35 KST)
// · 여러 회사를 맡은 관리자: 다른 회사에서 '확정을 기다리는 지원자'도 알려 줌 (지금까진 새 문의만)
//   - 대시보드 '다른 회사에 확인할 일' 칩 '회사명 대기 n' (문의도 있으면 '문의 n 대기 n') → 누르면 그 회사로
//   - 회사 고르기: 빨간 점 + '· 대기 n'
//   - 보류한 지원자 · 끝난 공고 · 취소한 공고의 지원자는 세지 않음 (대시보드 '확정 대기'와 같은 기준)
// · 근무자 내 근무: 근무 날에는 '오늘의 근무'(출퇴근 버튼)가 레벨 카드·이번 주 내 근무보다 먼저
//   (버튼이 첫 화면에 보이게) · 근무가 없는 날은 예전처럼 레벨 카드·이번 주가 먼저
// node scripts/qa/batch183.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000183'
const J2 = 'cccccccc-0000-4000-8000-000000000183', J2OLD = 'cccccccc-0000-4000-8000-000000000184', J2X = 'cccccccc-0000-4000-8000-000000000185'
const U = (n) => `44444444-0000-4000-8000-0000000183${String(n).padStart(2, '0')}`
const AP = (n) => `55555555-0000-4000-8000-0000000183${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const today = kstDay(Date.now()), tmr = kstDay(Date.now() + 864e5), yest = kstDay(Date.now() - 864e5)
  const now = new Date().toISOString()
  // 두 번째 회사(같은 관리자가 맡음) + 공고 3개: 내일(모집 중) · 어제 끝남 · 내일이지만 취소
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: now })
  await rest('jobs', 'POST', { ...j, id: J2, company_id: C2, title: '두번째 회사 행사', start_date: tmr, end_date: tmr, status: 'open', applications: [] })
  await rest('jobs', 'POST', { ...j, id: J2OLD, company_id: C2, title: '어제 끝난 행사', start_date: yest, end_date: yest, status: 'open', applications: [] })
  await rest('jobs', 'POST', { ...j, id: J2X, company_id: C2, title: '취소한 행사', start_date: tmr, end_date: tmr, status: 'cancelled', applications: [] })
  const apply = async (n, jobId, extra = {}) => {
    const user = { id: U(n), name: `지원자${n}`, phone: `0101830000${n}`, birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true }
    await rest('users', 'POST', user)
    await rest('applications', 'POST', { id: AP(n), job_id: jobId, user_id: U(n), company_id: C2, status: 'applied', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, held_at: null, created_at: now, user, job: { id: jobId, title: '두번째 회사 행사', start_date: tmr, end_date: tmr, start_time: '09:00:00', end_time: '18:00:00' }, ...extra })
  }
  await apply(1, J2) // 세어짐
  await apply(2, J2) // 세어짐
  await apply(3, J2, { held_at: now }) // 보류 → 안 셈
  await apply(4, J2OLD) // 끝난 공고 → 안 셈
  await apply(5, J2X) // 취소한 공고 → 안 셈

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

  // ── 1. 대시보드: 다른 회사의 확정 대기 지원자
  const a = await pg(A)
  await a.goto(`${D}/admin`)
  const card = a.locator('[data-other-companies]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const ct = ((await card.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  // (어제 끝난 공고의 대기 지원자는 '확정 대기'가 아니라 '결과 안 알림'으로 따로 셈 — 묶음 217)
  ok("'다른 회사에 확인할 일 · 두번째기획 대기 2 결과 안 알림 1' (보류·취소한 공고는 안 셈 · 끝난 공고는 '결과 안 알림' · 내일 시작 공고는 '내일 행사 1')", ct === '다른 회사에 확인할 일 두번째기획 대기 2 결과 안 알림 1 내일 행사 1', ct)
  ok('문의가 없으면 문의 숫자는 없음', (await card.locator('[data-other-unread-n]').count()) === 0 && (await card.locator('[data-other-waiting]').count()) === 1)
  ok('회사 고르기: 빨간 점', (await a.locator('header [data-other-unread]').count()) === 1)
  const opt = await a.locator(`header select[name=company] option[value="${C2}"]`).innerText()
  ok("회사 고르기 목록: '두번째기획 · 대기 2 · 결과 안 알림 1 · 내일 행사 1' (어제 끝난 공고의 대기 지원자 — 묶음 220)", opt.replace(/\s+/g, ' ').trim() === '두번째기획 · 대기 2 · 결과 안 알림 1 · 내일 행사 1', opt)
  ok('한 줄 · 360px 옆으로 안 밀림', (await card.locator('button').first().evaluate((el) => el.getBoundingClientRect().height < 40)) && (await noSide(a)))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/other-waiting.png` }).catch(() => {})
  // 문의도 있으면 함께
  await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, job_id: null, company_id: C2, body: '내일 주차 되나요?', read_at: null, created_at: now })
  await a.goto(`${D}/admin`)
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const ct2 = ((await card.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  ok("문의도 있으면 '두번째기획 문의 1 대기 2 결과 안 알림 1'", ct2 === '다른 회사에 확인할 일 두번째기획 문의 1 대기 2 결과 안 알림 1 내일 행사 1', ct2)
  ok('문의와 함께여도 360px 옆으로 안 밀림', await noSide(a))
  // 누르면 그 회사로 → 확정 대기 지원자 2명이 보임
  await card.getByRole('button', { name: /두번째기획/ }).click()
  await a.waitForFunction((c2) => document.querySelector('header select[name=company]')?.value === c2, C2, { timeout: 15000 }).catch(() => {})
  ok('누르면 그 회사 대시보드로', (await a.locator('header select[name=company]').inputValue()) === C2)
  // 그 회사에서 보면: 원래 회사(대기 지원자 김지원 1명 · 문의 1건)가 '다른 회사'로
  const back = ((await a.locator('[data-other-companies]').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  ok("그 회사에서 보면 원래 회사가 '다른 회사'로 (대기 1)", /주식회사 테스트( 문의 \d+)? 대기 1( (오늘|내일) 행사 \d+)?$/.test(back), back)
  // 다 확정·처리하면 안내 없음 (원래 회사로 돌아와서)
  await rest(`applications?company_id=eq.${C2}`, 'PATCH', { status: 'approved' })
  await rest(`messages?company_id=eq.${C2}`, 'PATCH', { read_at: now })
  // (고르면 바로 바뀌어 다시 그려짐 — 다 바뀐 뒤에 확인)
  await Promise.all([a.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => {}), a.locator('header select[name=company]').selectOption(C1)])
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.goto(`${D}/admin`)
  await a.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(400)
  ok("다른 회사에 남은 일이 없으면 점 없음 · 안내는 '다른 회사 행사 · 내일 행사 1'만", (await a.locator('header select[name=company]').inputValue()) === C1 && ((await a.locator('[data-other-companies]').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim() === '다른 회사 행사 두번째기획 내일 행사 1' && (await a.locator('header [data-other-unread]').count()) === 0, `${await a.locator('header select[name=company]').inputValue()} | ${((await a.locator('[data-other-companies]').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ')}`)

  // ── 2. 근무자 내 근무: 근무 날엔 '오늘의 근무'가 먼저
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  // (서명할 서류가 남아 있으면 그 안내가 맨 위에 오는 게 맞음 → 서류는 다 서명한 상태로 두고 버튼 위치를 봄)
  await rest(`signed_docs?user_id=eq.${W}`, 'PATCH', { status: 'signed', signed_at: now })
  const w = await pg(W)
  await w.goto(`${D}/me`)
  await w.locator('#today-work [data-clock-main]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const pos = await w.evaluate(() => {
    const y = (s) => { const el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1 }
    const btn = [...document.querySelectorAll('#today-work [data-clock-main]')].find((e) => e.checkVisibility())
    const nav = document.querySelector('[data-bottom-nav]')?.getBoundingClientRect().top ?? innerHeight
    return { today: y('#today-work'), xp: y('[data-xp-card]'), week: y('[data-week]'), btnBottom: btn ? Math.round(btn.getBoundingClientRect().bottom + scrollY) : -1, nav: Math.round(nav) }
  })
  ok("근무 날: '오늘의 근무'가 레벨 카드·이번 주 내 근무보다 위", pos.today > 0 && pos.xp > pos.today && pos.week > pos.today, JSON.stringify(pos))
  ok('출퇴근 버튼이 내리지 않아도 보임 (아래 탭 줄 위)', pos.btnBottom > 0 && pos.btnBottom <= pos.nav, JSON.stringify(pos))
  ok('360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/me-workday.png` }).catch(() => {})
  // 근무가 없는 날: 레벨 카드·이번 주가 먼저 (예전 그대로)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr, start_time: '09:00:00', end_time: '18:00:00' })
  await w.goto(`${D}/me`)
  await w.locator('#today-work').waitFor({ timeout: 15000 }).catch(() => {})
  const pos2 = await w.evaluate(() => { const y = (s) => { const el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1 }; return { today: y('#today-work'), xp: y('[data-xp-card]'), week: y('[data-week]') } })
  ok('근무가 없는 날: 레벨 카드·이번 주가 먼저', pos2.xp > 0 && pos2.xp < pos2.today && pos2.week > 0 && pos2.week < pos2.today, JSON.stringify(pos2))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
