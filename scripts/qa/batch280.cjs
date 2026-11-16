// 묶음 280 (정기 개선 2026-11-17 00:36 KST) — 지난 근무도 기록 정정 요청 → 담당자는 대화에서 한 번에
// · 근무자 '지난 근무' 날짜별 기록: 최근 3일(오늘 제외 · 오늘은 '내 근무'에서) · 종료 기록 있음 · 지급 전인 날에 '이날 기록 정정 요청'
//   그보다 오래된 날·지급 끝난 날은 없음
// · 보내면 '담당자에게 종료 HH:MM(으)로 정정을 요청했어요' · 다시 열면 '담당자 확인 중'
// · 관리자 홈 할 일: '기록 정정 요청 · 공고' + 작은 줄 'M/D(요일) 근무' → 그날 출퇴근 탭
// · 관리자 문의 대화: 그 요청 아래 '요청대로 고치기' → 그날(어제) 기록이 고쳐짐 → 근무자 지난 근무에 고친 시각
// node scripts/qa/batch280.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const hm = (d) => new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(11, 16)
const md = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(`${s}T00:00:00Z`).getUTCDay()]})` }
const at = (day, t) => new Date(Date.parse(`${day}T${t}:00+09:00`)).toISOString()

;(async () => {
  const today = kday(Date.now()), yest = kday(Date.now() - 864e5), old = kday(Date.now() - 3 * 864e5)
  // 공고는 나흘 전부터 오늘까지 · 근무자 W: 어제 10:00~15:00 (끝남 · 지급 전) + 사흘 전 10:00~15:00 (요청 기간 밖)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(Date.now() - 4 * 864e5), end_date: today, start_time: '09:00:00', end_time: '18:00:00' })
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: yest, clock_in: at(yest, '10:00'), clock_out: at(yest, '15:00'), adj_in: null, adj_out: null, paid: false, note: null })
  await rest('attendance', 'POST', [{ ...att, id: 'eeeeeeee-0000-4000-8000-000000280003', work_date: old, clock_in: at(old, '10:00'), clock_out: at(old, '15:00'), adj_in: null, adj_out: null, paid: false, note: null }])

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)
  const days = w.locator(`[data-history-job="${J}"] [data-history-days]`)
  const openDays = async () => {
    await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
    await days.waitFor({ timeout: 15000 }).catch(() => {})
    if (!(await days.evaluate((d) => d.open).catch(() => false))) await days.locator('summary').click().catch(() => {})
    await w.waitForTimeout(300)
  }
  const dayRow = (d) => days.locator(`[data-history-day="${d}"]`)

  // ── 1. 지난 근무: 어제 줄에만 '이날 기록 정정 요청'
  await openDays()
  ok("어제(끝남·지급 전) 줄에 '이날 기록 정정 요청'", one(await dayRow(yest).locator('[data-fix-open]').textContent().catch(() => '')) === '이날 기록 정정 요청')
  ok('사흘 전(요청 기간 밖) 줄에는 없음', (await dayRow(old).count()) === 1 && (await dayRow(old).locator('[data-fix-open]').count()) === 0)
  await dayRow(yest).locator('[data-fix-open]').click()
  const form = dayRow(yest).locator('form')
  await form.waitFor({ timeout: 5000 }).catch(() => {})
  ok('누르면 그 줄 아래에 정정 칸 (종료 15:00 고름)', one(await form.locator('label', { hasText: '종료' }).first().textContent().catch(() => '')) === '종료 15:00')
  ok('360px 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await form.locator('input[type="time"]').fill('16:00')
  await form.locator('input[name="reason"]').fill('정리하느라 늦게 나왔어요')
  if (SHOTS) await dayRow(yest).screenshot({ path: `${SHOTS}/history-fix-form.png` }).catch(() => {})
  await form.getByRole('button', { name: '정정 요청 보내기' }).click()
  const done = dayRow(yest).locator('p', { hasText: '정정을 요청했어요' })
  await done.waitFor({ timeout: 15000 }).catch(() => {})
  ok("보내면 '담당자에게 종료 16:00(으)로 정정을 요청했어요'", one(await done.textContent().catch(() => '')).includes('종료 16:00(으)로 정정을 요청했어요'), one(await done.textContent().catch(() => '')))
  const msgs = await rest(`messages?thread_user_id=eq.${W}`)
  const req = msgs.find((m) => m.body.startsWith('✏️ 기록 정정 요청') && m.body.includes(`· ${md(yest)} 근무`))
  ok(`요청 글은 어제 근무(${md(yest)})에 대한 것 · 오늘 보냄`, !!req && kday(Date.parse(req.created_at)) === today && req.body.includes('실제 종료 16:00'))
  await openDays()
  ok("다시 열면 '담당자 확인 중'", one(await dayRow(yest).textContent()).includes('담당자 확인 중'))
  if (SHOTS) await w.locator(`[data-history-job="${J}"]`).screenshot({ path: `${SHOTS}/history-fix-sent.png` }).catch(() => {})

  // ── 2. 관리자 홈: 어제 근무 정정 요청 할 일 → 그날 출퇴근 탭
  const a = await mk(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const todo = a.locator(`[data-todo="fix-${J}-${yest}"]`)
  const tt = one(await todo.textContent().catch(() => ''))
  ok(`홈 할 일 '기록 정정 요청' + '${md(yest)} 근무' · 그날 출퇴근 탭으로`, tt.includes('기록 정정 요청') && tt.includes(`${md(yest)} 근무`) && (await todo.locator('a').first().getAttribute('href').catch(() => '')) === `/admin/jobs/${J}?tab=att&date=${yest}`, tt)

  // ── 3. 관리자 문의 대화: 요청 아래 '요청대로 고치기' → 어제 기록이 고쳐짐
  await a.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  const quick = a.locator('[data-chat-quick="fix"]')
  await quick.waitFor({ timeout: 15000 }).catch(() => {})
  ok('대화의 어제 근무 정정 요청 아래 바로 처리 버튼', (await quick.getByRole('button', { name: '요청대로 고치기' }).count()) === 1)
  await Promise.all([a.waitForURL(/m=/, { timeout: 30000 }).catch(() => {}), quick.getByRole('button', { name: '요청대로 고치기' }).click()])
  const flash = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok("'종료 시각을 16:00(으)로 고쳤어요.'", flash === '종료 시각을 16:00(으)로 고쳤어요.', flash)
  const [att2] = await rest(`attendance?id=eq.${att.id}`)
  ok('어제 근무 기록의 종료가 16:00으로', !!att2?.adj_out && hm(att2.adj_out) === '16:00' && kday(Date.parse(att2.adj_out)) === yest, att2?.adj_out ?? 'null')
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok('처리하면 홈 할 일에서 빠짐', (await a.locator(`[data-todo="fix-${J}-${yest}"]`).count()) === 0)

  // ── 4. 근무자 지난 근무: 고친 시각 · 확인 중 표시 없음
  await openDays()
  const rowTxt = one(await dayRow(yest).locator('> div').first().textContent().catch(() => ''))
  ok("어제 줄이 '10:00~16:00' · '담당자 확인 중' 없음", rowTxt.includes('10:00~16:00') && !one(await dayRow(yest).textContent()).includes('담당자 확인 중'), rowTxt)

  // ── 5. 지급 끝난 날은 요청 칸 없음
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { paid: true })
  await openDays()
  ok('지급 끝난 날은 정정 요청 없음', (await dayRow(yest).locator('[data-fix-open]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
