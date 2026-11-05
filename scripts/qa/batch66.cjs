// 묶음 66: 진행바를 모집 인원만큼 칸으로 · '확인' 인원을 가입자·비회원으로 나눠 보여 줌
// · 관리자 홈(진행·예정 공고, 지금 근무 중) · 관리자 공고 목록 · 근무자 공고 카드: 모집 N명이면 N칸, 확정된 만큼 칸이 참
// · 정원보다 많이 확정되면 넘친 칸을 주황으로 더함 · 40칸이 넘으면 이어진 막대
// · 공고 목록·공고 화면: 확인 = 가입자 + 비회원 (예: 확인 3명 (가입자 2명 · 비회원 1명))
// node scripts/qa/batch66.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000000d2', J3 = 'cccccccc-0000-4000-8000-0000000000d3'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000d2', W3 = 'bbbbbbbb-0000-4000-8000-0000000000d3'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const ago = (min) => new Date(Date.now() - min * 60e3).toISOString()

;(async () => {
  // 준비: J는 5명 모집(확정 1) · J2는 2명 모집인데 3명 확정(넘침) · J3는 100명 모집 · 모두 내일 행사
  const tomorrow = kstDate(new Date(Date.now() + 86400e3))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { headcount: 5 })
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: J2, title: '넘친 공고 두 명 모집', headcount: 2, start_date: tomorrow, end_date: tomorrow, status: 'open', applications: [{ status: 'approved' }, { status: 'approved' }, { status: 'approved' }] })
  await rest('jobs', 'POST', { ...j, id: J3, title: '큰 행사 백 명 모집', headcount: 100, start_date: tomorrow, end_date: tomorrow, status: 'open', applications: [] })
  const [w] = await rest(`users?id=eq.${W}`)
  for (const [id, name] of [[W2, '이둘째'], [W3, '이셋째']]) await rest('users', 'POST', { ...w, id, name, attendance: [], ratings: [] })
  for (const [n, uid] of [[1, W], [2, W2], [3, W3]])
    await rest('applications', 'POST', { id: `11111111-0000-4000-8000-0000000000d${n}`, job_id: J2, user_id: uid, status: 'approved', available_dates: null, created_at: new Date().toISOString(), user: { id: uid, name: '근무자', phone: '01012345678', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '근무자', photo_at: null } })
  // 조회: J를 가입자 2명(W, W2) + 비회원 1명이 봄 (비회원은 세 시간 전 · 가입자는 한 시간 전 → 다른 사람)
  await rest('job_views', 'POST', { job_id: J, viewer: 'v:guestguestguest0001', user_id: null, first_seen: ago(180), last_seen: ago(179), visits: 1 })
  for (const uid of [W, W2]) await rest('job_views', 'POST', { job_id: J, viewer: `u:${uid}`, user_id: uid, first_seen: ago(60), last_seen: ago(59), visits: 1 })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, desktop = false) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const bar = (p, scope) => p.locator(`${scope} [role=img][aria-label*="명 중"]`).first()
  const slots = async (p, scope) => {
    const el = bar(p, scope)
    if (!(await el.count())) return null
    return el.evaluate((e) => ({
      slots: e.dataset.slots ? Number(e.dataset.slots) : null,
      on: [...e.children].filter((c) => c.className.includes('animate-grow')).length,
      amber: [...e.children].filter((c) => c.className.includes('bg-amber-400')).length,
      label: e.getAttribute('aria-label'),
    }))
  }

  // ── 1. 관리자 홈: 진행·예정 공고 카드 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin`)
  await ad.locator(`a[href="/admin/jobs/${J2}"]`).first().waitFor({ timeout: 10000 }).catch(() => {})
  const h1 = await slots(ad, `a.card-link[href="/admin/jobs/${J}"]`)
  ok('관리자 홈: 5명 모집 → 5칸 중 1칸', h1?.slots === 5 && h1?.on === 1 && h1?.amber === 0, JSON.stringify(h1))
  const h2 = await slots(ad, `a.card-link[href="/admin/jobs/${J2}"]`)
  ok('관리자 홈: 2명 모집에 3명 확정 → 3칸 모두 + 넘친 1칸 주황', h2?.slots === 3 && h2?.on === 3 && h2?.amber === 1, JSON.stringify(h2))
  const h3 = await slots(ad, `a.card-link[href="/admin/jobs/${J3}"]`)
  ok('관리자 홈: 100명 모집 → 이어진 막대 (칸 없음)', !!h3 && h3.slots === null && h3.label === '100명 중 0명', JSON.stringify(h3))
  ok('360px: 옆으로 안 밀림 (관리자 홈)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 관리자 공고 목록 (휴대폰 카드): 칸 막대 + 확인 (가입 N) ──
  await ad.goto(`${D}/admin/jobs`)
  await ad.locator(`a[href="/admin/jobs/${J}"] [data-views]`).first().waitFor({ timeout: 10000 }).catch(() => {})
  const l1 = await slots(ad, `a[href="/admin/jobs/${J}"]`)
  ok('공고 목록(휴대폰): 5칸 중 1칸', l1?.slots === 5 && l1?.on === 1, JSON.stringify(l1))
  const v1 = (await ad.locator(`a[href="/admin/jobs/${J}"] [data-views]`).first().innerText()).replace(/\s+/g, ' ').trim()
  ok("공고 목록(휴대폰): 확인 3 (가입 2)", /^3 \(가입 2\)/.test(v1), v1)
  ok('360px: 옆으로 안 밀림 (공고 목록)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 관리자 공고 목록 (넓은 화면 표): 확인 3명 · 가입자 2 · 비회원 1 ──
  const wide = await pg(A, true)
  await wide.goto(`${D}/admin/jobs`)
  const row = wide.locator('tr', { has: wide.locator(`a[href="/admin/jobs/${J}"]`) })
  await row.waitFor({ timeout: 10000 }).catch(() => {})
  const cell = (await row.locator('[data-views-cell]').innerText()).replace(/\s+/g, ' ').trim()
  ok("공고 표: '3명' + '가입자 2 · 비회원 1'", cell.startsWith('3명') && cell.includes('가입자 2 · 비회원 1'), cell)

  // ── 4. 공고 화면: 확인 3명 (가입자 2명 · 비회원 1명) ──
  await ad.goto(`${D}/admin/jobs/${J}`)
  await ad.getByText(/확인\s*3\s*명/).first().waitFor({ timeout: 10000 }).catch(() => {})
  const head = (await ad.locator('main').innerText()).replace(/\s+/g, ' ')
  ok('공고 화면: 확인 3명 (가입자 2명 · 비회원 1명)', /확인 3 ?명 \(가입자 2명 · 비회원 1명\)/.test(head), (head.match(/확인[^)]*\)/) || [''])[0])

  // ── 5. 근무자 공고 카드도 칸으로 ──
  const wk = await pg(W)
  await wk.goto(`${D}/`)
  await wk.locator(`a[href="/jobs/${J}"]`).first().waitFor({ timeout: 10000 }).catch(() => {})
  const c1 = await slots(wk, `a[href="/jobs/${J}"]`)
  ok('근무자 공고 카드: 5칸 중 1칸', c1?.slots === 5 && c1?.on === 1, JSON.stringify(c1))
  ok('360px: 옆으로 안 밀림 (근무자 공고)', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
