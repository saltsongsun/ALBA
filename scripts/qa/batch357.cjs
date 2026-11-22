// 묶음 357 (정기 개선 2026-11-23 03:35 KST · 다른 회사 '관리자 신청' + 신고자료 달 바꾸기 움직임)
// · 여러 회사를 맡은 관리자: 내가 대표인 다른 회사에 승인을 기다리는 관리자 가입 신청이 있으면
//   관리자 홈 '다른 회사에 확인할 일' 칩에 '관리자 신청 n' (누르면 그 회사로 → '관리자 가입 신청 · 승인해 주세요') · 회사 고르기에도 '· 관리자 신청 n' + 빨간 점
//   - 대표가 아닌(관리자로만 있는) 회사의 신청은 세지 않음 (승인은 대표만) · 다른 사람 회사는 안 나옴
// · 정산·신고자료: 달을 바꾸면 달 이름이 톡(0.25초) · 합계 카드가 살짝 올라옴(0.25초) · 움직임 줄이기면 바로 · 숫자는 그대로
// node scripts/qa/batch357.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-0000003570c2' // A가 대표 · 신청 2명
const C3 = '99999999-0000-4000-8000-0000003570c3' // A는 관리자 · 신청 1명 (세지 않음)
const C4 = '99999999-0000-4000-8000-0000003570c4' // A와 상관없는 회사 · 신청 1명
const R1 = 'bbbbbbbb-0000-4000-8000-0000003570b1', R2 = 'bbbbbbbb-0000-4000-8000-0000003570b2', R3 = 'bbbbbbbb-0000-4000-8000-0000003570b3', R4 = 'bbbbbbbb-0000-4000-8000-0000003570b4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const co = (id, name) => rest('companies', 'POST', { id, company_name: name, ceo_name: '대표', active: true, verified: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  await co(C2, '둘째회사357')
  await co(C3, '셋째회사357')
  await co(C4, '남의회사357')
  await rest('company_members', 'POST', { company_id: C2, user_id: A, role: 'owner', created_at: '2026-10-01T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C3, user_id: A, role: 'admin', created_at: '2026-10-01T00:00:00Z' })
  const [au] = await rest(`users?id=eq.${A}`)
  for (const [id, name] of [[R1, '신청일357'], [R2, '신청이357'], [R3, '신청삼357'], [R4, '신청사357']]) await rest('users', 'POST', { ...au, id, name, phone: `0103570${id.slice(-4)}`, role: 'worker', is_super: false })
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
  await rest('company_join_requests', 'POST', { company_id: C2, user_id: R1, created_at: ago(2) })
  await rest('company_join_requests', 'POST', { company_id: C2, user_id: R2, created_at: ago(1) })
  await rest('company_join_requests', 'POST', { company_id: C3, user_id: R3, created_at: ago(1) })
  await rest('company_join_requests', 'POST', { company_id: C4, user_id: R4, created_at: ago(1) })

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
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 지금 회사(C1) 홈: 다른 회사 칩
  const a = await mk(A)
  await go(a, '/admin')
  const bar = a.locator('[data-other-companies]')
  await bar.waitFor({ timeout: 15000 }).catch(() => {})
  const chip = (name) => bar.locator('form', { hasText: name })
  ok("'다른 회사에 확인할 일'", one(await bar.locator('span').first().innerText().catch(() => '')).endsWith('다른 회사에 확인할 일'), one(await bar.innerText().catch(() => '')).slice(0, 80))
  ok("대표인 회사 칩: '관리자 신청 2'", one(await chip('둘째회사357').locator('[data-other-join]').innerText().catch(() => '')) === '관리자 신청 2', one(await chip('둘째회사357').innerText().catch(() => '')))
  ok('관리자로만 있는 회사의 신청은 세지 않음', (await chip('셋째회사357').locator('[data-other-join]').count()) === 0)
  ok('상관없는 회사는 안 나옴', (await chip('남의회사357').count()) === 0)
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await bar.screenshot({ path: `${SHOTS}/other-join-chip.png` }).catch(() => {})

  // 회사 고르기: '· 관리자 신청 2' + 빨간 점
  const opt = await a.locator('select[name=company] option', { hasText: '둘째회사357' }).innerText().catch(() => '')
  ok("회사 고르기: '둘째회사357 · 관리자 신청 2'", one(opt).startsWith('둘째회사357 · 관리자 신청 2'), one(opt))
  ok('회사 고르기 빨간 점', (await a.locator('[data-other-unread]').count()) === 1)
  const opt3 = await a.locator('select[name=company] option', { hasText: '셋째회사357' }).innerText().catch(() => '')
  ok('관리자로만 있는 회사 고르기엔 신청 없음', !opt3.includes('관리자 신청'), one(opt3))

  // 칩을 누르면 그 회사로 → '관리자 가입 신청 · 승인해 주세요 2' → 관리자 목록
  await Promise.all([a.waitForLoadState('networkidle'), chip('둘째회사357').locator('button').click()])
  await a.waitForTimeout(800)
  await a.locator('[data-todo="join"]').waitFor({ timeout: 15000 }).catch(() => {})
  const todo = a.locator('[data-todo="join"]')
  ok("그 회사로 바뀌고 '관리자 가입 신청 · 승인해 주세요' 2", (await todo.count()) === 1 && one(await todo.innerText()).includes('관리자 가입 신청') && one(await todo.innerText()).includes('2'), one(await todo.innerText().catch(() => '')))
  ok('할 일 → 관리자 목록', (await todo.locator('a').first().getAttribute('href')) === '/admin/settings#admins')
  // 이제 C1 칩에는 관리자 신청 없음 (C1엔 신청 없음)
  ok('지금 회사(C2)는 칩에 안 나옴', (await a.locator('[data-other-companies] form', { hasText: '둘째회사357' }).count()) === 0)

  // ── 2. 정산·신고자료: 달 바꾸기 움직임
  const r = await mk(A)
  await go(r, '/admin/reports')
  const label = r.locator('[data-month-label]')
  await label.waitFor({ timeout: 15000 }).catch(() => {})
  const anim = (loc) => loc.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])
  ok('달 이름 톡 0.25초', JSON.stringify(await anim(label)) === JSON.stringify(['pop', '0.25s']), JSON.stringify(await anim(label)))
  const sum = r.locator('[data-report-summary]')
  ok('합계 카드 올라옴 0.25초', JSON.stringify(await anim(sum)) === JSON.stringify(['rise', '0.25s']), JSON.stringify(await anim(sum)))
  const before = one(await label.innerText())
  await Promise.all([r.waitForURL((u) => u.searchParams.has('month'), { timeout: 15000 }).catch(() => {}), r.locator('[data-month-prev]').click()])
  await r.waitForLoadState('networkidle')
  await r.waitForTimeout(400)
  const after = one(await r.locator('[data-month-label]').innerText())
  ok('지난 달로 바뀜 (달 이름 다시 톡)', before !== after && after.includes('이번 달로') && (await anim(r.locator('[data-month-label]')))[0] === 'pop', `${before} → ${after}`)
  ok('합계 숫자는 그대로 글자 (0원)', one(await r.locator('[data-report-gross]').innerText()).endsWith('원'))
  ok('360px 옆으로 안 밀림 (신고자료)', await noSide(r))
  const rm = await mk(A, { reducedMotion: 'reduce' })
  await go(rm, '/admin/reports')
  const rd = await rm.locator('[data-report-summary]').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
