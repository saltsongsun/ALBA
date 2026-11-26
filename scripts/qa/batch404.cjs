// 묶음 404 (정기 개선 2026-11-26 21:35 KST)
// 기능(버그 고침) · 근무자 '내 근무' 오늘 카드: 오늘 근무를 마쳤는데 서명 안 한 서류가 남았을 때
//   예전: '서류 n건에 서명하면 근무를 시작할 수 있어요'가 먼저 걸려 '오늘 근무 완료'(인정 시간·오늘 번 돈)와
//         기록 정정·시간 인정 요청이 안 보였음
//   지금: '오늘 근무 완료 👏' 그대로 + 바로 아래 '근무 끝 · 서명할 서류 n건 · 서명 ›' (누르면 그 서류)
//   · 근무 전에는 예전처럼 '서명하면 근무를 시작할 수 있어요' · 문의 대화 근무 버튼 칸도 같은 줄
// 디자인 · 서명 줄은 톡 나타남 (0.25초 · 움직임 줄이기면 끔) · 360px 한 줄
// node scripts/qa/batch404.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const DOC = 'dddddddd-0000-4000-8000-000000000004' // 가짜 DB 기본: W의 서명 대기 서류
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)

;(async () => {
  const today = kday(0)
  // 하루 종일 근무 (끝나기 전) · 서명 대기 서류 1건은 가짜 DB 기본
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  const [doc] = await rest(`signed_docs?id=eq.${DOC}`)
  ok('준비: W 서명 대기 서류 1건', doc?.status === 'pending' && doc?.user_id === W, JSON.stringify(doc?.status))
  const [att] = (await rest(`attendance?user_id=eq.${W}`)).filter((x) => x.work_date === today)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const me = async () => {
    await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
    return w.locator('[data-today-card]').first()
  }

  // ── 1. 근무 전 (출퇴근 기록 없음): 예전처럼 '서명하면 근무를 시작할 수 있어요'
  if (att) await rest(`attendance?id=eq.${att.id}`, 'DELETE')
  let card = await me()
  ok("근무 전: '서류 1건에 서명하면 근무를 시작할 수 있어요'", one(await card.locator('[data-sign-before-start]').innerText().catch(() => '')).includes('서류 1건에 서명하면 근무를 시작할 수 있어요'))
  ok('근무 전: 완료 서명 줄 없음', (await card.locator('[data-sign-left="done"]').count()) === 0)

  // ── 2. 오늘 근무를 마침 (서명은 안 함): 완료 요약 + 아래 서명 줄
  const inAt = new Date(Date.now() - 3 * 3600e3).toISOString()
  const outAt = new Date(Date.now() - 600e3).toISOString()
  await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: W, company_id: C1, work_date: today, clock_in: inAt, clock_out: outAt, paid: false })
  card = await me()
  const cardText = one(await card.innerText().catch(() => ''))
  ok("마친 뒤: '오늘 근무 완료 👏' 보임", cardText.includes('오늘 근무 완료'), cardText.slice(0, 160))
  ok("마친 뒤: '서명하면 근무를 시작할 수 있어요'는 안 보임", (await card.locator('[data-sign-before-start]').count()) === 0 && !cardText.includes('근무를 시작할 수 있어요'))
  const line = card.locator('[data-sign-left="done"]')
  ok("마친 뒤: '근무 끝 · 서명할 서류 1건 · 서명 ›'", one(await line.innerText().catch(() => '')) === '근무 끝 · 서명할 서류 1건 서명 ›', one(await line.innerText().catch(() => '')))
  ok('서명 줄을 누르면 그 서류', (await line.getAttribute('href').catch(() => null)) === `/docs/${DOC}`)
  ok('서명 줄은 톡 나타남 (pop · 0.25초)', await line.evaluate((el) => getComputedStyle(el).animationName === 'pop' && getComputedStyle(el).animationDuration === '0.25s').catch(() => false))
  ok('서명 줄 한 줄 · 360px 옆으로 안 밀림', (await line.evaluate((el) => el.getBoundingClientRect().height < 50).catch(() => false)) && (await noSide(w)))
  ok('기록 정정 요청도 그대로 보임 (가려지지 않음)', (await card.locator('[data-fix-open], [data-fix-request], details').count()) > 0 || /기록|시각이 달라요|정정/.test(cardText), cardText.slice(-120))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/done-sign-left.png` }).catch(() => {})

  // ── 3. 서명을 마치면 서명 줄이 사라지고 완료 요약만
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  card = await me()
  ok('서명 다 하면: 완료 요약만 (서명 줄 없음)', (await card.locator('[data-sign-left]').count()) === 0 && one(await card.innerText().catch(() => '')).includes('오늘 근무 완료'))
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'pending', signed_at: null })

  // ── 4. 문의 대화 근무 버튼 칸: '오늘 근무를 마쳤어요' + 같은 서명 줄
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: null, body: '아래 버튼을 누르면 근무 시작 버튼이 있는 곳으로 바로 가요.\n::b:clock-in::', created_at: new Date(Date.now() - 60e3).toISOString(), read_at: null })
  await w.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  const done = w.locator('[data-chat-clock-done]')
  await done.waitFor({ timeout: 15000 }).catch(() => {})
  ok("대화: '오늘 근무를 마쳤어요 · 수고했어요' 그대로", one(await done.innerText().catch(() => '')).includes('오늘 근무를 마쳤어요'))
  const chatLine = w.locator('[data-chat-sign-left]')
  ok("대화: '근무 끝 · 서명할 서류 1건 · 서명 ›' → 그 서류", one(await chatLine.innerText().catch(() => '')) === '근무 끝 · 서명할 서류 1건 서명 ›' && (await chatLine.getAttribute('href').catch(() => null)) === `/docs/${DOC}`, one(await chatLine.innerText().catch(() => '')))
  ok('대화 화면 360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) await done.locator('xpath=..').screenshot({ path: `${SHOTS}/chat-done-sign.png` }).catch(() => {})

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
