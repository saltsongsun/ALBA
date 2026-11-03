// 묶음 8: 공고 화면에 최근 후기 한 줄 미리보기(회원만) · 후기 별을 누르면 한마디가 바뀜
// node scripts/qa/batch8.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  await rest('company_reviews', 'POST', { company_id: CO, job_id: J, author_id: AP, rating: 5, body: '급여가 약속한 날 들어왔어요. 담당자분도 친절해요', hidden_at: null })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 공고 화면: 최근 후기 미리보기 ──
  const w = await pg(W)
  await w.goto(`${D}/jobs/${J}`)
  const pv = w.locator('[data-review-preview]')
  ok('공고 화면: 최근 후기 한 줄 + 별명', (await pv.count()) === 1 && (await pv.innerText()).includes('약속한 날') && (await pv.innerText()).includes('새벽스태프') && (await pv.innerText()).includes('★★★★★'), await pv.innerText().catch(() => ''))
  ok('누르면 회사 후기 화면', (await pv.getAttribute('href')) === `/community/company/${CO}`)
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const guest = await pg(null)
  await guest.goto(`${D}/jobs/${J}`)
  ok('비회원: 후기 미리보기 없음', (await guest.locator('[data-review-preview]').count()) === 0)

  // ── 2. 후기 별 한마디 ──
  await w.goto(`${D}/me/review/${J}`)
  const label = w.locator('[data-rating-label]')
  ok('처음: 별을 눌러 골라 주세요', (await label.innerText()).includes('별을 눌러'))
  const stars = w.locator('[data-review-form] [role=radio]')
  await stars.nth(4).click()
  ok('별 5개: 최고였어요', (await label.innerText()).includes('최고였어요'))
  await stars.nth(1).click()
  ok('별 2개: 아쉬웠어요', (await label.innerText()).includes('아쉬웠어요'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
