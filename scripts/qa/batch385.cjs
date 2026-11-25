// 묶음 385 (정기 개선 2026-11-25 08:35 KST)
// ① 관리자 공고 화면 '근로계약서를 받지 않는 공고예요' 카드: 서류는 모집이 끝나면 가므로(사용자 요청 2026-11-24) 언제 가는지 맞게
//    · 아직 보낼 때가 아님(모집 중 · 근무 며칠 뒤): '모집을 마감할 때(늦어도 M/D(요일) 저녁 6시) 확정된 n명에게 서명 요청이 가고' ('바로' 없음)
//    · 보낼 때(오늘 근무): 예전 그대로 '이미 확정된 n명에게도 바로 서명 요청이 가고'
// ② 가입 화면 위 진행 줄: '다음: ○○'가 화면 차례(이름 → 사진 → …) · 다 채우면 '✓ 필수 항목을 모두 채웠어요 ↓' 누르면 '가입하기' 버튼으로
// node scripts/qa/batch385.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const JL = 'cccccccc-0000-4000-8000-000000038501', JN = 'cccccccc-0000-4000-8000-000000038502'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003850${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003850${String(n).padStart(2, '0')}`
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('x'.repeat(64)).toString('base64')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

;(async () => {
  const nowIso = new Date().toISOString()
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, attendance, ...jrow } = j
  // 서식(근로계약서)을 하나도 안 넣은 앱 서명 공고
  const base = { ...jrow, company_id: C1, status: 'open', required_docs: [], contract_method: 'app', headcount: 10, created_at: nowIso, audience: 'worker' }
  await rest('jobs', 'POST', { ...base, id: JL, title: '닷새 뒤 행사385', start_date: kday(5), end_date: kday(5), start_time: '09:00:00', end_time: '18:00:00' })
  await rest('jobs', 'POST', { ...base, id: JN, title: '오늘 밤 행사385', start_date: kday(0), end_date: kday(0), start_time: '23:00:00', end_time: '23:59:00' })
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 2; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}385`, phone: `010385000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  const app = (n, job) => rest('applications', 'POST', { id: AP(n), company_id: C1, job_id: job, user_id: U(n), user: usr[n], status: 'approved', available_dates: null, message: null, decided_at: nowIso, held_at: null, position: null, contract_received_at: null, created_at: nowIso })
  await app(1, JL)
  await app(2, JN)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 관리자: 근로계약서 없는 공고 카드
  const a = await mk(A)
  await go(a, `/admin/jobs/${JL}`)
  const later = a.locator('[data-no-contract-when]')
  const tl = one(await later.innerText().catch(() => ''))
  ok(`모집 중 · 닷새 뒤: '모집을 마감할 때(늦어도 ${md(kday(4))}(…) 저녁 6시) 확정된 1명에게 서명 요청이 가고' ('바로' 없음)`, (await later.getAttribute('data-no-contract-when').catch(() => '')) === 'later' && new RegExp(`모집을 마감할 때\\(늦어도 ${md(kday(4)).replace('/', '\\/')}\\(.\\) 저녁 6시\\) 확정된 1명에게 서명 요청이 가고, 서명 전에는 근무 시작 버튼이 잠겨요\\.`).test(tl) && !tl.includes('바로'), tl)
  ok('360px 옆으로 안 밀림 (공고 화면)', await noSide(a))
  if (SHOTS) await later.locator('xpath=..').screenshot({ path: `${SHOTS}/no-contract-later.png` }).catch(() => {})
  await go(a, `/admin/jobs/${JN}`)
  const now = a.locator('[data-no-contract-when]')
  const tn = one(await now.innerText().catch(() => ''))
  ok("오늘 근무(보낼 때): 예전 그대로 '이미 확정된 1명에게도 바로 서명 요청이 가고'", (await now.getAttribute('data-no-contract-when').catch(() => '')) === 'now' && tn.includes('지정하면 이미 확정된 1명에게도 바로 서명 요청이 가고'), tn)

  // ── 2. 가입 화면: 다음 칸은 화면 차례 · 다 채우면 '가입하기'로
  const s = await mk(null)
  await go(s, '/signup?type=worker')
  const nextBtn = s.locator('[data-next-field]')
  await nextBtn.waitFor({ timeout: 10000 }).catch(() => {})
  await s.waitForFunction(() => document.querySelector('[data-next-field]')?.getAttribute('data-next-field') === 'name', null, { timeout: 4000 }).catch(() => {})
  ok("처음엔 화면 맨 위 '이름'부터 ('필수 0/8 · 다음: 이름 →' 한 줄)", (await nextBtn.getAttribute('data-next-field')) === 'name' && one(await nextBtn.innerText()) === '필수 0/8 · 다음: 이름 →' && (await nextBtn.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)))
  if (SHOTS) await s.locator('[data-next-field]').locator('xpath=../..').screenshot({ path: `${SHOTS}/signup-next.png` }).catch(() => {})
  await s.fill('input[name=name]', '김새내')
  await s.waitForFunction(() => document.querySelector('[data-next-field]')?.getAttribute('data-next-field') === 'photo', null, { timeout: 4000 }).catch(() => {})
  ok("이름을 쓰면 바로 아래 '사진'", (await nextBtn.getAttribute('data-next-field')) === 'photo')
  await s.evaluate((v) => { document.querySelector('form input[name=photo]').value = v }, PHOTO)
  await s.fill('input[name=rrn1]', '900101')
  await s.fill('input[name=rrn2]', '1234567')
  await s.fill('input[name=phone]', '01055556666')
  await s.fill('input[name=pin]', '482915')
  await s.fill('input[name=pin2]', '482915')
  for (const n of ['agree_privacy', 'agree_third', 'agree_rrn']) await s.locator(`input[name=${n}]`).check()
  const done = s.locator('[data-signup-complete]')
  await done.waitFor({ timeout: 4000 }).catch(() => {})
  ok("다 채우면 '✓ 필수 항목을 모두 채웠어요 ↓' (한 줄 · 누르는 버튼)", one(await done.innerText().catch(() => '')) === '✓ 필수 항목을 모두 채웠어요 ↓' && (await done.evaluate((el) => el.tagName === 'BUTTON' && el.scrollWidth <= el.clientWidth + 1).catch(() => false)))
  await s.evaluate(() => window.scrollTo(0, 0))
  await s.waitForTimeout(200)
  if (SHOTS) await done.locator('xpath=../..').screenshot({ path: `${SHOTS}/signup-complete.png` }).catch(() => {})
  await done.click()
  await s.waitForTimeout(900)
  const sub = s.locator('form button[type=submit]').last()
  const inView = await sub.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }).catch(() => false)
  ok("누르면 '아르바이트로 가입하기' 버튼이 화면 안으로", inView && one(await sub.innerText()) === '아르바이트로 가입하기')
  ok('360px 옆으로 안 밀림 (가입)', await noSide(s))
  // 움직임 줄이기: 바로 옮김 (부드럽게 내려가지 않음) · 그래도 버튼은 화면 안
  const r = await mk(null, { reducedMotion: 'reduce' })
  await go(r, '/signup?type=worker')
  await r.locator('[data-next-field]').waitFor({ timeout: 10000 }).catch(() => {})
  await r.fill('input[name=name]', '김새내')
  await r.evaluate((v) => { document.querySelector('form input[name=photo]').value = v }, PHOTO)
  await r.fill('input[name=rrn1]', '900101')
  await r.fill('input[name=rrn2]', '1234567')
  await r.fill('input[name=phone]', '01055556667')
  await r.fill('input[name=pin]', '482915')
  await r.fill('input[name=pin2]', '482915')
  for (const n of ['agree_privacy', 'agree_third', 'agree_rrn']) await r.locator(`input[name=${n}]`).check()
  const rd = r.locator('[data-signup-complete]')
  await rd.waitFor({ timeout: 4000 }).catch(() => {})
  await r.evaluate(() => window.scrollTo(0, 0))
  await rd.click()
  await r.waitForTimeout(150)
  ok('움직임 줄이기: 누르자마자 버튼이 화면 안 (부드러운 스크롤 없음)', await r.locator('form button[type=submit]').last().evaluate((el) => { const x = el.getBoundingClientRect(); return x.top >= 0 && x.bottom <= innerHeight }).catch(() => false))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
