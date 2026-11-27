// 묶음 412 (정기 개선 2026-11-27 11:36 KST)
// 기능 · 정산 탭 '일찍 찍힌 출근 n건': 같은 날 · 같은 시작 시각에 2건 이상이면 '한 번에 고치기 ›'
//   → 출퇴근 탭 '여러 명 시간 한 번에 고치기'가 펼쳐진 채 그 사람들을 고르고 출근 칸을 시작 시각(09:00)으로 채움
//   → 두 번 눌러 저장하면 모두 09:00 · '정산 탭에서 금액 보기 ›' · 정산 탭 줄이 사라짐 (근무자 알림은 그대로 감)
//   · 1건이거나 날짜가 섞이면 예전처럼 한 사람 고치기 칸 · 지급 끝난 사람은 미리 고르지 않음
// 인터랙션 · '출근을 09:00로 맞추기'를 누르면 저장 버튼이 화면 안으로 + 잠깐 테두리 · 펼친 칸 테두리 한 번(0.3초)
// node scripts/qa/batch412.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const X = '41200000-0000-4000-8000-000000000412'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const at = (d, hm) => new Date(`${d}T${hm}:00+09:00`).toISOString()

;(async () => {
  const y = kday(-1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(-2), end_date: kday(0), start_time: '09:00:00', end_time: '18:00:00', early_clamp: false })
  // 어제: W 06:00 · X 06:30 출근 (둘 다 09:00보다 한참 일찍 · 18:00 퇴근)
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { work_date: y, clock_in: at(y, '06:00'), clock_out: at(y, '18:00'), adj_in: null, adj_out: null, paid: false })
  const [att] = await rest(`attendance?id=eq.${ATT}`)
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const u = { ...w1, id: X, name: '엑스일찍', phone: '01077770412', created_at: new Date().toISOString() }
  await rest('users', 'POST', u)
  await rest('applications', 'POST', { ...wApp, id: undefined, user_id: X, user: u, position: null })
  await rest('attendance', 'POST', { ...att, id: undefined, user_id: X, clock_in: at(y, '06:30'), clock_out: at(y, '18:00'), adj_in: null, adj_out: null, paid: false, note: null })
  const xAtt = () => rest(`attendance?job_id=eq.${J}&user_id=eq.${X}`).then((r) => r?.[0])

  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid, reduce = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await ctxOf(A)
  const pay = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' }); return a.locator('[data-pay-early]') }

  // ── 1. 정산 탭: 2건 · 같은 날 · 같은 시작 → '한 번에 고치기 ›'
  let line = await pay()
  ok("정산 탭: '일찍 찍힌 출근 2건 · 한 번에 고치기 ›'", (await line.getAttribute('data-pay-early').catch(() => null)) === '2' && one(await line.locator('[data-pay-early-go]').innerText().catch(() => '')) === '한 번에 고치기 ›', one(await line.innerText().catch(() => '')))
  const href = (await line.getAttribute('href').catch(() => '')) ?? ''
  ok('주소: 그날 · 두 사람 · 출근 09:00 · 여러 명 고치기 칸', href.includes(`date=${y}`) && href.includes(W) && href.includes(X) && href.includes('in=09:00') && href.endsWith('#bulk-adjust'), href)
  ok(`아랫줄: '근무자 외 1명 · … 시작 09:00보다 최대 3시간 일찍 · 급여에 그대로 들어가요'`, one(await line.locator('[data-pay-early-top]').innerText().catch(() => '')).endsWith('외 1명 · ' + one(await line.locator('[data-pay-early-top]').innerText().catch(() => '')).split('외 1명 · ')[1]) && one(await line.locator('[data-pay-early-top]').innerText().catch(() => '')).includes('근무자 외 1명 ·') && one(await line.locator('[data-pay-early-top]').innerText().catch(() => '')).includes('시작 09:00보다 최대 3시간 일찍 · 급여에 그대로 들어가요'), one(await line.locator('[data-pay-early-top]').innerText().catch(() => '')))
  ok('윗줄이 한 줄 안에 (360px)', await line.locator('b').evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false))
  if (SHOTS) { await line.scrollIntoViewIfNeeded(); await a.waitForTimeout(350); const bx = await line.boundingBox(); if (bx) await a.screenshot({ path: `${SHOTS}/pay-early-bulk.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(140, bx.height + 24) } }).catch(() => {}) }

  // ── 2. 누르면 여러 명 고치기 칸이 열리고 두 사람 · 09:00이 채워짐
  await line.click()
  await a.waitForURL((u) => u.searchParams.get('tab') === 'att', { timeout: 15000 }).catch(() => {})
  const panel = a.locator('#bulk-adjust')
  await panel.waitFor({ timeout: 15000 }).catch(() => {})
  ok('여러 명 시간 한 번에 고치기: 펼쳐진 채', await panel.evaluate((d) => d.open).catch(() => false))
  const picked = await panel.locator('input[name=uid]:checked').evaluateAll((els) => els.map((e) => e.value).sort()).catch(() => [])
  ok('두 사람이 미리 골라짐', JSON.stringify(picked) === JSON.stringify([W, X].sort()), JSON.stringify(picked))
  ok("출근 칸 '09:00' · 종료 칸은 비움", (await panel.locator('input[name=in_time]').inputValue().catch(() => '')) === '09:00' && (await panel.locator('input[name=out_time]').inputValue().catch(() => 'x')) === '')
  ok('펼친 칸 테두리 한 번 (flash-ring · 0.3초)', await panel.evaluate((d) => getComputedStyle(d).animationName === 'flash-ring' && getComputedStyle(d).animationDuration === '0.3s').catch(() => false))
  ok('360px 옆으로 안 밀림 (출퇴근 탭)', await noSide(a))
  if (SHOTS) { await a.waitForTimeout(350); const bx = await panel.boundingBox(); if (bx) await a.screenshot({ path: `${SHOTS}/att-bulk-prefill.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(560, bx.height + 16) } }).catch(() => {}) }
  // 두 번 눌러 저장
  await panel.getByRole('button', { name: '고른 2명 시간 고치기' }).click()
  await panel.getByRole('button', { name: '한 번 더 누르면 2명 시간을 고쳐요' }).click()
  await a.getByText('2명 시간을 고쳤어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  const [w2] = await rest(`attendance?id=eq.${ATT}`)
  const x2 = await xAtt()
  ok('저장하면 두 사람 모두 출근 09:00 (보정)', Date.parse(w2?.adj_in ?? 0) === Date.parse(at(y, '09:00')) && Date.parse(x2?.adj_in ?? 0) === Date.parse(at(y, '09:00')), `${w2?.adj_in} / ${x2?.adj_in}`)
  const back = panel.locator('[data-bulk-back]')
  ok("'정산 탭에서 금액 보기 ›' (톡 · 0.25초)", (await back.isVisible().catch(() => false)) && (await back.evaluate((el) => getComputedStyle(el).animationName === 'pop' && getComputedStyle(el).animationDuration === '0.25s').catch(() => false)))
  const msgs = ((await rest('messages')) ?? []).filter((m) => (m.body ?? '').startsWith('🕒 근무 시각 고침') && [W, X].includes(m.thread_user_id))
  ok('두 사람 모두에게 시각 고침 알림', new Set(msgs.map((m) => m.thread_user_id)).size === 2, String(msgs.length))
  await back.click()
  await a.waitForURL((u) => u.searchParams.get('tab') === 'pay', { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  ok('정산 탭으로 돌아오면 일찍 찍힌 출근 줄이 사라짐', (await a.locator('[data-pay-early]').count()) === 0)

  // ── 3. 1건이면 예전처럼 한 사람 고치기 · 날짜가 섞여도 한 사람씩
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { adj_in: null })
  const xId = (await xAtt()).id
  await rest(`attendance?id=eq.${xId}`, 'PATCH', { adj_in: null, paid: true })
  line = await pay()
  ok("1건(지급한 X 빼고): '고치기 ›' · 한 사람 고치기 칸으로", one(await line.locator('[data-pay-early-go]').innerText().catch(() => '')) === '고치기 ›' && ((await line.getAttribute('href').catch(() => '')) ?? '').includes(`fix=${W}`))
  await rest(`attendance?id=eq.${xId}`, 'PATCH', { paid: false, work_date: kday(-2), clock_in: at(kday(-2), '06:30'), clock_out: at(kday(-2), '18:00') })
  line = await pay()
  ok('날짜가 다르면: 2건이어도 한 사람씩', (await line.getAttribute('data-pay-early').catch(() => null)) === '2' && one(await line.locator('[data-pay-early-go]').innerText().catch(() => '')) === '고치기 ›')
  // 지급 끝난 사람은 미리 고르지 않음 (주소에 있어도)
  await rest(`attendance?id=eq.${xId}`, 'PATCH', { work_date: y, clock_in: at(y, '06:30'), clock_out: at(y, '18:00'), paid: true })
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${y}&bulk=${W},${X}&in=09:00&from=pay#bulk-adjust`, { waitUntil: 'networkidle' })
  const picked2 = await a.locator('#bulk-adjust input[name=uid]:checked').evaluateAll((els) => els.map((e) => e.value)).catch(() => [])
  ok('지급 끝난 사람은 미리 고르지 않음', JSON.stringify(picked2) === JSON.stringify([W]), JSON.stringify(picked2))
  // 주소 없이 오면 접힌 채 · 아무도 안 고름
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${y}`, { waitUntil: 'networkidle' })
  ok('그냥 열면: 접힌 채 · 아무도 안 고름', !(await a.locator('#bulk-adjust').evaluate((d) => d.open).catch(() => true)) && (await a.locator('#bulk-adjust input[name=uid]:checked').count()) === 0)

  // ── 4. '출근을 09:00로 맞추기' → 저장 버튼이 화면 안으로 + 잠깐 테두리
  await rest(`attendance?id=eq.${xId}`, 'PATCH', { paid: false })
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${y}&fix=${W}#att-${W}`, { waitUntil: 'networkidle' })
  const form = a.locator('form[data-att-edit="open"]')
  await form.waitFor({ timeout: 15000 }).catch(() => {})
  await form.locator('[data-early-fix]').scrollIntoViewIfNeeded()
  await a.evaluate(() => window.scrollBy(0, -200))
  await form.locator('[data-early-fix]').click()
  await a.waitForTimeout(700)
  const save = form.locator('button[type="submit"]').first()
  ok('맞추기를 누르면 저장 버튼이 화면 안에 (아래 탭 막대에 안 가림)', await save.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 60 && r.bottom <= innerHeight - 90 }).catch(() => false), JSON.stringify(await save.evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight] }).catch(() => null)))
  ok('저장 버튼 잠깐 테두리', (await save.getAttribute('data-save-hint').catch(() => null)) === '' && (await save.evaluate((el) => el.classList.contains('ring-2')).catch(() => false)))
  await a.waitForTimeout(1400)
  ok('테두리는 곧 사라짐', (await save.getAttribute('data-save-hint').catch(() => 'x')) === null)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
