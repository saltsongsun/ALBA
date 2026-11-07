// 묶음 85: 출근 — 위치에 막혀 '근무 시작'만 여러 번 누르던 것 (인사이트: 한 근무자가 2분 동안 10번 누르고 같은 오류만 봄)
// · 현장 확인이 필요한 공고인데 위치 권한이 꺼져 있으면 누르기 전부터 '담당자에게 출근 확인 요청' 칸이 보임
// · 오류 문장은 해요체 한 번만 (아래 위치 안내에서 같은 말을 되풀이하지 않음)
// · 두 번째로 막히면 큰 버튼이 '담당자에게 출근 확인 요청'으로 바뀌어 화면 안으로 (묶음 120 · 이용 기록: 같은 버튼만 다시 누름)
// · 요청하면 버튼 위에 'HH:MM 출근 확인 요청함 · 담당자가 확인하면 …' (다시 열어도 그대로) · 담당자가 처리하면 '근무 중'으로 바뀌고 안내는 사라짐
// · 내 정보 '정보 채우기' 칸의 설명이 360px에서 잘리지 않음 · 지금 보고 있는 아래 탭을 또 누르면 맨 위로
// node scripts/qa/batch85.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const N = 'bbbbbbbb-0000-4000-8000-0000000000f5', J2 = 'cccccccc-0000-4000-8000-0000000000f5', APP = '11111111-0000-4000-8000-0000000000f5'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  // 준비: 오늘 하루 종일, 현장 확인이 필요한 공고에 확정된 새 근무자 (사진·비상연락처·주소 없음)
  const [w1] = await rest(`users?id=eq.${W}`)
  const user = { ...w1, id: N, name: '위치꺼짐', phone: '01077770885', photo_at: null, emergency_phone: null, address: null, careers: [], created_at: new Date().toISOString() }
  await rest('users', 'POST', user)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const job = { ...j, id: J2, title: '위치 확인 공고', gps_required: true, start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00', required_docs: [], applications: undefined }
  await rest('jobs', 'POST', job)
  await rest('applications', 'POST', {
    id: APP, job_id: J2, user_id: N, company_id: j.company_id, status: 'approved', available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null,
    decided_at: new Date().toISOString(), created_at: new Date().toISOString(), job: { ...job, company: { company_name: '주식회사 테스트' } }, user,
  })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {}
    // 위치 권한을 끈 휴대폰처럼
    const q = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (d) => (d && d.name === 'geolocation' ? Promise.resolve({ state: 'denied', onchange: null }) : q(d))
    navigator.geolocation.getCurrentPosition = (_ok, err) => setTimeout(() => err({ code: 1, message: 'denied' }), 30)
  })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(N), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const inView = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })

  // ── 1. 위치 권한이 꺼져 있음: 누르기 전부터 요청 칸 ──
  await p.goto(`${D}/me`)
  const askBox = p.locator('[data-arrive-ask]')
  await askBox.waitFor({ timeout: 10000 }).catch(() => {})
  ok("위치 권한이 꺼진 걸 미리 알면 누르기 전부터 '담당자에게 출근 확인 요청'", (await askBox.count()) === 1 && (await askBox.innerText()).includes('위치를 켜기 어렵나요?'))

  // ── 2. 눌러도 막힘: 오류는 한 번만 ──
  const start = p.getByRole('button', { name: '근무 시작', exact: true })
  await start.click()
  const err = p.locator('[role=status]').filter({ hasText: '현장 위치를 확인하지 못했어요' })
  await err.first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("오류: '현장 위치를 확인하지 못했어요 …' (해요체)", (await err.count()) >= 1)
  const panelText = await start.locator('xpath=..').innerText()
  ok("'현장에서만 근무 시작을 누를 수 있어요'는 한 번만", panelText.split('현장에서만 근무 시작을 누를 수 있어요').length - 1 === 1, String(panelText.split('현장에서만 근무 시작을 누를 수 있어요').length - 1))
  ok('첫 번째에는 강조하지 않음', (await p.locator('[data-arrive-ask][data-strong]').count()) === 0)
  await p.evaluate(() => scrollTo(0, 0))
  await start.click()
  const strong = p.locator('[data-clock-stuck]')
  await strong.waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(900)
  const rect = await strong.evaluate((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.top)}~${Math.round(r.bottom)}/${innerHeight}` }).catch(() => 'none')
  ok("두 번째로 막히면 큰 버튼이 '담당자에게 출근 확인 요청' (화면 안)", (await strong.count()) === 1 && (await inView(strong)) && (await p.locator('[data-arrive-ask]').count()) === 0, rect)

  // ── 3. 요청 → 기다리는 중 ──
  await strong.getByRole('button', { name: '담당자에게 출근 확인 요청' }).click()
  const wait = p.locator('[data-arrive-wait]')
  await wait.waitFor({ timeout: 10000 }).catch(() => {})
  ok("요청하면 버튼 위에 '출근 확인 요청함 · 담당자가 확인하면 …'", (await wait.count()) === 1 && (await wait.innerText()).includes('담당자가 확인하면'))
  ok('요청 칸은 사라짐 (같은 요청을 또 누르지 않게)', (await askBox.count()) === 0)
  const msgs = await rest(`messages?thread_user_id=eq.${N}`)
  ok('담당자에게 출근 확인 요청이 감', msgs.some((m) => m.body.startsWith('📍 출근 확인 요청') && m.job_id === J2))
  await p.reload()
  await wait.waitFor({ timeout: 10000 }).catch(() => {})
  ok("다시 열어도 'HH:MM 출근 확인 요청함'", /\d{2}:\d{2} 출근 확인 요청함/.test(await wait.innerText().catch(() => '')))
  ok('안내 제목은 한 줄 (360px)', (await wait.locator('p').first().evaluate((el) => el.getBoundingClientRect().height).catch(() => 99)) < 26)
  ok("기다리는 동안엔 '근무 시작을 눌러 주세요'·위치 켜는 방법은 접어 둠", (await p.getByText('도착했다면 근무 시작을 눌러 주세요').count()) === 0 && (await p.getByText('위치 권한이 꺼져 있어요').count()) === 0)
  ok('버튼보다 위에 보임', (await wait.evaluate((el) => el.getBoundingClientRect().top)) < (await start.evaluate((el) => el.getBoundingClientRect().top)))
  ok('360px: 옆으로 안 밀림 (내 근무)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 담당자가 출근 처리 → 근무 중 ──
  await rest('attendance', 'POST', { job_id: J2, user_id: N, work_date: today, clock_in: new Date().toISOString(), clock_out: null, source: 'admin', paid: false, ot_minutes: 0 })
  await p.reload()
  await p.getByText(/근무 중 · \d{2}:\d{2} 시작/).first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("담당자가 처리하면 '근무 중'으로 바뀌고 요청 안내는 사라짐", (await p.getByText(/근무 중 · \d{2}:\d{2} 시작/).count()) >= 1 && (await wait.count()) === 0)

  // ── 5. 내 정보: 정보 채우기 설명이 잘리지 않음 ──
  await p.goto(`${D}/me/profile`)
  const checks = p.locator('[data-profile-checks]')
  await checks.waitFor({ timeout: 10000 }).catch(() => {})
  const n = await checks.locator('li').count()
  const cut = await checks.locator('span.block').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))
  ok(`정보 채우기 칸 설명이 360px에서 잘리지 않음 (${n}칸)`, n >= 3 && cut.length === 0, cut.join(' | '))

  // ── 6. 보고 있는 탭을 또 누르면 맨 위로 ──
  await p.evaluate(() => scrollTo(0, 1200))
  await p.waitForTimeout(300)
  const before = await p.evaluate(() => scrollY)
  await p.locator('nav[data-bottom-nav] a[href="/me/profile"]').click()
  await p.waitForTimeout(1000)
  ok("'내 정보'에서 '내 정보' 탭을 누르면 맨 위로", before > 300 && (await p.evaluate(() => scrollY)) < 5 && new URL(p.url()).pathname === '/me/profile', `before=${before}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
