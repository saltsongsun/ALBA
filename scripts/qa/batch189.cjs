// 묶음 189 (정기 개선 2026-11-11 05:35 KST)
// · 내 근무: 지원하고 확정을 기다리는 중(오늘·다음 근무 없음)이면 '확정 대기' 칸이 '오늘의 근무' 위로 — 큰 빈 화면 안내는 한 줄로
//   (지원하고 '내 근무 보기'로 들어온 사람이 지원한 공고를 첫 화면에서 바로 봄)
// · 확정 대기 칸: 하루 안에 시작하는데(또는 이미 시작했는데) 아직 확정 전이면 '곧 시작인데 아직 확정 전이에요 · 담당자에게 문의 →'
//   → 문의 화면에 '지원했는데 확정 여부가 궁금해요.'가 첫 빠른 답으로 (확정된 줄 알고 가거나, 안 된 줄 알고 안 가는 일을 막음)
// node scripts/qa/batch189.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const NEW = 'bbbbbbbb-0000-4000-8000-000000018901'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const kstHm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now()
  // 준비: 지원자(김지원)는 날짜를 고르지 않고 지원 · 근무는 23시간 뒤 시작 (하루 안 → 곧 시작)
  const at = now + 23 * 3600e3
  const soonJob = { start_date: kstDay(at), end_date: kstDay(at + 2 * 3600e3), start_time: `${kstHm(at)}:00`, end_time: `${kstHm(at + 2 * 3600e3)}:00`, status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', soonJob)
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { available_dates: null, status: 'applied', job: { ...(await rest(`applications?id=eq.${AP_APP}`))[0].job, ...soonJob } })

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
  const setJob = async (patch) => {
    await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
    const [app] = await rest(`applications?id=eq.${AP_APP}`)
    await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { job: { ...app.job, ...patch } })
  }

  // ── 1. 확정을 기다리는 지원자: '확정 대기'가 먼저
  const p = await pg(AP)
  await p.goto(`${D}/me`)
  const wait = p.locator('[data-waiting]')
  await wait.waitFor({ timeout: 15000 }).catch(() => {})
  const order = await p.evaluate(() => {
    const w = document.querySelector('[data-waiting]'), t = document.querySelector('#today-work')
    return { before: !!w && !!t && !!(w.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING), top: w ? Math.round(w.querySelector('[data-waiting-app]').getBoundingClientRect().top) : -1, bottom: w ? Math.round(w.querySelector('[data-waiting-app]').getBoundingClientRect().bottom) : -1 }
  })
  ok("'확정 대기' 칸이 '오늘의 근무' 위에 · 첫 화면 안에 다 보임 (아래 메뉴 위)", (await wait.getAttribute('data-waiting')) === 'first' && order.before && order.top > 0 && order.bottom < 660, JSON.stringify(order))
  const compact = p.locator('[data-today-empty=compact]')
  ok("'오늘의 근무'는 한 줄 안내로 (큰 빈 화면 그림 없음)", one(await compact.innerText().catch(() => '')) === '오늘 예정된 근무가 없어요 다른 알바 보기 →' && (await compact.evaluate((el) => el.getBoundingClientRect().height <= 56).catch(() => false)) && (await p.locator('[data-empty=schedule]').count()) === 0 && (await compact.getByRole('link').getAttribute('href')) === '/', one(await compact.innerText().catch(() => '')))
  const soon = p.locator('[data-waiting-soon]')
  ok("곧 시작(하루 안): '곧 시작인데 아직 확정 전이에요 · 담당자에게 문의 →'", (await soon.getAttribute('data-waiting-soon')) === 'soon' && one(await soon.innerText()) === '곧 시작인데 아직 확정 전이에요 담당자에게 문의 →' && (await soon.getByRole('link').getAttribute('href')) === `/me/chat?job=${J}&ask=confirm`, one(await soon.innerText().catch(() => '')))
  ok('한 줄 · 360px 옆으로 안 밀림', (await soon.evaluate((el) => el.getBoundingClientRect().height <= 40).catch(() => false)) && (await noSide(p)), String(await soon.evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => '')))
  if (SHOTS) { await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/me-waiting.png` }).catch(() => {}) }
  // 카드(제목 쪽)를 누르면 공고로
  ok('카드 제목 쪽은 그대로 공고로', (await p.locator('[data-waiting-app] > a').first().getAttribute('href')) === `/jobs/${J}`)

  // ── 2. '담당자에게 문의' → 확정 여부를 묻는 말이 첫 빠른 답
  await soon.getByRole('link').click()
  await p.waitForURL((u) => u.pathname === '/me/chat' && u.searchParams.get('ask') === 'confirm', { timeout: 15000 }).catch(() => {})
  const chips = p.locator('[data-quick-replies] button')
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  await p.waitForLoadState('networkidle').catch(() => {})
  const texts = (await chips.allInnerTexts()).map(one)
  ok("문의 화면 첫 빠른 답: '지원했는데 확정 여부가 궁금해요.' ('아직 지원할 수 있나요?'는 뺌)", texts[0] === '지원했는데 확정 여부가 궁금해요.' && !texts.includes('아직 지원할 수 있나요?') && texts.includes('주차할 수 있나요?'), JSON.stringify(texts))
  await chips.first().click()
  ok('누르면 입력 칸에 들어감 (바로 보내지 않음)', (await p.locator('textarea[name=body]').inputValue()) === '지원했는데 확정 여부가 궁금해요.')
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chat-confirm.png` }).catch(() => {})
  // 평소 공고 문의는 그대로
  await p.goto(`${D}/me/chat?job=${J}`)
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('평소 공고 문의의 빠른 답은 그대로', one(await chips.first().innerText()) === '아직 지원할 수 있나요?')

  // ── 3. 멀리 남은 근무: 문의 줄 없음 · 이미 시작한 근무: '시작했는데…'
  const far = now + 3 * 864e5
  await setJob({ start_date: kstDay(far), end_date: kstDay(far), start_time: '09:00:00', end_time: '18:00:00' })
  await p.goto(`${D}/me`)
  await wait.waitFor({ timeout: 15000 }).catch(() => {})
  ok('사흘 뒤 근무: 문의 줄 없음 (확정 대기 칸은 그대로 위)', (await soon.count()) === 0 && (await wait.getAttribute('data-waiting')) === 'first')
  await setJob({ start_date: kstDay(now - 864e5), end_date: kstDay(now + 864e5), start_time: '00:00:00', end_time: '23:59:00' })
  await p.goto(`${D}/me`)
  await soon.waitFor({ timeout: 15000 }).catch(() => {})
  ok("이미 시작한 근무: '시작했는데 아직 확정 전이에요'", (await soon.getAttribute('data-waiting-soon')) === 'started' && one(await soon.innerText()) === '시작했는데 아직 확정 전이에요 담당자에게 문의 →', one(await soon.innerText().catch(() => '')))
  // 끝난 근무(어제까지): 확정 대기 칸에서 빠짐
  await setJob({ start_date: kstDay(now - 2 * 864e5), end_date: kstDay(now - 864e5) })
  await p.goto(`${D}/me`)
  await p.locator('#today-work').waitFor({ timeout: 15000 }).catch(() => {})
  ok('끝난 공고는 확정 대기에 없음 → 예전처럼 큰 빈 화면 안내', (await wait.count()) === 0 && (await p.locator('[data-empty=schedule]').count()) === 1 && (await compact.count()) === 0)

  // ── 4. 다른 사람들은 그대로
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: NEW, name: '새회원', phone: '01018900001', attendance: [], ratings: [] })
  const n = await pg(NEW)
  await n.goto(`${D}/me`)
  await n.locator('#today-work').waitFor({ timeout: 15000 }).catch(() => {})
  ok('지원한 적 없는 새 회원: 큰 빈 화면 안내 그대로', (await n.locator('[data-empty=schedule]').count()) === 1 && (await n.locator('[data-waiting]').count()) === 0 && (await n.locator('[data-today-empty]').count()) === 0)
  await setJob({ start_date: kstDay(now - 864e5), end_date: kstDay(now + 864e5), start_time: '00:00:00', end_time: '23:59:00' })
  const wk = await pg(W)
  await wk.goto(`${D}/me`)
  await wk.locator('#today-work').waitFor({ timeout: 15000 }).catch(() => {})
  ok('오늘 근무가 있는 사람: 오늘의 근무가 그대로 먼저 (한 줄 안내·확정 대기 없음)', (await wk.locator('[data-waiting]').count()) === 0 && (await wk.locator('[data-today-empty]').count()) === 0 && (await noSide(wk)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
