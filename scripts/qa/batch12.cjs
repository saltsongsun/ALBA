// 묶음 12: 공고 목록 카드에 회사 별점(★4.5 (2), 회원만) · 회사 후기 정렬(최신·별점 높은·낮은)
// node scripts/qa/batch12.cjs <default 앱> <default 가짜>
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
const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString()

;(async () => {
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
  const w = await pg(W)

  // 후기 없으면 별점 없음
  await w.goto(`${D}/`)
  ok('후기 없는 회사: 카드에 별점 없음', (await w.locator('[data-card-rating]').count()) === 0)

  await rest('company_reviews', 'POST', [
    { company_id: CO, job_id: J, author_id: AP, rating: 5, body: '최고였어요 다음에도 할래요', hidden_at: null, created_at: ago(30) },
    { company_id: CO, job_id: J, author_id: W, rating: 2, body: '쉬는 시간이 짧았어요', hidden_at: null, created_at: ago(2) },
    { company_id: CO, job_id: J, author_id: 'x', rating: 1, body: '가려진 후기', hidden_at: new Date().toISOString(), created_at: ago(1) },
  ])

  // ── 1. 공고 목록 카드 별점 ──
  await w.goto(`${D}/`)
  const chip = w.locator('[data-card-rating]').first()
  ok('카드에 ★3.5 (2) (가려진 후기 빼고)', (await chip.count()) === 1 && /★3\.5\s*\(2\)/.test(await chip.innerText()), await chip.innerText().catch(() => ''))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const guest = await pg(null)
  await guest.goto(`${D}/`)
  ok('비회원: 카드에 별점 없음', (await guest.locator('[data-card-rating]').count()) === 0)

  // ── 2. 회사 후기 정렬 ──
  const first = () => w.locator('[data-review-list] li').first().innerText()
  await w.goto(`${D}/community/company/${CO}`)
  ok('최신순(기본): 맨 위가 최근 후기', (await first()).includes('쉬는 시간이 짧았어요') && (await w.locator('[data-review-sort] a[aria-current=page]').innerText()) === '최신순')
  await w.locator('[data-review-sort] a', { hasText: '별점 높은순' }).click()
  await w.waitForURL(/s=high/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-review-sort] a[aria-current=page]', { hasText: '별점 높은순' }).waitFor({ timeout: 8000 }).catch(() => {})
  ok('별점 높은순: 맨 위가 5점', (await first()).includes('최고였어요'))
  await w.locator('[data-review-sort] a', { hasText: '별점 낮은순' }).click()
  await w.waitForURL(/s=low/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-review-sort] a[aria-current=page]', { hasText: '별점 낮은순' }).waitFor({ timeout: 8000 }).catch(() => {})
  ok('별점 낮은순: 맨 위가 2점, 가려진 후기 없음', (await first()).includes('쉬는 시간이 짧았어요') && !(await w.locator('[data-review-list]').innerText()).includes('가려진 후기'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
