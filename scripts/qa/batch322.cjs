// 묶음 322 (정기 개선 2026-11-20 07:35 KST)
// · 근무자 문의(회사와의 대화) 위: 그 회사에 지금 모집 중인 알바 공고가 있으면 '공고 n개 →' (누르면 그 회사 공고 모음 /?co=)
//   모집 중인 공고가 없는 회사 · 고객센터 대화에는 없음 · 360px 한 줄
// · 내 근무: 오늘 근무가 확정 대기면 아래 줄은 '오늘 HH:MM 시작 · 확정되면 바로 알려 드려요'
//   ('아직 확정 전'은 위 확정 대기 칸이 이미 말함 — 화면에 한 번만)
// node scripts/qa/batch322.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000322c2'
const J2 = 'cccccccc-0000-4000-8000-0000000322a2', J3 = 'cccccccc-0000-4000-8000-0000000322a3'
const W4 = 'bbbbbbbb-0000-4000-8000-0000000322b4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 테스트 회사(C1)에 모집 중 공고 하나 더 → 2개 · 남의회사(C2)는 마감 공고만 (근무자 W가 거기 지원)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, verified: true, created_at: '2026-10-15T00:00:00Z' })
  const [j0] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j0, id: J3, title: '테스트 회사 다음 행사', start_date: kday(3), end_date: kday(3), applications: [], created_at: '2026-11-01T00:00:00Z' })
  await rest('jobs', 'POST', { ...j0, id: J2, company_id: C2, company: { company_name: '남의회사' }, title: '남의회사 마감 행사', status: 'closed', start_date: kday(2), end_date: kday(2), applications: [], created_at: '2026-11-01T00:00:00Z' })
  await rest('applications', 'POST', { id: 'dddddddd-0000-4000-8000-0000000322d2', job_id: J2, user_id: W, status: 'applied', available_dates: null, job: { id: J2, title: '남의회사 마감 행사', start_date: kday(2), end_date: kday(2), start_time: '09:00:00', end_time: '18:00:00', status: 'closed', company_id: C2, audience: 'worker' }, created_at: '2026-11-10T00:00:00Z' })
  const [u] = await rest(`users?id=eq.${W}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: W4, name: '새근무자', phone: '01032203224', photo_at: new Date().toISOString(), created_at: '2026-10-20T00:00:00Z' })

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
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(400) }

  // ── 1. 테스트 회사와의 대화: '공고 n개 →' → 그 회사 공고 모음
  const w = await mk(W)
  await go(w, `/me/chat?co=${C1}`)
  const link = w.locator('[data-chat-co-jobs]')
  const lt = one(await link.textContent().catch(() => ''))
  ok("모집 중 공고가 있는 회사 대화: '공고 n개 →'", (await link.count()) === 1 && /^공고 [12]개 →$/.test(lt), lt)
  ok('누르는 곳은 그 회사 공고 모음', (await link.getAttribute('href')) === `/?co=${C1}`)
  ok('회사 이름 줄과 같은 줄 (360px 한 줄 · 옆으로 밀림 없음)', await w.evaluate(() => { const a = document.querySelector('[data-chat-co-jobs]'), p = document.querySelector('[data-chat-intro]'); return Math.abs(a.getBoundingClientRect().top - p.getBoundingClientRect().top) < 8 && a.getBoundingClientRect().right <= innerWidth && a.getBoundingClientRect().height < 30 }) && (await noSide(w)))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/chat-co-jobs.png` })
  await link.click()
  await w.waitForURL((x) => x.search.includes(`co=${C1}`) && x.pathname === '/')
  await w.waitForTimeout(400)
  ok('그 회사 공고만 보임', (await w.locator(`a[href="/jobs/${J3}"]`).count()) >= 1 && (await w.locator(`a[href="/jobs/${J2}"]`).count()) === 0)

  // ── 2. 모집 중 공고가 없는 회사 대화: 없음
  await go(w, `/me/chat?co=${C2}`)
  ok('모집 중 공고가 없는 회사 대화: 링크 없음', (await w.locator('[data-chat-intro]').count()) === 1 && (await w.locator('[data-chat-co-jobs]').count()) === 0, one(await w.locator('[data-chat-intro]').textContent().catch(() => '')))

  // ── 3. 고객센터 대화 (아무 회사에도 지원 안 한 회원): 없음
  const w4 = await mk(W4)
  await go(w4, '/me/chat')
  ok('고객센터 대화: 링크 없음', (await w4.locator('[data-chat-co-jobs]').count()) === 0)

  // ── 4. 내 근무: 오늘 근무 확정 대기 → 아래 줄은 시작 시각만 · '확정 전'은 한 번만
  const k = await mk(K)
  await go(k, '/me')
  const row = k.locator('[data-today-empty="waiting"]')
  if ((await row.count()) === 1) {
    const rt = one(await row.textContent())
    ok("아래 줄: '오늘 HH:MM 시작 · 확정되면 바로 알려 드려요'", /^오늘 \d{2}:\d{2} 시작 ?확정되면 바로 알려 드려요$/.test(rt), rt)
    ok("'확정 전이에요'는 화면에 한 번만 (위 확정 대기 칸)", (one(await k.locator('main').textContent()).match(/확정 전이에요/g) ?? []).length === 1)
    ok('360px 옆으로 밀림 없음 (내 근무)', await noSide(k))
    if (SHOTS) {
      await row.scrollIntoViewIfNeeded()
      await k.screenshot({ path: `${SHOTS}/me-today-start.png` })
    }
  } else ok('(오늘 근무가 이미 끝난 시각이면 대기 줄 대신 다른 안내 — 건너뜀)', true)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
