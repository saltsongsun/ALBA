// 묶음 331 (정기 개선 2026-11-21 01:35 KST · 놀이터 다듬기)
// · 배지: 못 얻은 배지를 누르면 그 배지를 얻는 화면으로 (첫 글 → 글쓰기 · 준비 완료 → 내 정보 …) · 얻은 배지는 그냥 칸
// · '다음 배지' 한 줄: 가장 가까운 배지(채운 비율이 가장 큰 것) + 남은 양('1곳 더') + 하러 가기 · 시작 전이면 첫 배지와 할 일
// · 퀴즈 결과 '결과 자랑하기' (점수만 · 공유 창이 없으면 링크 복사) + '다시 풀기'
// · 이번 주 챌린지: 끝낸 줄·남은 줄의 막대 끝이 같은 자리 (오른쪽 칸 너비 고정) · 360px
// node scripts/qa/batch331.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const N = 'bbbbbbbb-0000-4000-8000-0000003310b1', P = 'bbbbbbbb-0000-4000-8000-0000003310b2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const at = (hm) => new Date(`${today}T${hm}:00+09:00`).toISOString()
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 준비: N = 기록 없는 새 회원 · P = 근무 1번 마침(정시) — 한 회사
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = k
  await rest('users', 'POST', { ...ub, id: N, name: '새싹', phone: '01033103311', photo_at: null, careers: [], nickname: null, created_at: '2026-11-01T00:00:00Z' })
  await rest('users', 'POST', { ...ub, id: P, name: '한번', phone: '01033103312', photo_at: null, careers: [], nickname: '한번수달', created_at: '2026-11-01T00:00:00Z' })
  const [j0] = await rest(`jobs?id=eq.${J}`)
  const { applications: _ap, ...jl } = j0
  const pu = { id: P, name: '한번', phone: '01033103312', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '한번', photo_at: null }
  await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: P, status: 'approved', available_dates: null, position: null, message: null, created_at: '2026-11-02T00:00:00Z', job: jl, user: pu })
  await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: P, work_date: today, clock_in: at('08:58'), clock_out: at('12:00'), note: null, source: 'app', confirmed: false, paid: false, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, sched_start: null, sched_end: null, created_at: at('08:58'), job: jl, user: pu })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 새 회원: 다음 배지 = 첫 근무 (근무 1번 마치기) → 알바 찾기
  const n = await mk(N)
  await go(n, '/community/play')
  const nb = n.locator('[data-next-badge]')
  ok("새 회원 '다음 배지 · 첫 근무 · 근무 1번 마치기'", (await nb.getAttribute('data-next-badge')) === 'first_shift' && one(await nb.innerText()).includes('첫 근무') && one(await nb.innerText()).includes('근무 1번 마치기') && one(await nb.innerText()).includes('하러 가기'), one(await nb.innerText().catch(() => '')))
  ok("'하러 가기' → 알바 찾기(/)", (await nb.getAttribute('href')) === '/')
  ok('다음 배지 줄: 휴대폰에서 두 줄 안 · 옆으로 안 밀림', (await nb.evaluate((e) => e.getBoundingClientRect().height < 60)) && (await noSide(n)))
  // 못 얻은 배지 칸은 눌러서 하러 가기
  const goCount = await n.locator('[data-badge-go]').count()
  ok('못 얻은 배지 칸은 모두 링크 (얻은 배지 0개)', goCount === (await n.locator('[data-badge]').count()) && goCount >= 11, String(goCount))
  const hrefs = Object.fromEntries(await n.locator('[data-badge]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-badge'), e.querySelector('a')?.getAttribute('href')])))
  ok("배지별 가는 곳 (첫 글 → 글쓰기 · 준비 완료 → 내 정보 · 첫 후기 → 지난 근무 · 인기쟁이 → 내 글)", hrefs.post1 === '/community/new' && hrefs.profile === '/me/profile' && hrefs.review1 === '/me/history' && hrefs.liked10 === '/community?c=mine', JSON.stringify(hrefs))
  if (SHOTS) {
    await n.locator('[data-badges]').scrollIntoViewIfNeeded()
    await n.screenshot({ path: `${SHOTS}/badges-new.png` })
  }
  await n.locator('[data-badge="post1"] a').click()
  await n.waitForURL(/\/community\/new/, { timeout: 10000 }).catch(() => {})
  ok("'첫 글' 배지 누르면 글쓰기 화면", new URL(n.url()).pathname === '/community/new')

  // ── 2. 근무 1번 한 회원: 첫 근무 얻음(그냥 칸) · 다음 배지 = 여기저기 (1/2 → '1곳 더')
  const p = await mk(P)
  await go(p, '/community/play')
  ok('얻은 배지(첫 근무)는 링크 아님', (await p.locator('[data-badge="first_shift"]').getAttribute('data-badge-got')) === '1' && (await p.locator('[data-badge="first_shift"] a').count()) === 0)
  const pnb = p.locator('[data-next-badge]')
  ok("다음 배지: 가장 가까운 '여기저기' · '1곳 더'", (await pnb.getAttribute('data-next-badge')) === 'two_co' && one(await p.locator('[data-next-badge-left]').innerText()) === '· 1곳 더', one(await pnb.innerText().catch(() => '')))

  // ── 3. 챌린지 막대 끝이 같은 자리 (끝낸 줄 · 남은 줄)
  const ends = await p.locator('[data-challenge] [aria-hidden].h-1\\.5').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)))
  const doneStates = await p.locator('[data-challenge]').evaluateAll((els) => els.map((e) => e.getAttribute('data-challenge-done')))
  ok('끝낸 줄과 남은 줄이 섞여 있음 (정시 출근 ✓ · 근무 2번 1/2)', doneStates.includes('1') && doneStates.includes('0'), doneStates.join(''))
  ok('챌린지 막대 끝 위치가 모두 같음', ends.length === 4 && new Set(ends).size === 1, JSON.stringify(ends))
  if (SHOTS) {
    await p.locator('[data-challenges]').scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/challenges.png` })
  }

  // ── 4. 퀴즈 결과 자랑하기 (공유 창이 없는 PC → 링크 복사)
  const q = await mk(P, { permissions: ['clipboard-read', 'clipboard-write'] })
  await q.addInitScript(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) } catch {} })
  await go(q, '/community/play')
  await q.locator('[data-quiz-start]').click()
  for (let i = 0; i < 5; i++) {
    await q.locator('[data-quiz="play"] [data-quiz-choice]').first().click()
    await q.locator('[data-quiz-next]').click()
  }
  const done = q.locator('[data-quiz="done"]')
  await done.waitFor()
  const score = await done.getAttribute('data-quiz-score')
  const share = q.locator('[data-quiz-share] button')
  ok("결과 화면: '다시 풀기' + '결과 자랑하기' 한 줄", (await q.locator('[data-quiz-again]').innerText()) === '다시 풀기' && (await share.innerText()) === '결과 자랑하기' && (await q.locator('[data-quiz-again]').evaluate((e) => Math.round(e.getBoundingClientRect().top))) === (await share.evaluate((e) => Math.round(e.getBoundingClientRect().top))))
  if (SHOTS) {
    await done.scrollIntoViewIfNeeded()
    await q.screenshot({ path: `${SHOTS}/quiz-share.png` })
  }
  await share.click()
  await q.waitForTimeout(300)
  const clip = await q.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok("누르면 '링크 복사됨 ✓' · 점수와 놀이터 링크만", (await share.innerText()) === '링크 복사됨 ✓' && clip.includes(`알바 상식 퀴즈 ${score}/5점`) && clip.includes('/community/play#quiz') && !clip.includes('한번'), clip.replace(/\n/g, ' / '))
  ok('360px 옆으로 밀림 없음 (퀴즈 결과)', await noSide(q))
  await q.locator('[data-quiz-again]').click()
  ok("'다시 풀기' → 새 문제 1/5", (await q.locator('[data-quiz="play"]').getAttribute('data-quiz-index')) === '0')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
