// 묶음 321 (정기 개선 2026-11-20 04:35 KST)
// · 전에 확정돼 일한 회사의 공고: 홈 공고 카드와 공고 화면 회사 줄에 '✓ 일했던 곳' (확인된 회사 표시 자리에 · 줄이 길어지지 않게)
//   홈 '일했던 회사' 거르기와 같은 기준 (확정 + 근무 시작 · 취소 공고 빼고) · 공고 화면은 그 공고 말고 다른 공고로 셈
//   로그인 전 · 지원만 한 회원에게는 없음
// · 공고 화면 지도 버튼: 같은 너비 칸 (4개면 2×2 · 3개면 한 줄) — 360px에서 '주소 복사'만 아랫줄로 떨어지던 것
// node scripts/qa/batch321.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000321c2'
const J2 = 'cccccccc-0000-4000-8000-0000000321a2', J3 = 'cccccccc-0000-4000-8000-0000000321a3', J5 = 'cccccccc-0000-4000-8000-0000000321a5'
const W4 = 'bbbbbbbb-0000-4000-8000-0000000321b4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, verified: true, created_at: '2026-10-15T00:00:00Z' })
  const [j0] = await rest(`jobs?id=eq.${J}`)
  const mkJob = (id, co, name, title, s, e, extra = {}) => ({ ...j0, id, company_id: co, company: { company_name: name, verified: true }, title, event_name: title, start_date: s, end_date: e, status: 'open', applications: [], created_at: '2026-11-01T00:00:00Z', ...extra })
  await rest('jobs', 'POST', mkJob(J2, C2, '남의회사', '남의회사 축제 주차 안내', kday(1), kday(1)))
  await rest('jobs', 'POST', mkJob(J3, C1, '주식회사 테스트', '테스트 회사 다음 행사 안내', kday(3), kday(3)))
  // 좌표 없는 공고 (길찾기 없이 지도 버튼 3개)
  await rest('jobs', 'POST', mkJob(J5, C2, '남의회사', '남의회사 좌표 없는 행사', kday(2), kday(2), { lat: null, lng: null }))
  const [u] = await rest(`users?id=eq.${W}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: W4, name: '새근무자', phone: '01032103214', photo_at: new Date().toISOString(), created_at: '2026-10-20T00:00:00Z' })
  await rest('applications', 'POST', { id: 'dddddddd-0000-4000-8000-0000000321d4', job_id: J3, user_id: W4, status: 'applied', available_dates: null, job: { id: J3, title: '테스트 회사 다음 행사 안내', start_date: kday(3), end_date: kday(3), start_time: '09:00:00', end_time: '18:00:00', status: 'open', company_id: C1, audience: 'worker' }, created_at: '2026-11-10T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: D })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(400) }
  const card = (p, id) => p.locator(`a[href="/jobs/${id}"]`).first()

  // ── 1. 홈: 테스트 회사(일한 곳) 공고 카드에만 '✓ 일했던 곳'
  const w = await mk(W)
  await go(w, '/')
  const m3 = one(await card(w, J3).textContent())
  ok("일한 회사 공고 카드: '✓ 일했던 곳'", (await card(w, J3).locator('[data-card-worked]').count()) === 1 && m3.includes('✓ 일했던 곳'), m3.slice(0, 80))
  ok("같은 줄에 '확인된 회사'는 되풀이하지 않음", !m3.includes('확인된 회사'))
  const m2 = one(await card(w, J2).textContent())
  ok("다른 회사 공고 카드: 표시 없음 (확인된 회사는 그대로)", (await card(w, J2).locator('[data-card-worked]').count()) === 0 && m2.includes('✓ 확인된 회사'), m2.slice(0, 80))
  ok('회사 줄이 한 줄 그대로 (넘치면 말줄임)', await card(w, J3).evaluate((a) => { const p = a.querySelector('[data-card-worked]').parentElement; return p.getBoundingClientRect().height < 24 }))
  if (SHOTS) {
    await card(w, J3).scrollIntoViewIfNeeded()
    await w.screenshot({ path: `${SHOTS}/home-worked.png` })
  }

  // ── 2. 공고 화면: 일한 회사의 다른 공고면 회사 줄에 '✓ 일했던 곳'
  await go(w, `/jobs/${J3}`)
  const line = w.locator('[data-company-line]')
  ok("공고 화면 회사 줄: '✓ 일했던 곳'", (await line.locator('[data-job-worked]').count()) === 1 && !one(await line.textContent()).includes('확인된 회사'), one(await line.textContent()))
  ok('아래 다른 공고 카드: 일한 회사만 표시', (await card(w, J).locator('[data-card-worked]').count()) === 1 && (await card(w, J2).locator('[data-card-worked]').count()) === 0)
  // 지금 이 공고만 확정(다른 곳에서 일한 적 없음)이면 표시 없음
  await go(w, `/jobs/${J}`)
  ok("이 공고 말고는 일한 적 없으면 회사 줄에 표시 없음 ('확인된 회사'는 그대로)", (await w.locator('[data-company-line] [data-job-worked]').count()) === 0)

  // ── 3. 지도 버튼: 4개면 2×2 같은 너비 · 3개면 한 줄
  await go(w, `/jobs/${J3}`)
  const grid = w.locator('[data-map-buttons]')
  await grid.scrollIntoViewIfNeeded()
  const g4 = await grid.evaluate((el) => {
    const r = [...el.children].map((c) => c.getBoundingClientRect())
    return { n: r.length, tops: [...new Set(r.map((x) => Math.round(x.top)))].length, widths: [...new Set(r.map((x) => Math.round(x.width)))].length, wrapped: [...el.children].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().height > 48) }
  })
  ok('지도 버튼 4개: 2줄 × 2칸 · 모두 같은 너비 · 글자 안 넘침', g4.n === 4 && g4.tops === 2 && g4.widths === 1 && !g4.wrapped, JSON.stringify(g4))
  ok('360px 옆으로 밀림 없음 (공고 화면)', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/map-4.png` })
  // 주소 복사는 그대로 동작 ('복사됨 ✓')
  const copy = grid.getByRole('button', { name: '주소 복사' })
  await copy.click()
  const copied = await grid.getByText('복사됨 ✓').waitFor({ timeout: 3000 }).then(() => true, () => false)
  const clip = await w.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok("'주소 복사' 누르면 '복사됨 ✓' · 주소가 복사됨", copied && clip === '서울 중구', clip)
  await go(w, `/jobs/${J5}`)
  const g3 = await w.locator('[data-map-buttons]').evaluate((el) => {
    const r = [...el.children].map((c) => c.getBoundingClientRect())
    return { n: r.length, tops: [...new Set(r.map((x) => Math.round(x.top)))].length, wrapped: [...el.children].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().height > 48) }
  })
  ok('좌표 없는 공고: 버튼 3개가 한 줄 · 글자 안 넘침', g3.n === 3 && g3.tops === 1 && !g3.wrapped, JSON.stringify(g3))

  // ── 4. 로그인 전 · 지원만 한 회원: 표시 없음
  const g = await mk(null)
  await go(g, '/')
  ok("로그인 전 홈: '일했던 곳' 없음", (await g.locator('[data-card-worked]').count()) === 0)
  await go(g, `/jobs/${J3}`)
  ok("로그인 전 공고 화면: '일했던 곳' 없음", (await g.locator('[data-job-worked], [data-card-worked]').count()) === 0)
  const w4 = await mk(W4)
  await go(w4, '/')
  ok("지원만 한 회원: '일했던 곳' 없음 (확정돼 일한 곳만)", (await w4.locator('[data-card-worked]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
