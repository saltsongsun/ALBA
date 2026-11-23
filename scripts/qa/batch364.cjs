// 묶음 364 (정기 개선 2026-11-23 18:36 KST · 근무자 '서명할 서류' 카드: 근무가 언제인지 + 급한 것부터 + 줄 올라옴)
// · 내 근무 '서명할 서류가 n건 있어요': 서류마다 아랫줄 맨 앞에 그 근무가 언제인지
//   - 이미 끝났으면 '근무 끝남' · 시작했으면 '근무 시작됨' (빨강 · 오른쪽 '서명 →'도 빨강) · 아직이면 'M/D(요) 근무 전' (주황)
//   - 근무가 시작·끝난 서류가 위로 (그다음 근무일 빠른 순)
// · 줄이 차례로 살짝 올라옴(0.25초) · 움직임 줄이기면 바로
// node scripts/qa/batch364.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const JE = 'cccccccc-0000-4000-8000-0000003640e1' // 그제 끝남
const JS = 'cccccccc-0000-4000-8000-0000003640e2' // 어제~내일 (오늘은 내 근무일 아님)
const JF = 'cccccccc-0000-4000-8000-0000003640e3' // 사흘 뒤
const DE = 'dddddddd-0000-4000-8000-0000003640e1', DS = 'dddddddd-0000-4000-8000-0000003640e2', DF = 'dddddddd-0000-4000-8000-0000003640e3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  // 가짜 DB의 지원 행은 공고를 붙여 들고 있음(job) → 새 지원 행에는 그 공고를 붙여 줌 (복사한 오늘 공고가 따라오지 않게)
  const lite = {}
  const job = (id, title, s, e) => {
    const row = { ...jb, id, title, status: e < kday(0) ? 'closed' : 'open', contract_method: 'app', start_date: kday(s), end_date: kday(e), created_at: new Date().toISOString() }
    lite[id] = row
    return rest('jobs', 'POST', { ...row, applications: [], attendance: [] })
  }
  await job(JE, '지난 주말 축제 안내', -3, -2)
  await job(JS, '사흘 전시 안내', -1, 1)
  await job(JF, '다음 주 공연 안내', 3, 3)
  const [app0] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const { id: _pi, company_id: _pc, ...appBase } = app0
  const app = (id, jobId, dates) => rest('applications', 'POST', { ...appBase, id, job_id: jobId, job: lite[jobId], user_id: W, status: 'approved', available_dates: dates, held_at: null, created_at: `${kday(-5)}T01:00:00Z` })
  await app('ffffffff-0000-4000-8000-0000003640e1', JE, null)
  await app('ffffffff-0000-4000-8000-0000003640e2', JS, [kday(-1), kday(1)])
  await app('ffffffff-0000-4000-8000-0000003640e3', JF, null)
  const [d0] = await rest('signed_docs?id=eq.dddddddd-0000-4000-8000-000000000004')
  const { id: _i, company_id: _dc, ...docBase } = d0
  // 만든 순서는 일부러 근무 전 → 끝남 → 시작됨 (화면은 급한 것부터)
  await rest('signed_docs', 'POST', { ...docBase, id: DF, job_id: JF, title: '근로계약서', status: 'pending', created_at: `${kday(-4)}T01:00:00Z` })
  await rest('signed_docs', 'POST', { ...docBase, id: DE, job_id: JE, title: '근로계약서', status: 'pending', created_at: `${kday(-4)}T02:00:00Z` })
  await rest('signed_docs', 'POST', { ...docBase, id: DS, job_id: JS, title: '서약서', status: 'pending', created_at: `${kday(-4)}T03:00:00Z` })

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

  const w = await mk(W)
  await go(w, '/me')
  const card = w.locator('[data-sign-card]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const rows = card.locator('a[href^="/docs/"]')
  const hrefs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('href').slice(-4)))
  ok("'서명할 서류가 3건 있어요' (오늘 근무 서류는 오늘 카드에)", one(await card.locator('h2').innerText().catch(() => '')) === '서명할 서류가 3건 있어요', one(await card.locator('h2').innerText().catch(() => '')))
  ok('급한 것부터: 근무 끝남 → 근무 시작됨 → 근무 전', hrefs.join(',') === [DE, DS, DF].map((x) => x.slice(-4)).join(','), hrefs.join(','))
  const row = (id) => card.locator(`a[href="/docs/${id}"]`)
  const sub = async (id) => one(await row(id).locator('span.block').nth(1).innerText().catch(() => ''))
  ok("끝난 근무: '근무 끝남 · 회사 · 공고' (빨강)", (await sub(DE)).startsWith('근무 끝남 · ') && (await sub(DE)).includes('지난 주말 축제 안내') && (await row(DE).locator('[data-sign-when]').evaluate((el) => el.classList.contains('text-rose-600'))), await sub(DE))
  ok("시작한 근무: '근무 시작됨 · …' (빨강)", (await sub(DS)).startsWith('근무 시작됨 · ') && (await row(DS).getAttribute('data-sign-doc')) === 'late', await sub(DS))
  ok(`근무 전: '${md(kday(3))} 근무 전 · …' (주황)`, (await sub(DF)).startsWith(`${md(kday(3))} 근무 전 · `) && (await row(DF).locator('[data-sign-when]').evaluate((el) => el.classList.contains('text-amber-700'))), await sub(DF))
  ok("오른쪽 '서명 →': 급한 서류는 빨강 · 근무 전은 파랑", (await row(DE).locator(':scope > span').last().evaluate((el) => el.classList.contains('text-rose-600'))) && (await row(DF).locator(':scope > span').last().evaluate((el) => el.classList.contains('text-brand-600'))))
  ok('아랫줄 한 줄 (말줄임)', await row(DE).locator('span.block').nth(1).evaluate((el) => el.getBoundingClientRect().height < 20))
  ok('360px 옆으로 안 밀림', await noSide(w))
  const anim = await rows.evaluateAll((els) => els.map((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration, getComputedStyle(el).animationDelay]))
  ok('줄이 차례로 올라옴 0.25초', anim.every((x) => x[0] === 'rise' && x[1] === '0.25s') && parseFloat(anim[2][2]) > parseFloat(anim[0][2]), JSON.stringify(anim))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/sign-card.png` }).catch(() => {})
  // 누르면 그 서류 서명 화면
  await Promise.all([w.waitForURL((u) => u.pathname === `/docs/${DE}`, { timeout: 15000 }).catch(() => {}), row(DE).click()])
  ok('맨 위(끝난 근무) 서류를 누르면 그 서류 서명 화면', new URL(w.url()).pathname === `/docs/${DE}`, w.url())

  // 움직임 줄이기
  const rm = await mk(W, { reducedMotion: 'reduce' })
  await go(rm, '/me')
  const rd = await rm.locator('[data-sign-card] a[href^="/docs/"]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
