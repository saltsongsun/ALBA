// 묶음 342 (정기 개선 2026-11-21 22:35 KST)
// · 확정된 근무(아직 끝나지 않음)의 공고 화면: '🚶 같이 갈 사람 찾기' → 커뮤니티 글쓰기에 '같이 가요' 말머리 + 'M/D(요일) 행사 이름 같이 가요' 제목이 채워져 있음
//   끝난 근무 · 아직 확정 전(지원만)에는 없음
// · 투표 결과 막대: 처음 보일 때 왼쪽에서 자라나고(grow) 숫자는 톡(pop) — 움직임 줄이기면 바로(거의 0초)
// node scripts/qa/batch342.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const P = 'bbbbbbbb-0000-4000-8000-0000003420b1', Q = 'bbbbbbbb-0000-4000-8000-0000003420b2'
const JF = 'cccccccc-0000-4000-8000-0000003420a1', JE = 'cccccccc-0000-4000-8000-0000003420a2', JW = 'cccccccc-0000-4000-8000-0000003420a3'
const POST = 'dddddddd-0000-4000-8000-0000003420d1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const WD = ['일', '월', '화', '수', '목', '금', '토']
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  for (const [id, name, phone, nickname] of [[P, '사사이', '01034203421', '같이가자'], [Q, '사사삼', '01034203422', '투표손님']]) {
    await rest('users', 'POST', { ...kb, id, name, phone, nickname, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  }
  // 사흘 뒤 확정 근무(JF) · 어제 끝난 확정 근무(JE) · 사흘 뒤 지원만 한 근무(JW)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  for (const [id, title, d, status] of [[JF, '코엑스 박람회 안내', kday(3), 'approved'], [JE, '어제 끝난 안내', kday(-1), 'approved'], [JW, '다음 주 안내', kday(3), 'applied']]) {
    await rest('jobs', 'POST', { ...jb, id, title, event_name: id === JF ? '코엑스 박람회' : jb.event_name, status: 'open', start_date: d, end_date: d, start_time: '09:00:00', end_time: '18:00:00', applications: [], attendance: [], created_at: new Date().toISOString() })
    const [j] = await rest(`jobs?id=eq.${id}`)
    const { applications: _ja, attendance: _jt, ...jl } = j
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: id, user_id: P, status, available_dates: null, position: null, message: null, created_at: new Date(Date.now() - 864e5).toISOString(), job: jl, user: { id: P, name: '사사이', phone: '01034203421' } })
  }
  // 투표 글 (Q가 씀)
  await rest('community_posts', 'POST', { id: POST, author_id: Q, category: 'free', title: '점심 뭐 드세요?', body: '행사장 점심 고민돼요', hidden_at: null, created_at: new Date().toISOString() })
  await rest('community_polls', 'POST', { post_id: POST, options: ['김밥', '도시락'] })

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
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 확정된 사흘 뒤 근무: '같이 갈 사람 찾기'
  const p = await mk(P)
  await go(p, `/jobs/${JF}`)
  const link = p.locator('[data-together-link]')
  const want = `${fmt(kday(3))} 코엑스 박람회 같이 가요`
  const href = (await link.getAttribute('href').catch(() => '')) ?? ''
  const u = new URL(href || '/', D)
  ok("확정 근무: '🚶 같이 갈 사람 찾기' (같이 가요 · 날짜 + 행사 이름)", (await link.count()) === 1 && u.pathname === '/community/new' && u.searchParams.get('c') === 'together' && u.searchParams.get('t') === want, href)
  ok('360px 옆으로 밀림 없음 (공고 화면)', await noSide(p))
  if (SHOTS) {
    await link.scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/together-link.png` })
  }
  await link.click()
  await p.waitForURL((x) => x.pathname === '/community/new', { timeout: 10000 }).catch(() => {})
  await p.locator('#post-title').waitFor({ timeout: 10000 }).catch(() => {})
  ok("누르면 글쓰기: 말머리 '같이 가요' 선택 · 제목 채움 · 안전 안내", (await p.locator('input[name=category][value=together]').isChecked()) && (await p.locator('#post-title').inputValue()) === want && (await p.locator('[data-together-note]').count()) === 1)

  // ── 2. 끝난 확정 근무 · 지원만 한 근무: 없음
  await go(p, `/jobs/${JE}`)
  ok('어제 끝난 근무: 없음', (await p.locator('[data-together-link]').count()) === 0)
  await go(p, `/jobs/${JW}`)
  ok('아직 확정 전(지원만): 없음', (await p.locator('[data-together-link]').count()) === 0)

  // ── 3. 투표 결과 막대: 고르면 자라나며 보이고 숫자는 톡
  await go(p, `/community/${POST}`)
  ok('고르기 전엔 막대 없음', (await p.locator('[data-poll-bar]').count()) === 0)
  await p.locator('[data-poll-option="1"]').click()
  await p.locator('[data-poll-bar]').first().waitFor({ timeout: 3000 }).catch(() => {})
  const anim = await p.locator('[data-poll-option="1"] [data-poll-bar]').evaluate((e) => { const s = getComputedStyle(e); return { name: s.animationName, dur: parseFloat(s.animationDuration), origin: s.transformOrigin } })
  const countAnim = await p.locator('[data-poll-option="1"] [data-poll-count]').evaluate((e) => getComputedStyle(e).animationName)
  ok('막대: 왼쪽에서 자라남 (grow · 0.3초)', anim.name === 'grow' && Math.abs(anim.dur - 0.3) < 0.01 && anim.origin.startsWith('0px'), JSON.stringify(anim))
  ok("숫자: 톡 (pop) · '100% · 1표'", countAnim === 'pop' && one(await p.locator('[data-poll-option="1"]').innerText()).includes('100% · 1표'), countAnim)
  if (SHOTS) {
    await p.waitForTimeout(400)
    await p.locator('[data-poll]').scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${SHOTS}/poll-grow.png` })
  }

  // ── 4. 움직임 줄이기: 바로 (거의 0초)
  const r = await mk(P, { reducedMotion: 'reduce' })
  await go(r, `/community/${POST}`)
  const rdur = await r.locator('[data-poll-option="1"] [data-poll-bar]').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration))
  ok('움직임 줄이기: 막대가 바로 (애니메이션 거의 0초)', rdur < 0.01, String(rdur))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
