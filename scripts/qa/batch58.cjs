// 묶음 58: 출석 체크 + 일괄 근무 시작·종료 (관리자 출퇴근 탭, 오늘)
// · 보기: 자세히 | 얼굴 명단 | 출석 체크 (오늘만) · 얼굴 카드를 눌러 체크 · '미출근 모두'·'근무 중 모두'·'체크 해제'
// · 체크한 미출근자 → 한 번 더 눌러 한 번에 근무 시작 (관리자 출석 체크로 기록 · 근무자에게 '출근 처리됐어요' 알림 · 기록 남김)
// · 체크한 근무 중인 사람 → 한 번에 근무 종료 (메모는 덧붙임) · 종료한 사람은 못 고름
// · 서버에서 다시 확인: 확정자 + 그날 근무하는 사람만 · 이미 시작한 사람은 건너뜀 · 다른 회사 관리자·오늘 아닌 날은 안 됨
// · '시작 시각으로'는 시작 시각이 지났을 때만 그 시각 (안 지났으면 지금) · 360px에서 처리 칸이 아래 탭 위에
// node scripts/qa/batch58.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000b2', W3 = 'bbbbbbbb-0000-4000-8000-0000000000b3', W4 = 'bbbbbbbb-0000-4000-8000-0000000000b4', W5 = 'bbbbbbbb-0000-4000-8000-0000000000b5', W6 = 'bbbbbbbb-0000-4000-8000-0000000000b6'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
const today = kstDate()
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
// 화면 안에서 서버 함수를 직접 부름 (조작된 요청 흉내) — 같은 이름 여러 값은 배열로
const call = (p, file, name, args, form = {}) =>
  p.evaluate(
    async ({ id, args, form }) => {
      const body = new FormData()
      for (const [k, v] of Object.entries(form)) for (const x of [].concat(v)) body.append(`_1_${k}`, x)
      body.append('0', JSON.stringify([...args, '$K1']))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.text()
    },
    { id: idOf(file, name), args, form },
  )
const att = async () => (await rest('attendance')).filter((a) => a.job_id === J && a.work_date === today)

