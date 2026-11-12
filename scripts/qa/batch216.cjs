// 묶음 216 (정기 개선 2026-11-12 13:35 KST · 사용자 요청 '모집인원 미정'의 이어서)
// · 인원 미정 공고는 숫자가 '최대 인원'이라 적게 뽑아도 됨 → 'n명 부족' 경고는 아무도 확정 안 된 날만
//   - 지원자 탭 여러 날 칩: '확정 1명' (최대 숫자·부족 없음) · 아무도 없는 날만 빨갛게 '확정 0명'
//   - 출퇴근 탭: 아무도 없는 날만 '⚠️ 날짜 확정 0명' (사람이 있는 날은 경고 없음 · 한 줄)
//   - 모두 확정 확인 문구: '최대 n명을 넘는 날이 있어요 · 확정?' ('모집 n명' 대신)
//   - 대시보드 '곧 시작하는데 인원이 모자라요': '10명 부족' 대신 '확정 0명' · '인원 미정'
// · 여러 날 칩마다 그날 채운 칸 막대 (모집 4명 → 4칸 중 확정한 만큼 · 모자란 날은 빨간 막대 · 인원 미정은 막대 없음)
// · 관리자 1:1 문의 대화를 여는 동안 말풍선 모양의 불러오는 화면 (문의 목록 모양 대신)
// node scripts/qa/batch216.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
const J7 = 'cccccccc-0000-4000-8000-00000000c216', AW = '11111111-0000-4000-8000-00000000a216', AA = '11111111-0000-4000-8000-00000000b216'
const T = '사흘 축제 주차 안내 (여러 날)'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  // 준비: 내일부터 사흘 공고 (모집 4명) · 근무자 W 첫날만 확정 · 지원자 AP 대기
  const nowIso = new Date().toISOString()
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const d1 = kst(1), d2 = kst(2), d3 = kst(3)
  let j7 = { ...j1, id: J7, title: T, start_date: d1, end_date: d3, headcount: 4, status: 'open', hidden_fields: [], applications: [{ status: 'approved' }, { status: 'applied' }], required_docs: [], created_at: nowIso }
  await rest('jobs', 'POST', j7)
  const [aw] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [aa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`)
  await rest('applications', 'POST', { ...aw, id: AW, job_id: J7, status: 'approved', available_dates: [d1], position: null, held_at: null, job: j7, created_at: nowIso })
  await rest('applications', 'POST', { ...aa, id: AA, job_id: J7, status: 'applied', available_dates: null, held_at: null, decided_at: null, job: j7, created_at: nowIso })
  const setJob = async (patch) => {
    j7 = { ...j7, ...patch }
    await rest(`jobs?id=eq.${J7}`, 'PATCH', patch)
    // 가짜 DB는 지원 행에 붙은 공고 사본을 따라 바꾸지 않음 → 맞춰 줌
    await rest(`applications?id=eq.${AW}`, 'PATCH', { job: j7 })
    await rest(`applications?id=eq.${AA}`, 'PATCH', { job: j7 })
  }

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const chip = (d) => a.locator(`a[href*="tab=apps"][href*="day=${d}"]`).first()
  const chipText = async (d) => one(await chip(d).locator('span.tabular-nums').innerText().catch(() => ''))
  const isRose = async (d) => ((await chip(d).getAttribute('class').catch(() => '')) ?? '').includes('bg-rose-50')

  // ── 1. 보통 공고: 칩마다 '확정 n/4' + 채운 칸 막대
  await a.goto(`${D}/admin/jobs/${J7}?tab=apps`, { waitUntil: 'networkidle' })
  await chip(d2).waitFor({ timeout: 15000 }).catch(() => {})
  ok("보통 공고 칩: 첫날 '확정 1/4 · 3 부족' · 둘째 날 '확정 0/4 · 4 부족'", (await chipText(d1)) === '확정 1/4 · 3 부족' && (await chipText(d2)) === '확정 0/4 · 4 부족', `${await chipText(d1)} | ${await chipText(d2)}`)
  const bar1 = chip(d1).locator('[data-slots]')
  ok('칩마다 4칸 막대 · 첫날 1칸 참', (await bar1.getAttribute('data-slots').catch(() => '')) === '4' && (await bar1.getAttribute('data-filled').catch(() => '')) === '1' && (await chip(d2).locator('[data-slots="4"][data-filled="0"]').count()) === 1)
  ok('모자란 날 막대는 빨강 · 막대는 칩 너비 안 (칩이 넓어지지 않음)', (await bar1.locator('span').first().evaluate((el) => getComputedStyle(el).backgroundColor)) !== '' && (await bar1.evaluate((el) => { const c = el.closest('a').getBoundingClientRect(), r = el.getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.height <= 5 })))
  ok('360px 옆으로 안 밀림 (지원자 탭)', await noSide(a))
  if (SHOTS) {
    await chip(d1).scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(900) // 칸이 차오르는 움직임이 끝난 뒤
    const box = await chip(d1).boundingBox()
    if (box) await a.screenshot({ path: `${SHOTS}/chips-normal.png`, clip: { x: 0, y: Math.max(0, box.y - 12), width: 360, height: box.height + 24 } }).catch(() => {})
  }
  await a.goto(`${D}/admin/jobs/${J7}?tab=att&date=${d1}`, { waitUntil: 'networkidle' })
  const warn = () => a.locator('a', { hasText: '⚠️' }).first()
  ok("보통 공고 출퇴근 탭(첫날): '확정 1/4명 · 3명 부족'", one(await warn().innerText().catch(() => '')).includes('확정 1/4명 · 3명 부족'), one(await warn().innerText().catch(() => '')))

  // ── 2. 인원 미정 (최대 4명)
  await setJob({ hidden_fields: ['headcount_tbd'] })
  await a.goto(`${D}/admin/jobs/${J7}?tab=apps`, { waitUntil: 'networkidle' })
  await chip(d2).waitFor({ timeout: 15000 }).catch(() => {})
  ok("인원 미정 칩: 첫날 '확정 1명' (최대 숫자·부족 없음 · 빨강 아님)", (await chipText(d1)) === '확정 1명' && !(await isRose(d1)), await chipText(d1))
  ok("아무도 없는 날만 빨갛게 '확정 0명' · 막대 없음", (await chipText(d2)) === '확정 0명' && (await isRose(d2)) && (await a.locator('a[href*="day="] [data-slots]').count()) === 0)
  if (SHOTS) {
    await chip(d1).scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(300)
    const box = await chip(d1).boundingBox()
    if (box) await a.screenshot({ path: `${SHOTS}/chips-tbd.png`, clip: { x: 0, y: Math.max(0, box.y - 12), width: 360, height: box.height + 24 } }).catch(() => {})
  }
  ok('360px 옆으로 안 밀림 (인원 미정 칩)', await noSide(a))

  await a.goto(`${D}/admin/jobs/${J7}?tab=att&date=${d1}`, { waitUntil: 'networkidle' })
  ok('인원 미정 출퇴근 탭(사람이 있는 첫날): 부족 경고 없음', (await a.locator('a', { hasText: '⚠️' }).count()) === 0)
  await a.goto(`${D}/admin/jobs/${J7}?tab=att&date=${d2}`, { waitUntil: 'networkidle' })
  const w2 = one(await warn().innerText().catch(() => ''))
  ok("아무도 없는 둘째 날: '⚠️ 날짜 확정 0명' ('n명 부족'·'/4' 없음)", w2.includes('확정 0명') && !w2.includes('부족') && !w2.includes('/4'), w2)
  ok('경고 줄은 한 줄 · 360px 옆으로 안 밀림', (await warn().evaluate((el) => el.getBoundingClientRect().height < 56)) && (await noSide(a)))
  if (SHOTS) await warn().screenshot({ path: `${SHOTS}/att-tbd-warn.png` }).catch(() => {})

  // 모두 확정 확인 문구: 최대 1명으로 줄이면 첫날이 넘침
  await setJob({ headcount: 1 })
  await a.goto(`${D}/admin/jobs/${J7}?tab=apps`, { waitUntil: 'networkidle' })
  const all = a.getByRole('button', { name: '대기 1명 모두 확정' })
  await all.waitFor({ timeout: 15000 }).catch(() => {})
  await all.click()
  await a.waitForTimeout(400)
  const armed = one(await a.locator('button', { hasText: '넘는 날이 있어요' }).first().innerText().catch(() => ''))
  ok("모두 확정 첫 누름: '최대 1명을 넘는 날이 있어요 · 확정?' ('모집 1명' 아님)", armed === '최대 1명을 넘는 날이 있어요 · 확정?' && (await rest(`applications?id=eq.${AA}`))[0].status === 'applied', armed)

  // ── 3. 대시보드: 인원 미정 · 아무도 확정 안 됨
  await setJob({ headcount: 4, applications: [{ status: 'applied' }, { status: 'applied' }] })
  await rest(`applications?id=eq.${AW}`, 'PATCH', { status: 'applied' })
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const li = a.locator('[data-shortage] li', { hasText: T })
  await li.waitFor({ timeout: 15000 }).catch(() => {})
  const liText = one(await li.innerText().catch(() => ''))
  ok("대시보드: '확정 0명' · '인원 미정' ('4명 부족'·'0/4명' 없음)", one(await li.locator('[data-short-gap]').innerText().catch(() => '')) === '확정 0명' && liText.includes('인원 미정') && !liText.includes('4명 부족') && !liText.includes('0/4'), liText.slice(0, 120))
  ok('360px 옆으로 안 밀림 (대시보드)', await noSide(a))
  if (SHOTS) await li.screenshot({ path: `${SHOTS}/dash-tbd-short.png` }).catch(() => {})

  // ── 4. 관리자 1:1 문의 대화를 여는 동안 말풍선 모양
  await a.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  const row = a.locator(`a[href="/admin/chat/${W}"]`).first()
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(500)
  await a.route((u) => u.pathname === `/admin/chat/${W}`, async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {})
  })
  await row.click()
  const sk = a.locator('[data-skeleton="chat"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('대화를 여는 동안 말풍선 모양 (문의 목록 모양 아님)', shown && (await a.locator('[data-skeleton="admin-inbox"]').count()) === 0)
  if (SHOTS && shown) await a.waitForTimeout(400).then(() => a.screenshot({ path: `${SHOTS}/admin-chat-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 740 } })).catch(() => {})
  ok('불러오는 화면도 360px 옆으로 안 밀림 (대화)', await noSide(a))
  await a.locator('textarea').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('다 열리면 대화 화면', (await sk.count()) === 0 && (await a.locator('textarea').count()) >= 1)

  // 정리
  await rest(`applications?id=eq.${AW}`, 'DELETE')
  await rest(`applications?id=eq.${AA}`, 'DELETE')
  await rest(`jobs?id=eq.${J7}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
