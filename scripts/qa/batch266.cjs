// 묶음 266 (정기 개선 2026-11-15 22:35 KST)
// · 오늘 근무가 둘 (예: 낮엔 A회사, 밤엔 B회사)일 때 '내 근무'·홈이 지금 할 근무를 먼저:
//   내 근무 '오늘의 근무' 카드 순서: 근무 중 → 아직 남은 근무 → 마친 근무 → 기록 없이 시간이 지난 근무
//   기록 없이 지난 근무는 '서류에 서명하면 근무를 시작할 수 있어요' 대신 '오늘 근무 시간이 지났어요 · 출근 기록이 없어요'
//   (+ 작게 '서명할 서류 1건 ›') · 휴게·준비물 줄 없이 · 카드 테두리도 옅게
//   홈 맨 위 오늘 근무 띠: 끝난 낮 근무의 '서명' 대신 밤 근무 (전엔 첫 번째 근무만 봐서 밤 근무 시작을 놓치게 했음)
// node scripts/qa/batch266.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000002660c2', J2 = 'cccccccc-0000-4000-8000-0000002660d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kstHM = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now()
  // 낮 근무(J · 우리 회사): 40분 전~10분 전 · 출근 기록 없음 · 서명 안 한 서류 1건 / 밤 근무(J2 · 다른 회사): 10분 뒤~30분 뒤
  const over = { s: kstHM(now - 40 * 60e3), e: kstHM(now - 10 * 60e3) }
  const next = { s: kstHM(now + 10 * 60e3), e: kstHM(now + 30 * 60e3) }
  const today = kstDay(now)
  if (kstDay(now - 40 * 60e3) !== today || kstDay(now + 30 * 60e3) !== today) {
    console.log('SKIP  자정 무렵이라 두 근무 시간을 오늘 안에 만들 수 없어 건너뜀')
    console.log('ALL PASSED')
    process.exit(0)
  }
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  const patch = { start_date: today, end_date: today, start_time: over.s, end_time: over.e, status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
  for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른기획', contact_phone: '01099990000' })
  const jb = { ...base, id: J2, company_id: C2, title: '다른기획 야간 행사', start_date: today, end_date: today, start_time: next.s, end_time: next.e, location_name: '시민회관', conditions: [], required_docs: [] }
  await rest('jobs', 'POST', jb)
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...wa, id: '11111111-0000-4000-8000-0000002660a2', job_id: J2, company_id: C2, status: 'approved', position: null, available_dates: null, job: { ...jb, company: { company_name: '다른기획' } } })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 내 근무: 밤 근무가 위, 지난 낮 근무는 아래 (조용히)
  await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const titles = (await p.locator('[data-today-title]').allTextContents()).map((t) => one(t).replace(/›$/, '').trim())
  ok("오늘의 근무 순서: ['다른기획 야간 행사', '경상남도 … 안내 스태프'] (아직 남은 근무가 먼저)", titles.length === 2 && titles[0] === '다른기획 야간 행사' && titles[1].startsWith('경상남도'), JSON.stringify(titles))
  const overCard = p.locator('[data-today-card="over"]')
  ok('지난 낮 근무 카드: 서명하면 시작 안내 없음 · 시간이 지났어요', (await overCard.count()) === 1 && (await overCard.locator('[data-sign-before-start]').count()) === 0 && one(await overCard.locator('[data-shift-over] p').first().textContent().catch(() => '')) === '오늘 근무 시간이 지났어요')
  ok(`'${over.s}~${over.e} · 출근 기록이 없어요' + 작게 '서명할 서류 1건 ›'`, one(await overCard.locator('[data-shift-over] p').nth(1).textContent().catch(() => '')) === `${over.s}~${over.e} · 출근 기록이 없어요` && one(await overCard.locator('[data-shift-over-sign]').textContent().catch(() => '')) === '서명할 서류 1건 ›')
  ok('지난 근무엔 휴게·식사·준비물 줄 없음 · 테두리 옅게', (await overCard.locator('[data-break], [data-meal]').count()) === 0 && ((await overCard.getAttribute('class')) ?? '').includes('ring-line'))
  const top = p.locator('[data-today-title]').first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
  ok('밤 근무 카드엔 근무 시작 쪽 (지난 표시 없음)', (await top.getAttribute('data-today-card')) === '' && (await top.locator('[data-shift-over]').count()) === 0)
  ok('360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) {
    await overCard.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    await overCard.screenshot({ path: `${SHOTS}/me-over-card.png` }).catch(() => {})
  }

  // ── 2. 홈 맨 위 오늘 근무 띠: 밤 근무
  await p.goto(`${D}/`, { waitUntil: 'networkidle' })
  const hero = p.locator('[data-today-hero]')
  await hero.waitFor({ timeout: 15000 }).catch(() => {})
  ok("홈 오늘 근무 띠: '다른기획 야간 행사' (끝난 낮 근무의 '서명' 아님)", one(await hero.innerText().catch(() => '')).includes('다른기획 야간 행사') && (await hero.getAttribute('data-today-sign')) === null, one(await hero.innerText().catch(() => '')))
  if (SHOTS) await hero.screenshot({ path: `${SHOTS}/home-hero-next.png` }).catch(() => {})

  // ── 3. 밤 근무를 시작하면 그 근무가 맨 위 그대로 · 홈 띠는 '근무 중'
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000002660e1', user_id: W, job_id: J2, company_id: C2, work_date: today, clock_in: new Date().toISOString(), clock_out: null, created_at: new Date().toISOString() })
  await p.goto(`${D}/`, { waitUntil: 'networkidle' })
  ok("밤 근무 중: 홈 띠 상태 'working'", (await hero.getAttribute('data-today-state').catch(() => '')) === 'working' && one(await hero.innerText().catch(() => '')).includes('다른기획 야간 행사'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
