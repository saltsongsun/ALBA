// 묶음 356 (정기 개선 2026-11-23 01:35 KST · 회사 설정 관리자 목록 + 명세서 계좌 등록)
// · 회사 설정 '관리자' 목록: 관리자(대표 아님)는 'M/D(요) 합류' · 사흘 안이면 '새로'(톡 0.25초) · 다른 관리자 번호는 눌러서 전화 (내 번호·대표 줄은 글자만 아님 — 나만 글자)
//   - 관리자 홈 '○○ 관리자가 됐어요 ›' 등으로 #admins에 오면 관리자 칸 테두리가 한 번 퍼짐 (움직임 줄이기면 바로)
//   - 다른 회사 관리자는 목록에 안 나옴 (회사별)
// · 근무자 본인 명세서: 계좌가 없으면 지급계좌 칸에 '없음 · 계좌 등록 →' (내 정보 계좌 칸으로 · 화면에만, 인쇄에는 '-') — 관리자 화면은 그대로 '-'
// node scripts/qa/batch356.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000003560c2'
const NEW = 'aaaaaaaa-0000-4000-8000-0000003560a1', OLD = 'aaaaaaaa-0000-4000-8000-0000003560a2', OTHER = 'aaaaaaaa-0000-4000-8000-0000003560a3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const kstDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 어제 합류한 관리자 · 10/1 합류한 관리자 · 다른 회사만 맡은 관리자
  const [au] = await rest(`users?id=eq.${A}`)
  const joinedAt = new Date(Date.now() - 864e5).toISOString()
  await rest('users', 'POST', { ...au, id: NEW, name: '새관리356', phone: '01035600001', is_super: false })
  await rest('users', 'POST', { ...au, id: OLD, name: '오랜관리356', phone: '01035600002', is_super: false })
  await rest('users', 'POST', { ...au, id: OTHER, name: '남의관리356', phone: '01035600003', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: NEW, role: 'admin', created_at: joinedAt })
  await rest('company_members', 'POST', { company_id: C1, user_id: OLD, role: 'admin', created_at: '2026-10-01T03:00:00Z' })
  await rest('companies', 'POST', { id: C2, company_name: '다른회사356', ceo_name: '다른대표', active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C2, user_id: OTHER, role: 'owner', created_at: joinedAt })

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
  const row = (p, name) => p.locator('#admins li', { hasText: name })

  // ── 1. 대표(A): 목록
  const a = await mk(A)
  await go(a, '/admin/settings#admins')
  const sec = a.locator('#admins')
  await sec.waitFor({ timeout: 15000 }).catch(() => {})
  const nr = row(a, '새관리356'), orr = row(a, '오랜관리356')
  ok(`어제 합류한 관리자: '새로' + '${md(kstDay(Date.parse(joinedAt)))} 합류'`, (await nr.locator('[data-admin-new]').count()) === 1 && one(await nr.locator('[data-admin-joined]').innerText().catch(() => '')) === `· ${md(kstDay(Date.parse(joinedAt)))} 합류`, one(await nr.innerText().catch(() => '')))
  ok("10/1 합류한 관리자: '새로' 없음 · '10/1(목) 합류'", (await orr.locator('[data-admin-new]').count()) === 0 && one(await orr.locator('[data-admin-joined]').innerText().catch(() => '')) === `· ${md('2026-10-01')} 합류`, one(await orr.innerText().catch(() => '')))
  const ownerRow = a.locator('#admins li[data-admin-row="owner"]')
  ok('대표 줄(나): 합류일·새로 없음 · 내 번호는 글자만', (await ownerRow.count()) === 1 && (await ownerRow.locator('[data-admin-joined], [data-admin-new], [data-admin-tel]').count()) === 0)
  ok('다른 관리자 번호는 눌러서 전화', (await nr.locator('[data-admin-tel]').getAttribute('href')) === 'tel:01035600001' && one(await nr.locator('[data-admin-tel]').innerText()) === '010-3560-0001')
  ok("'새로' 톡 0.25초", (await nr.locator('[data-admin-new]').evaluate((el) => getComputedStyle(el).animationDuration)) === '0.25s')
  ok('다른 회사만 맡은 관리자는 목록에 없음', (await row(a, '남의관리356').count()) === 0 && one(await sec.locator('h2 + span').innerText().catch(() => '')) === '3명', one(await sec.locator('h2 + span').innerText().catch(() => '')))
  ok('#admins로 오면 관리자 칸 테두리가 한 번 퍼짐', (await sec.evaluate((el) => getComputedStyle(el).animationName)) === 'flash-ring')
  ok('한 줄(이름) + 한 줄(번호 · 합류) · 360px 옆으로 안 밀림', (await nr.evaluate((el) => el.getBoundingClientRect().height < 70)) && (await noSide(a)), String(await nr.evaluate((el) => el.getBoundingClientRect().height)))
  if (SHOTS) await sec.screenshot({ path: `${SHOTS}/settings-admins.png` })
  // 그냥 들어오면(#admins 없이) 퍼지지 않음
  await go(a, '/admin/settings')
  ok('그냥 열면 퍼지지 않음', (await a.locator('#admins').evaluate((el) => getComputedStyle(el).animationName)) === 'none')

  // ── 2. 새 관리자 본인: 내 줄은 '(나)' · 내 번호는 글자 · 대표 번호는 전화
  const n = await mk(NEW)
  await go(n, '/admin/settings#admins')
  const mine = row(n, '새관리356')
  ok("본인 줄: '(나)' · '새로' · 내 번호는 글자만", one(await mine.innerText().catch(() => '')).includes('(나)') && (await mine.locator('[data-admin-new]').count()) === 1 && (await mine.locator('[data-admin-tel]').count()) === 0)
  ok('대표 번호는 눌러서 전화', (await n.locator('#admins li[data-admin-row="owner"] [data-admin-tel]').count()) === 1)

  // ── 3. 움직임 줄이기: 바로
  const r = await mk(A, { reducedMotion: 'reduce' })
  await go(r, '/admin/settings#admins')
  const rd = await r.locator('#admins').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 퍼짐 없이 바로', rd < 0.05, String(rd))

  // ── 4. 근무자 본인 명세서: 계좌 없음 → '없음 · 계좌 등록 →' (인쇄에는 '-')
  const w = await mk(W)
  const [wu] = await rest(`users?id=eq.${W}`)
  ok('(준비) 근무자 계좌 없음', !wu.bank_account_enc)
  await go(w, `/print/payslip/${J}/${W}`)
  const acct = w.locator('[data-payslip-account]')
  await acct.waitFor({ timeout: 15000 }).catch(() => {})
  ok("지급계좌: '없음 · 계좌 등록 →' → 내 정보 계좌 칸", one(await acct.innerText().catch(() => '')) === '없음 · 계좌 등록 →' && (await acct.getAttribute('href')) === '/me/profile#bank_account')
  ok('360px 옆으로 안 밀림 (명세서)', await noSide(w))
  if (SHOTS) await acct.evaluate((el) => el.closest('table').scrollIntoView({ block: 'center' })).then(() => w.waitForTimeout(300)).then(() => acct.evaluate((el) => el.closest('tr')).then(() => w.locator('tr', { has: acct }).screenshot({ path: `${SHOTS}/payslip-account.png` }))).catch(() => {})
  await w.emulateMedia({ media: 'print' })
  const cell = w.locator('tr', { has: w.locator('th', { hasText: '지급계좌' }) }).locator('td')
  ok("인쇄에서는 '-'만 (등록 안내 없음)", !(await acct.isVisible()) && one(await cell.innerText()) === '-', one(await cell.innerText()))
  await w.emulateMedia({ media: 'screen' })
  await Promise.all([w.waitForURL((u) => u.pathname === '/me/profile', { timeout: 15000 }).catch(() => {}), acct.click()])
  ok('누르면 내 정보 (계좌 칸)', new URL(w.url()).pathname === '/me/profile' && new URL(w.url()).hash === '#bank_account', w.url())

  // 관리자가 보는 같은 명세서·한 번에 인쇄: 그대로 '-'
  await go(a, `/print/payslip/${J}/${W}`)
  ok("관리자 화면은 그대로 '-' (등록 안내 없음)", (await a.locator('[data-payslip-account]').count()) === 0 && one(await a.locator('tr', { has: a.locator('th', { hasText: '지급계좌' }) }).locator('td').first().innerText().catch(() => '')) === '-')
  await go(a, `/print/payslip/${J}`)
  ok("한 번에 인쇄에도 안내 없음", (await a.locator('[data-payslip-account]').count()) === 0)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
