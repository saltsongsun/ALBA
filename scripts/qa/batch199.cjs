// 묶음 199 (정기 개선 2026-11-11 16:35 KST)
// · 근무자 내 근무: 오늘 근무가 없는 날, 다음 근무를 위쪽 큰 카드에 한 번만 보여 줌 (아래 '예정된 근무' 목록에 같은 근무가 또 나오지 않음)
//   - 큰 카드에 배치·달력에 넣기·전날 '내일 갈게요' 줄이 함께 · 이번 주 칸을 누르면 그 카드로
//   - 예정 근무가 둘이면 목록에는 나머지만 · 오늘 근무가 있는 날은 큰 카드가 없으니 목록에 모두
// node scripts/qa/batch199.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-000000019901', APP2 = '11111111-0000-4000-8000-000000019901'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), nowIso = new Date().toISOString(), today = kstDay(now), tomorrow = kstDay(now + 864e5), day3 = kstDay(now + 3 * 864e5)
  const setJob = async (patch) => {
    await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
    for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  }
  // 준비: 첫 공고는 내일 하루 (근무자 확정 · 배치 A게이트) · 오늘 근무 기록은 지움
  const [att0] = await rest(`attendance?user_id=eq.${W}`)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await setJob({ start_date: tomorrow, end_date: tomorrow, start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [j] = await rest(`jobs?id=eq.${J}`)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async (path) => { await w.goto(D + path); await w.waitForLoadState('networkidle').catch(() => {}) }
  const shot = async (name) => { if (SHOTS) { await w.waitForTimeout(500); await w.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) } }
  const hero = w.locator('[data-next-work]')
  const listSec = w.locator('section', { has: w.locator('h2', { hasText: '예정된 근무' }) })
  const titleLinks = () => w.locator(`main a[href="/jobs/${J}"]`).count()

  // ── 1. 예정 근무가 하나 (내일): 큰 카드에 한 번만
  await open('/me')
  const ht = one(await hero.innerText().catch(() => ''))
  ok("다음 근무 큰 카드: '내일 · 다음 근무' + 공고 이름 + 시간", ht.includes('내일') && ht.includes('다음 근무') && ht.includes(j.title) && ht.includes('09:00 ~ 18:00'), ht.slice(0, 80))
  ok("아래 '예정된 근무' 목록은 없음 (같은 근무를 두 번 보이지 않음)", (await listSec.count()) === 0 && (await w.locator(`[id="work-${wApp.id}"]`).count()) === 1)
  ok('큰 카드가 그 근무의 자리 (이번 주 칸을 누르면 여기로)', (await hero.getAttribute('id')) === `work-${wApp.id}`)
  ok("큰 카드에 배치 · 달력에 넣기 · 전날 '내일 갈게요' 줄이 함께", ht.includes('배치 · A게이트') && (await hero.locator('[data-next-calendar]').getAttribute('href')) === `/me/calendar/${wApp.id}` && one(await hero.locator('[data-coming="ask"]').innerText().catch(() => '')) === '내일 올 수 있나요? 못 가요 내일 갈게요', ht.slice(-90))
  ok("'내일 갈게요' 줄은 화면에 하나뿐 · 문의함 버튼이 데려올 곳(#coming)도 여기", (await w.locator('[data-coming]').count()) === 1 && (await hero.locator('#coming').count()) === 1)
  await w.waitForTimeout(500)
  ok('달력에 넣기 한 줄 · 360px 옆으로 안 밀림', (await hero.locator('[data-next-calendar]').evaluate((el) => el.getBoundingClientRect().height <= 36).catch(() => false)) && (await noSide(w)))
  const mapBtn = hero.locator('[data-next-map]')
  ok("큰 카드에 '길찾기' (전날 미리 가는 길 확인 · 새 창)", one(await mapBtn.innerText().catch(() => '')) === '길찾기' && /^https:\/\/map\.kakao\.com\/link\/to\//.test((await mapBtn.getAttribute('href').catch(() => '')) ?? '') && (await mapBtn.getAttribute('target')) === '_blank', await mapBtn.getAttribute('href').catch(() => ''))
  ok("'달력에 넣기'와 '길찾기'가 한 줄에 나란히", await hero.evaluate((el) => { const a = el.querySelector('[data-next-calendar]').getBoundingClientRect(), b = el.querySelector('[data-next-map]').getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && a.right <= b.left }).catch(() => false))
  await hero.scrollIntoViewIfNeeded().catch(() => {})
  if (SHOTS) { await w.waitForTimeout(400); await w.screenshot({ path: `${SHOTS}/1-next-only.png` }) }
  // 좌표 없이 주소만 있으면 '지도' · 장소 정보가 아예 없으면 버튼 없음
  await setJob({ lat: null, lng: null })
  await open('/me')
  ok("좌표가 없고 주소만 있으면 '지도' (검색으로 열림)", one(await mapBtn.innerText().catch(() => '')) === '지도' && ((await mapBtn.getAttribute('href').catch(() => '')) ?? '').startsWith('https://map.kakao.com/link/search/'), await mapBtn.getAttribute('href').catch(() => ''))
  await setJob({ address: null, location_name: null })
  await open('/me')
  ok('장소 정보가 없으면 길찾기 버튼 없음 (달력에 넣기만)', (await mapBtn.count()) === 0 && (await hero.locator('[data-next-calendar]').count()) === 1)
  await setJob({ lat: j.lat, lng: j.lng, address: j.address, location_name: j.location_name })
  await open('/me')
  // 이번 주 칸(내일)을 누르면 큰 카드로
  const cell = w.locator(`a[href="#work-${wApp.id}"]`).first()
  ok('이번 주 내일 칸이 큰 카드를 가리킴', (await cell.count()) === 1)
  // 큰 카드에서 바로 '내일 갈게요'
  await hero.locator('[data-coming="ask"] button').click()
  await hero.locator('[data-coming="done"]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("큰 카드에서 누르면 그 자리에 '내일 출근 확인함'", /내일 출근 확인함 · \d{2}:\d{2}/.test(one(await hero.locator('[data-coming="done"]').innerText().catch(() => ''))) && (await w.locator('[data-coming]').count()) === 1)

  // ── 2. 예정 근무가 둘: 목록에는 나머지만
  await rest('jobs', 'POST', { ...j, id: J2, title: '사흘 뒤 행사 보조', start_date: day3, end_date: day3, applications: [{ status: 'approved' }] })
  const [j2] = await rest(`jobs?id=eq.${J2}`)
  await rest('applications', 'POST', { ...wApp, id: APP2, job_id: J2, job: { ...j2, company: wApp.job?.company ?? null }, position: null, created_at: nowIso })
  await open('/me')
  const cards = listSec.locator('[id^="work-"]')
  ok("예정 근무가 둘이면 '예정된 근무'에는 나머지 하나만", (await listSec.count()) === 1 && (await cards.count()) === 1 && (await cards.first().getAttribute('id')) === `work-${APP2}` && one(await listSec.innerText()).includes('사흘 뒤 행사 보조'), one(await listSec.innerText().catch(() => '')).slice(0, 80))
  ok('내일 근무는 큰 카드에만 (목록에 다시 나오지 않음)', !(await listSec.innerText()).includes(j.title) && (await hero.innerText()).includes(j.title))
  ok('목록 카드는 예전 모양 그대로 (확정 · 달력에 넣기)', one(await cards.first().innerText()).includes('확정') && (await cards.first().locator(`a[href="/me/calendar/${APP2}"]`).count()) === 1)
  ok('360px: 옆으로 안 밀림 (둘일 때)', await noSide(w))
  await shot('2-next-and-list')

  // ── 3. 오늘 근무가 있는 날: 큰 카드가 없으니 예정 근무는 목록에 모두
  await setJob({ start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  if (att0) await rest('attendance', 'POST', { ...att0, work_date: today })
  await open('/me')
  ok('오늘 근무가 있으면 다음 근무 큰 카드 없음 · 예정 근무는 목록에', (await hero.count()) === 0 && (await cards.count()) === 1 && (await cards.first().getAttribute('id')) === `work-${APP2}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
