// 묶음 328 (정기 개선 2026-11-20 19:35 KST)
// · 회사 후기 화면: 내가 이 회사에서 일을 마친(퇴근 기록 있는) 공고 중 후기를 안 쓴 게 있으면 바로 '⭐ 후기 쓰기'
//   후기가 없으면 빈 화면 안에 버튼 + 공고 이름 · 후기가 있으면 목록 위 한 줄 '내 후기 남기기 · 공고 → 쓰기'
//   근무 중(퇴근 전)·이미 쓴 공고·다른 회사·관리자 계정엔 없음 (지난 근무의 '후기 쓰기'와 같은 기준 · 내 기록만)
// · 빈 화면 안내 글 줄 길이 고르게 (마지막 줄에 '주세요.'만 남지 않게 · 앱 전체 Empty)
// node scripts/qa/batch328.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006', C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-0000003280c2', J2 = 'cccccccc-0000-4000-8000-0000003280a2', J3 = 'cccccccc-0000-4000-8000-0000003280a3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
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
  const CO = `/community/company/${C1}`

  // ── 1. 근무 중(퇴근 전)이면 아직 없음 · 원래 안내 그대로
  const w = await mk(W)
  await go(w, CO)
  ok('퇴근 전이면 후기 쓰기 버튼 없음 (원래 안내)', (await w.locator('[data-review-cta]').count()) === 0 && (await w.locator('main').textContent()).includes('지난 근무에서 첫 후기를 남겨 주세요'))
  ok('빈 화면 안내 글: 줄 길이 고르게 (text-wrap balance)', await w.evaluate(() => { const e = document.querySelector('[data-empty] > div, .card > div.text-mute'); return !!e && getComputedStyle(e).textWrap.includes('balance') }))

  // ── 2. 퇴근하면: 빈 화면 안에 '⭐ 후기 쓰기' + 공고 이름 → 후기 쓰는 화면
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { clock_out: new Date().toISOString() })
  await go(w, CO)
  const cta = w.locator('[data-review-cta]')
  ok("일을 마친 공고: '⭐ 후기 쓰기' (그 공고로)", (await cta.count()) === 1 && one(await cta.textContent()) === '⭐ 후기 쓰기' && (await cta.getAttribute('href')) === `/me/review/${J}`)
  ok('버튼 아래 공고 이름', one(await w.locator('[data-review-cta-job]').textContent()).includes('행사장 안내 스태프'))
  ok('360px 옆으로 밀림 없음', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/review-cta-empty.png` })
  await cta.click()
  await w.waitForURL((u) => u.pathname === `/me/review/${J}`, { timeout: 15000 }).catch(() => {})
  await w.waitForLoadState('networkidle')
  await w.locator('textarea').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 그 공고 후기 쓰는 화면 (쓰기 칸이 열림)', new URL(w.url()).pathname === `/me/review/${J}` && (await w.locator('[data-review-blocked]').count()) === 0 && (await w.locator('textarea').count()) >= 1)

  // ── 3. 그 공고 후기를 쓰면 버튼 없음 · 다른 일한 공고가 있으면 목록 위 한 줄
  await rest('company_reviews', 'POST', { company_id: C1, job_id: J, author_id: W, rating: 5, body: '안내 잘 받았어요. 담당자분이 친절해요', hidden_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  await go(w, CO)
  ok('이미 쓴 공고뿐이면 버튼 없음 · 후기 목록', (await w.locator('[data-review-cta]').count()) === 0 && (await w.locator('[data-review-list] li').count()) === 1)
  const [j0] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j0, id: J2, title: '테스트 회사 지난 주말 행사', start_date: kday(-3), end_date: kday(-3), status: 'closed', applications: [], created_at: '2026-11-01T00:00:00Z' })
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000003280e2', job_id: J2, user_id: W, company_id: C1, work_date: kday(-3), clock_in: new Date(Date.now() - 3 * 864e5).toISOString(), clock_out: new Date(Date.now() - 3 * 864e5 + 8 * 3600e3).toISOString(), paid: false, created_at: '2026-11-17T00:00:00Z' })
  await go(w, CO)
  const row = w.locator('[data-review-cta]')
  ok("후기가 있으면 목록 위 한 줄 '내 후기 남기기 · 공고 → 쓰기'", (await row.count()) === 1 && one(await row.innerText()).startsWith('⭐ 내 후기 남기기') && one(await row.innerText()).includes('테스트 회사 지난 주말 행사') && one(await row.innerText()).endsWith('쓰기 →') && (await row.getAttribute('href')) === `/me/review/${J2}`)
  ok('한 줄은 목록보다 위', await w.evaluate(() => document.querySelector('[data-review-cta]').getBoundingClientRect().top < document.querySelector('[data-review-list]').getBoundingClientRect().top))
  ok('360px 옆으로 밀림 없음 (한 줄)', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/review-cta-row.png` })

  // ── 4. 다른 회사 · 관리자 계정: 없음
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼이팔행사', verified: true, created_at: '2026-10-15T00:00:00Z' })
  await rest('jobs', 'POST', { ...j0, id: J3, company_id: C2, company: { company_name: '삼이팔행사' }, title: '삼이팔 공고', applications: [], created_at: '2026-11-01T00:00:00Z' })
  await go(w, `/community/company/${C2}`)
  ok('일 안 한 회사: 버튼 없음 (원래 안내)', (await w.locator('[data-review-cta]').count()) === 0 && (await w.locator('main').textContent()).includes('지난 근무에서 첫 후기를'))
  const a = await mk(A)
  await go(a, CO)
  ok('관리자 계정: 후기 쓰기 버튼 없음', (await a.locator('[data-review-cta]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
