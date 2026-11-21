// 묶음 340 (사용자 요청 2026-11-21 "커뮤니티 2단계도 진행해줘")
// · 새 말머리 '현장 썰' · '같이 가요' (말머리 줄 · 글쓰기 다섯 칸 · 같이 가요 안전 안내)
// · 투표 글: 글쓰기 '투표 넣기' 보기 2~4개 → 글 화면 투표 카드 (고르기 전엔 결과 없음 → 고르면 막대 · 바꾸기 · 다시 누르면 취소) · 목록 '📊 투표' · 고치기 화면은 투표 그대로
// · 이모지 반응 다섯 가지 (누르기·취소 · 목록에 가장 많은 반응 + 수)
// · 놀이터 출석 체크 (이번 주 7칸 · 🔥 연속 · 하루 한 번) · 커뮤니티 놀이터 줄 '출석 전' → '🔥 n일째'
// · 주간 랭킹: 참여한 사람만 별명·점수 · 참여 안 한 사람은 목록에 없음 · 그만하기 · 360px
// node scripts/qa/batch340.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011'
const P = 'bbbbbbbb-0000-4000-8000-0000003400b1', Q = 'bbbbbbbb-0000-4000-8000-0000003400b2', R = 'bbbbbbbb-0000-4000-8000-0000003400b3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const weekStart = (d) => { const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; return new Date(Date.parse(`${d}T00:00:00Z`) - dow * 864e5).toISOString().slice(0, 10) }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 가입한 지 오래된 근무자 셋 (P: 글쓴이 · Q: 투표·반응 · R: 랭킹에 참여하지 않는 사람)
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = k
  for (const [id, name, phone, nickname] of [[P, '이사공', '01034003401', '썰쟁이'], [Q, '이사이', '01034003402', '투표왕'], [R, '이사삼', '01034003403', '구경꾼']]) {
    await rest('users', 'POST', { ...ub, id, name, phone, nickname, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  }
  // P는 그제·어제 출석 (오늘 하면 3일째) — 자정 바로 앞이면 날짜가 바뀌어 건너뜀
  for (const d of [kday(-2), kday(-1)]) await rest('community_checkins', 'POST', { user_id: P, day: d })
  // R도 오늘 출석 (참여 안 했으니 랭킹에는 없어야 함)
  await rest('community_checkins', 'POST', { user_id: R, day: kday(0) })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 말머리 줄에 새 말머리 둘
  const p = await mk(P)
  await go(p, '/community')
  const tabs = one(await p.locator('[data-community-tabs]').innerText())
  ok("말머리 줄: '현장 썰' · '같이 가요'", tabs.includes('현장 썰') && tabs.includes('같이 가요'), tabs)
  ok("놀이터 줄: 오늘 출석 전이면 '출석 전'", (await p.locator('[data-play-checkin-todo]').count()) === 1 && one(await p.locator('[data-play-entry]').innerText()).includes('출석'))

  // ── 2. 글쓰기: 다섯 칸 · 같이 가요 안내 · 투표 보기 3개
  await go(p, '/community/new')
  ok('말머리 다섯 칸 (세 칸씩 두 줄) · 360px 옆으로 밀림 없음', (await p.locator('[data-post-cats] input[name=category]').count()) === 5 && (await noSide(p)))
  ok('처음엔 같이 가요 안내 없음', (await p.locator('[data-together-note]').count()) === 0)
  await p.locator('[data-post-cats] label', { hasText: '같이 가요' }).click()
  await p.locator('[data-together-note]').waitFor({ timeout: 3000 }).catch(() => {})
  ok("'같이 가요'를 고르면 안전 안내 (번호 가림 · 사람 많은 곳)", one(await p.locator('[data-together-note]').innerText().catch(() => '')).includes('사람이 많은 곳'))
  await p.locator('#post-title').fill('토요일 코엑스 행사 같이 가요')
  await p.locator('#post-body').fill('삼성역에서 만나서 같이 들어가실 분 계세요? 복장은 뭐 입으실 거예요?')
  await p.locator('[data-poll-toggle]').click()
  const inputs = p.locator('[data-poll-input]')
  ok("'투표 넣기' → 보기 칸 2개", (await inputs.count()) === 2)
  await inputs.nth(0).fill('정장')
  await inputs.nth(1).fill('편한 옷')
  await p.locator('[data-poll-add]').click()
  await inputs.nth(2).fill('아직 몰라요')
  ok('보기 더하기 → 3개 · 360px 옆으로 밀림 없음', (await inputs.count()) === 3 && (await noSide(p)))
  if (SHOTS) {
    await p.locator('[data-poll-editor]').scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/post-form-poll.png` })
  }
  await p.getByRole('button', { name: '올리기' }).click()
  await p.waitForURL((u) => /^\/community\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 15000 }).catch(() => {})
  await p.locator('[data-post-detail]').waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForLoadState('networkidle')
  const postId = new URL(p.url()).pathname.split('/').pop()
  ok('올리면 글 화면 · 투표 글 알림', /^[0-9a-f-]{36}$/.test(postId) && one(await p.locator('body').innerText()).includes('투표 글을 올렸어요') && (await p.locator('[data-poll]').count()) === 1, p.url())
  const [saved] = await rest(`community_polls?post_id=eq.${postId}`)
  ok("투표 보기 저장 ['정장','편한 옷','아직 몰라요'] · 말머리 together", JSON.stringify(saved?.options) === JSON.stringify(['정장', '편한 옷', '아직 몰라요']) && (await rest(`community_posts?id=eq.${postId}`))[0]?.category === 'together')
  ok('글쓴이는 투표 전에도 결과 (0명 참여)', (await p.locator('[data-poll-count]').count()) === 3 && one(await p.locator('[data-poll-total]').innerText()) === '0명 참여')

  // ── 3. Q: 투표 · 바꾸기 · 취소
  const q = await mk(Q)
  await go(q, `/community/${postId}`)
  const poll = q.locator('[data-poll]')
  ok('고르기 전엔 결과 숫자 없음', (await poll.count()) === 1 && (await poll.locator('[data-poll-count]').count()) === 0 && one(await poll.locator('[data-poll-hint]').innerText()).includes('하나를 고르면'))
  await poll.locator('[data-poll-option="1"]').click()
  await q.waitForTimeout(800)
  ok("'편한 옷' 고름 → 100% · 1표 · ✓ · 1명 참여", one(await poll.locator('[data-poll-option="1"]').innerText()).includes('100% · 1표') && (await poll.locator('[data-poll-option="1"]').getAttribute('aria-pressed')) === 'true' && one(await poll.locator('[data-poll-total]').innerText()) === '1명 참여')
  const barW = await poll.locator('[data-poll-option="1"] [data-poll-bar]').evaluate((e) => e.style.width)
  ok('결과 막대 100%', barW === '100%', barW)
  await go(q, `/community/${postId}`)
  ok('다시 열어도 그대로 (저장됨)', (await q.locator('[data-poll-option="1"]').getAttribute('aria-pressed')) === 'true' && (await rest(`community_poll_votes?post_id=eq.${postId}`)).length === 1)
  await q.locator('[data-poll-option="0"]').click()
  await q.waitForTimeout(800)
  const votes = await rest(`community_poll_votes?post_id=eq.${postId}`)
  ok("다른 보기('정장')를 누르면 바뀜 (한 사람 한 표)", votes.length === 1 && votes[0].choice === 0 && one(await q.locator('[data-poll-option="0"]').innerText()).includes('100% · 1표'))
  await q.locator('[data-poll-option="0"]').click()
  await q.waitForTimeout(800)
  ok('같은 보기를 다시 누르면 취소 → 0명', (await rest(`community_poll_votes?post_id=eq.${postId}`)).length === 0 && one(await q.locator('[data-poll-total]').innerText()) === '0명 참여')
  await q.locator('[data-poll-option="1"]').click()
  await q.waitForTimeout(600)

  // ── 4. 이모지 반응
  const laugh = q.locator('[data-reaction="laugh"]')
  ok('반응 다섯 가지', (await q.locator('[data-reactions] [data-reaction]').count()) === 5)
  await laugh.click()
  await q.waitForTimeout(800)
  ok("😂 누름 → 1 · 켜짐", one(await laugh.innerText()) === '😂 1' && (await laugh.getAttribute('aria-pressed')) === 'true')
  await q.locator('[data-reaction="cheer"]').click()
  await q.waitForTimeout(600)
  await q.locator('[data-reaction="cheer"]').click()
  await q.waitForTimeout(800)
  ok('💪 눌렀다 다시 누르면 취소', (await rest(`community_reactions?post_id=eq.${postId}`)).length === 1 && (await q.locator('[data-reaction="cheer"]').getAttribute('aria-pressed')) === 'false')
  ok('글 화면 360px 옆으로 밀림 없음', await noSide(q))
  if (SHOTS) {
    await poll.scrollIntoViewIfNeeded()
    await q.screenshot({ path: `${SHOTS}/post-poll-react.png` })
  }

  // 목록: 📊 투표 · 😂 1 · 같이 가요 말머리에서 보임
  await go(q, '/community?c=together')
  const card = q.locator(`a[href="/community/${postId}"]`).first()
  ok("같이 가요 목록에 그 글 · '📊 투표' · '😂 1'", (await card.count()) === 1 && (await card.locator('[data-post-poll]').count()) === 1 && one(await card.locator('[data-post-react]').innerText()) === '😂 1')

  // 고치기 화면: 투표는 그대로 (안내만)
  await go(p, `/community/${postId}/edit`)
  ok("고치기: '투표는 올린 뒤에는 고칠 수 없어요' · 투표 칸 없음", (await p.locator('[data-poll-locked]').count()) === 1 && (await p.locator('[data-poll-toggle]').count()) === 0)

  // ── 5. 놀이터 출석 체크 (P: 그제·어제 했음 → 오늘 3일째)
  await go(p, '/community/play')
  const ck = p.locator('[data-checkin]')
  ok("출석 전: '오늘 출석하기 · 🔥 3일째로' · 연속 2일째", (await ck.getAttribute('data-checkin-done')) === null && one(await p.locator('[data-checkin-go]').innerText()).includes('3일째로') && (await p.locator('[data-streak]').getAttribute('data-streak')) === '2')
  ok('이번 주 7칸 · 오늘 칸은 점선(아직)', (await p.locator('[data-checkin-week] li').count()) === 7 && (await p.locator('[data-checkin-day="today"]').count()) === 1)
  await p.locator('[data-checkin-go]').click()
  await p.locator('[data-checkin-ok]').waitFor({ timeout: 8000 }).catch(() => {})
  ok("누르면 '오늘 출석했어요' · 🔥 3일째 · 오늘 칸 ✓", (await ck.getAttribute('data-checkin-done')) === '' && (await p.locator('[data-streak]').getAttribute('data-streak')) === '3' && (await p.locator('[data-checkin-day="today"]').count()) === 0)
  const mine = (await rest(`community_checkins?user_id=eq.${P}`)).filter((r) => r.day === kday(0))
  ok('하루 한 줄만 저장', mine.length === 1)
  await go(p, '/community/play')
  ok('다시 열어도 출석함 (버튼 없음)', (await p.locator('[data-checkin-go]').count()) === 0 && (await p.locator('[data-checkin-ok]').count()) === 1)
  await go(p, '/community')
  ok("커뮤니티 놀이터 줄: '🔥 3일째'", one(await p.locator('[data-play-streak]').innerText().catch(() => '')) === '🔥 3일째')

  // ── 6. 주간 랭킹: P 참여 → 별명·점수 · R(참여 안 함)은 없음
  await go(p, '/community/play')
  const rank = p.locator('[data-rank]')
  ok('참여 전: 참여하기 버튼 · 별명·점수만 보인다는 안내', (await rank.locator('[data-rank-join] button').count()) === 1 && one(await rank.innerText()).includes('별명과 이번 주 점수만'))
  await rank.locator('[data-rank-join] button').click()
  await p.waitForURL((u) => u.searchParams.has('m'), { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(400)
  const ws = weekStart(kday(0))
  const days = [kday(-2), kday(-1), kday(0)].filter((d) => d >= ws).length
  const expect = days * 10 + 5 // 출석 + 이번 주 글 1개
  const meRow = p.locator('[data-rank-me]')
  ok(`참여하면 내 줄: '썰쟁이' · ${expect}점 · '나'`, (await meRow.count()) === 1 && one(await meRow.innerText()).includes('썰쟁이') && one(await meRow.locator('[data-rank-points]').innerText()) === `${expect}점`, one(await meRow.innerText().catch(() => '')))
  ok('참여 안 한 사람(구경꾼)은 목록에 없음', !one(await rank.innerText()).includes('구경꾼'))
  ok("점수 규칙 줄 · '그만하기'", one(await p.locator('[data-rank-rules]').innerText()).includes('출석 10') && (await rank.locator('[data-rank-leave] button').count()) === 1)
  ok('놀이터 360px 옆으로 밀림 없음', await noSide(p))
  if (SHOTS) {
    await p.locator('[data-checkin]').scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/play-checkin.png` })
    await rank.scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/play-rank.png` })
  }
  // 출석 카드: 랭킹에 참여 중이면 '+10점'
  ok("랭킹 참여 중이면 출석 줄에 '랭킹 +10점'", one(await p.locator('[data-checkin-ok]').innerText()).includes('랭킹 +10점'))

  // Q: 참여 → 점수 0이면 맨 아래 '⋮' 다음에 내 줄
  await go(q, '/community/play')
  await q.locator('[data-rank-join] button').click()
  await q.waitForURL((u) => u.searchParams.has('m'), { timeout: 10000 }).catch(() => {})
  await q.waitForTimeout(400)
  ok("Q: 1위는 썰쟁이 · 내 줄(0점)은 따로", one(await q.locator('[data-rank-row="1"]').first().innerText()).includes('썰쟁이') && one(await q.locator('[data-rank-me]').innerText()).includes('0점'))

  // P 그만하기 → 목록에서 빠짐
  await go(p, '/community/play')
  await p.locator('[data-rank-leave] button').click()
  await p.waitForURL((u) => u.searchParams.get('m')?.includes('그만'), { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(400)
  ok('그만하면 내 줄 없음 · 참여하기 버튼 다시', (await p.locator('[data-rank-me]').count()) === 0 && (await p.locator('[data-rank-join] button').count()) === 1 && (await rest(`community_rank_members?user_id=eq.${P}`)).length === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
