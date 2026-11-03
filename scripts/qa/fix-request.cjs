// 출퇴근 기록 정정 요청: 근무자가 요청 → 관리자가 요청대로 고치기 / 그대로 두기
// node scripts/qa/fix-request.cjs <working 앱> <working 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [W_, MW] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString()
const today = kst(Date.now()).slice(0, 10)
const hm = (ms) => kst(ms).slice(11, 16)
const minute = (ms) => Math.floor(ms / 60e3) * 60e3
// 오늘 안에서: 출근 inT, (실수로) 종료 outT, 실제 종료 fixT
const midnight = Date.parse(`${today}T00:00:00+09:00`)
const now = minute(Date.now())
const inT = Math.max(midnight + 60e3, now - 120 * 60e3)
const outT = minute(inT + (now - inT) / 3)
const fixT = now - 60e3
const in2T = inT + 60e3
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MW}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  if (now - inT < 6 * 60e3) { console.log('SKIP  자정 직후라 시각을 고를 수 없음'); process.exit(0) }
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: W_ }, { name: 'alba_roster', value: roster(uid), url: W_ }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p
  }
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`attendance?job_id=eq.${J}`, 'PATCH', { work_date: today, clock_in: new Date(inT).toISOString(), clock_out: new Date(outT).toISOString(), adj_in: null, adj_out: null, note: null, paid: false })

  // ── 근무자: 종료를 실수로 일찍 누름 → 정정 요청 ──
  const w = await pg(WK)
  await w.goto(`${W_}/me`)
  ok('근무 완료 카드', await see(w, '오늘 근무 완료'))
  await w.getByRole('button', { name: '시각이 잘못 찍혔나요? 정정 요청' }).click()
  ok('기본: 종료 시각 고름', (await w.locator('input[name=time]').inputValue()) === hm(outT), await w.locator('input[name=time]').inputValue())
  await w.locator('input[name=time]').fill(hm(fixT))
  await w.locator('input[name=reason]').fill('실수로 종료를 일찍 눌렀어요')
  await w.getByRole('button', { name: '정정 요청 보내기' }).click()
  ok('요청 보냄 안내', await see(w, `종료 ${hm(fixT)}(으)로 정정을 요청했어요`))
  let msgs = await rest(`messages?thread_user_id=eq.${WK}`)
  const req = msgs.find((m) => m.body.startsWith('✏️ 기록 정정 요청'))
  ok('담당자 문의함에 요청', !!req && req.body.includes(`실제 종료 ${hm(fixT)}`) && req.body.includes('사유: 실수로'), req?.body.replace(/\n/g, ' / '))
  await w.goto(`${W_}/me`)
  ok('다시 열면: 담당자 확인 중', await see(w, '담당자 확인 중'))

  // ── 관리자: 확인할 일 + 출퇴근 탭에서 요청대로 고치기 ──
  const a = await pg(A)
  await a.goto(`${W_}/admin`)
  ok('확인할 일: 기록 정정 요청', await see(a, /기록 정정 요청 ·/))
  await a.goto(`${W_}/admin/jobs/${J}?tab=att&date=${today}`)
  ok('출퇴근 탭: 정정 요청 표시', await see(a, `실제 종료 ${hm(fixT)}`))
  await a.getByRole('button', { name: `요청대로 ${hm(fixT)}(으)로 고치기` }).click()
  ok('고쳤다는 안내', await see(a, `종료 시각을 ${hm(fixT)}(으)로 고쳤어요`, 15000))
  let att = (await rest(`attendance?job_id=eq.${J}`))[0]
  ok('보정 종료 = 요청 시각', att.adj_out === new Date(fixT).toISOString() && att.clock_out === new Date(outT).toISOString(), `${att.adj_out} / 원래 ${att.clock_out}`)
  ok('메모 남김', (att.note ?? '').includes(`근무자 요청으로 종료 ${hm(fixT)} 정정`), att.note)
  msgs = await rest(`messages?thread_user_id=eq.${WK}`)
  ok('근무자에게 고쳤다고 알림', msgs.some((m) => m.from_admin && m.body.startsWith('✅ 기록 정정') && m.body.includes(hm(fixT))))
  ok('답한 요청은 사라짐', !(await see(a, `요청대로 ${hm(fixT)}(으)로 고치기`, 1500)))
  await w.goto(`${W_}/me`)
  ok('근무자: 고친 시각으로 보임', await see(w, `${hm(inT)} ~ ${hm(fixT)}`))
  ok('근무자: 확인 중 표시 사라짐', !(await see(w, '담당자 확인 중', 1500)))

  // ── 다시 요청 → 관리자가 그대로 두기 ──
  await w.getByRole('button', { name: '시각이 잘못 찍혔나요? 정정 요청' }).click()
  await w.locator('label', { hasText: `출근 ${hm(inT)}` }).click()
  await w.locator('input[name=time]').fill(hm(in2T))
  await w.getByRole('button', { name: '정정 요청 보내기' }).click()
  ok('출근 시각 정정 요청', await see(w, `출근 ${hm(in2T)}(으)로 정정을 요청했어요`))
  await a.goto(`${W_}/admin/jobs/${J}?tab=att&date=${today}`)
  await a.getByRole('button', { name: '그대로 두기' }).click()
  await a.getByRole('button', { name: '한 번 더 누르면 그대로 둬요' }).click()
  ok('그대로 두기 안내', await see(a, '정정하지 않고 근무자에게 알렸어요', 15000))
  att = (await rest(`attendance?job_id=eq.${J}`))[0]
  ok('출근은 그대로', !att.adj_in, att.adj_in)
  msgs = await rest(`messages?thread_user_id=eq.${WK}`)
  ok('근무자에게 그대로 둔다고 알림', msgs.some((m) => m.from_admin && m.body.startsWith('↩️ 기록 정정 안 함')))

  // ── 잘못된 요청은 막힘: 종료를 출근보다 앞으로 ──
  await w.goto(`${W_}/me`)
  await w.getByRole('button', { name: '시각이 잘못 찍혔나요? 정정 요청' }).click()
  await w.locator('label', { hasText: `출근 ${hm(inT)}` }).click()
  await w.locator('input[name=time]').fill(hm(fixT + 60e3 < Date.now() ? fixT : fixT))
  await w.getByRole('button', { name: '정정 요청 보내기' }).click()
  ok('출근을 종료보다 뒤로는 못 보냄', await see(w, '출근 시각은 종료보다 앞이어야 해요'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
