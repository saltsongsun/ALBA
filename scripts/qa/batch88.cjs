// 묶음 88: 근무 종료를 안 누르고 가는 사람 (사용자 요청 "근무종료 안누르고 가는 사람들이 있어서 근무종료 누르게 해줘")
// · 예정 종료 시각이 지났는데 아직 근무 중이면 어느 화면에서든 맨 위에 '⏰ 종료 시각(HH:MM)이 지났어요' + '근무 종료하러 가기'(→ 내 근무의 근무 종료 버튼)
// · 내 근무 화면에는 안 뜸 · '나중에'를 누르면 숨김 · 종료 시각 전에는 안 뜸
// · 같은 행사에서 누가 근무 종료를 누르면, 종료 시각이 지났는데 아직 근무 중인 다른 사람에게 '🏁 근무 종료를 눌러 주세요' (한 번만 · 누른 사람은 빼고)
// node scripts/qa/batch88.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const X = 'bbbbbbbb-0000-4000-8000-0000000000e9'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  // 준비: 오늘 근무가 00:00~00:01이라 종료 시각이 이미 지남 · W와 X 둘 다 아직 근무 중
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [wAtt] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  const xu = { ...w1, id: X, name: '안누른엑스', phone: '01077770881', created_at: new Date().toISOString() }
  await rest('users', 'POST', xu)
  await rest('applications', 'POST', { ...wApp, id: undefined, user_id: X, user: xu })
  await rest('attendance', 'POST', { ...wAtt, id: undefined, user_id: X, clock_in: new Date().toISOString(), clock_out: null })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:01:00' })
  await rest(`signed_docs?user_id=eq.${W}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const prompt = (p) => p.locator('[data-clockout-prompt]')

  // ── 1. 다른 화면에서도 안내 ──
  const w = await pg(W)
  await w.goto(`${D}/`)
  await prompt(w).waitFor({ timeout: 10000 }).catch(() => {})
  ok("홈에서도 '⏰ 종료 시각(00:01)이 지났어요'", (await prompt(w).innerText().catch(() => '')).includes('종료 시각(00:01)이 지났어요'))
  ok('제목 한 줄 · 360px 옆으로 안 밀림', (await prompt(w).locator('p').first().evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 26)) && (await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  await w.goto(`${D}/me/chat`)
  await prompt(w).waitFor({ timeout: 10000 }).catch(() => {})
  ok('문의 화면에서도', (await prompt(w).count()) === 1)
  await prompt(w).getByRole('link', { name: '근무 종료하러 가기' }).click()
  await w.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 10000 }).catch(() => {})
  const endBtn = w.getByRole('button', { name: '근무 종료', exact: true })
  await endBtn.waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForTimeout(800)
  ok("'근무 종료하러 가기' → 내 근무의 근무 종료 버튼이 화면 안에", new URL(w.url()).hash === '#clock' && (await endBtn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })))
  ok('내 근무 화면에는 안 뜸 (버튼이 이미 있음)', (await prompt(w).count()) === 0)

  // ── 2. '나중에' ──
  const w2 = await pg(W)
  await w2.goto(`${D}/community`)
  await prompt(w2).waitFor({ timeout: 10000 }).catch(() => {})
  await prompt(w2).getByRole('button', { name: '나중에' }).click()
  await w2.reload()
  await w2.locator('main').waitFor()
  await w2.waitForTimeout(800)
  ok("'나중에'를 누르면 숨김 (다시 열어도)", (await prompt(w2).count()) === 0)

  // ── 3. W가 근무 종료 → 아직 근무 중인 X에게 '근무 종료를 눌러 주세요' (한 번만) ──
  await endBtn.click()
  await w.getByRole('button', { name: '한 번 더 누르면 종료' }).click()
  await w.getByText('근무를 종료했어요').waitFor({ timeout: 10000 }).catch(() => {})
  await sleep(1500)
  const toX = () => rest(`messages?thread_user_id=eq.${X}`).then((m) => m.filter((x) => x.body.startsWith('🏁 근무 종료를 눌러 주세요')))
  const m1 = await toX()
  ok("동료가 근무 종료를 누르면 아직 근무 중인 X에게 '🏁 근무 종료를 눌러 주세요'", m1.length === 1 && /예정 종료 00:01/.test(m1[0].body), m1[0]?.body)
  ok('누른 사람(W)에게는 안 감', (await rest(`messages?thread_user_id=eq.${W}`)).every((x) => !x.body.startsWith('🏁 근무 종료를 눌러 주세요')))
  ok('X가 남아 있으니 행사 종료는 아직', (await rest(`jobs?id=eq.${J}`))[0].status === 'open')
  // W가 다시 근무 중이었다가 또 종료해도 X에게는 한 번만
  await rest(`attendance?id=eq.${wAtt.id}`, 'PATCH', { clock_out: null })
  await w.goto(`${D}/me`)
  await endBtn.click()
  await w.getByRole('button', { name: '한 번 더 누르면 종료' }).click()
  await w.getByText('근무를 종료했어요').waitFor({ timeout: 10000 }).catch(() => {})
  await sleep(1500)
  ok('같은 사람에게는 한 번만', (await toX()).length === 1)

  // ── 4. 종료 시각 전에는 안 뜸 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  const x = await pg(X)
  await x.goto(`${D}/`)
  await x.locator('main').waitFor()
  await x.waitForTimeout(800)
  ok('종료 시각 전에는 안내가 안 뜸', (await prompt(x).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
