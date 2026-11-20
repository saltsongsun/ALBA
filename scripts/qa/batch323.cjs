// 묶음 323 (정기 개선 2026-11-20 09:35 KST)
// · 근무자 문의 목록(여러 대화): 회사 줄 이름 옆 '모집 n' — 그 회사에 지금 모집 중인 알바 공고 수
//   (대화 위 '공고 n개 →'와 같은 기준 · 모집 중 공고가 없는 회사·단체방 줄·전문가에겐 없음 · 360px 한 줄)
// · '모집 n' · '공고 n개 →'는 나타날 때 살짝 튀어나옴 (움직임 줄이기면 바로)
// node scripts/qa/batch323.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000323c2'
const J2 = 'cccccccc-0000-4000-8000-0000000323a2', J3 = 'cccccccc-0000-4000-8000-0000000323a3'
const E = '33333333-0000-4000-8000-0000000323e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 테스트 회사(C1): 모집 중 2개 (J + J3) · 남의회사(C2): 마감 공고만 — 근무자 W는 C2에도 문의함
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, verified: true, created_at: '2026-10-15T00:00:00Z' })
  const [j0] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j0, id: J3, title: '테스트 회사 다음 행사', start_date: kday(3), end_date: kday(3), applications: [], created_at: '2026-11-01T00:00:00Z' })
  await rest('jobs', 'POST', { ...j0, id: J2, company_id: C2, company: { company_name: '남의회사' }, title: '남의회사 마감 행사', status: 'closed', start_date: kday(2), end_date: kday(2), applications: [], created_at: '2026-11-01T00:00:00Z' })
  await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, company_id: C2, body: '다음 행사도 있나요?', created_at: new Date(Date.now() - 3600e3).toISOString() })

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
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(500) }
  const coRow = (p, id) => p.locator(`a[data-chat-row="company"][href^="/me/chat?co=${id}"]`)

  // ── 1. 문의 목록: 모집 중 공고가 있는 회사 줄에만 '모집 n'
  const w = await mk(W)
  await go(w, '/me/chat')
  const r1 = coRow(w, C1)
  const t1 = one(await r1.locator('[data-chat-co-open]').textContent().catch(() => ''))
  ok("모집 중 공고가 있는 회사 줄: '모집 2'", t1 === '모집 2', t1)
  ok("모집 중 공고가 없는 회사 줄: '모집' 없음", (await coRow(w, C2).count()) === 1 && (await coRow(w, C2).locator('[data-chat-co-open]').count()) === 0)
  ok("단체방 줄엔 '모집' 없음", (await w.locator('a[data-chat-row="room"] [data-chat-co-open]').count()) === 0)
  ok('회사 이름 줄 한 줄 (360px · 옆으로 밀림 없음)', (await r1.evaluate((a) => { const t = a.querySelector('[data-chat-co-open]'); const b = a.querySelector('b'); return Math.abs(t.getBoundingClientRect().top - b.getBoundingClientRect().top) < 8 && t.getBoundingClientRect().height < 22 })) && (await noSide(w)))
  ok("'모집 n'은 튀어나오며 나타남 (animate-pop)", /animate-pop/.test((await r1.locator('[data-chat-co-open]').getAttribute('class')) ?? ''))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/inbox-open.png` })

  // ── 2. 누르면 그 회사 대화 → 위 '공고 2개 →' (같은 수)
  await r1.click()
  await w.waitForURL(/co=/)
  await w.waitForTimeout(400)
  ok("들어가면 대화 위 '공고 2개 →' (같은 수)", one(await w.locator('[data-chat-co-jobs]').textContent().catch(() => '')) === '공고 2개 →')

  // ── 3. 전문가: '모집 n' 없음 (알바 공고를 보지 않음)
  const [u] = await rest(`users?id=eq.${W}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: E, name: '김전문', phone: '01032303231', member_type: 'expert', photo_at: new Date().toISOString(), created_at: '2026-10-20T00:00:00Z' })
  await rest('messages', 'POST', { thread_user_id: E, sender_id: E, from_admin: false, company_id: C1, body: '의뢰 문의드려요', created_at: new Date(Date.now() - 7200e3).toISOString() })
  await rest('messages', 'POST', { thread_user_id: E, sender_id: E, from_admin: false, company_id: C2, body: '견적 문의드려요', created_at: new Date(Date.now() - 7100e3).toISOString() })
  const e = await mk(E)
  await go(e, '/me/chat')
  ok("전문가 문의 목록: '모집 n' 없음", (await e.locator('a[data-chat-row="company"]').count()) >= 1 && (await e.locator('[data-chat-co-open]').count()) === 0)
  await go(e, `/me/chat?co=${C1}`)
  ok("전문가 회사 대화: '공고 n개 →' 없음", (await e.locator('[data-chat-co-jobs]').count()) === 0)

  // ── 4. 움직임 줄이기: 바로 보임
  const r = await mk(W, { reducedMotion: 'reduce' })
  await go(r, '/me/chat')
  ok("움직임 줄이기에서도 '모집 2'가 바로 보임", (await coRow(r, C1).locator('[data-chat-co-open]').isVisible()) && (await coRow(r, C1).locator('[data-chat-co-open]').evaluate((el) => getComputedStyle(el).opacity)) === '1')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
