// 묶음 253 (정기 개선 2026-11-14 23:35 KST)
// · 근무자 홈 '다음 근무' 카드 · '예정된 근무' 카드에 담당자 '📢 공지'를 바로 (전날 보낸 '내일 집결은…'을 문의함까지 안 가도 보게)
//   - 안 읽은 공지엔 '새' (톡 나타남) · 읽으면 사라짐 · 일정 변경(🔔)은 원래 줄이 따로 알림 · 공지 없는 공고엔 칸 없음
// · 다음 근무 카드 안내를 한 줄로 ('오늘은 쉬는 날 · 근무 날 여기서 출퇴근해요' — 360px에서 '출퇴근을 눌러요.'만 다음 줄로 떨어지던 것)
// · 공지 칸을 누르면 그 회사 문의함으로 바로 (?co=) — 여러 회사에서 일하면 대화 목록부터 나와 한 번 더 골라야 하던 것 (오늘 근무 카드도)
// node scripts/qa/batch253.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000253d2', J3 = 'cccccccc-0000-4000-8000-0000000253d3'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000253c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const msg = (id, job, co, ago, body) => ({ id, thread_user_id: W, sender_id: A, from_admin: true, company_id: co, job_id: job, body, read_at: null, created_at: new Date(Date.now() - ago).toISOString() })

