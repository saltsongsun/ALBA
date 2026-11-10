// 묶음 184 (정기 개선 2026-11-10 23:35 KST)
// · 근무자 공고 화면(확정된 근무): 이미 출근했으면 '지금 근무 중 · HH:MM 시작' / '✓ M/D(요일) 근무 HH:MM~HH:MM' 한 줄
//   (진행 단계는 출근까지 모두 ✓ · 버튼은 '근무 종료하러 가기' · 근무 기록이 있으면 눌러도 거절되던 '확정 근무 취소하기' 대신 '담당자에게 알리기')
// · 단체방: 아직 대화가 없으면 첫 인사·첫 안내를 눌러서 채움 (관리자는 담당자 이름·집합 시각이 들어간 문장 · 이어 누르면 한 메시지로)
// node scripts/qa/batch184.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const kstHm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const DAY = '[일월화수목금토]'

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const mk = async (u, admin) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }, ...(admin ? [{ name: 'alba_roster', value: roster(u), url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)
  const now = Date.now()
  // 준비: 어제~내일 3일 근무 (자정을 넘겨도 '끝난 근무'가 되지 않게) · 근무자는 확정 · 오늘 출근해 근무 중 (서명 안 한 서류 1건)
  const span = { start_date: kstDay(now - 864e5), end_date: kstDay(now + 864e5), start_time: '00:00:00', end_time: '23:59:00' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', span)
  const inAt = now - 40 * 60e3
  await rest(`attendance?user_id=eq.${W}`, 'PATCH', { work_date: kstDay(inAt), clock_in: new Date(inAt).toISOString(), clock_out: null })
  const open = async () => { await w.goto(`${D}/jobs/${J}`); await w.locator('[data-apply-steps]').waitFor({ timeout: 15000 }).catch(() => {}) }
  const line = w.locator('[data-my-work]')
  const steps = w.locator('[data-apply-steps]')
  const cancelBtn = w.getByRole('button', { name: '확정 근무 취소하기' })

  // ── 1. 근무 중
  await open()
  ok("근무 중: '지금 근무 중 · HH:MM 시작'", (await line.getAttribute('data-my-work')) === 'working' && one(await line.innerText()) === `지금 근무 중 · ${kstHm(inAt)} 시작`, one(await line.innerText().catch(() => '')))
  ok("'근무가 확정됐어요.'는 그대로 · 한 줄 · 초록 점이 깜빡임", (await w.getByText('근무가 확정됐어요.').count()) === 1 && (await line.evaluate((el) => el.getBoundingClientRect().height < 26)) && (await line.locator('.animate-ping').count()) === 1)
  ok('서명이 남았으면 단계는 서명(3)', (await steps.getAttribute('data-apply-steps')) === '3')
  ok("버튼: '근무 종료하러 가기' → 내 근무", (await w.getByRole('link', { name: '근무 종료하러 가기' }).getAttribute('href')) === '/me')
  // 근무 기록이 있으면 취소 칸 대신 '담당자에게 알리기'
  const worked = w.locator('[data-cancel-worked]')
  await worked.locator('summary').click()
  await w.waitForTimeout(250)
  ok("취소 칸: '근무한 기록이 있어 여기서는 취소할 수 없어요' + 담당자에게 알리기", one(await worked.innerText()).includes('근무한 기록이 있어 여기서는 취소할 수 없어요.') && (await worked.getByRole('link', { name: '담당자에게 알리기' }).getAttribute('href')) === `/me/chat?job=${J}` && (await cancelBtn.count()) === 0, one(await worked.innerText()))
  if (SHOTS) { await w.locator('#apply').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await w.waitForTimeout(600); await w.screenshot({ path: `${SHOTS}/job-working.png` }).catch(() => {}) }

  // ── 2. 서명까지 마치면 단계가 모두 ✓
  await rest(`signed_docs?user_id=eq.${W}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await open()
  const dots = await steps.locator('[data-step-dot]').evaluateAll((els) => els.map((e) => `${e.dataset.stepDot}:${e.textContent.trim()}`))
  ok('서명 + 출근: 네 단계 모두 ✓ (5)', (await steps.getAttribute('data-apply-steps')) === '5' && dots.join(',') === 'done:✓,done:✓,done:✓,done:✓' && (await steps.getAttribute('aria-label')) === '진행 단계 4/4 · 모두 마침', `${dots.join(',')} · ${await steps.getAttribute('aria-label')}`)
  ok('서명 바(아래)는 없음', (await w.getByText('근무 전에 서명해 주세요').count()) === 0)

  // ── 3. 근무를 마친 뒤
  const outAt = now - 5 * 60e3
  await rest(`attendance?user_id=eq.${W}`, 'PATCH', { clock_out: new Date(outAt).toISOString() })
  await open()
  const doneText = one(await line.innerText().catch(() => ''))
  ok("마친 뒤: '✓ M/D(요일) 근무 HH:MM~HH:MM'", (await line.getAttribute('data-my-work')) === 'done' && new RegExp(`^✓ \\d{1,2}/\\d{1,2}\\(${DAY}\\) 근무 ${kstHm(inAt)}~${kstHm(outAt)}$`).test(doneText), doneText)
  ok("버튼은 '오늘 출퇴근하러 가기'로 · 취소 칸은 여전히 알리기만", (await w.getByRole('link', { name: '오늘 출퇴근하러 가기' }).count()) === 1 && (await worked.count()) === 1 && (await cancelBtn.count()) === 0)
  ok('360px 옆으로 안 밀림 (공고 화면)', await noSide(w))
  if (SHOTS) { await w.locator('#apply').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' })); await w.waitForTimeout(600); await w.screenshot({ path: `${SHOTS}/job-done.png` }).catch(() => {}) }

  // ── 4. 종료를 안 누른 지난 근무
  const oldIn = now - 20 * 3600e3
  await rest(`attendance?user_id=eq.${W}`, 'PATCH', { work_date: kstDay(oldIn), clock_in: new Date(oldIn).toISOString(), clock_out: null })
  await open()
  const openText = one(await line.innerText().catch(() => ''))
  ok("종료를 안 누른 지난 근무: 'M/D(요일) HH:MM 시작 · 종료 기록 없음'", (await line.getAttribute('data-my-work')) === 'open' && new RegExp(`^\\d{1,2}/\\d{1,2}\\(${DAY}\\) ${kstHm(oldIn)} 시작 · 종료 기록 없음$`).test(openText), openText)

  // ── 5. 근무 기록이 없으면 예전 그대로
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await open()
  ok('기록이 없으면 줄 없음 · 단계는 출근(4)', (await line.count()) === 0 && (await steps.getAttribute('data-apply-steps')) === '4')
  await w.locator('summary', { hasText: '근무를 못 하게 됐어요' }).click()
  await w.waitForTimeout(250)
  ok("기록이 없으면 '확정 근무 취소하기' 그대로", (await cancelBtn.count()) === 1 && (await worked.count()) === 0)

  // ── 6. 단체방 (근무자): 대화가 없으면 첫 인사
  await rest(`job_chat?job_id=eq.${J}`, 'DELETE')
  await w.goto(`${D}/me/chat/room/${J}`)
  const wq = w.locator('[data-quick-replies] button')
  await wq.first().waitFor({ timeout: 15000 }).catch(() => {})
  const wChips = (await wq.allInnerTexts()).map(one)
  ok('근무자 방: 첫 인사 3개', JSON.stringify(wChips) === JSON.stringify(['안녕하세요, 잘 부탁드려요!', '처음이라 잘 부탁드립니다.', '같이 가실 분 계신가요?']), JSON.stringify(wChips))
  const wBox = w.locator('textarea[name=body]')
  await wq.nth(0).click()
  ok('누르면 입력 칸에 들어감 (바로 보내지 않음)', (await wBox.inputValue()) === '안녕하세요, 잘 부탁드려요!' && (await rest(`job_chat?job_id=eq.${J}`)).length === 0, await wBox.inputValue())
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/room-worker.png` }).catch(() => {})
  await w.locator('button[type=submit][aria-label="보내기"]').click()
  await w.getByText('안녕하세요, 잘 부탁드려요!').first().waitFor({ timeout: 15000 }).catch(() => {})
  await w.locator('[data-quick-replies]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  const sent = await rest(`job_chat?job_id=eq.${J}`)
  ok('보내면 방에 올라가고 인사말 줄은 사라짐', sent.length === 1 && sent[0].body === '안녕하세요, 잘 부탁드려요!' && (await w.locator('[data-quick-replies]').count()) === 0, JSON.stringify(sent.map((m) => m.body)))
  ok('360px 옆으로 안 밀림 (근무자 방)', await noSide(w))

  // ── 7. 단체방 (관리자): 첫 안내 — 시작 전이면 집합 시각도
  const a = await mk(A, true)
  const adminName = (await rest(`users?id=eq.${A}`))[0].name
  await rest(`job_chat?job_id=eq.${J}`, 'DELETE')
  const d1 = kstDay(now + 864e5)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d1, end_date: d1, start_time: '09:00:00', end_time: '18:00:00' })
  await a.goto(`${D}/admin/chat/room/${J}`)
  const aq = a.locator('[data-quick-replies] button')
  await aq.first().waitFor({ timeout: 15000 }).catch(() => {})
  const aChips = (await aq.allInnerTexts()).map(one)
  ok('관리자 방: 담당자 이름 · 집합 시각 · 문의 안내', aChips.length === 3 && aChips[0] === `안녕하세요, 담당자 ${adminName}입니다.` && new RegExp(`^\\d{1,2}/\\d{1,2}\\(${DAY}\\) 09:00까지 와 주세요\\.$`).test(aChips[1]) && aChips[2] === '궁금한 점은 여기에 남겨 주세요.', JSON.stringify(aChips))
  const aBox = a.locator('textarea[name=body]')
  await aq.nth(0).click(); await aq.nth(1).click(); await aq.nth(2).click()
  ok('이어 누르면 한 메시지로 이어짐', (await aBox.inputValue()) === aChips.join(' '), await aBox.inputValue())
  ok('360px 옆으로 안 밀림 (관리자 방)', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/room-admin.png` }).catch(() => {})
  // 이미 시작한 근무면 집합 시각은 빼고
  await rest(`jobs?id=eq.${J}`, 'PATCH', span)
  await a.goto(`${D}/admin/chat/room/${J}`)
  await aq.first().waitFor({ timeout: 15000 }).catch(() => {})
  const started = (await aq.allInnerTexts()).map(one)
  ok('이미 시작한 근무: 집합 시각 없이 2개', started.length === 2 && !started.some((t) => t.includes('까지 와 주세요')), JSON.stringify(started))
  // 대화가 있으면 안 보임
  await rest('job_chat', 'POST', { job_id: J, company_id: '99999999-0000-4000-8000-000000000099', sender_id: A, from_admin: true, body: '안내드려요', pinned_at: null, created_at: new Date().toISOString(), sender: { name: adminName } })
  await a.goto(`${D}/admin/chat/room/${J}`)
  await a.getByText('안내드려요').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('대화가 있는 방에는 안 보임', (await a.locator('[data-quick-replies]').count()) === 0 && (await a.getByText('안내드려요').count()) >= 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
