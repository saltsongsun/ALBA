// 매일 저녁 자동 안내(전날 안내·근무 종료 확인)도 전문가 의뢰면 '용역계약서'·'내 일'로
// node scripts/qa/expert-remind-words.cjs <working 앱> <working 가짜>
const [W_, MW] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MW}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const cron = () => fetch(`${W_}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } }).then((r) => r.json())
const msgs = async (prefix) => (await rest(`messages?thread_user_id=eq.${WK}`)).filter((m) => m.body.startsWith(prefix))
;(async () => {
  // 전문가 의뢰로 바꿈
  const [job] = await rest(`jobs?id=eq.${J}`)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { audience: 'expert', tax_type: 'business', start_time: '09:00:00', end_time: '18:00:00' })

  // 1) 어제 근무 종료를 안 누름 → '내 일'에서 끝난 시각 알려 달라고
  const [att] = await rest(`attendance?job_id=eq.${J}`)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: day(-1), clock_in: `${day(-1)}T00:00:00.000Z`, clock_out: null, job: { ...att.job, audience: 'expert' } })
  let r = await cron()
  const f = (await msgs('⏰ 근무 종료 확인'))[0]
  ok('근무 종료 확인: 전문가는 ‘내 일’에서', r.forgot === 1 && !!f && f.body.includes('‘내 일’에서 끝난 시각'), f?.body.replace(/\n/g, ' / '))

  // 2) 내일 일하는 전문가 의뢰(종이 계약, 아직 안 받음) → 용역계약서 안내
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: `${day(-1)}T09:00:00.000Z` })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day(1), end_date: day(1), contract_method: 'paper' })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${WK}`, 'PATCH', { status: 'approved', contract_received_at: null, available_dates: null })
  r = await cron()
  const d = (await msgs('⏰ 내일 근무 안내'))[0]
  ok('전날 안내가 감', !!d, JSON.stringify(r))
  ok('전날 안내: 📝 용역계약서는 내일 현장에서 종이로', !!d && d.body.includes('📝 용역계약서는 내일 현장에서 종이로 작성해요.') && !d.body.includes('근로계약서'), d?.body.replace(/\n/g, ' / '))

  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
