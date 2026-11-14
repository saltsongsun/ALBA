// 묶음 250 (정기 개선 2026-11-14 17:35 KST)
// · 근무자 문의 화면 빠른 답장: 오늘 이 회사에서의 상황에 맞게
//   근무 중이면 '근무 종료 버튼이 안 눌려요 · 쉬는 시간이 언제인가요 · 현장 담당자를 못 찾겠어요' (이미 출근했는데 '조금 늦을 것 같아요'·'근무 시작 버튼이 안 눌려요'가 뜨던 것)
//   마쳤으면 '급여 지급일 · 두고 온 물건 · 다음 근무' · 다른 회사 근무는 섞지 않음
// · 빠른 답장 칩: 입력칸에 들어간 말은 '✓' · 한 번 더 누르면 뺌 (같은 말이 두 번 들어가던 것)
// node scripts/qa/batch250.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000250c2', J2 = 'cccccccc-0000-4000-8000-0000000250d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const today = kst(0)
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { work_date: today, clock_in: new Date(Date.now() - 60 * 60e3).toISOString(), clock_out: null })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const url = `${D}/me/chat?co=${C1}`
  const chips = async () => (await p.locator('[data-quick-replies] button:not([data-button-toggle])').allInnerTexts()).map(one)
  const open = async () => { await p.goto(url, { waitUntil: 'networkidle' }); await p.locator('[data-quick-replies]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 근무 중
  await open()
  const c1 = await chips()
  ok("근무 중: '근무 종료 버튼이 안 눌려요' · '쉬는 시간이 언제인가요' · '현장 담당자를 못 찾겠어요' · '급여 지급일'", JSON.stringify(c1) === JSON.stringify(['근무 종료 버튼이 안 눌려요.', '쉬는 시간이 언제인가요?', '현장 담당자를 못 찾겠어요.', '급여 지급일이 언제인가요?']), JSON.stringify(c1))
  ok("근무 중엔 '조금 늦을 것 같아요' · '근무 시작 버튼이 안 눌려요' 없음", !c1.some((c) => c.includes('늦을 것 같아요') || c.includes('근무 시작 버튼')))

  // ── 2. 빠른 답장 칩: ✓ · 한 번 더 누르면 뺌
  const box = p.locator('textarea[name=body]')
  const chip = p.locator('[data-quick-replies] button', { hasText: '쉬는 시간이 언제인가요?' })
  await chip.click()
  ok("누르면 입력칸에 들어가고 칩에 ✓ (aria-pressed)", (await box.inputValue()) === '쉬는 시간이 언제인가요?' && (await chip.getAttribute('aria-pressed')) === 'true' && one(await chip.innerText()).startsWith('✓'), JSON.stringify([await box.inputValue(), await chip.innerText()]))
  if (SHOTS) {
    await p.waitForTimeout(300)
    const bx = await p.locator('[data-quick-replies]').boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/chat-quick-working.png`, clip: { x: 0, y: Math.max(0, bx.y - 70), width: 360, height: 190 } }).catch(() => {})
  }
  await chip.click()
  ok('한 번 더 누르면 빠짐 (같은 말 두 번 안 들어감) · ✓ 없어짐', (await box.inputValue()) === '' && (await chip.getAttribute('aria-pressed')) === 'false')
  await box.fill('안녕하세요')
  await chip.click()
  ok("쓰던 글 뒤에 붙음 '안녕하세요 쉬는 시간이 언제인가요?'", (await box.inputValue()) === '안녕하세요 쉬는 시간이 언제인가요?')
  await chip.click()
  ok("다시 누르면 그 말만 빠지고 쓰던 글은 남음 '안녕하세요'", (await box.inputValue()) === '안녕하세요', await box.inputValue())
  await box.fill('')
  await box.pressSequentially('쉬는 시간이 언제인가요?', { delay: 5 })
  ok('직접 같은 말을 써도 칩에 ✓', (await chip.getAttribute('aria-pressed')) === 'true')
  await box.fill('')
  ok('360px 옆으로 안 밀림', await noSide(p))

  // ── 3. 근무를 마쳤으면
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { clock_out: new Date().toISOString() })
  await open()
  const c2 = await chips()
  ok("마침: '급여 지급일' · '두고 온 물건' · '다음 근무'", JSON.stringify(c2) === JSON.stringify(['급여 지급일이 언제인가요?', '두고 온 물건이 있어요.', '다음 근무도 할 수 있나요?']), JSON.stringify(c2))

  // ── 4. 오늘 이 회사 근무가 없으면 원래대로 · 다른 회사에서 근무 중인 건 섞지 않음
  await fetch(`${MD}/rest/v1/attendance?job_id=eq.${J}&user_id=eq.${W}`, { method: 'DELETE' })
  const [c1row] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1row, id: C2, company_name: '다른기획', created_at: new Date().toISOString() })
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  await rest('jobs', 'POST', { ...base, id: J2, company_id: C2, title: '다른 회사 행사', created_at: new Date().toISOString() })
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000002500a1', job_id: J2, company_id: C2, user_id: W, work_date: today, clock_in: new Date(Date.now() - 30 * 60e3).toISOString(), clock_out: null, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, note: null, source: 'app', confirmed: false, paid: false, ot_minutes: 0, ot_status: null, ot_by: null, sched_start: null, sched_end: null })
  await open()
  const c3 = await chips()
  ok("이 회사 근무가 없으면 원래대로 ('조금 늦을 것 같아요'…) · 다른 회사 근무는 안 섞임", c3[0] === '조금 늦을 것 같아요. 죄송합니다.' && c3.includes('근무 시작 버튼이 안 눌려요.'), JSON.stringify(c3))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
