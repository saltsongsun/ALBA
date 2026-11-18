// 묶음 307 (정기 개선 2026-11-19 00:35 KST)
// · 근무자 공고 화면: 예정 종료가 지났어도 지금 일하는 중이면 위 배지가 '오늘 근무 종료'·'마감' 대신 숨 쉬는 초록 점 '근무 중'
//   (아래 '지금 근무 중 · HH:MM 시작'과 같은 말 · 퇴근하면 다시 '오늘 근무 종료'·'마감')
// · 정산·신고자료 '개인정보 처리 기록': 휴대폰은 표 대신 한 건에 두 줄 (내용 · 대상 / 시각 · 처리자 · 자세히) — 좁은 칸에서 여러 줄로 꺾이지 않게
// node scripts/qa/batch307.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const hm = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 16)

;(async () => {
  // 공고는 어제 끝남(예정 종료가 지남) · 근무자는 2시간 반 전에 시작해 아직 퇴근 전 (밤늦게까지 일하는 중) — 시각과 상관없이
  const now = new Date()
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(-1), end_date: kday(-1) })
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { clock_in: new Date(now.getTime() - 2.5 * 3600e3).toISOString(), clock_out: null })
  // 개인정보 처리 기록 한 건 더 (긴 내용)
  await rest('audit_logs', 'POST', { id: 3070001, company_id: '99999999-0000-4000-8000-000000000099', actor_id: A, action: 'rrn.view', target_user_id: W, detail: '주민번호 확인 · 근로내용확인신고 준비', ip: '1.2.3.4', created_at: new Date().toISOString(), actor: { name: '관리자' }, target: { name: '근무자' } })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무자: 예정 종료가 지났지만 일하는 중 → '근무 중' (종료 아님)
  const w = await mk(W)
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  const live = w.locator('[data-live-badge]')
  ok("위 배지 '근무 중' (숨 쉬는 초록 점) · '오늘 근무 종료' 없음", (await live.count()) === 1 && one(await live.textContent()) === '근무 중' && (await live.locator('.motion-safe\\:animate-ping').count()) === 1 && (await w.locator('[data-over-today]').count()) === 0)
  ok("아래 '지금 근무 중 · HH:MM 시작'과 같은 말", one(await w.locator('main').textContent()).includes('지금 근무 중'))
  if (SHOTS) await w.locator('main .card').first().screenshot({ path: `${SHOTS}/job-live-badge.png` }).catch(() => {})

  // ── 2. 퇴근하면 다시 끝난 공고 배지 ('마감')
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { clock_out: new Date(now.getTime() - 60e3).toISOString() })
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  ok("퇴근 뒤엔 '근무 중' 대신 '마감'", (await w.locator('[data-live-badge]').count()) === 0 && one(await w.locator('main .card').first().locator('.badge').first().textContent()) === '마감')

  // ── 3. 개인정보 처리 기록: 휴대폰은 두 줄 목록
  const a = await mk(A)
  await a.goto(`${D}/admin/reports`, { waitUntil: 'networkidle' })
  const box = a.locator('[data-audit-log]')
  await box.locator('summary').click()
  // 펼치는 움직임이 끝날 때까지
  await box.locator('[data-audit-list]').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  const items = box.locator('[data-audit-item]')
  ok('휴대폰: 표 대신 목록 (표는 숨김)', (await box.locator('[data-audit-list]').isVisible()) && !(await box.locator('table').isVisible()) && (await items.count()) >= 2)
  const it = items.filter({ hasText: '근로내용확인신고 준비' }).first()
  ok("한 건 두 줄: '주민번호 열람 · 근무자' / '시각 · 관리자 · 자세히'", /^주민번호 열람\s*· 근무자$/.test(one(await it.locator('p').first().textContent())) && /^\d+\/\d+\(.\) \d\d:\d\d · 관리자 · 주민번호 확인 · 근로내용확인신고 준비$/.test(one(await it.locator('p').nth(1).textContent())), one(await it.textContent()))
  ok('각 줄은 한 줄 (꺾이지 않음)', await it.locator('p').evaluateAll((ps) => ps.every((p) => p.getBoundingClientRect().height < 24)))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await box.screenshot({ path: `${SHOTS}/audit-list.png` }).catch(() => {})
  // 넓은 화면은 그대로 표
  const wide = await b.newPage({ viewport: { width: 1024, height: 800 } })
  await wide.context().addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  await wide.goto(`${D}/admin/reports`, { waitUntil: 'networkidle' })
  await wide.locator('[data-audit-log] summary').click()
  await wide.locator('[data-audit-log] table').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  ok('넓은 화면은 표 그대로', (await wide.locator('[data-audit-log] table').isVisible()) && !(await wide.locator('[data-audit-list]').isVisible()))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
