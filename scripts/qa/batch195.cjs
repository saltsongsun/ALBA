// 묶음 195 (정기 개선 2026-11-11 11:36 KST)
// · 근무 전날 '내일 갈게요': 확정된 근무자가 내 근무의 예정 카드에서 한 번 누름 → '내일 출근 확인함 · 시각' ('못 가요' 쪽은 batch196)
//   - 전날 안내(자동)에 '내일 갈게요' 한 줄 + 문의함 버튼 '내일 갈게요 · 출근 확인하기' (→ /me#coming)
//   - 문의함에 기록으로 남되 관리자 '안 읽음'·'답장 전'으로 쌓이지 않음 · 두 번 눌러도 기록은 하나
//   - 내일 근무가 아니면 버튼 없음
// · 관리자 공고 화면: '‘갈게요’ 누름 n/m명' + 아직 답 없는 사람 전화 (안내를 안 읽은 사람은 '안 읽음' 표시)
//   - 아무도 안 눌렀으면 예전처럼 안내를 안 읽은 사람만 · 모두 누르면 '모두 온대요'
// node scripts/qa/batch195.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const C = '99999999-0000-4000-8000-000000000099', X = 'bbbbbbbb-0000-4000-8000-000000019501'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), tomorrow = kstDay(now + 864e5)
  // 준비: 공고를 내일 하루로 · 확정자 셋 (근무자 · 김지원 · 엑스) · 오늘 근무 기록은 지움
  const setJob = async (patch) => {
    await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
    for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  }
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', available_dates: null })
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const xu = { ...w1, id: X, name: '안온엑스', phone: '01077771951', created_at: new Date().toISOString() }
  await rest('users', 'POST', xu)
  await rest('applications', 'POST', { ...wApp, id: undefined, user_id: X, user: xu, position: null })
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
  const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) } }
  const open = async (p, path) => { await p.goto(D + path); await p.waitForLoadState('networkidle').catch(() => {}) }
  const comingMsgs = async () => (await rest(`messages?job_id=eq.${J}`)).filter((m) => !m.from_admin && m.body.startsWith('🙋 출근 예정 확인'))
  const unreadForAdmin = async () => (await rest(`messages?company_id=eq.${C}`)).filter((m) => !m.from_admin && !m.read_at).length

  // ── 1. 전날 안내 (자동): '내일 갈게요' 한 줄 + 버튼
  const cron = await fetch(`${D}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } }).then((r) => r.json())
  const reminds = (await rest(`messages?job_id=eq.${J}`)).filter((m) => m.from_admin && m.body.startsWith('⏰ 내일 근무 안내'))
  ok('전날 안내가 확정자 셋에게 감', cron.sent === 3 && reminds.length === 3, JSON.stringify(cron))
  ok("안내에 '내일 갈게요' 한 줄 + 출근 확인 버튼", reminds.every((m) => m.body.includes('‘내일 갈게요’를 눌러 주세요') && m.body.trim().endsWith('::b:coming::')), reminds[0]?.body.split('\n').slice(-2).join(' / '))

  // ── 2. 관리자: 아직 아무도 안 눌렀을 때 (예전처럼 안내를 안 읽은 사람만)
  const a = await pg(A)
  const card = a.locator('[data-remind-read]')
  const cnt = a.locator('[data-coming-count]')
  const people = () => card.locator('[data-unread-person]').allInnerTexts().then((l) => l.map(one))
  await open(a, `/admin/jobs/${J}`)
  ok("관리자: '전날 안내 확인 0/3명' + '‘갈게요’ 누름 0/3명 · 아직 없어요'", /전날 안내 확인 0\/3명/.test(one(await card.innerText().catch(() => ''))) && one(await cnt.innerText().catch(() => '')) === '‘갈게요’ 누름 0/3명 아직 없어요', one(await cnt.innerText().catch(() => '')))
  ok("아무도 안 눌렀으면 안내를 안 읽은 사람만 (셋, '안 읽음' 표시는 없음)", (await people()).length === 3 && (await people()).every((t) => !t.includes('안 읽음')), JSON.stringify(await people()))
  ok("'갈게요' 줄은 한 줄 · 360px 옆으로 안 밀림", (await cnt.evaluate((el) => el.getBoundingClientRect().height < 30).catch(() => false)) && (await noSide(a)))

  // ── 3. 근무자: 문의함 안내의 버튼 → 내 근무의 '내일 갈게요'
  const unread0 = await unreadForAdmin()
  const w = await pg(W)
  await open(w, `/me/chat?co=${C}`)
  const go = w.locator('a[href="/me#coming"]').last()
  ok("문의함 안내 아래 '내일 갈게요 · 출근 확인하기' 버튼", one(await go.innerText().catch(() => '')).includes('내일 갈게요 · 출근 확인하기'), one(await go.innerText().catch(() => '')))
  await open(w, '/me')
  const ask = w.locator('[data-coming="ask"]')
  ok("예정된 근무 카드: '내일 올 수 있나요?' + '못 가요' · '내일 갈게요'", one(await ask.innerText().catch(() => '')) === '내일 올 수 있나요? 못 가요 내일 갈게요' && (await ask.getAttribute('id')) === 'coming', one(await ask.innerText().catch(() => '')))
  await w.waitForTimeout(500) // 카드가 나타나는 움직임이 끝난 뒤에 잼
  ok('한 줄 · 버튼 높이 40px 이상 · 360px 옆으로 안 밀림', (await ask.evaluate((el) => el.getBoundingClientRect().height < 64).catch(() => false)) && (await ask.locator('button').evaluate((el) => el.getBoundingClientRect().height >= 40).catch(() => false)) && (await noSide(w)))
  await shot(w, '1-worker-ask')
  // (같은 화면을 하나 더 열어 둠 → 두 번 누르는 경우)
  const w2 = await pg(W)
  await open(w2, '/me')
  await ask.locator('button').click()
  const done = w.locator('[data-coming="done"]')
  await done.waitFor({ timeout: 10000 }).catch(() => {})
  ok("누르면 '✓ 내일 출근 확인함 · 시각' + '못 가게 됐어요' (버튼은 사라짐)", /^✓ 내일 출근 확인함 · \d{2}:\d{2} 못 가게 됐어요$/.test(one(await done.innerText().catch(() => ''))) && (await ask.count()) === 0, one(await done.innerText().catch(() => '')))
  ok("안내 한 줄 ('내일 온다고 담당자에게 알렸어요')", one(await w.locator('[role=status]').first().innerText().catch(() => '')).includes('내일 온다고 담당자에게 알렸어요'))
  ok('확인 줄은 한 줄 · 360px 옆으로 안 밀림', (await done.evaluate((el) => el.getBoundingClientRect().height < 56).catch(() => false)) && (await noSide(w)))
  await shot(w, '2-worker-done')
  let cm = await comingMsgs()
  ok('문의함에 기록 하나 (회사·공고·날짜 · 읽은 것으로)', cm.length === 1 && cm[0].thread_user_id === W && cm[0].company_id === C && !!cm[0].read_at && cm[0].body.includes('09:00 · 시간 맞춰 갈게요.'), JSON.stringify(cm.map((m) => [m.body.split('\n')[1], !!m.read_at])))
  ok("관리자 '안 읽음'은 그대로 (전날 밤 문의가 쌓이지 않음)", (await unreadForAdmin()) === unread0, `${unread0} → ${await unreadForAdmin()}`)
  // 열어 둔 다른 화면에서 또 누름 → 기록은 그대로 하나
  await w2.locator('[data-coming="ask"] button').click()
  await w2.locator('[data-coming="done"]').waitFor({ timeout: 10000 }).catch(() => {})
  cm = await comingMsgs()
  ok("두 번 눌러도 기록은 하나 ('이미 확인했어요')", cm.length === 1 && one(await w2.locator('[role=status]').first().innerText().catch(() => '')).includes('이미 확인했어요'), `${cm.length}건`)

  // ── 4. 관리자: 한 명이 누른 뒤 — 답 없는 사람 전화 (안 읽은 사람 표시)
  await open(a, `/admin/jobs/${J}`)
  ok("관리자: '‘갈게요’ 누름 1/3명 · 답 없음 2명'", one(await cnt.innerText().catch(() => '')) === '‘갈게요’ 누름 1/3명 답 없음 2명', one(await cnt.innerText().catch(() => '')))
  ok("전화할 사람은 답 없는 둘 (누른 사람은 빠짐 · 안내를 안 읽었으면 '안 읽음')", (await people()).length === 2 && (await people()).every((t) => t.includes('안 읽음')) && !(await people()).some((t) => t.includes('근무자')) && (await people()).some((t) => t.includes('안온엑스')), JSON.stringify(await people()))
  ok('전화 버튼은 그 사람 번호', (await card.locator('[data-unread-person]', { hasText: '안온엑스' }).getAttribute('href').catch(() => '')) === 'tel:01077771951')
  ok('360px: 옆으로 안 밀림 (관리자 공고)', await noSide(a))
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await shot(a, '3-admin-one')
  // 문의 목록: 그 글은 '답장 전'으로 뜨지 않음
  await open(a, '/admin/chat')
  ok("문의 목록: '출근 예정 확인'은 답장 전으로 안 뜸", (await a.locator('[data-inbox-row]', { hasText: '근무자' }).locator('[data-inbox-noreply]').count()) === 0)

  // ── 5. 나머지도 누름 → '모두 온대요'
  const ap = await pg(AP)
  await open(ap, '/me')
  await ap.locator('[data-coming="ask"] button').click()
  await ap.locator('[data-coming="done"]').waitFor({ timeout: 10000 }).catch(() => {})
  const x = await pg(X)
  await open(x, '/me')
  await x.locator('[data-coming="ask"] button').click()
  await x.locator('[data-coming="done"]').waitFor({ timeout: 10000 }).catch(() => {})
  await open(a, `/admin/jobs/${J}`)
  ok("모두 누르면 '‘갈게요’ 누름 3/3명 · 모두 온대요' (전화할 사람 없음)", one(await cnt.innerText().catch(() => '')) === '‘갈게요’ 누름 3/3명 모두 온대요' && (await people()).length === 0, one(await cnt.innerText().catch(() => '')))
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await shot(a, '4-admin-all')

  // ── 6. 내일 근무가 아니면 버튼 없음 (모레로 미룸)
  const day2 = kstDay(now + 2 * 864e5)
  await setJob({ start_date: day2, end_date: day2 })
  await open(w, '/me')
  ok('모레 근무: 예정 카드는 있지만 출근 확인 줄은 없음', (await w.locator('[data-coming]').count()) === 0 && (await w.locator('main').innerText()).includes('예정된 근무'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
