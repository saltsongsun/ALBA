// 묶음 298 (정기 개선 2026-11-18 07:36 KST)
// · 관리자 홈 'n월분 신고': 지난달에 끝난 근무가 있으면 이번 달 신고 마감(원천세 10일 · 근로내용확인신고 15일 · 일용근로소득 지급명세 말일) 중
//   아직 안 지난 것만 D-n으로 (3일 안이면 빨강) · 누르면 그 달 신고자료 · '✓ 했어요'를 누르면 그 줄이 접히고 다시 열어도 그대로 (회사·달마다 따로)
// · 지난달 근무가 없는 회사(다른 회사 포함)엔 칸이 없음
// node scripts/qa/batch298.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000298a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
// 앱이 쓰는 계산 그대로 (src/lib/filing.ts — 다른 파일을 부르지 않는 순수 함수)
const lib = (expr) => JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', `import(${JSON.stringify(path.join(__dirname, '../../src/lib/filing.ts'))}).then((m) => process.stdout.write(JSON.stringify(${expr})))`], { encoding: 'utf8' }))

;(async () => {
  // ── 0. 계산: 날짜마다 남은 마감
  const k = (rows) => rows.map((r) => `${r.key}:${r.left}`).join(',')
  ok('11/1: 원천세 D-9 · 근로내용 D-14 · 지급명세 D-29', k(lib("m.filingDues('2026-11-01')")) === 'tax:9,employment:14,daily:29')
  ok('11/10: 원천세 오늘(0)부터', k(lib("m.filingDues('2026-11-10')")) === 'tax:0,employment:5,daily:20')
  ok('11/16: 지급명세(말일 30일)만', k(lib("m.filingDues('2026-11-16')")) === 'daily:14')
  ok('2월 말일(28일) · 12월 31일', k(lib("m.filingDues('2026-02-28')")) === 'daily:0' && k(lib("m.filingDues('2026-12-31')")) === 'daily:0')
  ok('지난달: 1월이면 지난해 12월', lib("m.prevMonthOf('2026-01-05')") === '2025-12' && lib("m.prevMonthOf('2026-11-18')") === '2026-10')

  const today = kday(0)
  const prev = lib(`m.prevMonthOf(${JSON.stringify(today)})`)
  const dues = lib(`m.filingDues(${JSON.stringify(today)})`)

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
  const a = await mk(A)
  const home = async (p = a) => {
    await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
    await p.waitForTimeout(300)
  }

  // ── 1. 지난달 근무가 없으면 칸 없음
  await home()
  ok('지난달 근무가 없으면 신고 칸 없음', (await a.locator('[data-filing]').count()) === 0)

  // ── 2. 지난달에 끝난 근무가 있으면: 남은 마감만 D-n
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000029801', job_id: J, user_id: W, work_date: `${prev}-15`, clock_in: `${prev}-15T09:00:00+09:00`, clock_out: `${prev}-15T18:00:00+09:00`, adj_in: null, adj_out: null, created_at: `${prev}-15T09:00:00+09:00` })
  await home()
  const card = a.locator('[data-filing]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`'${Number(prev.slice(5))}월분 신고' 칸`, one(await card.locator('h2').textContent().catch(() => '')) === `${Number(prev.slice(5))}월분 신고`)
  const rows = card.locator('[data-filing-row]')
  ok(`아직 안 지난 마감 ${dues.length}개 (${dues.map((d) => d.label).join(' · ')})`, (await rows.count()) === dues.length && (await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-filing-row')))).join() === dues.map((d) => d.key).join())
  const first = rows.first()
  const d0 = dues[0]
  ok(`첫 줄: '${d0.label} · ${Number(d0.due.slice(5, 7))}/${Number(d0.due.slice(8))}까지' · '${d0.left === 0 ? '오늘' : 'D-' + d0.left}'`, one(await first.textContent()).startsWith(`${d0.label}${Number(d0.due.slice(5, 7))}/${Number(d0.due.slice(8))}까지 · ${d0.where}${d0.left === 0 ? '오늘' : 'D-' + d0.left}`), one(await first.textContent()))
  ok('3일 안이면 빨강 · 아니면 회색', /text-(rose-600|sub)/.test(await first.locator('[data-filing-left]').getAttribute('class')) && (await first.locator('[data-filing-left]').getAttribute('class')).includes(d0.left <= 3 ? 'text-rose-600' : 'text-sub'))
  ok('누르면 그 달 신고자료', (await first.locator('a').getAttribute('href')) === `/admin/reports?month=${prev}`)
  ok('한 줄에 들어감 (360px)', await first.evaluate((el) => el.getBoundingClientRect().height < 64))
  ok('360px 옆으로 안 밀림 (관리자 홈)', await noSide(a))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/filing.png` }).catch(() => {})

  // ── 3. '✓ 했어요': 그 줄이 접히고 다시 열어도 그대로
  await first.locator('[data-filing-done]').click()
  await a.waitForTimeout(500)
  ok('누르면 그 줄이 접힘', (await a.locator(`[data-filing-row="${d0.key}"]`).count()) === 0 && (await a.locator('[data-filing-row]').count()) === dues.length - 1)
  await home()
  ok('다시 열어도 접힌 그대로 (남은 줄만 · 다 했으면 칸도 없음)', (await a.locator(`[data-filing-row="${d0.key}"]`).count()) === 0 && (dues.length > 1 ? (await a.locator('[data-filing-row]').count()) === dues.length - 1 : (await a.locator('[data-filing]').count()) === 0))

  // ── 4. 다른 회사(지난달 근무 없음) 관리자: 칸 없음
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01029802980', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  const o = await mk(A2)
  await home(o)
  ok('다른 회사 관리자에겐 우리 회사 근무로 칸이 뜨지 않음', (await o.locator('main').count()) === 1 && (await o.locator('[data-filing]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
