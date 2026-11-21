// 묶음 336 (정기 개선 2026-11-21 11:35 KST · 공고 화면 회사 줄 '다른 공고' · 챌린지 다 끝낸 축하)
// · 근무자 공고 화면 회사 줄: 이 공고 말고 그 회사가 모집 중인 공고가 있을 때만 '다른 공고 n개 →' (이 공고 하나뿐이면 숫자 없음 — 같은 공고로 다시 가지 않게)
//   회사 이름을 누르면 그 회사 공고 모음은 그대로
// · 놀이터 이번 주 챌린지를 모두 끝내면 처음 한 번만 작은 폭죽 (다시 열면 조용히 · 움직임 줄이기면 점 없음) · 360px
// node scripts/qa/batch336.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000003360c2'
const J2 = 'cccccccc-0000-4000-8000-0000003360a2', J3 = 'cccccccc-0000-4000-8000-0000003360a3'
const P = 'bbbbbbbb-0000-4000-8000-0000003360b1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const kday = (n) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const at = (hm) => new Date(`${today}T${hm}:00+09:00`).toISOString()
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
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

  // ── 1. 공고 화면 회사 줄: 이 회사 모집 공고가 이 공고 하나뿐 → 숫자 없음
  const w = await mk(W)
  await go(w, `/jobs/${J}`)
  const line = w.locator('[data-company-line]')
  await line.waitFor({ timeout: 10000 }).catch(() => {})
  ok("이 공고 하나뿐: '공고 1개 →' 없음 (같은 공고를 세지 않음)", (await w.locator('[data-company-more]').count()) === 0 && !/공고 \d+개/.test(one(await line.innerText())), one(await line.innerText()))
  ok('회사 이름 → 그 회사 공고 모음은 그대로', (await line.getAttribute('href')) === `/?co=${C1}`)

  // 같은 회사가 다른 공고를 하나 더 올리면 '다른 공고 1개 →'
  const [j0] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a0, attendance: _t0, ...jb } = j0
  await rest('jobs', 'POST', { ...jb, id: J3, title: '다음 주 박람회 안내', status: 'open', start_date: kday(5), end_date: kday(5), applications: [], attendance: [], created_at: new Date().toISOString() })
  await go(w, `/jobs/${J}`)
  const more = w.locator('[data-company-more]')
  ok("다른 공고가 있으면 '다른 공고 1개 →'", (await more.count()) === 1 && one(await more.innerText()) === '다른 공고 1개 →', one(await line.innerText()))
  ok('회사 줄 한 줄 · 360px 옆으로 밀림 없음', (await line.evaluate((e) => e.getBoundingClientRect().height < 30)) && (await noSide(w)))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/company-more.png` })
  // 새로 올린 공고 화면에서도 '다른 공고 1개' (원래 공고)
  await go(w, `/jobs/${J3}`)
  ok("새 공고 화면에서도 '다른 공고 1개 →'", one(await w.locator('[data-company-more]').innerText().catch(() => '')) === '다른 공고 1개 →')

  // ── 2. 놀이터 챌린지: 오늘 근무 2번(1번 정시) + 글 1개 → 3/4, 퀴즈 한 판 → 4/4 + 처음 한 번 폭죽
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = k
  await rest('users', 'POST', { ...ub, id: P, name: '축하', phone: '01033603361', photo_at: null, careers: [], nickname: '축하수달', created_at: '2026-11-01T00:00:00Z' })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼삼육회사', created_at: new Date().toISOString() })
  const { applications: _ap, ...jl } = j0
  await rest('jobs', 'POST', { ...j0, id: J2, company_id: C2, company: { company_name: '삼삼육회사' }, title: '삼삼육 행사 안내', applications: [], created_at: new Date().toISOString() })
  const jobOf = { [J]: jl, [J2]: { ...jl, id: J2, company_id: C2, company: { company_name: '삼삼육회사' }, title: '삼삼육 행사 안내' } }
  const pu = { id: P, name: '축하', phone: '01033603361', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '축하', photo_at: null }
  for (const [jid, inT, outT] of [[J, '08:58', '12:00'], [J2, '09:30', '13:00']]) {
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: P, status: 'approved', available_dates: null, position: null, message: null, created_at: '2026-11-02T00:00:00Z', job: jobOf[jid], user: pu })
    await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: P, work_date: today, clock_in: at(inT), clock_out: at(outT), note: null, source: 'app', confirmed: false, paid: false, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, sched_start: null, sched_end: null, created_at: at(inT), job: jobOf[jid], user: pu })
  }
  await rest('community_posts', 'POST', { author_id: P, category: 'tip', title: '축하 테스트 글', body: '내용', hidden_at: null, created_at: new Date().toISOString() })

  const quiz = async (p) => {
    await p.locator('[data-quiz-start]').click()
    for (let i = 0; i < 5; i++) {
      await p.locator('[data-quiz="play"] [data-quiz-choice]').first().click()
      await p.locator('[data-quiz-next]').click()
    }
    await p.locator('[data-quiz="done"]').waitFor()
  }
  const p = await mk(P)
  await go(p, '/community/play')
  const ch = p.locator('[data-challenges]')
  ok('시작: 챌린지 3/4 · 축하 없음', (await ch.getAttribute('data-done')) === '3' && (await p.locator('[data-challenges-all]').count()) === 0 && (await p.locator('[data-challenges-party]').count()) === 0)
  await quiz(p)
  const party = p.locator('[data-challenges-party]')
  await party.waitFor({ timeout: 3000 }).catch(() => {})
  ok("퀴즈를 끝내면 4/4 '모두 끝냈어요' + 작은 폭죽(점 8개)", (await ch.getAttribute('data-done')) === '4' && (await p.locator('[data-challenges-all]').count()) === 1 && (await party.locator('i').count()) === 8)
  ok('폭죽은 글 칸 안에서만 (360px 옆으로 밀림 없음)', await noSide(p))
  if (SHOTS) {
    await ch.scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/challenges-party.png` })
  }
  await p.waitForTimeout(1500)
  ok('잠깐 뒤 폭죽은 사라지고 축하 글은 남음', (await party.count()) === 0 && (await p.locator('[data-challenges-all]').count()) === 1)
  const week = await p.evaluate(() => localStorage.getItem('play-quiz-week'))
  ok('이번 주 축하를 봤다고 이 휴대폰에 기억', (await p.evaluate(() => localStorage.getItem('play-challenges-party'))) === week && !!week)
  await go(p, '/community/play')
  await p.waitForTimeout(400)
  ok('다시 열면 조용히 (축하 글만 · 폭죽 없음)', (await p.locator('[data-challenges-all]').count()) === 1 && (await p.locator('[data-challenges-party]').count()) === 0)

  // ── 3. 움직임 줄이기: 다 끝내도 점은 보이지 않음
  const r = await mk(P, { reducedMotion: 'reduce' })
  await go(r, '/community/play')
  await quiz(r)
  await r.locator('[data-challenges-all]').waitFor({ timeout: 3000 }).catch(() => {})
  const rp = r.locator('[data-challenges-party]')
  ok('움직임 줄이기: 축하 글은 나오고 폭죽 점은 숨김', (await r.locator('[data-challenges-all]').count()) === 1 && ((await rp.count()) === 0 || (await rp.evaluate((e) => getComputedStyle(e).display)) === 'none'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
