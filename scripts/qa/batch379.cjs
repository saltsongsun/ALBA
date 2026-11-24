// 묶음 379 (정기 개선 2026-11-24 20:36 KST)
// · 관리자 공고 화면 '모집 마감' 버튼: 한 번 누르면 '마감하면 확정 n명에게 서류가 가요' (서류가 아직 없는 확정자 · 앱 서명 서식이 있을 때만)
//   (근로계약서는 모집 마감 후 — 사용자 요청 2026-11-24 · 마감 버튼이 무엇을 하는지 누르기 전에 알게)
//   · 인원이 다 찬 큰 버튼 · 회색 '모집 마감하기' 둘 다 · 더보기의 '모집 마감' 줄 오른쪽에 '확정 n명에게 서류'
//   · 종이 계약서만 있는 공고(앱 서류 없음)·서류가 이미 있으면 예전처럼 '한 번 더 누르면 모집 마감'
// · 근무자 내 근무: 확정했는데 서류가 아직 안 온 예정 근무 카드에 '서명할 서류는 모집이 끝나면 와요' (한 줄 · 종이 계약서만 있으면 없음 · 서류가 오면 사라짐)
// node scripts/qa/batch379.cjs <default 앱> <default 가짜> <shots>
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
const JF = 'cccccccc-0000-4000-8000-000000037901', JO = 'cccccccc-0000-4000-8000-000000037902', JP = 'cccccccc-0000-4000-8000-000000037903'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003790${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003790${String(n).padStart(2, '0')}`
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
  const { company, applications, ...jrow } = j
  const base = { ...jrow, company_id: C1, status: 'open', required_docs: [TPL], contract_method: 'app', start_time: '09:00:00', end_time: '18:00:00', created_at: nowIso, audience: 'worker' }
  const jobs = {
    [JF]: { ...base, id: JF, title: '다 찬 공고379', headcount: 2, start_date: kday(5), end_date: kday(5) },
    [JO]: { ...base, id: JO, title: '모집 중 공고379', headcount: 10, start_date: kday(8), end_date: kday(8) },
    [JP]: { ...base, id: JP, title: '종이 계약 공고379', headcount: 10, contract_method: 'paper', start_date: kday(6), end_date: kday(6) },
  }
  for (const row of Object.values(jobs)) await rest('jobs', 'POST', row)
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 4; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}379`, phone: `010379000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  // 가짜 DB는 함께 읽기(join)를 안 해서 지원서에 사람·공고 정보를 같이 넣어 둠
  const app = (n, uid, job, status) =>
    rest('applications', 'POST', { id: AP(n), company_id: C1, job_id: job, user_id: U(uid), user: usr[uid], job: { ...jobs[job], company: { company_name: '주식회사 테스트' } }, status, available_dates: null, message: null, decided_at: status === 'approved' ? nowIso : null, held_at: null, position: null, contract_received_at: null, created_at: nowIso })
  await app(1, 1, JF, 'approved')
  await app(2, 2, JF, 'approved')
  await app(3, 3, JF, 'applied')
  await app(4, 1, JO, 'approved')
  await app(5, 4, JP, 'approved')

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const armed = async (btn) => {
    await btn.click()
    await btn.page().waitForTimeout(400)
    return { text: one(await btn.innerText().catch(() => '')), state: await btn.getAttribute('data-confirm').catch(() => null), fits: await btn.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height < 64).catch(() => false) }
  }
  const a = await pg(A)

  // ── 1. 근무자 내 근무: 서류가 아직 안 온 확정 근무 → '서명할 서류는 모집이 끝나면 와요' (종이 계약만인 공고는 없음)
  const w1 = await pg(U(1))
  await open(w1, '/me')
  const later1 = w1.locator('[data-docs-later]')
  ok("근무자1 내 근무: 두 예정 근무 카드에 '서명할 서류는 모집이 끝나면 와요' (한 줄)", (await later1.count()) === 2 && (await later1.allInnerTexts()).every((t) => one(t) === '서명할 서류는 모집이 끝나면 와요') && (await later1.evaluateAll((els) => els.every((el) => el.getBoundingClientRect().height < 22))), JSON.stringify((await later1.allInnerTexts()).map(one)))
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w1))
  if (SHOTS) await w1.locator('[data-next-work]').first().screenshot({ path: `${SHOTS}/me-next-docs-later.png` }).catch(() => {})
  const w4 = await pg(U(4))
  await open(w4, '/me')
  ok('종이 계약서만 있는 공고: 줄 없음 (앱 서류가 오지 않음)', (await w4.locator('[data-docs-later]').count()) === 0 && (await w4.locator('[data-next-work]').count()) === 1)

  // ── 2. 모집 중(인원 남음) 공고: 회색 '모집 마감하기' → 한 번 누르면 '마감하면 확정 1명에게 서류가 가요'
  await open(a, `/admin/jobs/${JO}`)
  // (누르면 글자가 바뀌므로 글자가 아니라 자리로 찾음)
  const closeBtn = () => a.locator('[data-job-actions="before"] form button[data-confirm]').first()
  const grayBtn = closeBtn()
  ok("회색 '모집 마감하기'", one(await grayBtn.innerText()) === '모집 마감하기')
  const g = await armed(grayBtn)
  ok("'모집 마감하기' 한 번 → '마감하면 확정 1명에게 서류가 가요' (한 줄)", g.state === 'armed' && g.text === '마감하면 확정 1명에게 서류가 가요' && g.fits, JSON.stringify(g))
  if (SHOTS) await a.locator('[data-job-actions="before"]').screenshot({ path: `${SHOTS}/close-armed-gray.png` }).catch(() => {})

  // ── 3. 인원이 다 찬 공고: 큰 버튼 → '마감하면 확정 2명에게 서류가 가요' · 더보기 '모집 마감' 줄에 '확정 2명에게 서류'
  await open(a, `/admin/jobs/${JF}`)
  await a.locator('[data-more-toggle]').click()
  const closeRow = a.locator('[data-more-panel] form button', { hasText: '모집 마감' })
  await closeRow.waitFor({ timeout: 5000 }).catch(() => {})
  ok("더보기 '모집 마감' 줄 오른쪽에 '확정 2명에게 서류' (한 줄)", one(await closeRow.locator('[data-close-docs]').innerText().catch(() => '')) === '확정 2명에게 서류' && (await closeRow.evaluate((el) => el.getBoundingClientRect().height < 56)), one(await closeRow.innerText().catch(() => '')))
  if (SHOTS) await closeRow.screenshot({ path: `${SHOTS}/more-close-docs.png` }).catch(() => {})
  await a.locator('[data-more-toggle]').click()
  const bigBtn = closeBtn()
  ok("큰 '인원이 다 찼어요 · 모집 마감'", one(await bigBtn.innerText()) === '인원이 다 찼어요 · 모집 마감')
  const big = await armed(bigBtn)
  ok("'인원이 다 찼어요 · 모집 마감' 한 번 → '마감하면 확정 2명에게 서류가 가요' (한 줄 · 큰 글씨)", big.state === 'armed' && big.text === '마감하면 확정 2명에게 서류가 가요' && big.fits, JSON.stringify(big))
  ok('360px 옆으로 안 밀림 (공고 화면)', await noSide(a))
  if (SHOTS) await a.locator('[data-job-actions="before"]').screenshot({ path: `${SHOTS}/close-armed-big.png` }).catch(() => {})
  // 두 번째로 누르면 마감 + 서류 + 안내
  await Promise.all([a.waitForURL((u) => u.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), bigBtn.click()])
  const f = one(await a.locator('[role=status]').first().innerText().catch(() => ''))
  const docs = ((await rest(`signed_docs?job_id=eq.${JF}`)) ?? []).filter((d) => d.status !== 'void')
  ok("두 번째로 누르면 마감 · '확정 2명에게 서명할 서류를 보냈어요' · 서류 2건", f.includes('모집을 마감했어요 · 확정 2명에게 서명할 서류를 보냈어요') && docs.length === 2, `${f} · ${docs.length}`)

  // ── 4. 서류가 다 있으면(마감한 뒤 다시 모집 열기) 예전처럼
  await rest(`jobs?id=eq.${JF}`, 'PATCH', { status: 'open' })
  await open(a, `/admin/jobs/${JF}`)
  const again = await armed(closeBtn())
  ok("확정자 모두 서류가 있으면 예전처럼 '한 번 더 누르면 모집 마감'", again.text === '한 번 더 누르면 모집 마감', JSON.stringify(again))
  await a.locator('[data-more-toggle]').click()
  ok("더보기 '모집 마감' 줄에도 서류 안내 없음", (await a.locator('[data-more-panel] [data-close-docs]').count()) === 0)

  // ── 5. 종이 계약서만 있는 공고: 앱 서류가 없으므로 예전처럼
  await open(a, `/admin/jobs/${JP}`)
  const paper = await armed(closeBtn())
  ok("종이 계약서만 있는 공고: '한 번 더 누르면 모집 마감'", paper.text === '한 번 더 누르면 모집 마감', JSON.stringify(paper))

  // ── 6. 서류가 온 뒤 근무자 카드에서 줄이 사라짐 (다 찬 공고 · 모집 중 공고는 그대로)
  await open(w1, '/me')
  ok("서류가 오면 그 공고의 '모집이 끝나면' 줄은 사라짐 (남은 1곳만)", (await w1.locator('[data-docs-later]').count()) === 1)

  // ── 7. 오늘 근무(J)는 예전처럼 (시드)
  ok('기존 오늘 근무 공고 서류 그대로', ((await rest(`signed_docs?job_id=eq.${J}`)) ?? []).length >= 1)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
