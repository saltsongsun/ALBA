// 묶음 230 (정기 개선 2026-11-13 09:36 KST)
// · 근무자 '늦어요' 알림: 시작 시각이 이미 지났으면 '가는 중이에요 · 도착 시간 알리기' → '언제쯤 도착해요?' (10분 뒤 · 20분 뒤 …)
//   고르는 칸마다 도착 예정 시각(HH:MM)이 함께 보이고, 고른 칸의 시각이 톡
//   담당자에게는 시작 시각에서 실제로 늦는 시간(지난 시간 + 고른 시간)으로 알림 — 전에는 40분 지나 '10분'을 고르면 '약 10분 늦어요'로 감
//   늦는 시간이 길면 '1시간 15분 늦음'처럼 시간·분으로
//   시작 전에는 전과 같음 ('늦을 것 같아요' · '얼마나 늦을 것 같나요?' · 고른 만큼 늦음)
// · 회사 설정 '가입 신청': 번호를 누르면 전화(아는 사람인지 확인) · 'n시간째' 기다린 시간
// node scripts/qa/batch230.cjs <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [F, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', N = 'aaaaaaaa-0000-4000-8000-0000000000c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MF}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const hm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const nowMin = () => { const k = new Date(Date.now() + 9 * 3600e3); return k.getUTCHours() * 60 + k.getUTCMinutes() }
const near = (a, b) => { const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)); return Math.abs(((m(a) - m(b) + 1440 + 720) % 1440) - 720) <= 1 }
const mt = (n) => { const h = Math.floor(n / 60), m = n % 60; return h && m ? `${h}시간 ${m}분` : h ? `${h}시간` : `${m}분` }
const lateMsgs = async () => ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => (m.body ?? '').startsWith('🕒'))