;(async () => {
  // 준비: 우리 회사(C1) 내일 공고 J2 · 다른 회사(C2) 사흘 뒤 공고 J3 — 둘 다 확정
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [c1row] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1row, id: C2, company_name: '다른기획', created_at: new Date().toISOString() })
  const addJob = async (id, co, day, title, appId) => {
    const jb = { ...base, id, company_id: co, title, start_date: day, end_date: day, created_at: new Date().toISOString() }
    await rest('jobs', 'POST', jb)
    await rest('applications', 'POST', { ...wApp, id: appId, job_id: id, company_id: co, position: null, available_dates: null, job: jb })
  }
  await addJob(J2, C1, kst(1), '내일 박람회 안내', '11111111-0000-4000-8000-0000002530a2')
  await addJob(J3, C2, kst(3), '다른 회사 축제 스태프', '11111111-0000-4000-8000-0000002530a3')
  // 우리 회사 공지 (2시간 전, 안 읽음) · 다른 회사 담당자 말이 더 최근 (기본 문의함이 다른 회사로 열리는 상황)
  await rest('messages', 'POST', msg(925301, J2, C1, 2 * 3600e3, '📢 공지\n내일 집결은 08:30 정문이에요.\n늦지 않게 와 주세요. 주차는 안 돼요.'))
  await rest('messages', 'POST', msg(925302, J3, C2, 60e3, '다른 회사에서 보낸 말이에요.'))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async (path = '/me') => { await p.goto(D + path, { waitUntil: 'networkidle' }) }
  const card = (job) => p.locator(`[id^="work-"]`, { has: p.locator(`a[href="/jobs/${job}"]`) })

  // ── 1. 예정된 근무 카드 (오늘 근무가 있는 날): 내일 공고에 공지 · 다른 회사 공고엔 칸 없음
  await open()
  const box = card(J2).locator('[data-job-notice]')
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  const head = one(await box.locator('span').first().innerText().catch(() => ''))
  ok("내일 공고 카드: '📢 담당자 공지 새 HH:MM' (어제 보낸 것이면 '11/14(토) 22:21') + 공지 내용", /^📢 담당자 공지 새 (\d{1,2}:\d\d|\d{1,2}\/\d{1,2}\([일월화수목금토]\) \d{1,2}:\d\d)$/.test(head) && one(await box.innerText()).endsWith('내일 집결은 08:30 정문이에요. 늦지 않게 와 주세요. 주차는 안 돼요.'), head)
  ok("안 읽음 표시 (data-job-notice='new' · '새' 톡)", (await box.getAttribute('data-job-notice')) === 'new' && ((await box.locator('[data-notice-new]').getAttribute('class')) ?? '').includes('animate-pop'))
  ok('공지 칸은 그 회사 문의함으로 (?co=우리 회사)', (await box.getAttribute('href')) === `/me/chat?co=${C1}`, await box.getAttribute('href'))
  ok('다른 회사 공고 카드엔 공지 칸 없음', (await card(J3).count()) === 1 && (await card(J3).locator('[data-job-notice]').count()) === 0)
  const lines = await box.evaluate((el) => { const t = el.lastElementChild; return Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) })
  ok('목록 카드에선 공지 두 줄까지 (넘치면 …)', lines <= 2, String(lines))
  ok('360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) {
    await card(J2).evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    await card(J2).screenshot({ path: `${SHOTS}/upcoming-notice.png` }).catch(() => {})
  }

  // ── 2. 누르면 우리 회사 문의함 (다른 회사 말이 더 최근이어도) → 돌아오면 '새' 없어짐
  await box.click()
  await p.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {})
  await p.locator('[data-chat-intro]').waitFor({ timeout: 15000 }).catch(() => {})
  await p.waitForLoadState('networkidle')
  const main = one(await p.locator('main').innerText())
  ok("대화 목록을 거치지 않고 우리 회사 문의함이 바로 열림 ('주식회사 테스트와의 대화' · 공지 보임 · 다른 회사 말 없음)", new URL(p.url()).searchParams.get('co') === C1 && main.includes('주식회사 테스트와의 대화') && main.includes('내일 집결은 08:30 정문이에요.') && !main.includes('다른 회사에서 보낸 말이에요.'), main.slice(0, 300))
  await open()
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  ok("읽고 나면 '새' 없음 (data-job-notice='read')", (await box.getAttribute('data-job-notice')) === 'read' && (await box.locator('[data-notice-new]').count()) === 0)

  // ── 3. 일정 변경(🔔)만 있으면 공지 칸 대신 원래 줄
  await rest('messages', 'POST', msg(925303, J3, C2, 30e3, '🔔 일정 변경\n시작 시간이 10:00으로 바뀌었어요.'))
  await open()
  ok("일정 변경만 있으면 '🔔 …일정이 바뀌었어요' 줄 · 공지 칸 없음", one(await card(J3).innerText()).includes('일정이 바뀌었어요') && (await card(J3).locator('[data-job-notice]').count()) === 0, one(await card(J3).innerText()).slice(0, 120))

  // ── 4. 오늘 근무 카드 공지도 그 회사 문의함으로
  await rest('messages', 'POST', msg(925304, J, C1, 10 * 60e3, '📢 공지\n점심은 12시 운영본부 천막에서 받아요.'))
  await open()
  const today = p.locator('#today-work [data-job-notice]').first()
  await today.waitFor({ timeout: 15000 }).catch(() => {})
  ok("오늘 근무 카드: '📢 담당자 공지 새' · ?co=우리 회사", (await today.getAttribute('href')) === `/me/chat?co=${C1}` && one(await today.innerText()).includes('점심은 12시 운영본부 천막에서 받아요.') && (await today.getAttribute('data-job-notice')) === 'new', await today.getAttribute('href'))

  // ── 5. 오늘 근무가 없는 날: 큰 '다음 근무' 카드에 공지
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await rest(`applications?id=eq.${wApp.id}`, 'PATCH', { status: 'cancelled' })
  await open()
  const hero = p.locator('[data-next-work]')
  await hero.waitFor({ timeout: 15000 }).catch(() => {})
  const hb = hero.locator('[data-job-notice]')
  ok("다음 근무(내일) 큰 카드에 공지 · 그 회사 문의함으로", (await hero.innerText().catch(() => '')).includes('내일 박람회 안내') && (await hb.count()) === 1 && (await hb.getAttribute('href')) === `/me/chat?co=${C1}` && one(await hb.innerText()).includes('내일 집결은 08:30 정문이에요.'), one(await hb.innerText().catch(() => '')))
  const hint = hero.locator('[data-next-hint]')
  ok("다음 근무 카드 안내 한 줄 '오늘은 쉬는 날 · 근무 날 여기서 출퇴근해요'", one(await hint.innerText().catch(() => '')) === '오늘은 쉬는 날 · 근무 날 여기서 출퇴근해요' && (await hint.evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)))
  ok('360px 옆으로 안 밀림 (다음 근무 카드)', await noSide(p))
  if (SHOTS) {
    await hb.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    await hero.screenshot({ path: `${SHOTS}/next-work-notice.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
