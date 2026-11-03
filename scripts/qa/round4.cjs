// 기능·디자인 개선 10가지 (4차) 테스트
// node scripts/qa/round4.cjs <default 앱> <default 가짜> <fresh 앱> <fresh 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD, F, MF] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString()
const hm = (ms) => kst(ms).slice(11, 16)
const today = kst(Date.now()).slice(0, 10)
const tomorrow = kst(Date.now() + 86400e3).slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (m, path, method = 'GET', body) => fetch(`${m}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const errs = []
;(async () => {
  const b = await chromium.launch()
  const pg = async (base, uid, opt = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR', ...opt })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }, { name: 'alba_roster', value: roster(uid), url: base }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${base} ${e.message.slice(0, 120)}`)); return p
  }
  const now = Date.now()
  const nearMidnight = hm(now) > '21:30' || hm(now) < '01:00'

  // ── 1. 출근 전 남은 시간 / 시작 시각 지남 (fresh: 아직 출근 전) ──
  const w = await pg(F, WK)
  if (nearMidnight) console.log('SKIP  1·2·3 (자정 가까워 시각 계산 생략)')
  else {
    await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { start_time: `${hm(now + 61 * 60e3)}:00`, end_time: `${hm(now + 180 * 60e3)}:00` })
    await w.goto(`${F}/me`)
    ok('1. 시작까지 남은 시간', await see(w, /시작까지 (1시간|59분|1시간 1분)/))
    await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { start_time: `${hm(now - 30 * 60e3)}:00`, end_time: `${hm(now + 120 * 60e3)}:00` })
    await w.goto(`${F}/me`)
    ok('1. 시작 시각 지나면 근무 시작 안내', await see(w, /이 (29|30|31)분 지났어요\. 도착했다면 근무 시작을 눌러 주세요/))

    // ── 3. 내 근무 자동 새로고침: 담당자가 출근 처리하면 새로 고치지 않아도 근무 중으로 ──
    await rest(MF, 'attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000000000a1', job_id: J, user_id: WK, work_date: today, clock_in: new Date(now - 20 * 60e3).toISOString(), clock_out: null, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, note: null, source: 'admin', confirmed: false, paid: false, ot_minutes: 0, ot_status: null, ot_by: null, sched_start: null, sched_end: null })
    ok('3. 새로 고치지 않아도 근무 중으로 바뀜 (1분 자동 갱신)', await see(w, /근무 중 · \d\d:\d\d 시작/, 75000))

    // ── 2. 근무 완료 카드: 오늘 번 돈 ──
    await rest(MF, `attendance?id=eq.eeeeeeee-0000-4000-8000-0000000000a1`, 'PATCH', { clock_out: new Date(now).toISOString() })
    await w.goto(`${F}/me`)
    ok('2. 근무 완료: 오늘 약 n원 (세전)', (await see(w, /오늘 약 [\d,]+원/)) && (await see(w, '세전')))
  }

  // ── 5. 계좌 확인 (default) ──
  const wd = await pg(D, WK)
  await wd.goto(`${D}/me/profile`)
  const prof = wd.locator('form', { hasText: '급여 계좌' })
  await prof.locator('select[name=bank_name]').selectOption('KB국민은행')
  await prof.locator('input[name=bank_account]').fill('12345')
  await prof.getByRole('button', { name: '저장' }).click()
  ok('5. 자리수가 모자라면 막힘', await see(wd, '계좌번호가 5자리예요'))
  await prof.locator('input[name=bank_account]').fill('123-456-789012')
  await prof.locator('input[name=account_holder]').fill('김철수')
  await prof.getByRole('button', { name: '저장' }).click()
  ok('5. 예금주가 다르면 저장하고 알려 줌', await see(wd, /예금주\(김철수\)가 본인 이름과 달라요/))

  // ── 8. 근무자 정보에서 공고에 바로 확정 + 예금주 다름 표시 ──
  const a = await pg(D, A, { permissions: ['clipboard-read', 'clipboard-write'] })
  await a.goto(`${D}/admin/workers/${WK}`)
  ok('8. 예금주 다름 표시', await see(a, '예금주 다름'))
  await a.goto(`${D}/admin/workers/${AP}`)
  await a.locator('select[name=job_id][required]').selectOption(J)
  await a.getByRole('button', { name: '확정으로 추가' }).click()
  await a.getByRole('button', { name: '한 번 더 누르면 확정돼요' }).click()
  ok('8. 확정했다는 안내', await see(a, /김지원님을 「.+」에 확정했어요/, 15000))
  // (가짜 DB는 upsert를 새 줄로 넣음 — 실제 DB는 같은 줄을 바꿈) 확정된 줄이 있는지만 봄
  const apRows = await rest(MD, `applications?job_id=eq.${J}&user_id=eq.${AP}`)
  ok('8. 지원 → 확정', apRows.some((r) => r.status === 'approved'), apRows.map((r) => r.status).join(','))
  // 가짜 DB에 생긴 중복 줄 정리 (원래 줄만 남김)
  await fetch(`${MD}/rest/v1/applications?job_id=eq.${J}&user_id=eq.${AP}&id=neq.11111111-0000-4000-8000-000000000012`, { method: 'DELETE' })

  // ── 4. 확정 알림이 문의함에도 (휴대폰 알림을 안 켠 사람도) ──
  let msgs = (await rest(MD, `messages?thread_user_id=eq.${AP}`)).filter((m) => m.body.startsWith('✅ 근무가 확정됐어요'))
  ok('4. 바로 확정해도 문의함에 확정 안내', msgs.length === 1 && msgs[0].from_admin === true, msgs.map((m) => m.body.replace(/\n/g, ' / ')).join(' | '))
  await rest(MD, `applications?job_id=eq.${J}&user_id=eq.${AP}`, 'PATCH', { status: 'applied' })
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await a.locator('.sm\\:hidden .card', { hasText: '김지원' }).getByRole('button', { name: '확정', exact: true }).click()
  await a.waitForTimeout(1500)
  msgs = (await rest(MD, `messages?thread_user_id=eq.${AP}`)).filter((m) => m.body.startsWith('✅ 근무가 확정됐어요'))
  ok('4. 지원자 탭에서 확정해도 문의함에 안내', msgs.length === 2, String(msgs.length))
  const apPage = await pg(D, AP)
  await apPage.goto(`${D}/me/chat`)
  ok('4. 근무자 문의함 화면에 보임', await see(apPage, '✅ 근무가 확정됐어요'))

  // ── 7. 명단 복사 (배치별) ──
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  await a.getByRole('button', { name: '명단 복사' }).click()
  const clip = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok('7. 명단 복사: 배치별 이름·연락처', clip.includes('■ A게이트') && clip.includes('근무자 010-3333-4444') && clip.includes('명단'), clip.replace(/\n/g, ' / '))

  // ── 6. 임금명세서 한 번에 인쇄 ──
  await rest(MD, `attendance?job_id=eq.${J}`, 'PATCH', { clock_out: new Date().toISOString() })
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  ok('6. 정산 탭에 한 번에 인쇄', await see(a, '🖨 명세서 한 번에 인쇄'))
  await a.goto(`${D}/print/payslip/${J}`)
  ok('6. 일한 사람 모두 · 한 사람에 한 장', (await see(a, '1명 · 한 사람에 한 장')) && (await a.locator('article', { hasText: '임금명세서' }).count()) === 1)
  await a.goto(`${D}/print/payslip/${J}/${WK}`)
  ok('6. 한 사람 명세서도 그대로', (await see(a, '실수령액')) && (await see(a, '근무 내역')))
  await wd.goto(`${D}/print/payslip/${J}`)
  ok('6. 근무자는 전체 인쇄 못 봄', !(await see(wd, '한 사람에 한 장', 2000)))

  // ── 9. 관리자 답장: 근무자 요청에 맞는 빠른 답장 ──
  await rest(MD, 'messages', 'POST', { id: 950, thread_user_id: WK, sender_id: WK, from_admin: false, job_id: J, body: '🕒 지각 알림\n테스트 · 약 10분 늦어요 (도착 예정 09:10)', read_at: null, created_at: new Date().toISOString(), job: { id: J, title: '테스트' }, sender: { name: '근무자' } })
  await a.goto(`${D}/admin/chat/${WK}`)
  ok('9. 지각 알림엔 "조심히 오세요" 답장', await see(a, '네, 조심히 오세요.'))
  ok('9. 기본 답장도 함께', await see(a, '확인했습니다.'))

  // ── 10. 대시보드: 내일 근무인데 서명 안 함 ──
  await rest(MD, `jobs?id=eq.${J}`, 'PATCH', { end_date: tomorrow })
  await a.goto(`${D}/admin`)
  ok('10. 확인할 일: 내일 근무 · 서명 안 함', await see(a, /내일 근무 · 서명 안 함 ·/))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
