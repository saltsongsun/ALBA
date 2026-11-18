// 묶음 306 (정기 개선 2026-11-18 22:35 KST)
// · 정산·신고자료 '개인정보 처리 기록': 대금 시트 연동의 일상 기록(맞춤·장부 줄·입금확인·프로젝트)이 최근 40건을 덮지 않게 빼고,
//   개인정보를 시트로 보낸 것(근무자 주민번호·계좌 → 장부 02)은 '거래장부에 근무자 등록 · 주민번호·계좌'로 남김 · 기계용 조각(row=·run=)은 안 보임
//   · 장부 회사 관리자에게만 '📒 대금 시트 연동 기록은 연동 화면에서 →'
// · 대금 시트 연동 기록 화면을 여는 동안 실제 모양의 불러오기 화면 (연결 카드 · 날짜별 연동 줄)
// node scripts/qa/batch306.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000306a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 둘째 회사 + 그 회사 관리자
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '둘째관리자', phone: '01030603060', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-15T00:00:00Z' })

  // 우리 회사 기록: 장부 입금확인 45건(처음 맞춤) + 연동 · 장부 줄 · 근무자 정보 기록 + 주민번호 열람
  const at = (min) => new Date(Date.now() - min * 60e3).toISOString()
  const log = (id, action, detail, min, extra = {}) =>
    rest('audit_logs', 'POST', { id, company_id: C1, actor_id: A, action, target_user_id: W, detail, ip: '1.2.3.4', created_at: at(min), actor: { name: '관리자' }, target: { name: '근무자' }, ...extra })
  for (let i = 0; i < 45; i++) await log(3060100 + i, 'ledger.paid', `장부 입금확인 → 지급 완료 · 1일 · row=${6 + i} · date=2026-11-10 · job=${J} · user=${W}`, 30 + i)
  await log(3060001, 'ledger.sync', '아침 자동 · 장부 1줄 추가 · run=abc', 5, { actor_id: null, actor: null, target_user_id: null, target: null })
  await log(3060002, 'ledger.export', `장부 05) 12줄 추가 · 82,560원 · row=12 · date=2026-11-16 · job=${J} · user=${W} · run=abc`, 5)
  await log(3060003, 'ledger.worker', '장부 02) 근무자 추가 · 근무자 · row=9 · run=abc', 5)
  await log(3060004, 'rrn.view', '주민번호 확인', 200)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 개인정보 처리 기록: 장부 연동 일상 기록은 빠지고, 근무자 정보를 시트로 보낸 것은 쉬운 말로
  const a = await mk(A)
  await a.goto(`${D}/admin/reports`, { waitUntil: 'networkidle' })
  const box = a.locator('[data-audit-log]')
  await box.locator('summary').click()
  const rows = box.locator('tbody tr')
  const texts = (await rows.allTextContents()).map(one)
  ok('장부 입금확인 45건·연동·장부 줄은 개인정보 처리 기록에서 빠짐', texts.every((t) => !/장부 입금확인|ledger\.|장부 05\)|아침 자동/.test(t)), texts.slice(0, 3).join(' | '))
  const worker = texts.find((t) => t.includes('거래장부에 근무자 등록'))
  ok("근무자 주민번호·계좌를 시트로 보낸 기록은 남음 '거래장부에 근무자 등록 주민번호·계좌' (대상 칸에 이름)", !!worker && /거래장부에 근무자 등록\s*주민번호·계좌/.test(worker) && !worker.includes('장부 02)'), worker)
  ok('기계용 조각(row=·run=·job=)은 안 보임', texts.every((t) => !/\b(row|run|job|user)=/.test(t)))
  ok('다른 기록(주민번호 열람)은 그대로', texts.some((t) => t.includes('주민번호 열람')))
  ok("요약 숫자도 장부 연동 일상 기록을 빼고 셈", Number((one(await box.locator('summary').textContent()).match(/최근 (\d+)건/) ?? [])[1]) === (await rows.count()))
  const link = a.locator('[data-audit-ledger-link]')
  ok("장부 회사 관리자: '📒 대금 시트 연동 기록은 연동 화면에서 →' → 연동 화면", (await link.count()) === 1 && (await link.getAttribute('href')) === '/admin/ledger')
  ok('360px 옆으로 안 밀림 (정산·신고자료)', await noSide(a))
  if (SHOTS) await box.screenshot({ path: `${SHOTS}/audit-log.png` }).catch(() => {})

  // ── 2. 다른 회사 관리자: 연동 화면 링크 없음 · 우리 회사 기록도 없음
  const a2 = await mk(A2)
  await a2.goto(`${D}/admin/reports`, { waitUntil: 'networkidle' })
  await a2.locator('[data-audit-log] summary').click().catch(() => {})
  ok('다른 회사 관리자: 연동 화면 링크 없음 · 우리 회사 근무자 정보 기록 안 보임', (await a2.locator('[data-audit-ledger-link]').count()) === 0 && !one(await a2.locator('[data-audit-log]').textContent()).includes('거래장부에 근무자'))

  // ── 3. 연동 기록 화면을 여는 동안: 실제 모양 (회사 설정 한 줄 → 연동 화면 · 응답만 1.5초 늦춤)
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  // 한 줄이 화면에 보이면 연동 화면의 불러오기 모양을 미리 받아 둠 → 그 뒤 화면 내용 응답만 늦춤 (느린 휴대폰 망처럼)
  await a.locator('[data-ledger-link]').scrollIntoViewIfNeeded()
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForTimeout(800)
  await a.route('**/admin/ledger**', async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {})
  })
  await a.locator('[data-ledger-link]').click()
  const sk = a.locator('[data-skeleton="ledger"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('여는 동안 연동 화면 모양 (연결 카드 + 연동 줄 3개)', shown && (await sk.locator('.card').count()) === 4, `shown=${shown} cards=${await sk.locator('.card').count()}`)
  if (SHOTS && shown) await a.screenshot({ path: `${SHOTS}/ledger-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})
  ok('불러오는 화면도 360px 옆으로 안 밀림', await noSide(a))
  await a.locator('[data-ledger-page]').waitFor({ timeout: 15000 }).catch(() => {})
  await a.unroute('**/admin/ledger**')
  ok('다 열리면 연동 기록 화면 (불러오기 모양은 사라짐)', (await a.locator('[data-ledger-page]').count()) === 1 && (await sk.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
