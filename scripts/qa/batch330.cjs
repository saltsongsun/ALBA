// 묶음 330 (사용자 요청 2026-11-20 "게임과 커뮤니티 기능을 많이 추가해줘 구인구직자들이 즐길 수 있도록" — 1단계, DB 변경 없음)
// · 커뮤니티 > 놀이터(/community/play): 오늘의 운세(눌러서 뒤집기 · 하루 같은 결과 · 연 채로 기억) · 이번 주 챌린지 · 알바 상식 퀴즈 · 배지
// · 배지·챌린지는 내 기록으로만 계산 (다른 사람 글·근무는 안 셈 · 내 글에 내가 누른 좋아요는 빼고)
// · 퀴즈 한 판 끝내면 챌린지 '퀴즈 한 판' 바로 ✓ · 최고 기록 기억 · 새로 얻은 배지는 '새로!'
// · 들어가는 곳: 커뮤니티 첫 화면 '🎮 놀이터' 줄 · 내 근무 레벨 카드 '🏅 배지 보기' · 외주 업체는 커뮤니티로 · 360px · 움직임 줄이기
// node scripts/qa/batch330.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000003300c2'
const J2 = 'cccccccc-0000-4000-8000-0000003300a2'
const P = 'bbbbbbbb-0000-4000-8000-0000003300b1', V = 'bbbbbbbb-0000-4000-8000-0000003300b2'
const FORTUNES = ['조금 일찍 도착하면 좋은 일이 생겨요', '새 동료와 금방 친해지는 날이에요', '꼼꼼함이 빛나는 하루예요', '웃는 얼굴이 행운을 불러요', '물을 자주 마시면 컨디션 최고!', '기다리던 연락이 올지도 몰라요', '작은 친절이 크게 돌아오는 날', '새로운 공고에 도전해 보세요', '오늘은 푹 쉬어 가도 괜찮아요', '칭찬을 듣게 될 예감이에요', '준비물을 한 번 더 챙기면 완벽해요', '퇴근길 하늘을 한번 올려다보세요']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const at = (hm) => new Date(`${today}T${hm}:00+09:00`).toISOString()
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 준비: 새 근무자 P — 오늘 두 회사에서 근무 2번 마침 (한 번은 정시 · 한 번은 늦음) + 커뮤니티 글 1개
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = k
  await rest('users', 'POST', { ...ub, id: P, name: '놀이터', phone: '01033003301', photo_at: null, careers: [], nickname: '즐거운수달', created_at: '2026-11-01T00:00:00Z' })
  await rest('users', 'POST', { ...ub, id: V, name: '외주회사', phone: '01033003302', member_type: 'vendor', created_at: '2026-11-01T00:00:00Z' })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째회사', created_at: new Date().toISOString() })
  const [j0] = await rest(`jobs?id=eq.${J}`)
  const { applications: _ap, ...jl } = j0
  await rest('jobs', 'POST', { ...j0, id: J2, company_id: C2, company: { company_name: '두번째회사' }, title: '두번째회사 행사 안내', applications: [], created_at: new Date().toISOString() })
  const jobOf = { [J]: jl, [J2]: { ...jl, id: J2, company_id: C2, company: { company_name: '두번째회사' }, title: '두번째회사 행사 안내' } }
  const pu = { id: P, name: '놀이터', phone: '01033003301', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '놀이터', photo_at: null }
  for (const [jid, inT, outT] of [[J, '08:58', '12:00'], [J2, '09:30', '13:00']]) {
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: P, status: 'approved', available_dates: null, position: null, message: null, created_at: '2026-11-02T00:00:00Z', job: jobOf[jid], user: pu })
    await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: P, work_date: today, clock_in: at(inT), clock_out: at(outT), note: null, source: 'app', confirmed: false, paid: false, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, sched_start: null, sched_end: null, created_at: at(inT), job: jobOf[jid], user: pu })
  }
  const [mine] = await rest('community_posts', 'POST', { author_id: P, category: 'tip', title: '행사장 꿀팁 하나', body: '편한 신발 꼭 챙기세요', hidden_at: null, created_at: new Date().toISOString() })
  // 다른 사람(W) 글 2개 — P의 기록에 안 셈 · 좋아요: W가 P 글에 1 (셈) · P가 자기 글에 1 (안 셈)
  await rest('community_posts', 'POST', { author_id: W, category: 'free', title: 'W의 글', body: '내용', hidden_at: null, created_at: new Date().toISOString() })
  await rest('community_posts', 'POST', { author_id: W, category: 'free', title: 'W의 글 2', body: '내용', hidden_at: null, created_at: new Date().toISOString() })
  await rest('community_likes', 'POST', { post_id: mine.id, user_id: W, created_at: new Date().toISOString() })
  await rest('community_likes', 'POST', { post_id: mine.id, user_id: P, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 들어가는 곳: 커뮤니티 첫 화면 · 레벨 카드
  const p = await mk(P)
  await go(p, '/community')
  const entry = p.locator('[data-play-entry]')
  ok("커뮤니티 첫 화면에 '🎮 놀이터' 줄 → /community/play", (await entry.count()) === 1 && (await entry.getAttribute('href')) === '/community/play' && one(await entry.innerText()).includes('놀이터'))
  ok('놀이터 줄: 한 줄 · 옆으로 안 밀림', (await entry.evaluate((e) => e.getBoundingClientRect().height < 50)) && (await noSide(p)))
  await go(p, '/community?c=tip')
  ok('다른 탭에서는 놀이터 줄 없음 (첫 화면만)', (await p.locator('[data-play-entry]').count()) === 0)
  await go(p, '/me')
  const xpPlay = p.locator('[data-xp-play]')
  ok("레벨 카드 '🏅 배지 보기' → 놀이터 · 안내 줄 한 줄 그대로", (await xpPlay.count()) === 1 && (await xpPlay.getAttribute('href')) === '/community/play' && (await p.locator('[data-xp-next]').evaluate((el) => el.getBoundingClientRect().height < 20)))

  // ── 2. 놀이터 첫 화면
  await go(p, '/community/play')
  ok('놀이터 화면 (제목 · 운세 · 챌린지 · 퀴즈 · 배지 · 재미용 안내)', (await p.locator('h1', { hasText: '놀이터' }).count()) === 1 && (await p.locator('[data-fortune]').count()) === 1 && (await p.locator('[data-challenges]').count()) === 1 && (await p.locator('[data-quiz="idle"]').count()) === 1 && (await p.locator('[data-badges]').count()) === 1 && (await p.locator('[data-play-note]').count()) === 1)
  ok('360px 옆으로 밀림 없음 (놀이터)', await noSide(p))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/play-top.png` })

  // 배지: 내 기록으로만 (근무 2 · 두 회사 · 글 1 → 첫 근무 · 여기저기 · 첫 글 = 3개)
  const got = await p.locator('[data-badge-got="1"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-badge')))
  ok('얻은 배지: 첫 근무 · 여기저기 · 첫 글 (3개, 얻은 것 먼저)', got.length === 3 && ['first_shift', 'two_co', 'post1'].every((k) => got.includes(k)) && (await p.locator('[data-badges]').getAttribute('data-badges-got')) === '3', JSON.stringify(got))
  const order = await p.locator('[data-badge]').evaluateAll((els) => els.map((e) => e.getAttribute('data-badge-got')).join(''))
  ok('배지 순서: 얻은 것 → 아직인 것', /^1+0+$/.test(order), order)
  ok("근무 10번 배지: '2/10' 막대", one(await p.locator('[data-badge="shift10"]').innerText()).includes('2/10'))
  ok('정시 출근은 1번만 셈 (09:30 출근은 늦음) → 칼출근 1/5', one(await p.locator('[data-badge="ontime5"]').innerText()).includes('1/5'))
  ok('좋아요: 다른 사람이 누른 것만 → 인기쟁이 1/10 (내가 누른 건 안 셈)', one(await p.locator('[data-badge="liked10"]').innerText()).includes('1/10'))
  ok('다른 사람 글은 안 셈 (첫 글만 · 댓글 0/10)', one(await p.locator('[data-badge="talk10"]').innerText()).includes('0/10'))
  ok('처음 열 땐 새로! 없음 (이미 얻은 것을 새로라 하지 않음)', (await p.locator('[data-badge-new]').count()) === 0)
  ok('제목 아래 지금 배지 3개', one(await p.locator('main').innerText()).includes('지금 배지 3개'))

  // 챌린지: 근무 2번 ✓ · 정시 1번 ✓ · 글·댓글 1개 ✓ · 퀴즈 아직 → 3/4
  const ch = p.locator('[data-challenges]')
  ok("이번 주 챌린지 3/4 · 남은 날 '…새로'", (await ch.getAttribute('data-done')) === '3' && one(await ch.locator('[data-challenges-count]').innerText()) === '3/4' && /새로/.test(await ch.innerText()))
  ok("끝낸 챌린지는 '✓ 완료' · 퀴즈는 '#quiz'로 가는 링크", (await ch.locator('[data-challenge-ok]').count()) === 3 && (await ch.locator('[data-challenge="w_quiz"] a').getAttribute('href')) === '#quiz')

  // ── 3. 오늘의 운세: 처음엔 닫힘 → 누르면 열림 · 다시 와도 열린 채 · 결과는 같음
  const fo = p.locator('[data-fortune]')
  ok('운세: 처음엔 닫혀 있음', (await fo.getAttribute('data-open')) === '0')
  await fo.locator('button').click()
  await p.waitForTimeout(450)
  const ft = one(await p.locator('[data-fortune-text]').innerText())
  ok('누르면 뒤집혀 오늘 한마디 · 별 · 행운 물건·시간', (await fo.getAttribute('data-open')) === '1' && FORTUNES.includes(ft) && /행운 물건/.test(await p.locator('[data-fortune-back]').innerText()) && /행운 시간 \d+시/.test(one(await p.locator('[data-fortune-back]').innerText())), ft)
  const facing = await p.locator('[data-fortune] button').evaluate((e) => getComputedStyle(e).transform)
  ok('뒷면이 보이게 돌아감 (180도)', facing !== 'none' && facing.startsWith('matrix3d'), facing)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/play-fortune.png` })
  await go(p, '/community/play')
  ok('다시 열어도 오늘은 열린 채 · 같은 결과', (await p.locator('[data-fortune]').getAttribute('data-open')) === '1' && one(await p.locator('[data-fortune-text]').innerText()) === ft)

  // ── 4. 퀴즈 한 판: 5문제 · 고르면 바로 맞음/틀림 + 풀이 · 끝나면 점수 · 챌린지 바로 ✓
  await p.locator('[data-quiz-start]').click()
  await p.waitForTimeout(700)
  const qTop = await p.locator('#quiz').evaluate((e) => Math.round(e.getBoundingClientRect().top))
  ok('시작하면 문제 카드 맨 위가 화면 안 (머리글 아래)', qTop >= 40 && qTop < 200, String(qTop))
  let right = 0
  const qs = new Set()
  for (let n = 0; n < 5; n++) {
    const q = p.locator('[data-quiz="play"]')
    await q.waitFor()
    ok(`${n + 1}번 문제: 보기 4개 · 진행 ${n + 1}/5`, (await q.getAttribute('data-quiz-index')) === String(n) && (await q.locator('[data-quiz-choice]').count()) === 4 && one(await q.innerText()).includes(`${n + 1}/5`))
    qs.add(one(await p.locator('[data-quiz-q]').innerText()))
    // 홀수 번째는 첫 보기, 짝수 번째는 둘째 보기 (맞고 틀리는 게 섞이게)
    await q.locator('[data-quiz-choice]').nth(n % 2).click()
    await p.waitForTimeout(120)
    const states = await q.locator('[data-quiz-choice]').evaluateAll((els) => els.map((e) => e.getAttribute('data-quiz-choice')))
    const isRight = states[n % 2] === 'right'
    if (isRight) right++
    ok(`${n + 1}번: 고른 즉시 정답 표시 + 풀이 한 줄`, states.filter((s) => s === 'right').length === 1 && (isRight || states[n % 2] === 'wrong') && (await p.locator('[data-quiz-why]').count()) === 1, states.join(','))
    if (n === 0 && SHOTS) await p.screenshot({ path: `${SHOTS}/play-quiz.png` })
    await p.locator('[data-quiz-next]').click()
  }
  ok('5문제 모두 다른 문제', qs.size === 5)
  const done = p.locator('[data-quiz="done"]')
  await done.waitFor()
  ok(`결과: 맞힌 수 ${right}/5`, (await done.getAttribute('data-quiz-score')) === String(right) && one(await done.innerText()).includes(`${right}/5`))
  ok("챌린지 '퀴즈 한 판' 바로 ✓ → 4/4 + '모두 끝냈어요'", (await p.locator('[data-challenge="w_quiz"]').getAttribute('data-challenge-done')) === '1' && (await p.locator('[data-challenges]').getAttribute('data-done')) === '4' && (await p.locator('[data-challenges-all]').count()) === 1)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/play-done.png`, fullPage: true })
  await go(p, '/community/play')
  ok(`다시 와도: 최고 ${right}/5 · 챌린지 4/4`, one(await p.locator('[data-quiz-best]').innerText().catch(() => '')) === `${right}/5` && (await p.locator('[data-challenges]').getAttribute('data-done')) === '4')
  ok('점수·챌린지는 DB에 저장 안 함 (이 휴대폰에만)', (await rest(`users?id=eq.${P}`))[0]?.quiz_best === undefined)

  // ── 5. 새로 얻은 배지: 회사 후기를 남기면 '첫 후기'에 '새로!'
  // (정기 개선 2026-11-21 01:35: 동료 기능이 꺼져 있으면 '첫 동료' 배지는 빠짐 — 가짜 DB는 기본 꺼짐이라 후기로 확인)
  ok("동료 기능이 꺼져 있으면 '첫 동료' 배지 없음 (얻을 수 없으니)", (await p.locator('[data-badge="pal1"]').count()) === 0 && (await p.locator('[data-badge]').count()) === 11)
  await rest('company_reviews', 'POST', { company_id: C1, job_id: J, author_id: P, rating: 5, body: '친절했어요', hidden_at: null, created_at: new Date().toISOString() })
  await go(p, '/community/play')
  const rv = p.locator('[data-badge="review1"]')
  ok("후기를 남기면 '첫 후기' 배지 + '새로!'", (await rv.getAttribute('data-badge-got')) === '1' && (await rv.locator('[data-badge-new]').count()) === 1 && (await p.locator('[data-badge-new]').count()) === 1)
  if (SHOTS) await p.locator('[data-badges]').screenshot({ path: `${SHOTS}/play-badges.png` })
  await go(p, '/community/play')
  ok("한 번 본 뒤엔 '새로!' 없음", (await p.locator('[data-badge-new]').count()) === 0)

  // ── 6. 다른 사람(W)은 자기 기록 (P의 근무·글이 안 보임)
  const w = await mk(W)
  await go(w, '/community/play')
  const wGot = await w.locator('[data-badge-got="1"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-badge')))
  ok("W 놀이터: W 기록으로 (W 글 → '첫 글')", wGot.includes('post1'), JSON.stringify(wGot))
  ok('W 화면: 퀴즈 기록은 P 휴대폰 것이 아님 (최고 기록 없음)', (await w.locator('[data-quiz-best]').count()) === 0 && (await w.locator('[data-fortune]').getAttribute('data-open')) === '0')

  // ── 7. 외주 업체 · 로그인 안 함
  const v = await mk(V)
  await go(v, '/community/play')
  ok('외주 업체는 커뮤니티로', new URL(v.url()).pathname === '/community')
  const g = await mk(null)
  await g.goto(`${D}/community/play`, { waitUntil: 'networkidle' })
  ok('로그인 안 했으면 로그인 화면 (돌아올 곳 기억)', new URL(g.url()).pathname === '/login' && new URL(g.url()).searchParams.get('next') === '/community/play')

  // ── 8. 움직임 줄이기: 뒤집기·톡 튐 없이 바로
  const r = await mk(P, { reducedMotion: 'reduce' })
  await r.addInitScript(() => { try { localStorage.removeItem('play-fortune-open') } catch {} })
  await go(r, '/community/play')
  const dur = await r.locator('[data-fortune] button').evaluate((e) => getComputedStyle(e).transitionDuration)
  ok('움직임 줄이기: 운세 뒤집기 바로 (전환 0초)', dur.split(',').every((d) => parseFloat(d) <= 0.001), dur)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
