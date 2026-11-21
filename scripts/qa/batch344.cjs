// 묶음 344 (정기 개선 2026-11-22 02:35 KST)
// · 공고 서류 탭: 서명한 '뒤에' 그 근무자에게 이 공고의 '🔔 일정 변경' 알림을 보냈으면 → 위에 '서명한 뒤 일정이 바뀐 서류 n건'(바뀐 내용 · 이름)
//   + 표 칸에 '일정 바뀜' 배지, 재서명 글자 강조. 변경 알림보다 늦게 서명한 서류 · 다른 회사 공고의 알림은 해당 없음 (자동 무효 처리 안 함)
// · 서류 탭 맨 아래 보관 안내: 세 문장 → 한 줄 '서명한 서류는 그때 내용 그대로 보관돼요' + 눌러서 자세히 (0.25초 내려옴)
// · 넓은 표 위 '옆으로 밀면' 안내(정산 탭 · 신고자료): 표 카드에 글자 아래가 가려지지 않음 · 화살표 살짝 밀림 · 표를 밀면 접혀 사라짐 (0.2초)
// node scripts/qa/batch344.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003'
const P = 'bbbbbbbb-0000-4000-8000-0000003440b1', Q = 'bbbbbbbb-0000-4000-8000-0000003440b2', R = 'bbbbbbbb-0000-4000-8000-0000003440b3'
const OTHER = '99999999-0000-4000-8000-0000003440c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()

