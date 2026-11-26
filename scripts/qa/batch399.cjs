// 묶음 399 (정기 개선 2026-11-26 09:35 KST)
// 기능 · 관리자 홈 '오늘 진행 행사' 카드: 시작했는데 안 온 사람에게 앱 '근무 시작 버튼'을 그 자리에서 보내기 (두 번 눌러 보냄)
//   · 보내면 홈에 그대로 · 그 행사 카드로 돌아옴 · 안내 'n명에게 앱 알림을 보냈어요.'
//   · 오늘 보냈으면 '✓ HH:MM 근무 시작 버튼 보냄' + '다시 보내기' (어제 보낸 건 안 셈)
//   · 다른 회사 관리자가 이 공고로 보내려 하면 아무것도 안 감 (회사 확인)
// 디자인 · 카드 안 한 줄 (글자 잘림 없이) · 보낸 표시 톡 · 360px 옆으로 안 밀림
// node scripts/qa/batch399.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000039902'
const A2 = 'aaaaaaaa-0000-4000-8000-000000039902'
const U5 = 'bbbbbbbb-0000-4000-8000-000000039905'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args) =>
  p.evaluate(
    async ({ id, args }) => {
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(args) })
      return { status: r.status, redirect: decodeURIComponent(r.headers.get('x-action-redirect') || ''), text: await r.text() }
    },
    { id: idOf(file, name), args },
  )
const clockNudges = async () => (await rest(`messages?job_id=eq.${J}`)).filter((m) => m.from_admin && (m.body ?? '').startsWith('⏰ 출근 확인'))

;(async () => {
  const today = kday(0)
  // 오늘 하루 종일 진행 중인 행사 (시각과 상관없이 '시작했는데 안 옴'이 되게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _b, ...jl } = job
  const [w] = await rest(`users?id=eq.${W}`)
  // 확정됐는데 아직 출근 기록이 없는 근무자
  await rest('users', 'POST', { ...w, id: U5, name: '안온사람399', phone: '01039900005', attendance: [], ratings: [] })
  await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: U5, company_id: C1, status: 'approved', available_dates: null, created_at: new Date().toISOString(), job: jl, user: { id: U5, name: '안온사람399', phone: '01039900005' } })
  // 어제 보낸 근무 시작 알림 (오늘 보낸 것으로 치면 안 됨)
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: U5, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: '⏰ 출근 확인\n어제 보낸 알림', created_at: new Date(Date.now() - 864e5 - 3600e3).toISOString(), read_at: null })
  // 다른 회사 + 그 회사 대표
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [ua] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른회사399', verified: true, seal_image: null, created_at: new Date().toISOString() })
  await rest('users', 'POST', { ...ua, id: A2, name: '다른대표399', phone: '01039900001', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: new Date().toISOString() })
  const before = (await clockNudges()).length

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { company, reducedMotion } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...(reducedMotion ? { reducedMotion } : {}) })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 홈 카드: 안 온 사람 + '앱으로 근무 시작 버튼 보내기' ──
  const a = await mk(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const card = a.locator(`#today-${J}`)
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const row = card.locator('[data-absent-nudge]')
  ok("오늘 행사 카드에 안 온 사람 전화칩 + '앱으로 근무 시작 버튼 보내기' (어제 보낸 건 '보냄'으로 안 셈)", (await card.locator('[data-absent-call]').innerText().catch(() => '')).includes('안온사람399') && one(await row.innerText().catch(() => '')).startsWith('앱으로 근무 시작 버튼 보내기') && (await row.locator('[data-absent-nudged]').count()) === 0, one(await row.innerText().catch(() => '')))
  ok('한 줄 · 360px 옆으로 안 밀림', (await row.evaluate((el) => el.getBoundingClientRect().height <= 48).catch(() => false)) && (await noSide(a)))
  // 두 번 눌러 보냄
  const btn = row.locator('button')
  await btn.click()
  ok("한 번 누르면 확인 ('n명에게 보낼까요?') · 아직 안 보냄", /명에게 보낼까요\?/.test(await btn.innerText().catch(() => '')) && (await clockNudges()).length === before, await btn.innerText().catch(() => ''))
  await btn.click()
  await a.waitForURL((u) => u.pathname === '/admin' && u.searchParams.get('from') === 'today', { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  const sent = (await clockNudges()).slice(before)
  ok('보내면 홈에 그대로 · 그 행사 카드로 (#today-공고)', new URL(a.url()).pathname === '/admin' && a.url().endsWith(`#today-${J}`), a.url())
  ok('안 온 사람에게만 (이미 근무 중인 사람 빼고) · 이 회사 · 이 공고', sent.length >= 1 && sent.every((m) => m.company_id === C1 && m.job_id === J && m.thread_user_id !== W) && sent.some((m) => m.thread_user_id === U5), JSON.stringify(sent.map((m) => m.thread_user_id)))
  ok("안내 'n명에게 앱 알림을 보냈어요.'", (await a.getByText('명에게 앱 알림을 보냈어요.').count()) > 0)
  await a.locator(`#today-${J} [data-absent-nudged]`).waitFor({ timeout: 10000 }).catch(() => {})
  const nudged = one(await a.locator(`#today-${J} [data-absent-nudged]`).innerText().catch(() => ''))
  ok("보낸 뒤: '✓ HH:MM 근무 시작 버튼 보냄' + '다시 보내기'", /^✓ \d{2}:\d{2} 근무 시작 버튼 보냄$/.test(nudged) && one(await a.locator(`#today-${J} [data-absent-nudge] button`).innerText().catch(() => '')) === '다시 보내기', nudged)
  const top = await a.locator(`#today-${J}`).evaluate((el) => el.getBoundingClientRect().top).catch(() => -1)
  ok('그 행사 카드가 화면에 보임', top >= 0 && top < 740, String(Math.round(top)))
  if (SHOTS) await a.locator(`#today-${J}`).screenshot({ path: `${SHOTS}/today-card.png` }).catch(() => {})

  // ── 2. 다른 회사 관리자: 이 공고로는 못 보냄 ──
  const o = await mk(A2, { company: C2 })
  await o.goto(`${D}/admin`, { waitUntil: 'domcontentloaded' })
  const n0 = (await clockNudges()).length
  const r = await call(o, 'admin', 'nudgeWorkers', [J, 'clockin', today, 'dashboard'])
  ok('다른 회사 관리자: 이 공고로는 아무것도 안 감', (await clockNudges()).length === n0 && !r.redirect.includes('보냈어요'), r.redirect || String(r.status))
  ok('다른 회사 홈에는 이 행사 카드 없음', (await o.locator(`#today-${J}`).count()) === 0)

  // ── 3. 출퇴근 탭에서 보내면 예전처럼 출퇴근 탭으로 ──
  const r2 = await call(a, 'admin', 'nudgeWorkers', [J, 'clockin', today])
  ok('출퇴근 탭에서 보낸 건 그대로 출퇴근 탭으로 돌아감', r2.redirect.split(';')[0].startsWith(`/admin/jobs/${J}?tab=att&date=${today}&m=`), r2.redirect)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
