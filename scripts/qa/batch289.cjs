// 묶음 289 (사용자 요청 2026-11-17 "문의 내용 중 자동 내용이 들어오면 그걸 해결하는 버튼을 문의 내용에 넣어줘")
// 관리자 문의 대화: 근무자·업체가 보낸 요청 말풍선 바로 아래에 처리 버튼 (누르면 그 자리에서 처리 · 처리하면 버튼이 사라짐)
// · 지각 알림 → '‘조심히 오세요’ 답장' (한 번에 답장) · 출퇴근 탭 →
// · '오늘 출근했는데 근무 시작을 못 눌렀어요' → 'HH:MM 출근 처리' (근무 시작 시각으로 기록 + 근무자에게 알림) · 다른 시각 →
// · '지원했는데 확정 여부가 궁금해요' → '확정 전 · 날짜 공고' + '확정하기'(두 번 눌러야) · 지원자 보기 →
// · 업체 '대금 지급일이 지났어요' → '대금 이름 · 금액' + '지급 완료 표시'(두 번 눌러야) → '✓ 지급 완료'
// (전에는 출근 기록·확정 문의가 대화 아래 따로 뜬 카드의 링크였고, 지각·대금 문의는 처리 버튼이 없었음)
// node scripts/qa/batch289.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C1 = '99999999-0000-4000-8000-000000000099'
const U2 = 'bbbbbbbb-0000-4000-8000-000000028901', J2 = 'cccccccc-0000-4000-8000-000000028901', APP2 = '11111111-0000-4000-8000-000000028901'
const P = 'bbbbbbbb-0000-4000-8000-000000028902', VP = '77777777-0000-4000-8000-000000028901', PAY = 'dddddddd-0000-4000-8000-000000028901'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kNow = () => new Date(Date.now() + 9 * 3600e3)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const md = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(`${s}T00:00:00Z`).getUTCDay()]})` }
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()

;(async () => {
  const today = kday(0)
  const nowMin = kNow().getUTCHours() * 60 + kNow().getUTCMinutes()
  const start = hm(Math.max(nowMin - 60, 0))
  // 근무자 W: 오늘 이미 시작한 근무 · 출근 기록 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: `${start}:00`, end_time: `${hm(Math.min(nowMin + 120, 23 * 60 + 59))}:00`, status: 'open' })
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [w] = await rest(`users?id=eq.${W}`)
  const msg = (id, uid, body, min, jobId = J, name = w.name) => ({ id, company_id: C1, thread_user_id: uid, sender_id: uid, from_admin: false, job_id: jobId, body, read_at: null, created_at: ago(min), user: { id: uid, name, phone: w.phone, photo_at: null } })
  await rest('messages', 'POST', [
    msg(2890001, W, `🕒 지각 알림\n${job.title} · 약 10분 늦어요 (도착 예정 ${hm(Math.min(nowMin + 10, 23 * 60 + 59))})`, 3),
    msg(2890002, W, '오늘 출근했는데 근무 시작을 못 눌렀어요. 기록 부탁드려요.', 2),
  ])
  // 지원자 U2: 내일 공고 J2에 지원(대기) · '확정 여부가 궁금해요'
  const { applications: _a, ...jb } = job
  await rest('jobs', 'POST', { ...jb, id: J2, title: '내일 무대 설치 스태프', start_date: kday(1), end_date: kday(1), start_time: '09:00:00', end_time: '18:00:00', headcount: 3, hidden_fields: [], applications: [], created_at: ago(600) })
  await rest('users', 'POST', { ...w, id: U2, name: '확정궁금', phone: '01028900001', attendance: [], ratings: [] })
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...wa, id: APP2, job_id: J2, user_id: U2, company_id: C1, status: 'applied', held_at: null, decided_at: null, available_dates: null, position: null, created_at: ago(300), user: { id: U2, name: '확정궁금' }, job: { id: J2, title: '내일 무대 설치 스태프', start_date: kday(1), end_date: kday(1), status: 'open', company_id: C1 } })
  await rest('messages', 'POST', [msg(2890003, U2, '지원했는데 확정 여부가 궁금해요.', 1, J2, '확정궁금')])
  // 외주 업체 P: 지급일이 지난 대금 · '대금 지급일이 지났어요'
  await rest('users', 'POST', { ...w, id: P, name: '빛나조명', phone: '01028900002', member_type: 'vendor', attendance: [], ratings: [] })
  await rest('vendors', 'POST', { id: VP, company_id: C1, user_id: P, name: '빛나조명', phone: '01028900002', category: '조명', contact_name: null, business_no: null, bank_name: null, account_no: null, account_holder: null, memo: null, active: true, created_at: ago(9000) })
  await rest('vendor_payments', 'POST', { id: PAY, company_id: C1, vendor_id: VP, job_id: null, quote_id: null, title: '개막식 조명', amount: 900000, vat_included: true, due_date: kday(-3), paid_at: null, invoice_at: today, memo: null, created_at: ago(9000) })
  await rest('messages', 'POST', [msg(2890004, P, `대금 지급일이 지났어요. 확인 부탁드려요. 개막식 조명 · 900,000원 (지급 예정 ${md(kday(-3))})`, 1, null, '빛나조명')])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async (uid) => {
    await a.goto(`${D}/admin/chat/${uid}`, { waitUntil: 'networkidle' })
    await a.locator('main ol').waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 근무자 W: 지각 알림 · 출근 기록 부탁 → 각 말풍선 바로 아래 버튼
  await open(W)
  const late = a.locator('main ol [data-late-ack]')
  const missed = a.locator('main ol [data-missed-fix]')
  ok("지각 알림 말풍선 아래 '‘조심히 오세요’ 답장' · '출퇴근 탭 →'", one(await late.innerText().catch(() => '')) === '‘조심히 오세요’ 답장 출퇴근 탭 →', one(await late.innerText().catch(() => '')))
  ok(`'못 눌렀어요' 말풍선 아래 '${start} 출근 처리' · '다른 시각 →' (대화 아래 따로 뜨던 카드 없음)`, one(await missed.innerText().catch(() => '')) === `${start} 출근 처리 다른 시각 →` && (await a.locator('[data-missed-fix]').count()) === 1, one(await missed.innerText().catch(() => '')))
  ok('버튼은 그 말풍선 바로 아래 (같은 줄 묶음 안)', await missed.evaluate((el) => el.closest('li')?.textContent.includes('근무 시작을 못 눌렀어요')).catch(() => false))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await missed.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(400)
    await a.screenshot({ path: `${SHOTS}/thread-late-missed.png` }).catch(() => {})
  }

  // 지각: 한 번에 답장 → 버튼 사라짐
  await late.getByRole('button').click()
  const replied = await a.getByText('네, 조심히 오세요.').first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  await a.waitForTimeout(500)
  const sent = (await rest(`messages?thread_user_id=eq.${W}`)).filter((m) => m.from_admin && m.body === '네, 조심히 오세요.')
  ok("누르면 '네, 조심히 오세요.' 답장이 가고 버튼은 사라짐", replied && sent.length === 1 && (await a.locator('[data-late-ack]').count()) === 0)

  // 출근 처리: 근무 시작 시각으로 기록 · 근무자에게 알림 · 버튼 사라짐
  await Promise.all([a.waitForURL(/m=/, { timeout: 30000 }).catch(() => {}), a.locator('main ol [data-missed-fix]').getByRole('button').click()])
  const flash = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  const att = (await rest(`attendance?user_id=eq.${W}`)).find((x) => x.work_date === today && x.job_id === J)
  const inHm = att ? new Date(new Date(att.clock_in).getTime() + 9 * 3600e3).toISOString().slice(11, 16) : ''
  ok(`누르면 '${start} 출근으로 기록했어요.' · 오늘 ${start} 출근 기록`, flash === `${start} 출근으로 기록했어요.` && inHm === start, `${flash} · ${inHm}`)
  await a.locator('[data-auto-notice]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const notice = (await rest(`messages?thread_user_id=eq.${W}`)).filter((m) => m.from_admin && m.body.startsWith('✅ 출근 처리됐어요') && m.body.includes(`${start} 출근으로 기록했어요`))
  ok("근무자에게 '✅ 출근 처리됐어요 · HH:MM 출근으로 기록했어요' · 처리 뒤 버튼 없음", notice.length === 1 && (await a.locator('[data-missed-fix]').count()) === 0)

  // ── 2. 지원자 U2: 확정 문의 → '확정하기' 두 번
  await open(U2)
  const conf = a.locator('main ol [data-confirm-ask]')
  ok(`말풍선 아래 '확정 전 · ${md(kday(1))} 내일 무대 설치 스태프' · '확정하기' · '지원자 보기 →'`, one(await conf.locator('span').first().innerText().catch(() => '')) === `확정 전 · ${md(kday(1))} 내일 무대 설치 스태프` && (await conf.getByRole('button', { name: '확정하기' }).count()) === 1 && (await conf.locator('[data-confirm-apps]').getAttribute('href').catch(() => '')) === `/admin/jobs/${J2}?tab=apps#app-${APP2}`)
  ok('360px 옆으로 안 밀림 (확정 문의)', await noSide(a))
  if (SHOTS) {
    await conf.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(400)
    await a.screenshot({ path: `${SHOTS}/thread-confirm.png` }).catch(() => {})
  }
  await conf.getByRole('button', { name: '확정하기' }).click()
  await a.waitForTimeout(300)
  ok("첫 누름: '한 번 더 누르면 확정' (아직 대기)", one(await conf.locator('button').innerText().catch(() => '')) === '한 번 더 누르면 확정' && (await rest(`applications?id=eq.${APP2}`))[0]?.status === 'applied')
  await Promise.all([a.waitForURL(/m=/, { timeout: 30000 }).catch(() => {}), conf.locator('button').click()])
  const f2 = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok("두 번째: 확정 · '확정궁금님 확정 · 알림을 보냈어요' · 이 대화에 그대로", f2 === '확정궁금님 확정 · 알림을 보냈어요' && (await rest(`applications?id=eq.${APP2}`))[0]?.status === 'approved' && new URL(a.url()).pathname === `/admin/chat/${U2}`, f2)
  await a.waitForTimeout(400)
  ok('확정 뒤 버튼 없음', (await a.locator('[data-confirm-ask]').count()) === 0)

  // ── 3. 외주 업체 P: 대금 지급일 지남 → '지급 완료 표시' 두 번
  await open(P)
  const pay = a.locator('main ol [data-paydue-ask]')
  ok("말풍선 아래 '개막식 조명 · 900,000원' · '지급 완료 표시' · '대금 보기 →'", one(await pay.locator('span').first().innerText().catch(() => '')) === '개막식 조명 · 900,000원' && (await pay.getByRole('button', { name: '지급 완료 표시' }).count()) === 1 && (await pay.getByRole('link', { name: '대금 보기 →' }).getAttribute('href').catch(() => '')) === `/admin/vendors/${VP}`)
  ok('360px 옆으로 안 밀림 (대금 문의)', await noSide(a))
  if (SHOTS) {
    await pay.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(400)
    await a.screenshot({ path: `${SHOTS}/thread-paydue.png` }).catch(() => {})
  }
  await pay.getByRole('button', { name: '지급 완료 표시' }).click()
  await a.waitForTimeout(300)
  ok("첫 누름: '보냈으면 한 번 더' (아직 지급 전)", one(await pay.locator('button').innerText().catch(() => '')) === '보냈으면 한 번 더' && !(await rest(`vendor_payments?id=eq.${PAY}`))[0]?.paid_at)
  await pay.locator('button').click()
  const done = a.locator('main ol [data-paydue-done]')
  await done.waitFor({ timeout: 15000 }).catch(() => {})
  ok("두 번째: 지급 완료 · 말풍선 아래 '✓ 지급 완료 · 개막식 조명'", !!(await rest(`vendor_payments?id=eq.${PAY}`))[0]?.paid_at && one(await done.innerText().catch(() => '')) === '✓ 지급 완료 · 개막식 조명')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
