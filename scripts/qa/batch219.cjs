// 묶음 219 (정기 개선 2026-11-12 16:35 KST · 이용 기록: '시간 인정 요청'이 일주일에 17번 — 자주 쓰는 기능)
// · 관리자 출퇴근 탭: 그날 시간 인정 요청이 둘 이상이면 위에 '🙏 시간 인정 요청 n건 [모두 인정]' (두 번 눌러야)
//   → 모두 근로조건대로(예정 종료 시각까지) 보정 · 근무자마다 결과 알림 · 한 줄이 사라짐 (하나뿐이면 줄 없이 한 명씩)
// · 근무자 내 근무: 담당자가 답하면 요청 칸 자리에 결과 한 줄
//   - 인정: '✓ 18:00까지 시간 인정됐어요' (초록 · 톡 나타남 · 한 줄)
//   - 실제대로: '실제 종료 시각대로 계산해요 · 문의 →' (다시 요청 칸이 뜨지 않음)
// node scripts/qa/batch219.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const U1 = '44444444-0000-4000-8000-000000021901', U2 = '44444444-0000-4000-8000-000000021902'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const at = (t) => new Date(`${today}T${t}:00+09:00`).toISOString()

;(async () => {
  // 준비: 오늘 09:00~18:00 · 근무자 W와 새 근무자 둘(U1 15:00, U2 16:00 종료) 모두 일찍 끝남 · 서류는 서명 끝
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '09:00:00', end_time: '18:00:00', status: 'closed' })
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: today, clock_in: at('09:00'), clock_out: at('14:00'), adj_in: null, adj_out: null, paid: false })
  for (const d of await rest(`signed_docs?user_id=eq.${W}`)) await rest(`signed_docs?id=eq.${d.id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  const [uw] = await rest(`users?id=eq.${W}`)
  const [aw] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const mkWorker = async (id, name, phone, out, n) => {
    await rest('users', 'POST', { ...uw, id, name, phone, nickname: null, created_at: new Date().toISOString() })
    await rest('applications', 'POST', { ...aw, id: `11111111-0000-4000-8000-0000000219${n}0`, user_id: id, status: 'approved', user: { ...aw.user, id, name, phone }, created_at: new Date().toISOString() })
    await rest('attendance', 'POST', { ...att, id: `abababab-0000-4000-8000-0000000219${n}0`, user_id: id, work_date: today, clock_in: at('09:00'), clock_out: at(out), adj_in: null, adj_out: null, paid: false, note: null, user: { ...(att.user ?? {}), id, name, phone } })
  }
  await mkWorker(U1, '이일찍', '01021900001', '15:00', 1)
  await mkWorker(U2, '박일찍', '01021900002', '16:00', 2)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  // 근무자 화면에서 '18:00까지 시간 인정받기' → '담당자에게 요청하기'
  const request = async (p) => {
    await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
    await p.locator('[data-full-time-open]').waitFor({ timeout: 15000 }).catch(() => {})
    await p.locator('[data-full-time-open]').click().catch(() => {})
    await p.getByRole('button', { name: '담당자에게 요청하기' }).click().catch(() => {})
    return p.locator('[data-full-time-sent]').waitFor({ timeout: 10000 }).then(() => true, () => false)
  }
  const a = await pg(A)
  const w = await pg(W)
  const u1 = await pg(U1)
  const u2 = await pg(U2)
  const attTab = `${D}/admin/jobs/${J}?tab=att&date=${today}`
  const bar = a.locator('[data-full-time-all]')

  // ── 1. 하나뿐이면 '모두 인정' 줄 없음 → 한 명씩 (실제 시각대로)
  ok('W: 시간 인정 요청 보냄', await request(w))
  await a.goto(attTab, { waitUntil: 'networkidle' })
  await a.locator('[data-full-time-ask]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("요청이 하나면 '모두 인정' 줄 없음 (그 사람 칸에서)", (await bar.count()) === 0 && (await a.locator('[data-full-time-ask]').count()) === 1)
  const card = a.locator('[data-full-time-ask]').first()
  await card.getByRole('button', { name: '실제 시각대로' }).click()
  await card.getByRole('button', { name: '한 번 더 누르면 실제대로 둬요' }).click()
  await a.getByText('실제 종료 시각대로 두고 근무자에게 알렸어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const noLine = w.locator('[data-full-time-answer="no"]')
  await noLine.waitFor({ timeout: 15000 }).catch(() => {})
  ok("W 근무자 화면: '실제 종료 시각대로 계산해요 · 문의 →' (요청 칸 다시 안 뜸)", one(await noLine.innerText().catch(() => '')) === '실제 종료 시각대로 계산해요 문의 →' && (await w.locator('[data-full-time], [data-full-time-open]').count()) === 0, one(await noLine.innerText().catch(() => '')))
  ok('문의 → 는 그 회사 문의로', ((await noLine.locator('a').getAttribute('href')) ?? '').startsWith('/me/chat?co='))

  // ── 2. 둘이 요청 → '모두 인정'
  ok('U1·U2: 시간 인정 요청 보냄', (await request(u1)) && (await request(u2)))
  await a.goto(attTab, { waitUntil: 'networkidle' })
  await bar.waitFor({ timeout: 15000 }).catch(() => {})
  const bt = one(await bar.innerText().catch(() => ''))
  ok("'🙏 시간 인정 요청 2건 · 모두 인정' 한 줄 (W는 이미 답해서 빠짐)", bt.startsWith('🙏 시간 인정 요청 2건') && bt.endsWith('모두 인정'), bt)
  ok('줄은 화면 안 · 설명은 한 줄 · 360px 옆으로 안 밀림', (await bar.evaluate((el) => el.getBoundingClientRect().right <= innerWidth && el.querySelector('span span').getBoundingClientRect().height < 20)) && (await noSide(a)))
  if (SHOTS) await bar.screenshot({ path: `${SHOTS}/full-time-all.png` }).catch(() => {})
  const btn = bar.locator('button')
  await btn.click()
  await a.waitForTimeout(300)
  ok("첫 누름: '2건 모두 인정?' (아직 그대로)", one(await btn.innerText()) === '2건 모두 인정?' && !(await rest(`attendance?user_id=eq.${U1}`))[0].adj_out)
  if (SHOTS) await bar.screenshot({ path: `${SHOTS}/full-time-all-armed.png` }).catch(() => {})
  await btn.click()
  const done = await a.getByText('시간 인정 2건 · 근무자마다 알렸어요.').first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  ok("두 번째 누름: '시간 인정 2건 · 근무자마다 알렸어요.'", done)
  const [r1] = await rest(`attendance?user_id=eq.${U1}`)
  const [r2] = await rest(`attendance?user_id=eq.${U2}`)
  const [rw] = await rest(`attendance?id=eq.${att.id}`)
  ok('U1·U2 종료가 18:00으로 보정 (원래 기록은 그대로) · W는 안 바뀜', new Date(r1.adj_out).toISOString() === at('18:00') && new Date(r2.adj_out).toISOString() === at('18:00') && new Date(r1.clock_out).toISOString() === at('15:00') && !rw.adj_out, JSON.stringify([r1.adj_out, r2.adj_out, rw.adj_out]))
  const msgs = await rest('messages')
  ok("둘 다 '근로조건대로 18:00까지 인정했어요' 알림", [U1, U2].every((u) => msgs.some((m) => m.thread_user_id === u && m.from_admin && m.body.includes('근로조건대로 18:00까지 인정했어요'))))
  ok("처리 뒤 '모두 인정' 줄 사라짐 · 각 사람의 요청 칸도", (await bar.count()) === 0 && (await a.locator('[data-full-time-ask]').count()) === 0)

  // ── 3. 근무자 화면: 인정 결과 한 줄
  await u1.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const okLine = u1.locator('[data-full-time-answer="ok"]')
  await okLine.waitFor({ timeout: 15000 }).catch(() => {})
  ok("U1 근무자 화면: '✓ 18:00까지 시간 인정됐어요' (톡 나타남)", one(await okLine.innerText().catch(() => '')) === '✓ 18:00까지 시간 인정됐어요' && ((await okLine.getAttribute('class')) ?? '').includes('animate-pop'), one(await okLine.innerText().catch(() => '')))
  ok('한 줄 · 360px 옆으로 안 밀림 (근무자)', (await okLine.evaluate((el) => el.getBoundingClientRect().height < 48)) && (await noSide(u1)))
  if (SHOTS) await okLine.screenshot({ path: `${SHOTS}/full-time-ok.png` }).catch(() => {})
  // 인정 뒤 담당자가 기록을 다시 15:00으로 되돌리면: 결과 대신 전처럼 요청 칸
  await rest(`attendance?id=eq.${r1.id}`, 'PATCH', { adj_out: null })
  await u1.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await u1.locator('[data-full-time], [data-full-time-answer]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('기록이 다시 일찍 끝난 채면 결과 대신 요청 칸', (await u1.locator('[data-full-time-answer]').count()) === 0 && (await u1.locator('[data-full-time-open]').count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
