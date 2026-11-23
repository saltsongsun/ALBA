// 묶음 271 (정기 개선 2026-11-16 08:35 KST)
// · 관리자 홈 '확인할 일': 오늘 근무하는데 근로계약서 등에 서명 안 한 확정자 → '오늘 근무 · 서명 안 함 · 공고 n명' (빨강)
//   (전엔 내일 근무만 있었음 · 서명 전이면 근무 시작이 막히고, 근로계약서는 일하기 전에 줘야 함)
//   여러 날 행사에서 오늘·내일 다 일하는 사람은 '오늘' 한 줄에만 · 내일부터 일하는 공고는 그대로 '내일 근무 · 서명 안 함'
//   누르면 공고 서류 탭 '서명 안 한 n명'으로 가서 '앱 알림' 버튼이 화면 가운데에서 번쩍 · 서명하면 줄이 사라짐
// · '서명 대기 서류' 숫자 칸 → 공고 목록 대신 서류 메뉴의 '서명 대기'로 바로
// node scripts/qa/batch271.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', J2 = 'cccccccc-0000-4000-8000-0000002710d2', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const today = kst(0), tomorrow = kst(1)
  // 오늘 공고 J: 오늘~내일 이틀 · 근무자 W 확정 · 근로계약서 서명 전
  const patch = { start_date: today, end_date: tomorrow, status: 'open', contract_method: 'app' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
  for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'pending', signed_at: null })
  // 내일 시작하는 공고 J2: 근무자 W 확정 · 서명 전
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const jb = { ...base, id: J2, title: '내일 시작 행사 안내', start_date: tomorrow, end_date: tomorrow }
  await rest('jobs', 'POST', jb)
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...wa, id: '11111111-0000-4000-8000-0000002710a2', job_id: J2, status: 'approved', available_dates: null, job: { ...jb, company: { company_name: '주식회사 테스트' } } })
  const [doc] = await rest(`signed_docs?id=eq.${DOC}`)
  await rest('signed_docs', 'POST', { ...doc, id: 'dddddddd-0000-4000-8000-0000002710d4', job_id: J2, status: 'pending', signed_at: null })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 확인할 일: 오늘 줄(빨강) · 내일 줄(주황) · 겹치지 않음
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const todayRow = p.locator(`[data-todo="unsigned-today-${J}"]`)
  await todayRow.waitFor({ timeout: 15000 }).catch(() => {})
  const tTxt = one(await todayRow.textContent().catch(() => ''))
  ok("'오늘 근무 · 서명 안 함 · 경상남도 … 1명' (빨강)", tTxt.startsWith('오늘 근무 · 서명 안 함 · 경상남도') && tTxt.endsWith('1명›') && (await todayRow.locator('b.text-rose-600').count()) === 1, tTxt)
  ok('누르면 그 공고 서류 탭 · 서명 안 한 사람 칸으로', (await todayRow.locator('a').getAttribute('href')) === `/admin/jobs/${J}?tab=docs#unsigned`)
  ok('여러 날 행사(오늘·내일)는 오늘 줄에만 (내일 줄에 같은 공고 없음)', (await p.locator(`[data-todo="unsigned-${J}"]`).count()) === 0)
  const tmrRow = p.locator(`[data-todo="unsigned-${J2}"]`)
  ok("내일 시작 공고는 그대로 '내일 근무 · 서명 안 함 · 내일 시작 행사 안내 1명' (주황)", one(await tmrRow.textContent().catch(() => '')) === '내일 근무 · 서명 안 함 · 내일 시작 행사 안내1명›' && (await tmrRow.locator('b.text-amber-700').count()) === 1, one(await tmrRow.textContent().catch(() => '')))
  const order = await p.locator('[data-todo^="unsigned"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-todo')))
  ok('오늘 줄이 내일 줄보다 위', order.indexOf(`unsigned-today-${J}`) > -1 && order.indexOf(`unsigned-today-${J}`) < order.indexOf(`unsigned-${J2}`), JSON.stringify(order))
  ok('줄 한 줄 · 360px 옆으로 안 밀림', (await todayRow.evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 99)) < 56 && (await noSide(p)))
  if (SHOTS) {
    await todayRow.evaluate((el) => el.closest('section').scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    await todayRow.locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/todo-unsigned-today.png` }).catch(() => {})
  }

  // ── 2. '서명 대기 서류' 칸 → 서류 메뉴 '서명 대기'
  const stat = p.locator('a', { hasText: '서명 대기 서류' }).first()
  ok("'서명 대기 서류' 칸 → /admin/docs?status=pending", (await stat.getAttribute('href')) === '/admin/docs?status=pending')

  // ── 3. 누르면 서류 탭 · '앱 알림' 버튼이 번쩍
  await todayRow.locator('a').click()
  await p.waitForURL((u) => u.pathname === `/admin/jobs/${J}` && u.hash === '#unsigned', { timeout: 15000 }).catch(() => {})
  const tools = p.locator('#unsigned[data-unsigned-tools]')
  await tools.waitFor({ timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(400)
  const flashed = await tools.evaluate((el) => { const f = el.querySelector('[data-flash]'); return f ? (f.textContent ?? '').trim() : null }).catch(() => null)
  // 2026-11-23 20:35부터 출근 기록이 있으면 뒤에 '· 일함 n'이 붙음 → 앞부분 '서명 안 한 1명'만 봄
  ok("서류 탭 '서명 안 한 1명' 칸 · '앱 알림' 버튼이 번쩍", /^서명 안 한 1명( · 일함 \d+)?$/.test(one(await tools.locator('b').first().textContent().catch(() => ''))) && flashed === '앱 알림', String(flashed))
  const inView = await tools.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }).catch(() => false)
  ok('그 칸이 화면 안에 보임', inView)
  if (SHOTS) await tools.screenshot({ path: `${SHOTS}/docs-unsigned-flash.png` }).catch(() => {})

  // ── 4. 서명하면 오늘 줄이 사라짐
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok('서명하면 오늘 줄 없음 · 내일 줄은 그대로', (await p.locator(`[data-todo="unsigned-today-${J}"]`).count()) === 0 && (await p.locator(`[data-todo="unsigned-${J2}"]`).count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
