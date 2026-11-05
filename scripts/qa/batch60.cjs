// 묶음 60: 출퇴근 탭 위아래 줄이기 (사람이 많을 때)
// · 자세히: 9명 이상이면 한 사람을 한 줄(사진·이름·배치·시간·상태)로 접어 둠 → 누르면 펼침 (연락·기록 수정 등)
//   처리할 일이 있는 사람(출근 확인 요청 등)은 펼쳐 둠 · 8명 이하면 예전처럼 모두 펼침
// · 출석 체크·얼굴 명단: 360px에서 한 줄에 3명 (작은 사진) · 출석 체크에서 종료한 사람은 '종료 N명'으로 접음
// node scripts/qa/batch60.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
const today = kstDate()
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const ad = await ctx.newPage()
  ad.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const att = (q = '') => ad.goto(`${D}/admin/jobs/${J}?tab=att${q}`)

  // ── 1. 사람이 적으면(2명) 예전처럼 모두 펼침 ──
  await att()
  ok('8명 이하: 접지 않음', (await ad.locator('[data-att-fold]').count()) === 0 && (await ad.locator('[data-att-row]').count()) >= 1)

  // ── 2. 확정자 12명으로 늘림 (한 명은 출근 확인 요청, 한 명은 이미 종료) ──
  const [w] = await rest(`users?id=eq.${W}`)
  const ids = []
  for (let i = 1; i <= 11; i++) {
    const id = `bbbbbbbb-0000-4000-8000-0000000d${String(i).padStart(4, '0')}`
    ids.push(id)
    const name = `근무자${String(i).padStart(2, '0')}`
    await rest('users', 'POST', { ...w, id, name, attendance: [], ratings: [] })
    await rest('applications', 'POST', { id: `11111111-0000-4000-8000-0000000d${String(i).padStart(4, '0')}`, job_id: J, user_id: id, status: 'approved', position: i % 2 ? 'A게이트' : 'B게이트', available_dates: null, created_at: new Date().toISOString(), user: { id, name, phone: '01012345678', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: name, photo_at: null } })
  }
  const ASK = ids[2], DONE = ids[4]
  await rest('messages', 'POST', { thread_user_id: ASK, sender_id: ASK, from_admin: false, company_id: CO, job_id: J, body: '📍 출근 확인 요청\n현장에 도착했는데 위치 확인이 안 돼요. (현장에서 약 450m)', read_at: null, created_at: new Date(Date.now() - 5 * 60e3).toISOString() })
  await rest('attendance', 'POST', { job_id: J, user_id: DONE, work_date: today, clock_in: new Date(Date.now() - 5 * 3600e3).toISOString(), clock_out: new Date(Date.now() - 600e3).toISOString(), source: 'app', note: null, confirmed: false, paid: false })

  await att()
  const folds = ad.locator('[data-att-fold]')
  ok('9명 이상: 한 사람씩 한 줄로 접힘 (12명)', (await folds.count()) === 12, String(await folds.count()))
  const closedH = await ad.locator('[data-att-row]', { has: ad.locator('[data-att-fold]:not([open])') }).first().evaluate((el) => el.getBoundingClientRect().height)
  ok('접힌 한 줄 높이는 작게 (90px 이하)', closedH <= 90, `${Math.round(closedH)}px`)
  const askOpen = await ad.locator(`[data-att-row="${ASK}"] [data-att-fold]`).evaluate((d) => d.open)
  const otherOpen = await ad.locator(`[data-att-row="${ids[0]}"] [data-att-fold]`).evaluate((d) => d.open)
  ok('처리할 일(출근 확인 요청)이 있는 사람은 펼쳐 둠 · 나머지는 접힘', askOpen && !otherOpen)
  ok('펼쳐 둔 사람: 출근 처리 버튼이 보임', await ad.locator(`[data-att-row="${ASK}"]`).getByText('출근 처리').first().isVisible().catch(() => false))
  const line = await ad.locator(`[data-att-row="${DONE}"] summary`).innerText()
  ok('접힌 줄: 이름 · 배치 · 시간 · 상태', line.includes('근무자05') && line.includes('A게이트') && /\d{2}:\d{2}~\d{2}:\d{2}/.test(line) && line.includes('종료'), line.replace(/\n/g, ' '))
  await ad.locator(`[data-att-row="${ids[0]}"] summary`).click()
  ok('누르면 펼침: 연락·평가·기록 등록이 보임', await ad.locator(`[data-att-row="${ids[0]}"]`).getByText('수기로 출퇴근 등록').isVisible())
  ok('펼쳐도 이름·사진을 두 번 보여 주지 않음', (await ad.locator(`[data-att-row="${ids[0]}"] a[href="/admin/workers/${ids[0]}"]`).allInnerTexts()).every((t) => t.trim() === '근무자 정보'))
  const pageH = await ad.evaluate(() => document.scrollingElement.scrollHeight)
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 출석 체크: 한 줄에 3명 · 종료한 사람은 접음 ──
  await att('&view=check')
  const tops = await ad.locator('[data-roll-grid] [data-roll]').evaluateAll((l) => l.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('출석 체크: 한 줄에 3명', tops[0] === tops[1] && tops[1] === tops[2] && tops[3] > tops[0], tops.join(','))
  const cardH = await ad.locator('[data-roll-grid] [data-roll]').first().evaluate((e) => e.getBoundingClientRect().height)
  ok('출석 체크 카드 높이 작게 (140px 이하)', cardH <= 140, `${Math.round(cardH)}px`)
  ok("종료한 사람은 '종료 1명'으로 접힘", (await ad.locator('[data-roll-done] summary').innerText()).includes('종료 1명') && !(await ad.locator(`[data-roll="${DONE}"]`).isVisible()))
  ok('출석 체크: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 얼굴 명단: 한 줄에 3명 ──
  await att('&view=faces')
  const ftops = await ad.locator('div.grid > div.card').evaluateAll((l) => l.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('얼굴 명단: 한 줄에 3명', ftops[0] === ftops[1] && ftops[1] === ftops[2] && ftops[3] > ftops[0], ftops.join(','))
  ok('얼굴 명단: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  console.log(`(참고) 12명 자세히 화면 전체 높이 ${pageH}px`)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
