// 묶음 229 (정기 개선 2026-11-13 08:35 KST)
// · 관리자 합류 승인 대기 화면: 신청 카드마다
//   - 'n시간째' 기다린 시간 · 진행 단계 '신청 ✓ → 승인(지금) → 시작' (끝난 단계가 차례로 채워짐)
//   - '대표에게 다시 알리기' (신청할 때도 알림이 가니 신청·마지막 알림에서 30분 뒤부터 · 누르면 '✓ 알렸어요 · n분 뒤 다시')
//   - 회사 문의 번호가 있으면 '회사 전화' (누르면 전화)
// · 휴대폰 번호 칸 5곳도 쓰는 대로 '-' (관리자 초대 · 새 회사 문의 연락처 · 지원자 '번호로 추가' · 근무자 정보 수정 · 첫 관리자 설치)
// node scripts/qa/batch229.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', N = 'aaaaaaaa-0000-4000-8000-0000000000c1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 회사가 아직 없는 새 관리자 N · 주식회사 테스트에 2시간 전 합류 신청
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: N, name: '김합류', phone: '01055556666', is_super: false })
  await rest('company_join_requests', 'POST', { company_id: C1, user_id: N, created_at: new Date(Date.now() - 2 * 3600e3 - 60e3).toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 기다리는 화면: 시간 · 단계 · 다시 알리기 · 회사 전화
  const n = await mk(N)
  await n.goto(`${D}/start/wait`, { waitUntil: 'networkidle' })
  const card = n.locator(`[data-join-wait="${C1}"]`)
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  ok("카드에 '2시간째' 기다린 시간", one(await card.locator('[data-join-waited]').innerText().catch(() => '')) === '2시간째')
  const steps = card.locator('[data-apply-steps]')
  const dots = await steps.locator('[data-step-dot]').evaluateAll((els) => els.map((e) => e.getAttribute('data-step-dot')))
  ok("진행 단계 3칸: '신청 ✓ → 승인(지금) → 시작'", (await steps.getAttribute('data-apply-steps')) === '2' && dots.join(',') === 'done,now,next' && one(await steps.innerText()).replace(/\s/g, '') === '✓신청2승인3시작', `${dots} / ${one(await steps.innerText())}`)
  const nudge = card.getByRole('button', { name: '대표에게 다시 알리기' })
  ok("2시간 지났으니 '대표에게 다시 알리기' 버튼", (await nudge.count()) === 1 && (await card.locator('[data-join-nudged]').count()) === 0)
  const call = card.locator('[data-join-call]')
  ok("회사 문의 번호로 '회사 전화' (tel:)", (await call.getAttribute('href')) === 'tel:01012345678' && one(await call.innerText()) === '회사 전화')
  const row = await card.locator('[data-join-call]').evaluate((el) => { const r = el.parentElement.getBoundingClientRect(); return r.height })
  ok('버튼 두 개가 한 줄 (360px)', row < 40, String(row))
  ok('360px 옆으로 안 밀림 (기다리는 화면)', await noSide(n))
  ok("예전 안내 '오래 걸리면 대표 관리자에게…'는 버튼으로 바뀜", (await n.getByText('오래 걸리면 대표 관리자에게').count()) === 0)

  // ── 2. 누르면 대표에게 알림 · '✓ 알렸어요 · 30분 뒤 다시'
  await nudge.click()
  await n.waitForURL((u) => new URL(u).searchParams.has('m'), { timeout: 15000 }).catch(() => {})
  await card.locator('[data-join-nudged]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("알림 뒤: '대표 관리자에게 다시 알렸어요.' 안내", await n.getByText('대표 관리자에게 다시 알렸어요.').first().isVisible().catch(() => false))
  const sent = card.locator('[data-join-nudged]')
  ok("버튼 자리에 '✓ 알렸어요 · 30분 뒤 다시' (톡 나타남)", one(await sent.innerText().catch(() => '')) === '✓ 알렸어요 · 30분 뒤 다시' && ((await sent.getAttribute('class')) ?? '').includes('animate-pop') && (await nudge.count()) === 0, one(await sent.innerText().catch(() => '')))
  const row2 = await sent.evaluate((el) => el.parentElement.getBoundingClientRect().height).catch(() => 99)
  const line = await card.locator('[data-join-waited]').evaluate((el) => { const p = el.parentElement; return { h: p.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(p).lineHeight), cut: p.scrollWidth > p.clientWidth + 1, t: p.innerText } })
  ok("알린 뒤에도 '✓ 알렸어요' · '회사 전화'가 한 줄 · 기다린 시간 줄도 한 줄 (잘림 없음)", row2 < 40 && line.h <= line.lh * 1.2 && !line.cut, `${row2} ${JSON.stringify(line)}`)
  ok("기다린 시간 줄: '2시간째 · (오늘이면 시각 / 아니면 날짜) 신청'", /^2시간째 · (\d{2}:\d{2}|\d{1,2}\/\d{1,2}) 신청$/.test(one(line.t)), line.t)
  const ev = ((await rest('rate_events')) ?? []).filter((e) => e.bucket === `join-nudge:${N}:${C1}`)
  ok('알림 기록 1번', ev.length === 1, String(ev.length))
  if (SHOTS) {
    await n.waitForTimeout(400)
    const bx = await card.boundingBox()
    if (bx) await n.screenshot({ path: `${SHOTS}/join-wait.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }

  // ── 3. 방금 신청했으면 (신청 알림이 막 감) 버튼 대신 '알렸어요 · n분 뒤 다시'
  await rest(`rate_events?bucket=eq.join-nudge:${N}:${C1}`, 'DELETE')
  await rest(`company_join_requests?user_id=eq.${N}`, 'PATCH', { created_at: new Date(Date.now() - 5 * 60e3).toISOString() })
  await n.goto(`${D}/start/wait`, { waitUntil: 'networkidle' })
  const left = Number(await card.locator('[data-join-nudged]').getAttribute('data-join-nudged').catch(() => '0'))
  ok("방금 신청: '5분째' · 버튼 대신 '25분 뒤 다시'", one(await card.locator('[data-join-waited]').innerText().catch(() => '')) === '5분째' && left >= 24 && left <= 25 && (await nudge.count()) === 0, String(left))

  // ── 4. 회사 문의 번호가 없으면 '회사 전화'도 없음
  await rest(`companies?id=eq.${C1}`, 'PATCH', { contact_phone: null, company_phone: null })
  await n.goto(`${D}/start/wait`, { waitUntil: 'networkidle' })
  ok("번호가 없는 회사: '회사 전화' 안 보임", (await card.count()) === 1 && (await card.locator('[data-join-call]').count()) === 0)
  await rest(`companies?id=eq.${C1}`, 'PATCH', { contact_phone: '01012345678', company_phone: '0212345678' })

  // ── 5. '움직임 줄이기'면 단계가 바로 (톡 움직임 없음)
  const r = await mk(N, { reducedMotion: 'reduce' })
  await r.goto(`${D}/start/wait`, { waitUntil: 'networkidle' })
  // 앱 전체 규칙: 움직임 줄이기면 모든 움직임을 0.01ms로 (사실상 바로)
  const an = await r.locator('[data-step-dot="done"]').first().evaluate((el) => getComputedStyle(el).animationDuration).catch(() => '?')
  ok("'움직임 줄이기'면 단계 동그라미가 바로 나타남", parseFloat(an) < 0.001, an)

  // ── 6. 휴대폰 번호 칸: 쓰는 대로 '-'
  const a = await mk(A)
  const typeIn = async (loc, digits) => {
    await loc.click()
    await loc.pressSequentially(digits, { delay: 10 })
    return loc.inputValue()
  }
  await a.goto(`${D}/admin/companies`, { waitUntil: 'networkidle' })
  ok("회사 관리 · 관리자 초대 번호: '010-7777-8888'", (await typeIn(a.locator('input[aria-label="관리자 휴대폰 번호"]').first(), '01077778888')) === '010-7777-8888')
  ok("새 회사 만들기 · 문의 연락처(서울): '02-1234-5678'", (await typeIn(a.locator('input[name="contact_phone"]').first(), '0212345678')) === '02-1234-5678')
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  const add = a.locator('[data-direct-add]')
  await add.locator('summary').click()
  const addPhone = add.locator('input[name=phone]')
  await addPhone.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("지원자 '번호로 추가': '010-1234-5678'", (await typeIn(addPhone, '01012345678')) === '010-1234-5678')
  await a.goto(`${D}/admin/workers/${W}`, { waitUntil: 'networkidle' })
  const fold = a.locator('summary', { hasText: '정보 수정' }).first()
  await fold.click().catch(() => {})
  const editPhone = a.locator('form input[name="phone"]').first()
  await editPhone.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("근무자 정보 수정(최고 관리자): 저장된 번호도 '010-3333-4444' 모양", (await editPhone.inputValue().catch(() => '')) === '010-3333-4444', await editPhone.inputValue().catch(() => ''))
  await editPhone.fill('')
  ok('근무자 정보 수정: 새로 써도 자동 -', (await typeIn(editPhone, '01099990000')) === '010-9999-0000')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
