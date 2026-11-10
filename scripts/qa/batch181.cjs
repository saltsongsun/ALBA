// 묶음 181 (정기 개선 2026-11-10 20:35 KST)
// · 새 공고 등록: 이 회사가 지난 공고에 쓴 값을 눌러서 넣는 '최근 값' 칩
//   - 최근 장소: 장소명·주소·위도·경도·허용 반경이 한 번에 (좌표를 다시 찾지 않게)
//   - 지급일 안내 · 현장 담당자(이름+연락처)
//   - 다른 회사 공고의 값은 안 나옴 · 지난 공고에 값이 없으면 줄 자체가 없음 · 공고 수정 화면엔 없음
// · 누르면: 고른 칩에 ✓ · 채워진 칸에 표시(잠깐 초록 테두리) · 접힌 칸 요약도 바로 바뀜
//   · '현장에서만 근무 시작'을 켠 채 장소를 고르면 '행사장 위치가 비어 있어요' 안내가 사라짐
// node scripts/qa/batch181.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const OTHER = 'ffffffff-0000-4000-8000-000000000181', JX = 'cccccccc-0000-4000-8000-000000000181', J2 = 'cccccccc-0000-4000-8000-000000000182'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const val = (n) => a.locator(`#job-form [name=${n}]`).inputValue()
  const chips = (n) => a.locator(`[data-recent=${n}] button`)

  // 준비: 우리 회사 지난 공고 2개(장소 2곳 · 지급일 같은 말 · 담당자 1명) + 다른 회사 공고 1개
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { location_name: '진주성 일원', address: '경남 진주시 남강로 626', lat: 35.189, lng: 128.0814, gps_radius_m: 250, pay_day: '행사 종료 후 7일 이내 계좌 입금', manager_name: '김현장', manager_phone: '01055556666', created_at: '2026-11-01T00:00:00Z' })
  await rest('jobs', 'POST', { ...j, id: J2, title: '지난달 행사', location_name: '창원 컨벤션센터', address: '경남 창원시 의창구 원이대로 362', lat: null, lng: null, gps_radius_m: 300, pay_day: '행사 종료 후 7일 이내 계좌 입금', manager_name: null, manager_phone: null, created_at: '2026-10-01T00:00:00Z', applications: [] })
  await rest('jobs', 'POST', { ...j, id: JX, company_id: OTHER, title: '다른 회사 행사', location_name: '다른 회사 장소', address: '부산', pay_day: '다른 회사 지급일', manager_name: '남의담당', manager_phone: '01099990000', created_at: '2026-11-09T00:00:00Z', applications: [] })

  await a.goto(`${D}/admin/jobs/new`)
  await a.locator('#job-form').waitFor({ timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})

  // ── 1. 최근 장소
  const places = (await chips('place').allInnerTexts()).map((t) => t.trim())
  ok("최근 장소: 우리 회사 장소만, 최근 것부터 ('진주성 일원' · '창원 컨벤션센터')", JSON.stringify(places) === JSON.stringify(['진주성 일원', '창원 컨벤션센터']), JSON.stringify(places))
  // '현장에서만 근무 시작'을 켜 두면 좌표가 없다는 안내 → 장소를 고르면 사라짐
  await a.locator('input[name=gps_required]').check()
  await a.locator('[data-gps-need]').waitFor({ timeout: 5000 }).catch(() => {})
  await chips('place').first().click()
  ok('장소를 고르면 장소명·주소·좌표·반경이 한 번에', (await val('location_name')) === '진주성 일원' && (await val('address')) === '경남 진주시 남강로 626' && (await val('lat')) === '35.189' && (await val('lng')) === '128.0814' && (await val('gps_radius_m')) === '250', [await val('location_name'), await val('address'), await val('lat'), await val('lng'), await val('gps_radius_m')].join(' | '))
  ok('고른 칩에 ✓ · 채워진 칸에 표시', (await chips('place').first().getAttribute('aria-pressed')) === 'true' && (await chips('place').first().innerText()).trim() === '✓ 진주성 일원' && !!(await a.locator('#job-form [name=lat]').getAttribute('data-filled')) && !!(await a.locator('#job-form [name=address]').getAttribute('data-filled')))
  ok("좌표가 들어와 '행사장 위치가 비어 있어요' 안내가 사라짐", await a.locator('[data-gps-need]').waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false))
  if (SHOTS) await a.locator('[data-recent=place]').locator('xpath=ancestor::details[1]').screenshot({ path: `${SHOTS}/recent-place.png` }).catch(() => {})
  // 좌표가 없는 장소를 고르면 좌표 칸은 비움 (앞 장소의 좌표가 남지 않게)
  await chips('place').nth(1).click()
  ok('좌표 없는 장소를 고르면 좌표 칸은 비움', (await val('location_name')) === '창원 컨벤션센터' && (await val('lat')) === '' && (await val('lng')) === '' && (await chips('place').first().getAttribute('aria-pressed')) === 'false')
  ok('칩 줄 한 줄씩 · 360px 옆으로 안 밀림', (await chips('place').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height < 36))) && (await noSide(a)))

  // ── 2. 지급일 안내 (같은 말은 한 번만)
  const pays = (await chips('pay_day').allInnerTexts()).map((t) => t.trim())
  ok("지급일 안내: 같은 말은 한 번만 · 다른 회사 것 없음", JSON.stringify(pays) === JSON.stringify(['행사 종료 후 7일 이내 계좌 입금']), JSON.stringify(pays))
  await chips('pay_day').first().click()
  ok('누르면 지급일 안내에 들어감', (await val('pay_day')) === '행사 종료 후 7일 이내 계좌 입금')

  // ── 3. 현장 담당자 (근무 안내 칸을 펼쳐서)
  await a.locator('#job-form details', { hasText: '근무 안내' }).locator('summary').first().click()
  await chips('manager').first().waitFor({ timeout: 5000 }).catch(() => {})
  const mans = (await chips('manager').allInnerTexts()).map((t) => t.trim())
  ok("최근 담당: '김현장 010-5555-6666' (다른 회사 담당자 없음)", JSON.stringify(mans) === JSON.stringify(['김현장 010-5555-6666']), JSON.stringify(mans))
  await chips('manager').first().click()
  ok('누르면 이름·연락처가 함께', (await val('manager_name')) === '김현장' && (await val('manager_phone')) === '010-5555-6666', `${await val('manager_name')} | ${await val('manager_phone')}`)
  // (요약은 칸을 접었을 때만 보여서 글자 자체로 확인)
  ok('접힌 칸 요약도 바로 바뀜 (담당 김현장)', ((await a.locator('#job-form details', { hasText: '근무 안내' }).locator('summary').first().evaluate((el) => el.textContent)) ?? '').includes('담당 김현장'))
  if (SHOTS) await a.locator('[data-recent=manager]').locator('xpath=ancestor::details[1]').screenshot({ path: `${SHOTS}/recent-manager.png` }).catch(() => {})
  ok('360px 옆으로 안 밀림', await noSide(a))

  // ── 4. 공고 수정 화면엔 없음 · 지난 공고에 값이 없으면 줄이 없음
  await a.goto(`${D}/admin/jobs/${J}/edit`)
  await a.locator('#job-form').waitFor({ timeout: 15000 }).catch(() => {})
  ok('공고 수정 화면엔 최근 값 칩이 없음', (await a.locator('[data-recent]').count()) === 0)
  await rest(`jobs?company_id=eq.${j.company_id}`, 'PATCH', { location_name: null, address: null, pay_day: null, manager_name: null, manager_phone: null })
  await a.goto(`${D}/admin/jobs/new`)
  await a.locator('#job-form').waitFor({ timeout: 15000 }).catch(() => {})
  ok('지난 공고에 쓴 값이 없으면 줄 자체가 없음', (await a.locator('[data-recent]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
