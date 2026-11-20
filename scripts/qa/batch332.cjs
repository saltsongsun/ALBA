// 묶음 332 (정기 개선 2026-11-21 03:35 KST · 놀이터 퀴즈·들어가는 곳)
// · 퀴즈: 이 휴대폰에서 안 나온 문제 먼저 (16문제 → 세 판 15문제가 모두 다름) · 다 나오면 처음부터 다시
// · 결과 화면: '틀린 문제 n개 다시 보기' (접어 둠 · 열면 문제 + 정답 + 풀이) · 다 맞으면 없음
// · 커뮤니티 '🎮 놀이터' 줄: 오늘의 운세를 아직 안 열었으면 작은 점 · 열면 사라짐 · 360px · 움직임 줄이기면 깜빡임 없음
// node scripts/qa/batch332.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
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
  // 한 판: pick 번째 보기를 계속 고름 (3번째 보기(0부터 3)는 어느 문제의 정답도 아님 → 모두 틀림)
  const round = async (p, pick) => {
    await p.locator('[data-quiz-start], [data-quiz-again]').first().click()
    const qs = []
    for (let i = 0; i < 5; i++) {
      await p.locator('[data-quiz="play"]').waitFor()
      qs.push(one(await p.locator('[data-quiz-q]').innerText()))
      await p.locator('[data-quiz="play"] [data-quiz-choice]').nth(pick).click()
      await p.locator('[data-quiz-next]').click()
    }
    await p.locator('[data-quiz="done"]').waitFor()
    return qs
  }

  // ── 1. 커뮤니티 '놀이터' 줄의 점: 운세를 안 열었으면 있음 → 열면 사라짐
  const p = await mk(K)
  await go(p, '/community')
  const dot = p.locator('[data-play-entry] [data-play-dot]')
  ok("운세 안 연 날: '놀이터' 줄에 작은 점", (await dot.count()) === 1 && (await dot.getAttribute('aria-label')) === '오늘의 운세를 아직 안 봤어요')
  ok('놀이터 줄 한 줄 · 옆으로 안 밀림', (await p.locator('[data-play-entry]').evaluate((e) => e.getBoundingClientRect().height < 50)) && (await noSide(p)))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/community-dot.png` })
  await p.locator('[data-play-entry]').click()
  await p.waitForURL(/\/community\/play/, { timeout: 10000 })
  await p.locator('[data-fortune] button').click()
  await p.waitForTimeout(400)
  await go(p, '/community')
  ok('운세를 열면 점이 사라짐', (await p.locator('[data-play-dot]').count()) === 0 && (await p.locator('[data-play-entry]').count()) === 1)

  // ── 2. 안 나온 문제 먼저: 세 판(15문제) 모두 다름
  await go(p, '/community/play')
  const r1 = await round(p, 3)
  const done = p.locator('[data-quiz="done"]')
  ok('모두 틀림(정답이 아닌 보기만): 0/5', (await done.getAttribute('data-quiz-score')) === '0')
  // ── 3. 틀린 문제 다시 보기 (접어 둠 → 열면 5개 · 정답 + 풀이)
  const rv = p.locator('[data-quiz-review]')
  ok("결과에 '틀린 문제 5개 다시 보기' (처음엔 접힘)", (await rv.count()) === 1 && one(await rv.locator('summary').innerText()) === '틀린 문제 5개 다시 보기' && !(await rv.evaluate((e) => e.open)))
  await rv.locator('summary').click()
  await p.waitForTimeout(250)
  const items = rv.locator('[data-quiz-review-item]')
  const firstItem = one(await items.first().innerText())
  ok('열면 틀린 문제 5개 · 각 문제에 정답과 풀이', (await items.count()) === 5 && firstItem.startsWith('Q. ') && firstItem.includes('정답 · ') && r1.some((q) => firstItem.includes(q.replace(/^Q\. /, ''))), firstItem)
  ok('360px 옆으로 밀림 없음 (틀린 문제 펼침)', await noSide(p))
  if (SHOTS) {
    await rv.scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/quiz-review.png` })
  }
  const r2 = await round(p, 3)
  const r3 = await round(p, 3)
  const all = [...r1, ...r2, ...r3]
  ok('세 판 15문제가 모두 다름 (안 나온 문제 먼저)', new Set(all).size === 15, String(new Set(all).size))
  const seenLen = await p.evaluate(() => JSON.parse(localStorage.getItem('play-quiz-seen') ?? '[]').length)
  ok('나온 문제 기록 15개 (이 휴대폰에만)', seenLen === 15, String(seenLen))
  // 네 번째 판: 남은 1문제가 먼저 나오고, 16문제를 다 보면 기록은 이번 판 것만 남음 (새로 시작)
  const r4 = await round(p, 3)
  ok('네 번째 판: 안 나온 마지막 1문제 포함', r4.some((q) => !all.includes(q)))
  const seen4 = await p.evaluate(() => JSON.parse(localStorage.getItem('play-quiz-seen') ?? '[]').length)
  ok('16문제를 다 보면 기록을 새로 시작 (이번 판 5문제만)', seen4 === 5, String(seen4))

  // ── 4. 다 맞으면 '틀린 문제' 칸 없음 (정답을 미리 알 수 없으니: 고른 뒤 정답 보기를 확인하며 진행)
  await p.locator('[data-quiz-again]').click()
  for (let i = 0; i < 5; i++) {
    await p.locator('[data-quiz="play"]').waitFor()
    // 화면 코드에서 정답을 알 수 없어 한 번 고르고 결과를 봄 → 틀렸으면 이 판은 '다 맞음' 확인에서 제외
    await p.locator('[data-quiz="play"] [data-quiz-choice]').nth(1).click()
    await p.locator('[data-quiz-next]').click()
  }
  await p.locator('[data-quiz="done"]').waitFor()
  const sc = Number(await p.locator('[data-quiz="done"]').getAttribute('data-quiz-score'))
  ok(`틀린 수만큼만 다시 보기 (점수 ${sc}/5)`, sc === 5 ? (await p.locator('[data-quiz-review]').count()) === 0 : one(await p.locator('[data-quiz-review] summary').innerText()) === `틀린 문제 ${5 - sc}개 다시 보기`)

  // ── 5. 움직임 줄이기: 점은 깜빡이지 않음 (깜빡이는 겹은 숨김)
  const r = await mk(K, { reducedMotion: 'reduce' })
  await go(r, '/community')
  const ping = r.locator('[data-play-dot] > span').first()
  ok('움직임 줄이기: 점만 (깜빡이는 겹 숨김)', (await r.locator('[data-play-dot]').count()) === 1 && (await ping.evaluate((e) => getComputedStyle(e).display)) === 'none')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
