// 묶음 14: 관리자 공고 화면 '⭐ 근무자 후기'(이 공고·이 회사 것만, 가려진 것 빼고) · 긴 화면 '맨 위로' 버튼
// node scripts/qa/batch14.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 관리자 공고 화면 후기 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/jobs/${J}`)
  ok('후기 없으면 표시 없음', (await ad.locator('[data-job-reviews]').count()) === 0)
  await rest('company_reviews', 'POST', [
    { company_id: CO, job_id: J, author_id: AP, rating: 5, body: '담당자분이 정말 친절했어요', hidden_at: null },
    { company_id: CO, job_id: J, author_id: W, rating: 4, body: '휴게 시간이 잘 지켜졌어요', hidden_at: null },
    { company_id: CO, job_id: J, author_id: 'x', rating: 1, body: '가려진 후기', hidden_at: new Date().toISOString() },
  ])
  await ad.reload()
  const box = ad.locator('[data-job-reviews]')
  ok('⭐ 근무자 후기 4.5 · 2개', (await box.count()) === 1 && /4\.5/.test(await box.locator('summary').innerText()) && /2개/.test(await box.locator('summary').innerText()))
  await box.locator('summary').click()
  const text = await box.innerText()
  ok('후기 내용, 가려진 후기·이름 없음', text.includes('정말 친절') && text.includes('휴게 시간') && !text.includes('가려진 후기') && !text.includes('김지원'))
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 맨 위로 ──
  const w = await pg(W)
  for (let i = 0; i < 12; i++) await rest('community_posts', 'POST', { author_id: AP, category: 'free', title: `긴 목록 글 ${i + 1}`, body: '내용 '.repeat(40), hidden_at: null, created_at: new Date(Date.now() - i * 60_000).toISOString() })
  await w.goto(`${D}/community`)
  await w.waitForLoadState('networkidle').catch(() => {})
  ok('맨 위에서는 버튼 없음', (await w.locator('[data-scroll-top]').count()) === 0)
  await w.evaluate(() => window.scrollTo(0, 2000))
  await w.locator('[data-scroll-top]').waitFor({ timeout: 3000 }).catch(() => {})
  ok('많이 내리면 맨 위로 버튼', (await w.locator('[data-scroll-top]').count()) === 1)
  const nav = await w.locator('nav[data-bottom-nav]').boundingBox()
  const btn = await w.locator('[data-scroll-top]').boundingBox()
  ok('아래 탭과 겹치지 않음', !!nav && !!btn && btn.y + btn.height <= nav.y)
  await w.locator('[data-scroll-top]').click()
  await w.waitForFunction(() => window.scrollY < 50, null, { timeout: 4000 }).catch(() => {})
  ok('누르면 맨 위로', (await w.evaluate(() => window.scrollY)) < 50)
  await w.locator('[data-scroll-top]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
  ok('맨 위에 오면 버튼 사라짐', (await w.locator('[data-scroll-top]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