;(async () => {
  const [job] = await rest(`jobs?id=eq.${J}`)
  const CO = job.company_id
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  for (const [id, name, phone] of [[P, '사사일', '01034403441'], [Q, '사사이', '01034403442'], [R, '사사삼', '01034403443']]) {
    await rest('users', 'POST', { ...kb, id, name, phone, nickname: null, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  }
  const { applications: _a, attendance: _t, ...jl } = job
  const [doc0] = await rest(`signed_docs?status=eq.signed&user_id=eq.${W}`)
  for (const [uid, name, signedH] of [[P, '사사일', 1], [Q, '사사이', 72], [R, '사사삼', 72]]) {
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: uid, status: 'approved', available_dates: null, position: null, message: null, contract_received_at: null, created_at: ago(200), job: jl, user: { id: uid, name, phone: '01034403441' } })
    await rest('signed_docs', 'POST', { ...doc0, id: crypto.randomUUID(), user_id: uid, signed_at: ago(signedH), created_at: ago(signedH + 1), worker: { name, phone: '01034403441', birth_date: '1990-01-01', address: '서울' } })
  }
  // 다른 회사의 다른 공고 (Q가 거기서 받은 변경 알림은 이 공고와 상관없음 — DB에서 알림의 회사는 공고를 따라감)
  const JO = 'cccccccc-0000-4000-8000-0000003440a9'
  await rest('jobs', 'POST', { ...jl, id: JO, company_id: OTHER, title: '다른 회사 행사', applications: [], attendance: [], created_at: new Date().toISOString() })
  const change = (id, uid, co, h, jobId = J) => rest('messages', 'POST', { id, thread_user_id: uid, sender_id: A, from_admin: true, company_id: co, job_id: jobId, body: `🔔 일정 변경\n${job.title}의 내용이 바뀌었어요.\n시간: 09:00~18:00 → 10:00~19:00\n장소: 광장 → 실내 체육관\n못 오게 되면 앱에서 담당자에게 알려 주세요.`, read_at: null, created_at: ago(h), job: { id: J, title: job.title }, sender: { name: '관리자' }, user: { id: uid, name: 'x', phone: '0' } })
  // R: 72시간 전 서명 → 2시간 전 변경 알림 = 바뀜 / P: 1시간 전 서명 ← 2시간 전 변경 = 아님 / Q: 72시간 전 서명, 변경 알림은 다른 회사 공고 것 = 아님
  // (기본 근무자 W는 같은 서류 칸에 서명 대기가 함께 있어 표에서 대기가 보이므로 쓰지 않음 · 변경 알림 없음 = 해당 없음)
  await change(3440001, R, CO, 2)
  await change(3440002, P, CO, 2)
  await change(3440003, Q, OTHER, 2, JO)

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
  const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 서류 탭: 서명 뒤 일정이 바뀐 서류
  const a = await mk(A)
  await go(a, `/admin/jobs/${J}?tab=docs`)
  const box = a.locator('[data-doc-stale]')
  await box.waitFor({ timeout: 10000 }).catch(() => {})
  const boxText = one(await box.innerText().catch(() => ''))
  ok("위 안내: '서명한 뒤 일정이 바뀐 서류 1건'", (await box.getAttribute('data-doc-stale').catch(() => '')) === '1' && boxText.includes('서명한 뒤 일정이 바뀐 서류 1건'), boxText.slice(0, 120))
  ok('바뀐 내용 두 줄 (시간 · 장소: 이전 → 이후)', (await a.locator('[data-doc-stale-changes] li').count()) === 2 && boxText.includes('시간 09:00~18:00 → 10:00~19:00') && boxText.includes('장소 광장 → 실내 체육관'), boxText)
  ok('이름: 바뀐 사람만 (사사삼) · 늦게 서명한 사람 · 다른 회사 공고 알림 · 알림 없는 사람은 빠짐', boxText.includes('사사삼') && !boxText.includes('사사일') && !boxText.includes('사사이') && !boxText.includes('근무자,'), boxText)
  const cells = a.locator('[data-doc-stale-cell]')
  const cellRow = one(await cells.first().evaluate((e) => e.closest('tr')?.innerText ?? '').catch(() => ''))
  ok("표 칸 '일정 바뀜' 배지: 1개 · 사사삼 줄", (await cells.count()) === 1 && cellRow.startsWith('사사삼'), cellRow.slice(0, 60))
  const rbtn = await cells.first().evaluate((e) => e.closest('td')?.querySelector('form button')?.className ?? '').catch(() => '')
  ok('그 칸의 재서명 글자는 눈에 띄게 (주황)', rbtn.includes('text-amber-700'), rbtn)
  ok('360px 옆으로 밀림 없음 (서류 탭)', await noSide(a))
  if (SHOTS) {
    await box.scrollIntoViewIfNeeded()
    await a.waitForTimeout(350)
    await a.screenshot({ path: `${SHOTS}/doc-stale.png` })
  }

  // ── 2. 보관 안내: 한 줄 + 자세히
  const note = a.locator('[data-docs-note]')
  ok("보관 안내 한 줄: '서명한 서류는 그때 내용 그대로 보관돼요' (접혀 있음)", one(await note.locator('summary').innerText()) === '서명한 서류는 그때 내용 그대로 보관돼요' && !(await note.evaluate((e) => e.open)))
  await note.locator('summary').click()
  await a.waitForTimeout(350)
  const np = await note.locator('p').evaluate((e) => ({ t: e.innerText, an: getComputedStyle(e).animationName, d: parseFloat(getComputedStyle(e).animationDuration) }))
  ok('누르면: 재서명 · 3년 보관 설명 (0.25초 내려옴)', np.t.includes('재서명') && np.t.includes('3년 동안 보관') && np.an === 'slide-down' && Math.abs(np.d - 0.25) < 0.01, JSON.stringify(np))

  // ── 3. 정산 탭 '옆으로 밀면' 안내
  await go(a, `/admin/jobs/${J}?tab=pay`)
  const hint = a.locator('[data-swipe-hint]')
  await hint.waitFor({ timeout: 10000 }).catch(() => {})
  const geo = await hint.evaluate((e) => {
    const wrap = e.parentElement
    const card = wrap.nextElementSibling
    const r = e.getBoundingClientRect(), c = card.getBoundingClientRect()
    return { bottom: r.bottom, top: c.top, h: r.height, state: wrap.getAttribute('data-swipe-state'), arrow: getComputedStyle(e.querySelector('span')).animationName }
  })
  ok('안내가 보임 · 글자 아래가 표 카드에 가려지지 않음', geo.state === 'show' && geo.h > 10 && geo.bottom <= geo.top + 0.5, JSON.stringify(geo))
  ok('화살표 살짝 밀림 (nudge-x)', geo.arrow === 'nudge-x', geo.arrow)
  ok("글: '이름은 그대로 두고 옆으로 밀면 공제·계좌·지급이 보여요 →'", one(await hint.innerText()) === '이름은 그대로 두고 옆으로 밀면 공제·계좌·지급이 보여요 →', one(await hint.innerText()))
  if (SHOTS) {
    await hint.scrollIntoViewIfNeeded()
    await a.screenshot({ path: `${SHOTS}/pay-hint.png` })
  }
  await a.locator('[data-pay-table]').evaluate((e) => e.scrollBy({ left: 160 }))
  await a.waitForTimeout(450)
  const after = await hint.evaluate((e) => ({ state: e.parentElement.getAttribute('data-swipe-state'), h: e.parentElement.getBoundingClientRect().height }))
  ok('표를 밀면 안내가 접혀 사라짐', after.state === 'done' && after.h < 1, JSON.stringify(after))
  ok('360px 옆으로 밀림 없음 (정산 탭)', await noSide(a))

  // ── 4. 신고자료 '근무자별 합계'에도 같은 안내 (표가 넘칠 때)
  await go(a, '/admin/reports')
  const rh = a.locator('[data-report-table]').locator('xpath=ancestor::div[contains(@class,"card")]/preceding-sibling::div[1]//p[@data-swipe-hint]')
  ok("신고자료: '성명은 그대로 두고 옆으로 밀면 세금·실지급액이 보여요 →'", one(await rh.innerText().catch(() => '')).startsWith('성명은 그대로 두고 옆으로 밀면'), one(await rh.innerText().catch(() => '')))

  // ── 5. 넓은 화면(태블릿 이상)에서는 안내 없음
  const wide = await mk(A, { viewport: { width: 1024, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })
  await go(wide, `/admin/jobs/${J}?tab=pay`)
  ok('넓은 화면: 안내 숨김', !(await wide.locator('[data-swipe-hint]').isVisible().catch(() => false)))

  // ── 6. 움직임 줄이기: 화살표 안 움직임 (거의 0초)
  const r = await mk(A, { reducedMotion: 'reduce' })
  await go(r, `/admin/jobs/${J}?tab=pay`)
  const rd = await r.locator('[data-swipe-hint] span').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration)).catch(() => 1)
  ok('움직임 줄이기: 화살표 움직임 거의 0초', rd < 0.01, String(rd))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
