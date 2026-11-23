// 묶음 361 (정기 개선 2026-11-23 12:35 KST · 서류 메뉴: 근무가 시작됐는데 서명 안 한 서류 + 거르기 바꾸면 목록 올라옴)
// · 서류 메뉴 줄: 근무가 이미 시작됐는데 서명 전이면 빨갛게 '서명 안 함 · 근무 시작됨 ›' (끝났으면 '근무 끝남')
//   - 누르면 그 공고 서류 탭 '서명 안 한 사람' 칸으로 (앱 알림 버튼)
//   - 아직 근무 전이면 예전처럼 '서명 대기 · 요청 M/D' (주황)
//   - 공고 묶음 머리의 '대기 n'도 근무 시작 뒤 대기가 있으면 빨갛게
// · 상태 칩 누름 반응 · 거르기(상태·공고·종류·찾기)를 바꾸면 목록이 살짝 올라옴(0.25초) · 움직임 줄이기면 바로
// node scripts/qa/batch361.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC_TODAY = 'dddddddd-0000-4000-8000-000000000004' // 오늘 시작한 공고 J의 서명 대기 계약서 (기본 자료)
const JF = 'cccccccc-0000-4000-8000-0000003610f1', JP = 'cccccccc-0000-4000-8000-0000003610e1'
const DF = 'dddddddd-0000-4000-8000-0000003610f1', DP = 'dddddddd-0000-4000-8000-0000003610e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 뒤 공고(근무 전) · 그제 끝난 공고(근무 끝남) — 둘 다 서명 대기 계약서
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: JF, title: '다음 주 박람회 안내', status: 'open', start_date: kday(3), end_date: kday(3), applications: [], attendance: [], created_at: new Date().toISOString() })
  await rest('jobs', 'POST', { ...jb, id: JP, title: '지난 주말 축제 안내', status: 'closed', start_date: kday(-3), end_date: kday(-2), applications: [], attendance: [], created_at: new Date().toISOString() })
  const [d0] = await rest(`signed_docs?id=eq.${DOC_TODAY}`)
  ok('(준비) 기본 서명 대기 서류는 오늘 시작한 공고', d0?.status === 'pending' && d0?.job_id === J && base.start_date <= kday(0), `${d0?.status} ${base.start_date}`)
  const { id: _i, ...docBase } = d0
  await rest('signed_docs', 'POST', { ...docBase, id: DF, job_id: JF, created_at: `${kday(-1)}T01:00:00Z` })
  await rest('signed_docs', 'POST', { ...docBase, id: DP, job_id: JP, created_at: `${kday(-5)}T01:00:00Z` })

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
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }
  const row = (p, id) => p.locator(`[data-doc-row="${id}"]`)

  const a = await mk(A)
  await go(a, '/admin/docs?status=pending')
  await a.locator('[data-docs-list]').waitFor({ timeout: 15000 }).catch(() => {})
  // 묶음이 접혀 있으면 펼침
  for (const det of await a.locator('details[data-docs-job]').all()) await det.evaluate((el) => { el.open = true })
  await a.waitForTimeout(400) // 펼치면 0.2초 내려오는 움직임이 끝난 뒤 글을 읽음

  // ── 1. 근무 시작됨 · 근무 끝남 · 근무 전
  const lateToday = row(a, DOC_TODAY).locator('[data-doc-row-late]')
  ok("오늘 시작한 공고: '서명 안 함 · 근무 시작됨 ›' (빨강)", one(await lateToday.innerText().catch(() => '')) === '서명 안 함 · 근무 시작됨 ›' && (await lateToday.evaluate((el) => el.classList.contains('text-rose-600'))), one(await row(a, DOC_TODAY).innerText().catch(() => '')))
  ok('→ 그 공고 서류 탭 서명 안 한 사람 칸', (await lateToday.getAttribute('href')) === `/admin/jobs/${J}?tab=docs#unsigned`)
  const lateEnded = row(a, DP).locator('[data-doc-row-late]')
  ok("끝난 공고: '서명 안 함 · 근무 끝남 ›'", one(await lateEnded.innerText().catch(() => '')) === '서명 안 함 · 근무 끝남 ›' && (await lateEnded.getAttribute('href')) === `/admin/jobs/${JP}?tab=docs#unsigned`, one(await row(a, DP).innerText().catch(() => '')))
  const future = row(a, DF)
  ok(`근무 전 공고: 예전처럼 '서명 대기 · 요청 ${md(kday(-1))}' (빨강 아님)`, (await future.locator('[data-doc-row-late]').count()) === 0 && one(await future.innerText()).includes(`서명 대기 · 요청 ${md(kday(-1))}`), one(await future.innerText()))
  // 묶음 머리 '대기 n' 색
  ok("묶음 머리: 근무 시작 뒤 대기 있는 공고는 '대기' 빨강, 근무 전 공고는 주황", (await a.locator(`[data-docs-job="${J}"] [data-docs-job-waiting]`).getAttribute('data-docs-job-waiting')) === 'late' && (await a.locator(`[data-docs-job="${JF}"] [data-docs-job-waiting]`).getAttribute('data-docs-job-waiting')) === 'wait')
  const order = await a.locator('details[data-docs-job]').evaluateAll((els) => els.map((e) => e.getAttribute('data-docs-job')))
  ok("'서명 대기'만 볼 때: 근무 시작된 공고 묶음이 위 (근무 전 공고는 맨 아래)", order.at(-1) === JF && order.slice(0, 2).sort().join() === [J, JP].sort().join(), order.map((x) => x.slice(-4)).join(' '))
  ok('줄 글씨 한 줄 (360px · 말 중간에 안 끊김)', await lateToday.evaluate((el) => el.getBoundingClientRect().height < 22))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/docs-late.png`, fullPage: true })

  // 서명 완료 줄은 그대로
  await go(a, '/admin/docs')
  for (const det of await a.locator('details[data-docs-job]').all()) await det.evaluate((el) => { el.open = true })
  await a.waitForTimeout(400) // 펼치면 0.2초 내려오는 움직임이 끝난 뒤 글을 읽음
  ok("서명 완료 줄은 그대로 '✓ 서명'", one(await a.locator('[data-doc-row="dddddddd-0000-4000-8000-000000000005"]').innerText().catch(() => '')).includes('✓ 서명'))

  // 빨간 줄을 누르면 공고 서류 탭
  await go(a, '/admin/docs?status=pending')
  for (const det of await a.locator('details[data-docs-job]').all()) await det.evaluate((el) => { el.open = true })
  await a.waitForTimeout(400) // 펼치면 0.2초 내려오는 움직임이 끝난 뒤 글을 읽음
  await Promise.all([a.waitForURL((u) => u.pathname === `/admin/jobs/${J}`, { timeout: 15000 }).catch(() => {}), row(a, DOC_TODAY).locator('[data-doc-row-late]').click()])
  ok('누르면 공고 서류 탭 (#unsigned)', new URL(a.url()).pathname === `/admin/jobs/${J}` && new URL(a.url()).searchParams.get('tab') === 'docs' && new URL(a.url()).hash === '#unsigned', a.url())

  // ── 2. 거르기 바꾸면 목록 올라옴 + 칩 누름 반응
  await go(a, '/admin/docs')
  const list = a.locator('[data-docs-list]')
  ok('목록 올라옴 0.25초', JSON.stringify(await list.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])) === '["rise","0.25s"]')
  ok('상태 칩 누름 반응', (await a.locator('[data-docs-status] a').first().evaluate((el) => getComputedStyle(el).transitionDuration)) !== '0s')
  await a.locator('[data-docs-list]').evaluate((el) => { el.dataset.before = '1' })
  await Promise.all([a.waitForURL((u) => u.searchParams.get('status') === 'signed', { timeout: 15000 }).catch(() => {}), a.locator('[data-docs-status] a', { hasText: '서명 완료' }).click()])
  await a.waitForLoadState('networkidle')
  await a.waitForTimeout(300)
  ok('칩을 바꾸면 목록을 새로 그림 (다시 올라옴)', (await a.locator('[data-docs-list][data-before="1"]').count()) === 0 && (await a.locator('[data-docs-list]').evaluate((el) => getComputedStyle(el).animationName)) === 'rise')

  // ── 3. 움직임 줄이기
  const rm = await mk(A, { reducedMotion: 'reduce' })
  await go(rm, '/admin/docs')
  const rd = await rm.locator('[data-docs-list]').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
