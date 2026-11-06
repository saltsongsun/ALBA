// 묶음 94: 운영자 전체 스위치 — '함께 일한 사람(내 지원 보여 주기)'(처음엔 꺼짐) · '공고에 회사 후기 보이기'(처음엔 켜짐)
// (사용자 요청 "동료맺기 기능은 켜고 끄게 해줘" · "근무자 뷰에서 공고에 회사후기가 보이는 거는 켜고 끄게 해줘")
// · 처음(기록 없음) = 꺼짐: 커뮤니티에 메뉴 없음 · 화면은 '지금은 쓰지 않는 기능이에요' · 이미 고른 기록이 있어도 아무것도 안 보임
// · 최상위 관리자 '커뮤니티 관리'에서 켜기 → 메뉴·동료 지원 표시가 보임 · 끄기(두 번) → 다시 숨음 (고른 기록은 남음)
// node scripts/qa/batch94.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 새벽스태프(AP)가 이 공고에 지원했고 주차왕(W)에게 지원을 보여 주기로 해 둠 · 둘 다 같은 공고에서 출근
  await rest('attendance', 'POST', { job_id: J, user_id: AP, work_date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), clock_in: new Date().toISOString(), clock_out: null })
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  await rest('coworker_links', 'POST', { from_id: AP, to_id: W })
  await rest('company_reviews', 'POST', { company_id: '99999999-0000-4000-8000-000000000099', job_id: J, author_id: AP, rating: 5, body: '급여가 약속한 날 들어왔어요', hidden_at: null })

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
  const w = await pg(W)
  const a = await pg(A)
  const state = async () => {
    await w.goto(`${D}/community`)
    await w.locator('main').waitFor()
    await w.waitForTimeout(500)
    const link = await w.locator('[data-coworkers-link]').count()
    await w.goto(`${D}/jobs/${J}`)
    await w.locator('main').waitFor()
    await w.waitForTimeout(500)
    const pal = await w.locator('[data-coworkers-on-job]').count()
    return { link, pal }
  }

  // ── 1. 처음엔 꺼짐 ──
  const s0 = await state()
  ok('처음엔 꺼짐: 커뮤니티에 메뉴 없음 · 공고 화면에 동료 표시 없음 (고른 기록이 있어도)', s0.link === 0 && s0.pal === 0, JSON.stringify(s0))
  await w.goto(`${D}/community/coworkers`)
  ok("꺼져 있을 때 화면: '지금은 쓰지 않는 기능이에요'", await w.locator('[data-coworkers-off]').isVisible().catch(() => false))

  // ── 2. 최상위 관리자가 켬 ──
  await a.goto(`${D}/admin/community`)
  const sw = a.locator('[data-feature=coworkers]')
  await sw.waitFor({ timeout: 10000 }).catch(() => {})
  ok("커뮤니티 관리: '함께 일한 사람 · 꺼짐' + 켜기", (await sw.getAttribute('data-on')) === 'off' && (await sw.getByRole('button', { name: '켜기' }).count()) === 1)
  ok('360px: 옆으로 안 밀림 (커뮤니티 관리)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await sw.getByRole('button', { name: '켜기' }).click()
  await a.getByText('보여 주기\'을 켰어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("켜기 → '켰어요' 안내 · 켜짐", (await a.locator('[data-feature=coworkers]').getAttribute('data-on')) === 'on')
  ok('켠 기록이 남음', (await rest('audit_logs')).some((r) => r.action === 'feature.coworkers' && r.detail === 'on' && r.actor_id === A))
  const s1 = await state()
  ok('켜면: 커뮤니티 메뉴 + 공고 화면 동료 표시', s1.link === 1 && s1.pal === 1, JSON.stringify(s1))

  // ── 3. 다시 끔 ──
  await a.goto(`${D}/admin/community`)
  await a.locator('[data-feature=coworkers]').getByRole('button', { name: '끄기' }).click()
  await a.locator('[data-feature=coworkers]').getByRole('button', { name: '한 번 더 누르면 꺼요' }).click()
  await a.getByText('보여 주기\'을 껐어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  const s2 = await state()
  ok('끄면: 다시 숨음', s2.link === 0 && s2.pal === 0, JSON.stringify(s2))
  ok('고른 기록은 남아 있음 (다시 켜면 이어짐)', (await rest('coworker_links')).some((l) => l.from_id === AP && l.to_id === W))

  // ── 4. 공고에 회사 후기 보이기: 처음엔 켜짐 → 끄면 공고 화면·목록에서 숨음 ──
  const reviews = async () => {
    await w.goto(`${D}/jobs/${J}`)
    await w.locator('main').waitFor()
    await w.waitForTimeout(500)
    const detail = (await w.locator('[data-review-preview]').count()) + (await w.locator('[data-company-rating-badge]').count())
    await w.goto(`${D}/`)
    await w.locator('main').waitFor()
    await w.waitForTimeout(500)
    return { detail, card: await w.locator('[data-card-rating]').count() }
  }
  const r0 = await reviews()
  ok('공고 후기는 처음엔 켜짐: 공고 화면 별점·최근 후기 + 목록 카드 별점', r0.detail >= 1 && r0.card >= 1, JSON.stringify(r0))
  await a.goto(`${D}/admin/community`)
  const rv = a.locator('[data-feature=job_reviews]')
  await rv.waitFor({ timeout: 10000 }).catch(() => {})
  ok("커뮤니티 관리: '공고에 회사 후기 보이기 · 켜짐'", (await rv.getAttribute('data-on')) === 'on')
  await rv.getByRole('button', { name: '끄기' }).click()
  await rv.getByRole('button', { name: '한 번 더 누르면 꺼요' }).click()
  await a.getByText('후기 보이기\'을 껐어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  const r1 = await reviews()
  ok('끄면: 공고 화면·목록에서 회사 후기 숨음', r1.detail === 0 && r1.card === 0, JSON.stringify(r1))
  await w.goto(`${D}/community/company/99999999-0000-4000-8000-000000000099`)
  ok('커뮤니티의 회사 후기는 그대로', (await w.getByText('급여가 약속한 날 들어왔어요').count()) >= 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
