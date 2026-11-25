// 묶음 352 (정기 개선 2026-11-22 18:35 KST)
// · 처음 확정하는 회사(아직 한 명도 확정한 적 없음): 대시보드 '확정 대기 지원자' 아래 접힌 안내 '처음이세요? 확정하면 이렇게 돼요'
//   - 펼치면 확정(앱 알림 · 공고 서류 서명 대기) · 단체방 · 미선발(결과 알림) · 보류(알리지 않음) 네 줄 · 0.22초 펼침 (움직임 줄이기면 바로)
//   - 한 명이라도 확정한 회사는 안 보임 · 회사마다 따로 셈 (다른 회사 확정은 상관없음)
// · 외주 업체 홈 큰 글씨: 상황에 맞게 — 아직 어느 회사와도 안 이어짐 '회사와 이어지면 견적 요청이 와요' ·
//   답할 견적 있음 '받은 견적 요청을 확인하세요' · 이어졌는데 답할 것 없음 '새 견적 요청을 기다려요'
// node scripts/qa/batch352.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000352'
const J2 = 'cccccccc-0000-4000-8000-000000035201'
const U = '44444444-0000-4000-8000-000000035201'
const V1 = '77777777-0000-4000-8000-000000003521', V2 = '77777777-0000-4000-8000-000000003522', V3 = '77777777-0000-4000-8000-000000003523'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const now = new Date().toISOString()
  const tmr = kstDay(Date.now() + 2 * 864e5)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job
  // 새 회사(처음 확정): 공고 하나 · 대기 지원자 한 명 · 확정한 사람 없음
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '처음상사352', seal_image: null, created_at: now })
  await rest('jobs', 'POST', { ...jl, id: J2, company_id: C2, title: '첫 행사352', start_date: tmr, end_date: tmr, status: 'open', applications: [], attendance: [], created_at: now })
  await rest('users', 'POST', { id: U, name: '첫지원자352', phone: '01035200001', birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true, member_type: 'worker', created_at: now })
  await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J2, user_id: U, company_id: C2, status: 'applied', available_dates: null, position: null, message: null, contract_received_at: null, decided_at: null, held_at: null, created_at: now, job: { id: J2, title: '첫 행사352', start_date: tmr, end_date: tmr, start_time: '09:00:00', end_time: '18:00:00' }, user: { id: U, name: '첫지원자352', phone: '01035200001' } })
  // 외주 업체 셋: 안 이어짐 · 이어짐+답할 견적 없음 · (답할 견적 있음은 V3에 견적 요청을 붙여서)
  const [w] = await rest(`users?id=eq.${W}`)
  const { attendance: _wa, ratings: _wr, ...wb } = w
  for (const [id, name, phone] of [[V1, '안이어짐352', '01035200011'], [V2, '이어짐352', '01035200012'], [V3, '견적옴352', '01035200013']]) {
    await rest('users', 'POST', { ...wb, id, name, phone, member_type: 'vendor', created_at: now })
  }
  const vbase = { company_id: C1, category: '음향', contact_name: '대표', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: now }
  await rest('vendors', 'POST', { ...vbase, id: '88888888-0000-4000-8000-000000003522', name: '이어짐352', phone: '01035200012', user_id: V2 })
  await rest('vendors', 'POST', { ...vbase, id: '88888888-0000-4000-8000-000000003523', name: '견적옴352', phone: '01035200013', user_id: V3 })
  await rest('quote_requests', 'POST', { id: '99999999-1111-4000-8000-000000003523', company_id: C1, job_id: null, title: '무대 음향 352', details: null, due_date: tmr, status: 'open', created_by: A, created_at: now })
  await rest('quotes', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000035203', request_id: '99999999-1111-4000-8000-000000003523', vendor_id: '88888888-0000-4000-8000-000000003523', token: 'tok352cccccccccccccccccccc', status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, submitted_by: null, created_at: now })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const guide = (p) => p.locator('[data-first-confirm]')

  // ── 1. 처음 확정하는 회사: 접힌 안내가 보임 → 펼치면 네 줄
  const a = await pg(A, C2)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await a.locator('#pending').waitFor({ timeout: 15000 }).catch(() => {})
  ok("처음 확정하는 회사: '처음이세요? 확정하면 이렇게 돼요' (접혀 있음)", (await guide(a).count()) === 1 && one(await guide(a).locator('summary').innerText()) === '처음이세요? 확정하면 이렇게 돼요' && !(await guide(a).evaluate((el) => el.open)))
  const gBox = await guide(a).boundingBox().catch(() => null)
  const firstCard = await a.locator('#pending .stagger > *').first().boundingBox().catch(() => null)
  ok('지원자 카드 위 · 접힌 줄 한 줄(높이 ≤ 48px)', !!gBox && !!firstCard && gBox.y < firstCard.y && gBox.height <= 48, JSON.stringify(gBox))
  await guide(a).locator('summary').click()
  await a.waitForTimeout(350)
  const rows = await guide(a).locator('li').allInnerTexts()
  // 정기 개선 2026-11-25 08:35: 서류는 확정 때가 아니라 모집이 끝나면 가므로 '서류' 줄이 확정 다음에 따로 (다섯 줄)
  ok('펼치면 확정·서류·단체방·미선발·보류 다섯 줄', rows.length === 5 && one(rows[0]) === '확정 · 근무자에게 앱 알림이 가요' && rows[1].startsWith('서류') && rows[1].includes('모집을 마감하면') && rows[2].startsWith('단체방') && rows[3].startsWith('미선발') && rows[4].startsWith('보류') && rows[4].includes('알리지 않고'), JSON.stringify(rows.map(one)))
  const anim = await guide(a).locator('ul').evaluate((el) => getComputedStyle(el).animationDuration).catch(() => '')
  ok('펼칠 때 0.22초 내려옴', anim === '0.22s', anim)
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await guide(a).screenshot({ path: `${SHOTS}/first-confirm.png` }).catch(() => {})

  // ── 2. 한 명이라도 확정한 회사(기본 회사)는 안 보임
  const a1 = await pg(A, C1)
  await a1.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await a1.locator('#pending').waitFor({ timeout: 15000 }).catch(() => {})
  const c1Approved = ((await rest(`applications?company_id=eq.${C1}&status=eq.approved`)) ?? []).length
  ok(`확정한 적 있는 회사(확정 ${c1Approved}명): 안내 없음`, c1Approved > 0 && (await guide(a1).count()) === 0)

  // ── 3. 새 회사에서 확정하면 다음부터는 안 보임
  await rest(`applications?job_id=eq.${J2}&user_id=eq.${U}`, 'PATCH', { status: 'approved' })
  await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J2, user_id: W, company_id: C2, status: 'applied', available_dates: null, position: null, message: null, contract_received_at: null, decided_at: null, held_at: null, created_at: now, job: { id: J2, title: '첫 행사352', start_date: tmr, end_date: tmr, start_time: '09:00:00', end_time: '18:00:00' }, user: { id: W, name: '근무자', phone: '01033334444' } })
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await a.locator('#pending').waitFor({ timeout: 15000 }).catch(() => {})
  ok('한 번 확정한 뒤에는 안내가 사라짐 (대기 지원자는 그대로)', (await guide(a).count()) === 0 && (await a.locator('#pending').innerText()).includes('근무자'))

  // ── 4. 움직임 줄이기: 펼침이 바로
  await rest(`applications?job_id=eq.${J2}&user_id=eq.${U}`, 'PATCH', { status: 'applied' })
  const r = await pg(A, C2, { reducedMotion: 'reduce' })
  await r.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await guide(r).locator('summary').click().catch(() => {})
  const rd = await guide(r).locator('ul').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로 펼쳐짐', rd < 0.05, String(rd))

  // ── 5. 외주 업체 홈 큰 글씨: 상황에 맞게
  const h1 = async (uid) => {
    const p = await pg(uid)
    await p.goto(`${D}/pro`, { waitUntil: 'networkidle' })
    return one(await p.locator('[data-mode="pro"] h1').first().innerText().catch(() => ''))
  }
  const t1 = await h1(V1)
  ok("안 이어진 업체: '회사와 이어지면 견적 요청이 와요'", t1 === '안이어짐352님, 회사와 이어지면 견적 요청이 와요', t1)
  const t2 = await h1(V2)
  ok("이어졌고 답할 견적 없음: '새 견적 요청을 기다려요'", t2 === '이어짐352님, 새 견적 요청을 기다려요', t2)
  const t3 = await h1(V3)
  ok("답할 견적 있음: '받은 견적 요청을 확인하세요'", t3 === '견적옴352님, 받은 견적 요청을 확인하세요', t3)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
