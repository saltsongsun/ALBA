// 묶음 384 (정기 개선 2026-11-25 06:35 KST)
// ① 근무자 공고 화면: 서류를 보낼 때가 지났는데 아직 없으면 '서명할 서류를 곧 보내 드려요 · …' 줄 전체가 누르는 곳
//    + 아래 '아직 안 왔으면 담당자에게 알리기 →' → 그 회사 문의함, 첫 빠른 답 '확정됐는데 서명할 서류를 아직 못 받았어요. 확인 부탁드려요.'
//    · 보내면 그 회사·그 공고로 · 관리자 문의 목록 '서류 요청' 표시 · 대화 빠른 답장 '서류를 보냈어요…' / '확인해 보고 바로…'
// ② 공고 맨 위 내 지원 배지('지원완료 ↓')를 누르면 맨 아래 '내 지원' 칸으로 (#apply · 화면 안 · 테두리 0.3초 한 번 · 움직임 줄이기면 없음)
// node scripts/qa/batch384.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const TPL = 'ffffffff-0000-4000-8000-000000000007'
const JT = 'cccccccc-0000-4000-8000-000000038401', JW = 'cccccccc-0000-4000-8000-000000038402'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003840${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003840${String(n).padStart(2, '0')}`
const ASK = '확정됐는데 서명할 서류를 아직 못 받았어요. 확인 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)

;(async () => {
  const nowIso = new Date().toISOString()
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, attendance, ...jrow } = j
  const base = { ...jrow, company_id: C1, status: 'open', required_docs: [TPL], contract_method: 'app', headcount: 10, created_at: nowIso, audience: 'worker' }
  // 오늘 밤 근무(모집 중) → 서류를 보낼 때(오늘 근무)인데 아직 없음 · 사흘 뒤 근무 → 지원만
  await rest('jobs', 'POST', { ...base, id: JT, title: '오늘 밤 행사384', start_date: kday(0), end_date: kday(0), start_time: '23:00:00', end_time: '23:59:00' })
  await rest('jobs', 'POST', { ...base, id: JW, title: '사흘 뒤 행사384', start_date: kday(3), end_date: kday(3) })
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 2; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}384`, phone: `010384000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  const app = (n, job, status) => rest('applications', 'POST', { id: AP(n), company_id: C1, job_id: job, user_id: U(n), user: usr[n], status, available_dates: null, message: null, decided_at: status === 'approved' ? nowIso : null, held_at: null, position: null, contract_received_at: null, created_at: nowIso })
  await app(1, JT, 'approved')
  await app(2, JW, 'applied')

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 근무자1: 서류가 아직 없는 오늘 근무 → 줄을 누르면 담당자에게
  const w1 = await mk(U(1))
  await go(w1, `/jobs/${JT}`)
  const soon = w1.locator('[data-docs-later="soon"]')
  ok("'서명할 서류를 곧 보내 드려요 …' + '아직 안 왔으면 담당자에게 알리기 →' · 줄이 링크", one(await soon.locator('[data-docs-ask]').innerText().catch(() => '')) === '아직 안 왔으면 담당자에게 알리기 →' && (await soon.getAttribute('href').catch(() => '')) === `/me/chat?job=${JT}&ask=docs` && (await noSide(w1)), one(await soon.innerText().catch(() => '')))
  if (SHOTS) await soon.screenshot({ path: `${SHOTS}/docs-ask-line.png` }).catch(() => {})
  await Promise.all([w1.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {}), soon.click()])
  await w1.waitForLoadState('networkidle')
  const chips = w1.locator('[data-quick-lead], [data-quick-replies] button')
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok(`문의함 첫 빠른 답 '${ASK}'`, one(await chips.first().textContent().catch(() => '')) === ASK, one(await chips.first().textContent().catch(() => '')))
  ok('360px 옆으로 안 밀림 (문의함)', await noSide(w1))
  await chips.first().click()
  await w1.locator('textarea').first().press('Enter')
  await w1.waitForTimeout(1500)
  const sent = ((await rest(`messages?thread_user_id=eq.${U(1)}`)) ?? []).filter((m) => m.body === ASK && !m.from_admin)
  ok('그 회사 · 그 공고로 보내짐', sent.length === 1 && sent[0].company_id === C1 && sent[0].job_id === JT, JSON.stringify(sent.map((m) => [m.company_id, m.job_id])))

  // ── 2. 관리자: 문의 목록 '서류 요청' · 대화 빠른 답장
  const a = await mk(A)
  await rest(`messages?id=eq.${sent[0]?.id}`, 'PATCH', { user: { id: U(1), name: usr[1].name, phone: usr[1].phone, photo_at: null, member_type: 'worker' } })
  await go(a, '/admin/chat')
  const thread = a.locator(`a[href="/admin/chat/${U(1)}"]`).first()
  await thread.waitFor({ timeout: 15000 }).catch(() => {})
  const tag = thread.locator('[data-inbox-tag]')
  ok("문의 목록: 그 근무자 줄에 '서류 요청'", one(await tag.textContent().catch(() => '')) === '서류 요청' && (await tag.getAttribute('data-inbox-tag')) === 'ask', one(await thread.textContent().catch(() => '')).slice(0, 80))
  await go(a, `/admin/chat/${U(1)}`)
  const aq = a.locator('[data-quick-lead], [data-quick-replies] button')
  await aq.first().waitFor({ timeout: 15000 }).catch(() => {})
  const replies = (await aq.allTextContents()).map(one)
  ok("대화 빠른 답장: '서류를 보냈어요. 내 근무에서 서명해 주세요.' · '확인해 보고 바로 보내 드릴게요.'", replies.includes('서류를 보냈어요. 내 근무에서 서명해 주세요.') && replies.includes('확인해 보고 바로 보내 드릴게요.'), replies.slice(0, 4).join(' | '))

  // ── 3. 근무자2: 위 배지 '지원완료 ↓' → 맨 아래 '내 지원' 칸으로 · 테두리 한 번
  const w2 = await mk(U(2))
  await go(w2, `/jobs/${JW}`)
  const badge = w2.locator('a[data-app-badge]')
  ok("위 배지 '지원완료 ↓'가 #apply 링크", one(await badge.innerText().catch(() => '')) === '지원완료 ↓' && (await badge.getAttribute('href')) === '#apply')
  if (SHOTS) await w2.locator('main').first().screenshot({ path: `${SHOTS}/badge.png`, clip: { x: 0, y: 0, width: 360, height: 200 } }).catch(() => {})
  await badge.click()
  await w2.waitForTimeout(900)
  const box = w2.locator('#apply')
  const inView = await box.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.top >= -4 })
  const anim = await box.evaluate((el) => ({ n: getComputedStyle(el).animationName, d: getComputedStyle(el).animationDuration }))
  ok("누르면 '내 지원' 칸이 화면 위쪽에 · 테두리 0.3초 한 번", new URL(w2.url()).hash === '#apply' && inView && anim.n === 'flash-ring' && anim.d === '0.3s', `${w2.url()} · ${JSON.stringify(anim)}`)
  if (SHOTS) await box.screenshot({ path: `${SHOTS}/apply-ring.png` }).catch(() => {})
  const r = await mk(U(2), { reducedMotion: 'reduce' })
  await go(r, `/jobs/${JW}#apply`)
  ok('움직임 줄이기: 테두리 없음', (await r.locator('#apply').evaluate((el) => getComputedStyle(el).animationName)) === 'none')

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
