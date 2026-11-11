// 묶음 198 (정기 개선 2026-11-11 14:36 KST)
// · 관리자 공고 화면(근무 전날): '답 없는 n명에게 다시 알리기' — '내일 갈게요'를 안 누른 확정자에게만 알림(버튼 포함)
//   - 두 번 눌러야 보냄 · 보낸 뒤 'HH:MM에 다시 알림' · 30분 안에는 또 보내지 않음 · 모두 누르면 버튼 없음 · 전날이 아니면 없음
// · 근무자 문의 화면: 확정을 기다리는 지원만 있으면 빠른 답이 '지원했는데 확정 여부가 궁금해요.'부터 (확정된 사람은 예전 그대로)
// · 근무자 지난 근무 빈 화면: 다음 근무 날짜 / 확정 대기 건수를 알려 줌 (둘 다 없을 때만 '모집 중인 알바 보기')
// node scripts/qa/batch198.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const C = '99999999-0000-4000-8000-000000000099'
const X = 'bbbbbbbb-0000-4000-8000-000000019801', Y = 'bbbbbbbb-0000-4000-8000-000000019802', Z = 'bbbbbbbb-0000-4000-8000-000000019803'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), nowIso = new Date().toISOString(), today = kstDay(now), tomorrow = kstDay(now + 864e5)
  // 준비: 공고는 내일 하루 · 확정자 셋 (근무자 · 김지원 · 엑스) · 지원만 한 사람(와이) · 아무것도 없는 새 회원(제트)
  const setJob = async (patch) => {
    await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
    for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  }
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', available_dates: null })
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const person = async (id, name, phone, status) => {
    const u = { ...w1, id, name, phone, created_at: nowIso }
    await rest('users', 'POST', u)
    if (status) await rest('applications', 'POST', { ...wApp, id: undefined, user_id: id, user: u, position: null, status })
  }
  await person(X, '안온엑스', '01077771981', 'approved')
  await person(Y, '기다리는와이', '01077771982', 'applied')
  await person(Z, '새회원제트', '01077771983', null)
  await setJob({ start_date: tomorrow, end_date: tomorrow, start_time: '09:00:00', end_time: '18:00:00', status: 'open' })

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
  const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/${name}.png` }) } }
  const open = async (p, path) => { await p.goto(D + path); await p.waitForLoadState('networkidle').catch(() => {}) }
  const flash = (p) => p.locator('[role=status]').first().innerText().then(one, () => '')
  const nudges = async () => (await rest(`messages?job_id=eq.${J}`)).filter((m) => m.from_admin && m.sender_id === A && m.body.startsWith('⏰ 내일 근무 안내'))

  // 전날 안내(자동) → 근무자 한 명이 '내일 갈게요'
  await fetch(`${D}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } })
  const w = await pg(W)
  await open(w, '/me')
  await w.locator('[data-coming="ask"] button').click()
  await w.locator('[data-coming="done"]').waitFor({ timeout: 10000 }).catch(() => {})

  // ── 1. 관리자: 답 없는 사람에게 다시 알리기
  const a = await pg(A)
  const card = a.locator('[data-remind-read]')
  const nudge = a.locator('[data-nudge]')
  const btn = nudge.locator('button')
  await open(a, `/admin/jobs/${J}`)
  ok("'답 없는 2명에게 다시 알리기' (아직 보낸 적 없음)", one(await btn.innerText().catch(() => '')) === '답 없는 2명에게 다시 알리기' && (await a.locator('[data-nudged-at]').count()) === 0, one(await btn.innerText().catch(() => '')))
  await a.waitForTimeout(500)
  ok('버튼 한 줄 · 높이 36px 이상 · 360px 옆으로 안 밀림', (await btn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.height >= 36 && r.height < 44 }).catch(() => false)) && (await noSide(a)))
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await shot(a, '1-admin-nudge')
  await btn.click()
  ok("한 번 누르면 묻기만 함 ('2명에게 보낼까요?') — 아직 안 보냄", one(await btn.innerText().catch(() => '')).includes('2명에게 보낼까요?') && (await nudges()).length === 0, one(await btn.innerText().catch(() => '')))
  await btn.click()
  await a.waitForURL(/m=/, { timeout: 10000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  let sent = await nudges()
  ok("두 번째에 보냄: '2명에게 다시 알렸어요.'", (await flash(a)).includes('2명에게 다시 알렸어요') && sent.length === 2, `${await flash(a)} · ${sent.length}건`)
  ok("안 누른 두 사람에게만 (이미 누른 근무자는 빼고) · 글에 '내일 갈게요'·'못 가요' + 버튼", sent.every((m) => [AP, X].includes(m.thread_user_id) && m.company_id === C && m.body.includes('‘내일 갈게요’') && m.body.includes('‘못 가요’') && m.body.trim().endsWith('::b:coming::')) && new Set(sent.map((m) => m.thread_user_id)).size === 2, JSON.stringify(sent.map((m) => m.body.split('\n').slice(1).join(' / '))))
  ok("보낸 뒤 'HH:MM에 다시 알림'이 버튼 옆에", /^\d{2}:\d{2}에 다시 알림$/.test(one(await a.locator('[data-nudged-at]').innerText().catch(() => ''))), one(await a.locator('[data-nudged-at]').innerText().catch(() => '')))
  ok("'전날 안내 확인'은 사람 수 그대로 (3명 중)", /전날 안내 확인 \d\/3명/.test(one(await card.innerText().catch(() => ''))), one(await card.innerText().catch(() => '')).slice(0, 40))
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await shot(a, '2-admin-nudged')
  // 바로 또 누르면 보내지 않음
  await btn.click(); await btn.click()
  await a.waitForFunction(() => /조금 뒤에/.test(document.querySelector('[role=status]')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {})
  ok("30분 안에 또 누르면 안 보냄 ('…에 다시 알렸어요. 조금 뒤에 눌러 주세요.')", (await flash(a)).includes('조금 뒤에 눌러 주세요') && (await nudges()).length === 2, `${await flash(a)} · ${(await nudges()).length}건`)

  // 받은 사람: 문의함 안내 아래 버튼 → 내 근무의 확인 줄
  const ap = await pg(AP)
  await open(ap, `/me/chat?co=${C}`)
  ok("받은 사람 문의함: 다시 온 안내와 '내일 갈게요 · 출근 확인하기' 버튼", (await ap.locator('a[href="/me#coming"]').count()) >= 1 && (await ap.locator('main').innerText()).includes('못 오게 되면 ‘못 가요’를 눌러 주세요'))
  // 나머지도 누르면 버튼이 사라짐
  for (const [p, uid] of [[ap, AP], [await pg(X), X]]) {
    await open(p, '/me')
    await p.locator('[data-coming="ask"] button').click()
    await p.locator('[data-coming="done"]').waitFor({ timeout: 10000 }).catch(() => {})
    void uid
  }
  await open(a, `/admin/jobs/${J}`)
  ok("모두 누르면 '다시 알리기' 없음 ('모두 온대요')", (await nudge.count()) === 0 && one(await card.innerText().catch(() => '')).includes('모두 온대요'))

  // ── 2. 근무자 문의 화면: 상황에 맞는 빠른 답
  const chips = (p) => p.locator('[data-quick-replies] button:not([data-button-toggle])').allInnerTexts().then((l) => l.map(one))
  const y = await pg(Y)
  await open(y, `/me/chat?co=${C}`)
  const yc = await chips(y)
  ok("지원만 해 둔 사람: 첫 빠른 답이 '지원했는데 확정 여부가 궁금해요.' (늦어요·출근 버튼 문구는 없음)", yc[0] === '지원했는데 확정 여부가 궁금해요.' && !yc.some((t) => t.includes('늦을 것 같아요') || t.includes('근무 시작 버튼')), JSON.stringify(yc))
  ok('360px: 옆으로 안 밀림 (문의)', await noSide(y))
  await shot(y, '3-chat-waiting')
  await open(w, `/me/chat?co=${C}`)
  const wc = await chips(w)
  ok("확정된 사람: 예전 그대로 ('조금 늦을 것 같아요. 죄송합니다.'부터)", wc[0] === '조금 늦을 것 같아요. 죄송합니다.' && !wc.includes('지원했는데 확정 여부가 궁금해요.'), JSON.stringify(wc))

  // ── 3. 지난 근무 빈 화면: 다음에 볼 것을 알려 줌
  const empty = (p, kind) => p.locator(`[data-history-empty="${kind}"]`)
  await open(y, '/me/history')
  ok("지원만 해 둔 사람: '지원한 공고 1건이 확정을 기다리고 있어요' → 내 근무에서 보기", one(await empty(y, 'waiting').innerText().catch(() => '')).includes('지원한 공고 1건이 확정을 기다리고 있어요') && (await empty(y, 'waiting').locator('a').getAttribute('href').catch(() => '')) === '/me' && !(await y.locator('main').innerText()).includes('모집 중인 알바 보기'), one(await y.locator('main').innerText()).slice(0, 90))
  ok('바로 가기 누르는 높이 40px 이상 · 360px 옆으로 안 밀림', (await empty(y, 'waiting').locator('a').evaluate((el) => el.getBoundingClientRect().height >= 40).catch(() => false)) && (await noSide(y)))
  await shot(y, '4-history-waiting')
  const x = await pg(X)
  await open(x, '/me/history')
  const xt = one(await empty(x, 'next').innerText().catch(() => ''))
  ok("확정된 근무가 있는 사람: '아직 마친 근무가 없어요 · 다음 근무 날짜 · 마치면 여기에 쌓여요'", xt.includes('아직 마친 근무가 없어요') && /다음 근무 \d{1,2}\/\d{1,2}\(.\) · 마치면 여기에 쌓여요/.test(xt) && xt.includes('내 근무 보기'), xt)
  await shot(x, '5-history-next')
  const z = await pg(Z)
  await open(z, '/me/history')
  ok("아무것도 없는 새 회원: 예전 그대로 '모집 중인 알바 보기'", one(await empty(z, 'none').innerText().catch(() => '')).includes('아직 근무 기록이 없어요') && (await empty(z, 'none').locator('a').getAttribute('href').catch(() => '')) === '/')

  // ── 4. 근무 전날이 아니면 '다시 알리기' 없음 (오늘 근무 · 모레 근무)
  await rest(`messages?job_id=eq.${J}`, 'DELETE')
  await setJob({ start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await rest('messages', 'POST', { thread_user_id: X, sender_id: null, from_admin: true, company_id: C, job_id: J, body: '⏰ 내일 근무 안내\n오늘 09:00 · 광장', read_at: null, created_at: nowIso })
  await open(a, `/admin/jobs/${J}`)
  ok('근무 당일: 전날 안내 칸은 있어도 다시 알리기는 없음 (당일은 전화로)', (await card.count()) === 1 && (await nudge.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