;(async () => {
  // 준비: 확정자 W2·W3(미출근) · W4(다른 날만 근무) · W5(오늘 이미 종료) · W6(미출근, 시작 시각 확인용) · 다른 회사 관리자 A2
  const [w] = await rest(`users?id=eq.${W}`)
  const person = (id, name, phone) => ({ id, name, phone, birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: name, photo_at: null })
  const people = [[W2, '김출석', '01011112222'], [W3, '이체크', '01033332222'], [W4, '박다른날', '01044442222'], [W5, '최종료', '01055552222'], [W6, '정시작', '01066662222']]
  for (const [id, name, phone] of people) {
    await rest('users', 'POST', { ...w, id, name, phone, attendance: [], ratings: [] })
    await rest('applications', 'POST', { id: `11111111-0000-4000-8000-0000000${id.slice(-5)}`, job_id: J, user_id: id, status: 'approved', position: null, available_dates: id === W4 ? ['2099-01-01'] : null, created_at: new Date().toISOString(), user: person(id, name, phone) })
  }
  const t = (min) => new Date(Date.now() - min * 60e3).toISOString()
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000000000f5', job_id: J, user_id: W5, work_date: today, clock_in: t(300), clock_out: t(10), source: 'app', note: null, confirmed: false, paid: false })
  const [c1] = await rest('companies?id=eq.99999999-0000-4000-8000-000000000099')
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const ad = await pg(A)
  const card = (id) => ad.locator(`[data-roll="${id}"]`)

  // ── 1. 보기 바꾸기 → 출석 체크 ──
  await ad.goto(`${D}/admin/jobs/${J}?tab=att`)
  ok('보기: 자세히 · 얼굴 명단 · 출석 체크 (오늘)', (await ad.locator('[data-att-views] [data-view]').allInnerTexts()).map((s) => s.trim()).join('|') === '자세히|얼굴 명단|출석 체크')
  await ad.locator('[data-view=check]').click()
  await ad.locator('[data-roll-call]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('출석 체크 화면: 안내 + 얼굴 카드', (await see(ad, '온 사람을 눌러 체크하세요')) && (await ad.locator('[data-roll]').count()) === 5, String(await ad.locator('[data-roll]').count()))
  ok('다른 날만 근무하는 사람은 명단에 없음', (await card(W4).count()) === 0)
  ok('상태: 근무 중 · 미출근 · 종료(못 고름)', (await card(W).getAttribute('data-state')) === 'working' && (await card(W2).getAttribute('data-state')) === 'absent' && (await card(W5).isDisabled()))
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 눌러서 체크 · 모두 고르기 · 해제 ──
  await card(W2).click()
  ok('카드 누르면 체크', (await card(W2).getAttribute('aria-pressed')) === 'true' && (await see(ad, '체크한 1명 근무 시작', 3000)))
  await card(W2).click()
  ok('한 번 더 누르면 체크 풀림', (await card(W2).getAttribute('aria-pressed')) === 'false' && (await ad.locator('[data-roll-bar]').count()) === 0)
  await ad.locator('[data-pick=absent]').click()
  ok("'미출근 모두': 미출근 3명 체크", (await ad.locator('[data-roll][aria-pressed=true]').count()) === 3 && (await see(ad, '체크한 3명 근무 시작', 3000)))
  await card(W6).click()
  const bar = await ad.locator('[data-roll-bar]').boundingBox()
  const tabTop = await ad.evaluate(() => { const n = document.querySelector('nav[aria-label] , nav'); const all = [...document.querySelectorAll('nav')].map((x) => x.getBoundingClientRect()).filter((r) => r.bottom >= innerHeight - 2); return all.length ? Math.min(...all.map((r) => r.top)) : innerHeight })
  ok('처리 칸이 화면 안 · 아래 탭에 안 가림', !!bar && bar.y + bar.height <= tabTop + 1 && bar.x >= 0 && bar.x + bar.width <= 360, `${JSON.stringify(bar)} tab ${tabTop}`)

  // ── 3. 한 번에 근무 시작 (한 번 더 눌러야) ──
  const startBtn = ad.locator('[data-roll-bar] button[type=submit]').first()
  await startBtn.click()
  ok('첫 누름은 확인 문구만', (await see(ad, '한 번 더 누르면 2명 근무 시작', 2000)) && (await att()).filter((a) => [W2, W3].includes(a.user_id)).length === 0)
  await startBtn.click()
  ok('두 번 누르면 2명 근무 시작 + 결과 안내', await see(ad, '2명 근무 시작으로 기록했어요'))
  let rows = await att()
  const r2 = rows.find((a) => a.user_id === W2), r3 = rows.find((a) => a.user_id === W3)
  ok('기록: 관리자 출석 체크 · 지금 시각', !!r2 && !!r3 && r2.source === 'admin' && r2.note === '관리자 출석 체크' && !r2.clock_out && Math.abs(new Date(r2.clock_in) - Date.now()) < 120e3)
  ok('체크 안 한 W6은 그대로 미출근', !rows.some((a) => a.user_id === W6))
  const inbox = (await rest('messages')).filter((m) => m.from_admin && m.job_id === J && m.body.startsWith('✅ 출근 처리됐어요'))
  ok("근무자에게 '출근 처리됐어요' (시각 포함)", inbox.length === 2 && inbox.every((m) => [W2, W3].includes(m.thread_user_id) && /\d{2}:\d{2} 근무 시작으로 기록/.test(m.body)))
  ok('기록 남김 (누가·몇 명)', (await rest('audit_logs')).some((l) => l.action === 'attendance.bulk_in' && l.actor_id === A && l.detail.includes('2명')))
  await ad.locator('[data-roll-call]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('돌아오면: 출석 체크 화면 그대로 · 체크 비움 · 상태 근무 중', (await ad.locator('[data-roll][aria-pressed=true]').count()) === 0 && (await card(W2).getAttribute('data-state')) === 'working')

  // ── 4. 근무 중 골라 한 번에 종료 ──
  await card(W).click()
  await card(W2).click()
  const endBtn = ad.locator('[data-roll-bar] form').last().locator('button[type=submit]')
  ok('근무 중 2명 고르면 종료 버튼', await see(ad, '근무 중 2명 근무 종료', 3000))
  await endBtn.click()
  await endBtn.click()
  ok('두 번 누르면 2명 근무 종료', await see(ad, '2명 근무 종료로 기록했어요'))
  rows = await att()
  const w1 = rows.find((a) => a.user_id === W), w2 = rows.find((a) => a.user_id === W2), w3 = rows.find((a) => a.user_id === W3)
  ok('고른 사람만 종료 (W3는 계속 근무 중)', !!w1?.clock_out && !!w2?.clock_out && !w3?.clock_out)
  ok('메모는 덧붙임 (원래 메모 보존)', w2?.note === '관리자 출석 체크 · 관리자 일괄 종료', w2?.note)
  ok("근무자에게 '근무 종료로 기록했어요'", (await rest('messages')).filter((m) => m.body.startsWith('🏁 근무 종료로 기록했어요')).length === 2)

  // ── 5. 서버에서 다시 확인 (조작된 요청) ──
  let r = await call(ad, 'admin', 'bulkClockIn', [J, today], { user_ids: [W4, AP] })
  ok('다른 날 근무자·확정 안 된 지원자는 시작 못 함', !(await att()).some((a) => [W4, AP].includes(a.user_id)))
  const before = (await att()).length
  r = await call(ad, 'admin', 'bulkClockIn', [J, today], { user_ids: [W3] })
  ok('이미 시작한 사람은 다시 안 넣음', (await att()).length === before)
  r = await call(ad, 'admin', 'bulkClockIn', [J, '2099-01-01'], { user_ids: [W6] })
  ok('오늘이 아닌 날은 안 됨', !(await att()).some((a) => a.user_id === W6) && !(await rest('attendance')).some((a) => a.work_date === '2099-01-01'))
  const a2 = await pg(A2)
  await a2.goto(`${D}/admin`)
  r = await call(a2, 'admin', 'bulkClockIn', [J, today], { user_ids: [W6] })
  ok('다른 회사 관리자는 안 됨', !(await att()).some((a) => a.user_id === W6))
  r = await call(a2, 'admin', 'bulkClockOutPicked', [J, today], { user_ids: [W3] })
  ok('다른 회사 관리자는 종료도 안 됨', !(await att()).find((a) => a.user_id === W3)?.clock_out)
  // '시작 시각으로': 시작 시각(09:00)이 지났으면 그 시각, 아직이면 지금
  r = await call(ad, 'admin', 'bulkClockIn', [J, today], { user_ids: [W6], at: 'start' })
  const r6 = (await att()).find((a) => a.user_id === W6)
  const startAt = new Date(`${today}T09:00:00+09:00`)
  const want = startAt < new Date() ? startAt.getTime() : Date.now()
  ok("'시작 시각으로': 지났으면 09:00, 아니면 지금", !!r6 && Math.abs(new Date(r6.clock_in).getTime() - want) < 120e3, r6?.clock_in)

  // ── 6. 다른 날에는 출석 체크 보기가 없음 ──
  const tomorrow = kstDate(new Date(Date.now() + 86400e3))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: tomorrow })
  await ad.goto(`${D}/admin/jobs/${J}?tab=att&date=${tomorrow}&view=check`)
  ok('오늘이 아닌 날(내일): 출석 체크 없음', (await ad.locator('[data-view=check]').count()) === 0 && (await ad.locator('[data-roll-call]').count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: today })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