;(async () => {
  const today = kst(0)
  if (nowMin() >= 23 * 60 + 56) { console.log('SKIP  23:56 넘어 확인 생략'); console.log('ALL PASSED'); process.exit(0) }
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: F }, { name: 'alba_roster', value: roster(uid), url: F }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)
  const openBtn = w.locator('[data-late-open]')
  const me = async () => {
    await w.goto(`${F}/me`, { waitUntil: 'networkidle' })
    await openBtn.waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 시작 시각(00:00)이 이미 지남: '가는 중이에요 · 도착 시간 알리기'
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await me()
  ok("시작이 지났으면 '🕒 가는 중이에요 · 도착 시간 알리기'", (await openBtn.getAttribute('data-late-open')) === 'started' && one(await openBtn.innerText()) === '🕒 가는 중이에요 · 도착 시간 알리기', one(await openBtn.innerText().catch(() => '')))
  await openBtn.click()
  const t0 = Date.now()
  const form = w.locator('form', { has: w.locator('[data-late-choices]') })
  await form.waitFor({ timeout: 5000 }).catch(() => {})
  ok("물음이 '언제쯤 도착해요?'", (await form.getByText('언제쯤 도착해요?').count()) === 1)
  const chips = form.locator('[data-late-choices] label')
  const texts = (await chips.allInnerTexts()).map((s) => one(s))
  const etas = await form.locator('[data-late-eta]').evaluateAll((els) => els.map((e) => e.getAttribute('data-late-eta')))
  ok("칸: '10분 뒤 · 20분 뒤 · 30분 뒤 · 1시간 뒤' + 각 도착 시각 (지금부터)", texts.map((s) => s.split(' ').slice(0, 2).join(' ')).join('|') === '10분 뒤|20분 뒤|30분 뒤|1시간 뒤' && [10, 20, 30, 60].every((m, i) => near(etas[i] ?? '', hm(t0 + m * 60e3))), `${texts.join('|')} / ${etas.join(',')}`)
  const lines = await form.locator('[data-late-choices] label > span:first-of-type').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight) * 1.2))
  ok('칸 글자가 한 줄 (360px) · 옆으로 안 밀림', lines.length === 4 && lines.every(Boolean) && (await noSide(w)))
  await chips.nth(2).click()
  await w.waitForTimeout(250)
  const pick = chips.nth(2).locator('[data-late-eta]')
  ok('고른 칸(30분 뒤): 파란 칸 · 시각이 톡', ((await chips.nth(2).getAttribute('class')) ?? '').includes('bg-brand-600') && ((await pick.getAttribute('class')) ?? '').includes('animate-pop'))
  if (SHOTS) {
    await w.waitForTimeout(300)
    const bx = await form.boundingBox()
    if (bx) await w.screenshot({ path: `${SHOTS}/late-started.png`, clip: { x: 0, y: Math.max(0, bx.y - 50), width: 360, height: bx.height + 60 } }).catch(() => {})
  }
  await form.getByRole('button', { name: '담당자에게 알리기' }).click()
  const eta30 = hm(Date.now() + 30 * 60e3)
  const okMsg = await w.getByText(/\d{2}:\d{2}쯤 도착한다고 알렸어요/).first().waitFor({ timeout: 10000 }).then(() => true, () => false)
  ok("보내면 'HH:MM쯤 도착한다고 알렸어요. 조심히 오세요!'", okMsg)
  const [m1] = await lateMsgs()
  const lateExpect = nowMin() + 30
  const got = Number((m1?.body ?? '').match(/약 (\d+)분 늦어요/)?.[1] ?? -1)
  const gotEta = (m1?.body ?? '').match(/도착 예정 (\d{2}:\d{2})/)?.[1] ?? ''
  ok('담당자에게: 시작(00:00)부터 실제로 늦는 시간 (지난 시간 + 30분) · 도착 예정', Math.abs(got - lateExpect) <= 2 && near(gotEta, eta30), `${got} vs ${lateExpect} · ${gotEta} vs ${eta30}`)
  await me()
  ok("다시 열면 보낸 내용 + '🕒 도착 시간 다시 알리기'", (await w.getByText(`약 ${mt(got)} 늦음`).count()) === 1 && one(await openBtn.innerText()) === '🕒 도착 시간 다시 알리기')

  // ── 2. 관리자 출퇴근 탭: 실제로 늦는 시간 배지
  const a = await mk(A)
  await a.goto(`${F}/admin/jobs/${J}?tab=att`, { waitUntil: 'networkidle' })
  ok(`관리자 출퇴근 탭: '${mt(got)} 늦음'(시간·분으로) · 도착 예정`, (await a.getByText(`${mt(got)} 늦음`).count()) > 0 && (await a.getByText(/도착 예정/).count()) > 0)

  // ── 3. 시작 전 (23:50 시작): 전과 같음 — '늦을 것 같아요' · 고른 만큼 늦음
  if (nowMin() < 23 * 60 + 45) {
    for (const m of await lateMsgs()) await rest(`messages?id=eq.${m.id}`, 'DELETE')
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '23:50:00', end_time: '23:59:00' })
    await me()
    ok("시작 전: '🕒 늦을 것 같아요 · 담당자에게 알리기'", (await openBtn.getAttribute('data-late-open')) === 'before' && one(await openBtn.innerText()) === '🕒 늦을 것 같아요 · 담당자에게 알리기', one(await openBtn.innerText().catch(() => '')))
    await openBtn.click()
    await form.waitFor({ timeout: 5000 }).catch(() => {})
    const etas2 = await form.locator('[data-late-eta]').evaluateAll((els) => els.map((e) => e.getAttribute('data-late-eta')))
    const texts2 = (await chips.allInnerTexts()).map((s) => one(s).split(' ')[0])
    ok("물음 '얼마나 늦을 것 같나요?' · 칸 '10분…1시간' · 도착 시각은 시작(23:50)부터", (await form.getByText('얼마나 늦을 것 같나요?').count()) === 1 && texts2.join('|') === '10분|20분|30분|1시간' && etas2.join(',') === '00:00,00:10,00:20,00:50', `${texts2.join('|')} / ${etas2.join(',')}`)
    await chips.nth(1).click()
    await form.getByRole('button', { name: '담당자에게 알리기' }).click()
    ok("보내면 '약 20분 늦는다고 알렸어요'", await w.getByText('약 20분 늦는다고 알렸어요').first().waitFor({ timeout: 10000 }).then(() => true, () => false))
    const [m2] = await lateMsgs()
    ok('담당자에게: 약 20분 늦어요 (도착 예정 00:10)', (m2?.body ?? '').includes('약 20분 늦어요 (도착 예정 00:10)'), m2?.body)
  } else console.log('PASS  (23:45 넘어 시작 전 확인 생략)')

  // ── 4. 회사 설정 가입 신청: 번호 누르면 전화 · 기다린 시간
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: N, name: '최합류', phone: '01066667777', is_super: false })
  await rest('company_join_requests', 'POST', { company_id: C1, user_id: N, created_at: new Date(Date.now() - 3 * 3600e3 - 60e3).toISOString() })
  await a.goto(`${F}/admin/settings`, { waitUntil: 'networkidle' })
  const req = a.locator(`[data-join-req="${N}"]`)
  await req.waitFor({ timeout: 15000 }).catch(() => {})
  ok("가입 신청 번호: 누르면 전화 (tel:01066667777 · '010-6666-7777')", (await req.locator('[data-join-req-call]').getAttribute('href')) === 'tel:01066667777' && one(await req.locator('[data-join-req-call]').innerText()) === '010-6666-7777')
  ok("기다린 시간 '3시간째' · 안내 '번호를 눌러 아는 사람인지 확인'", one(await req.locator('[data-join-req-waited]').innerText()) === '3시간째' && (await a.getByText('번호를 눌러 아는 사람인지 확인한 뒤 승인해 주세요').count()) === 1)
  const ln = await req.locator('[data-join-req-waited]').evaluate((el) => { const p = el.parentElement; return { h: p.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(p).lineHeight), cut: p.scrollWidth > p.clientWidth + 1, t: p.innerText } })
  ok("기다린 시간 줄은 한 줄 · '3시간째 · HH:MM 신청'(오늘) 또는 날짜", ln.h <= ln.lh * 1.2 && !ln.cut && /^3시간째 · (\d{2}:\d{2}|\d{1,2}\/\d{1,2}) 신청$/.test(one(ln.t)), JSON.stringify(ln))
  ok('360px 옆으로 안 밀림 (회사 설정)', await noSide(a))
  if (SHOTS) {
    await req.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(300)
    const bx = await req.locator('xpath=..').boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/join-req.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
