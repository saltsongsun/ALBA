// 묶음 320 (정기 개선 2026-11-20 02:35 KST)
// · 근무자 홈 거르기 칩 '🏢 일했던 회사': 전에 확정돼 일한 회사(근무가 시작된 공고 · 취소 공고는 빼고)의 공고만
//   그 회사 공고가 목록에 있을 때만 칩이 보임 · 회원만 · 회사 공고 모음(?co=)에서는 없음 (이미 한 회사)
//   맞는 공고가 없으면 빈 화면에서 '다른 회사도 · n개 →'로 바로 풀기
// · 켜진 칩이 줄 오른쪽 밖에 숨어 있으면 보이게 밀어 줌 (링크로 켠 채 들어오거나 새로 고쳤을 때)
// · 거르기를 두 개 넘게 켜면 '조건에 맞는 공고 n개' 줄 오른쪽에 '모두 풀기 ✕' (한 번에 처음으로)
// node scripts/qa/batch320.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000320c2', C3 = '99999999-0000-4000-8000-0000000320c3'
const J2 = 'cccccccc-0000-4000-8000-0000000320a2', J3 = 'cccccccc-0000-4000-8000-0000000320a3', JP = 'cccccccc-0000-4000-8000-0000000320a9'
const W3 = 'bbbbbbbb-0000-4000-8000-0000000320b3', W4 = 'bbbbbbbb-0000-4000-8000-0000000320b4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // ── 회사 둘 더 (남의회사: 지금 공고 있음 · 옛회사: 지난 공고만) + 공고
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, verified: true, created_at: '2026-10-15T00:00:00Z' })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '옛회사', seal_image: null, verified: true, created_at: '2026-10-16T00:00:00Z' })
  const [j0] = await rest(`jobs?id=eq.${J}`)
  const mkJob = (id, co, name, title, s, e, status = 'open') => ({ ...j0, id, company_id: co, company: { company_name: name }, title, event_name: title, start_date: s, end_date: e, status, applications: [], created_at: '2026-11-01T00:00:00Z' })
  await rest('jobs', 'POST', mkJob(J2, C2, '남의회사', '남의회사 축제 주차 안내', kday(1), kday(1)))
  await rest('jobs', 'POST', mkJob(J3, C1, '주식회사 테스트', '테스트 회사 다음 행사 안내', kday(3), kday(3)))
  // 옛회사 지난 공고(JP)는 근무자 지원 기록에만 (가짜 DB는 끝난 날짜로 공고 목록을 거르지 않아서 공고 표에는 넣지 않음)
  // ── 근무자 둘 더: W3 = 옛회사에서만 일함 · W4 = 아직 일한 곳 없음 (지원만)
  const [u] = await rest(`users?id=eq.${W}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: W3, name: '옛근무자', phone: '01032003203', photo_at: new Date().toISOString(), created_at: '2026-10-20T00:00:00Z' })
  await rest('users', 'POST', { ...ub, id: W4, name: '새근무자', phone: '01032003204', photo_at: new Date().toISOString(), created_at: '2026-10-20T00:00:00Z' })
  const jl = (id, co, s, e, status) => ({ start_date: s, end_date: e, start_time: '09:00:00', end_time: '18:00:00', status, company_id: co, audience: 'worker' })
  await rest('applications', 'POST', { id: 'dddddddd-0000-4000-8000-0000000320d3', job_id: JP, user_id: W3, status: 'approved', available_dates: null, job: jl(JP, C3, kday(-5), kday(-5), 'closed'), created_at: '2026-11-10T00:00:00Z' })
  await rest('applications', 'POST', { id: 'dddddddd-0000-4000-8000-0000000320d4', job_id: J2, user_id: W4, status: 'applied', available_dates: null, job: jl(J2, C2, kday(1), kday(1), 'open'), created_at: '2026-11-10T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(500) }
  const cards = (p) => p.evaluate(() => [...document.querySelectorAll('a[href^="/jobs/"]')].map((a) => a.getAttribute('href').slice(6)))
  const chip = (p) => p.locator('[data-known-filter]')
  const inRow = (p) =>
    p.evaluate(() => {
      const row = document.querySelector('[data-chip-row]'), k = document.querySelector('[data-known-filter]')
      if (!row || !k) return false
      const r = row.getBoundingClientRect(), c = k.getBoundingClientRect()
      return c.left >= r.left - 1 && c.right <= r.right + 1
    })

  // ── 1. 테스트 회사에서 일한 근무자: 칩이 보이고 눌러서 켜면 그 회사 공고만
  const w = await mk(W)
  await go(w, '/')
  ok('칩 보임 (일한 회사 공고가 목록에 있음) · 꺼진 상태', (await chip(w).count()) === 1 && (await chip(w).getAttribute('aria-pressed')) === 'false', one(await chip(w).textContent().catch(() => '')))
  const all = await cards(w)
  ok('처음엔 다른 회사 공고도 함께', all.includes(J2) && all.includes(J3), all.join(','))
  await chip(w).scrollIntoViewIfNeeded()
  await chip(w).click()
  await w.waitForURL(/known=1/)
  await w.waitForTimeout(600)
  const mine = await cards(w)
  ok('켜면 일했던 회사(테스트) 공고만 · 남의회사 공고는 빠짐', mine.includes(J3) && !mine.includes(J2), mine.join(','))
  ok('칩이 켜진 모양 (✓ · 초록)', (await chip(w).getAttribute('aria-pressed')) === 'true' && one(await chip(w).textContent()).startsWith('✓') && /emerald/.test(await chip(w).getAttribute('class')))
  ok('남은 공고 수 줄', /조건에 맞는 공고 \d+개/.test(one(await w.locator('[data-filter-count]').textContent().catch(() => ''))))
  ok('거르기 하나만 켰을 땐 \'모두 풀기\' 없음', (await w.locator('[data-filter-clear]').count()) === 0)
  ok('360px 옆으로 밀림 없음', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/known-on.png` })

  // ── 2. 링크로 켠 채 새로 들어와도 켜진 칩이 줄 안에 보임 (줄을 오른쪽으로 밀어 줌)
  await go(w, '/?known=1')
  await w.waitForTimeout(700)
  ok('새로 열어도 켜진 칩이 칩 줄 안에 보임', await inRow(w))
  ok('칩 줄이 오른쪽으로 밀려 있음', (await w.evaluate(() => document.querySelector('[data-chip-row]').scrollLeft)) > 0)

  // ── 3. 두 개 켜면 '모두 풀기 ✕' → 누르면 거르기 없이 처음으로
  await go(w, '/?when=week&known=1')
  const clear = w.locator('[data-filter-clear]')
  ok('거르기 두 개: \'모두 풀기 ✕\' 보임', (await clear.count()) === 1 && one(await clear.textContent()).includes('모두 풀기'))
  ok('\'모두 풀기\'가 같은 줄 오른쪽 (줄바꿈 없이)', await w.evaluate(() => { const p = document.querySelector('[data-filter-count]'); const c = p.querySelector('[data-filter-clear]'); const s = p.querySelector('span'); return Math.abs(c.getBoundingClientRect().top - s.getBoundingClientRect().top) < 6 && c.getBoundingClientRect().right <= innerWidth }))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/clear.png` })
  await clear.click()
  await w.waitForURL((u) => !/known|when/.test(u.search))
  await w.waitForTimeout(500)
  const back = await cards(w)
  ok('누르면 모든 공고가 다시 · 칩 꺼짐', back.includes(J2) && back.includes(J3) && (await chip(w).getAttribute('aria-pressed')) === 'false')

  // ── 4. 회사 공고 모음(?co=)에서는 칩 없음 · known=1을 붙여도 거르지 않음
  await go(w, `/?co=${C2}&known=1`)
  ok('회사 공고 모음: 칩 없음', (await chip(w).count()) === 0)
  ok('회사 공고 모음: known=1이 붙어도 그 회사 공고 그대로', (await cards(w)).includes(J2))

  // ── 5. 지난 회사 공고가 지금 없음: 칩 안 보임 · 켠 링크로 오면 빈 화면에서 '다른 회사도' 바로
  const w3 = await mk(W3)
  await go(w3, '/')
  ok('일한 회사의 지금 공고가 없으면 칩 없음', (await chip(w3).count()) === 0)
  await go(w3, '/?known=1')
  ok('켠 링크: 칩은 보여서 끌 수 있음', (await chip(w3).count()) === 1 && (await chip(w3).getAttribute('aria-pressed')) === 'true')
  const lo = w3.locator('[data-loosen] a').first()
  const loText = one(await lo.textContent().catch(() => ''))
  ok('맞는 공고 없음 → \'다른 회사도 · n개 →\'가 먼저', /^다른 회사도 · \d+개/.test(loText), loText)
  await lo.click()
  await w3.waitForURL((u) => !/known/.test(u.search))
  await w3.waitForTimeout(500)
  ok('누르면 다른 회사 공고까지 보임', (await cards(w3)).includes(J2))

  // ── 6. 일한 곳 없는 회원(지원만) · 로그인 전: 칩 없음
  const w4 = await mk(W4)
  await go(w4, '/')
  ok('지원만 한 회원: 칩 없음 (확정돼 일한 곳만 셈)', (await chip(w4).count()) === 0)
  const g = await mk(null)
  await go(g, '/?known=1')
  ok('로그인 전: 칩 없음 · known=1이어도 모든 공고', (await chip(g).count()) === 0 && (await cards(g)).includes(J2))

  // ── 7. 움직임 줄이기: 줄을 바로 옮김 (켜진 칩이 보임)
  const r = await mk(W, { reducedMotion: 'reduce' })
  await go(r, '/?avail=1&known=1')
  ok('움직임 줄이기에서도 켜진 칩이 줄 안에 보임', await inRow(r))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
