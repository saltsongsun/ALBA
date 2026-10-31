// 10가지 현장 시나리오 기능 테스트 (SCENARIOS.md). 가짜 Supabase 3개: default / working / fresh, 앱은 CRON_SECRET=test-cron
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, W_, MW, F, MF] = process.argv.slice(2) // default app/mock, working app/mock, fresh app/mock
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000000a2', J4 = 'cccccccc-0000-4000-8000-0000000000a4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const errs = []
const shot = async (p, n, sel) => { if (!process.env.SHOTS) return; const l = sel ? p.locator(sel).first() : null; if (l) await l.scrollIntoViewIfNeeded().catch(() => {}); await p.screenshot({ path: `${process.env.SHOTS}/${n}.png` }) }
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 33 * 3600e3).toISOString().slice(0, 10)
const rest = (m, path, method = 'GET', body) => fetch(`${m}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const heads = async (m) => (await rest(m, `messages?thread_user_id=eq.${WK}`)).map((x) => x.body.split('\n')[0])
const see = (p, text, t = 8000) => p.getByText(text).first().waitFor({ timeout: t }).then(() => true, () => false)
const workerLite = { id: WK, name: '근무자', phone: '01033334444', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '근무자', photo_at: null }

;(async () => {
  const b = await chromium.launch()
  const page = async (base, uid, extra = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR', ...extra })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(`${base} ${e.message.slice(0, 150)}`))
    return p
  }
  const job = (await rest(MD, `jobs?id=eq.${J}`))[0]

  // ───── fresh: 출근 전 ─────
  await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  // S1 지각 알림
  const wf = await page(F, WK, { geolocation: { latitude: 37.6, longitude: 127.0 }, permissions: ['geolocation'] })
  await wf.goto(`${F}/me`)
  await wf.getByRole('button', { name: /늦을 것 같아요/ }).click()
  await wf.locator('label', { hasText: '30분' }).click()
  await wf.locator('input[name=reason]').fill('버스 지연')
  await shot(wf, '1-late-form', 'input[name=reason]')
  await wf.getByRole('button', { name: '담당자에게 알리기' }).click()
  ok('S1 근무자: 늦어요 보내면 확인 문구', await see(wf, '약 30분 늦는다고 알렸어요'))
  ok('S1 담당자 문의함에 🕒 지각 알림', (await heads(MF)).includes('🕒 지각 알림'))
  await wf.reload()
  ok('S1 다시 열어도 보낸 내용 표시', await see(wf, /약 30분 늦음/))
  const af = await page(F, ADMIN)
  await af.goto(`${F}/admin/jobs/${J}?tab=att`)
  await shot(af, '1-admin-late', 'text=도착 예정')
  ok('S1 관리자 출퇴근 탭: 30분 늦음 배지·도착 예정', (await see(af, '30분 늦음')) && (await see(af, /도착 예정/)))
  ok('S1 늦는다고 알린 사람은 미출근 앱 알림 대상에서 빠짐', (await af.getByRole('button', { name: /미출근 \d+명 앱 알림/ }).count()) === 0)

  // S2 위치 확인 실패 → 출근 확인 요청 → 관리자 출근 처리
  await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { gps_required: true })
  await wf.reload()
  await wf.getByRole('button', { name: '근무 시작' }).click()
  ok('S2 멀리서 누르면 거리 안내', await see(wf, /떨어져 있어요/, 15000))
  await wf.getByRole('button', { name: '담당자에게 출근 확인 요청' }).click()
  ok('S2 출근 확인 요청 보냄', await see(wf, /출근 확인을 요청했어요/))
  await shot(wf, '2-gps-ask', 'text=출근 확인을 요청했어요')
  ok('S2 담당자 문의함에 📍 출근 확인 요청', (await heads(MF)).includes('📍 출근 확인 요청'))
  await af.reload()
  ok('S2 관리자: 출근 요청 배지', await see(af, '출근 요청'))
  await shot(af, '2-admin-ask', 'text=현장 도착')
  await af.getByRole('button', { name: /\d\d:\d\d 출근 처리/ }).click()
  ok('S2 관리자: 요청 시각으로 출근 처리', await see(af, /출근으로 처리했어요/))
  const att = (await rest(MF, `attendance?job_id=eq.${J}&user_id=eq.${WK}`))[0]
  ok('S2 출근 기록 생김 (관리자 등록, 요청 시각)', att && att.source === 'admin' && !att.clock_out, att && att.note)
  ok('S2 근무자에게 ✅ 출근 처리됐어요', (await heads(MF)).includes('✅ 출근 처리됐어요'))
  await wf.reload()
  ok('S2 근무자 화면: 근무 중으로 바뀜', await see(wf, /근무 중 · /))

  // S6 행사 취소 (근무 기록 없는 내일 행사)
  await rest(MF, 'jobs', 'POST', { ...job, id: J4, title: '우천 취소 테스트 행사', start_date: tomorrow, end_date: tomorrow, status: 'open', applications: [{ status: 'approved' }] })
  await rest(MF, 'applications', 'POST', { id: '11111111-0000-4000-8000-0000000000a4', job_id: J4, user_id: WK, status: 'approved', available_dates: null, position: null, message: null, admin_memo: null, decided_at: null, created_at: new Date().toISOString(), job: { ...job, id: J4, title: '우천 취소 테스트 행사', start_date: tomorrow, end_date: tomorrow }, user: workerLite })
  await af.goto(`${F}/admin/jobs/${J4}`)
  await af.getByText(/행사가 취소됐나요/).click()
  await af.locator('textarea[name=reason]').fill('태풍 예보로 주최측이 행사를 취소했습니다.')
  await shot(af, '6-cancel-form', 'textarea[name=reason]')
  await af.getByRole('button', { name: '행사 취소하고 알리기' }).click()
  await af.getByRole('button', { name: '정말 취소하고 알릴까요?' }).click()
  ok('S6 관리자: 취소 완료 안내', await see(af, /행사를 취소했어요. 확정·지원자 1명에게 알렸어요/))
  ok('S6 공고 상태 행사 취소 배지', await see(af, '행사 취소'))
  const app4 = (await rest(MF, `applications?job_id=eq.${J4}`))[0]
  ok('S6 지원도 취소 처리', app4.status === 'cancelled' && /태풍/.test(app4.admin_memo ?? ''))
  ok('S6 근무자 문의함에 ❌ 행사 취소', (await heads(MF)).includes('❌ 행사 취소'))
  await wf.goto(`${F}/jobs/${J4}`)
  ok('S6 근무자 공고 화면: 취소된 행사예요', await see(wf, '❌ 취소된 행사예요'))
  await shot(wf, '6-worker-cancelled')

  // ───── default: 근무 중(서류 대기) ─────
  // S5 일정 변경 알림
  const ad = await page(D, ADMIN)
  await ad.goto(`${D}/admin/jobs/${J}/edit`)
  await ad.locator('input[name=start_time]').evaluate((el) => (el.value = '10:00'))
  await ad.getByRole('button', { name: '공고 저장' }).click()
  ok('S5 저장 + 확정·지원자에게 알림 안내', await see(ad, /확정·지원자 2명에게 바뀐 내용을 알렸어요/, 15000))
  ok('S5 서명된 서류 다시 받으라는 안내', await see(ad, /서명된 서류 1건은 예전 내용이에요/))
  const ch = (await rest(MD, `messages?thread_user_id=eq.${WK}`)).find((m) => m.body.startsWith('🔔 일정 변경'))
  ok('S5 변경 내용(이전 → 변경)이 담김', ch && /시간: 09:00~18:00 → 10:00~18:00/.test(ch.body), ch && ch.body.split('\n')[2])
  const wd = await page(D, WK)
  await wd.goto(`${D}/me`)
  ok('S5 근무자 오늘 카드에 🔔 일정 변경', await see(wd, '🔔 일정 변경'))
  await shot(wd, '5-worker-change', 'text=🔔 일정 변경')

  // S4 겹치는 근무
  await rest(MD, 'jobs', 'POST', { ...job, id: J2, title: '같은 날 다른 행사 스태프', status: 'open' })
  await wd.goto(`${D}/jobs/${J2}`)
  ok('S4 근무자: 같은 시간에 잡힌 근무 경고', await see(wd, '⚠️ 같은 시간에 잡힌 근무가 있어요'))
  await shot(wd, '4-overlap', 'text=같은 시간에 잡힌 근무가 있어요')
  await rest(MD, 'applications', 'POST', { id: '11111111-0000-4000-8000-0000000000a2', job_id: J2, user_id: WK, status: 'applied', available_dates: null, position: null, message: null, admin_memo: null, decided_at: null, created_at: new Date().toISOString(), job: { ...job, id: J2 }, user: workerLite })
  await ad.goto(`${D}/admin/jobs/${J2}?tab=apps`)
  ok('S4 관리자 지원자 목록: 다른 근무와 겹침', await see(ad, /다른 근무와 겹침/))

  // S10 인원 부족 알림
  await ad.goto(`${D}/admin`)
  ok('S10 대시보드: 곧 시작하는데 인원이 모자라요', await see(ad, '🚨 곧 시작하는데 인원이 모자라요'))
  await shot(ad, '10-shortage', 'text=곧 시작하는데 인원이 모자라요')
  ok('S10 부족 인원·대기자 바로가기', (await see(ad, '4명 부족')) && (await see(ad, '대기 1명 확정하러 가기')))

  // ───── working: 근무 중(서류 끝) ─────
  // S3 인터넷 끊김 → 연결되면 자동으로 다시
  const ctxW = { geolocation: { latitude: 37.5, longitude: 127.0 }, permissions: ['geolocation'] }
  const ww = await page(W_, WK, ctxW)
  await ww.goto(`${W_}/me`)
  await ww.context().setOffline(true)
  await ww.getByRole('button', { name: '근무 종료' }).click()
  await ww.getByRole('button', { name: '한 번 더 누르면 종료' }).click()
  ok('S3 끊겼을 때 오류 화면 대신 안내', await see(ww, /인터넷 연결이 약해 기록하지 못했어요/, 15000))
  await shot(ww, '3-offline', 'text=인터넷 연결이 약해')
  await ww.context().setOffline(false)
  ok('S3 연결되면 자동으로 다시 눌러 종료됨', await see(ww, /근무를 종료했어요/, 30000))
  const attW = (await rest(MW, `attendance?job_id=eq.${J}&user_id=eq.${WK}`))[0]
  ok('S3 종료 기록 저장', !!attW.clock_out)

  // S9 계좌 등록 요청 (앱 알림)
  const aw = await page(W_, ADMIN)
  await aw.goto(`${W_}/admin/jobs/${J}?tab=pay`)
  await aw.getByRole('button', { name: '앱 알림' }).click()
  await aw.getByRole('button', { name: '1명에게 보낼까요?' }).click()
  ok('S9 계좌 등록 요청 보냄', await see(aw, '1명에게 앱 알림을 보냈어요'))
  ok('S9 근무자 문의함에 💳 계좌 등록 요청', (await heads(MW)).includes('💳 계좌 등록 요청'))

  // S8 급여 지급 알림
  await aw.goto(`${W_}/admin/jobs/${J}?tab=pay`)
  await aw.getByRole('button', { name: /미지급 1명 모두 지급 완료/ }).click()
  await aw.getByRole('button', { name: '1명 지급 완료로 바꾸고 알릴까요?' }).click()
  ok('S8 지급 완료 + 알림 안내', await see(aw, '1명을 지급 완료로 바꾸고 알렸어요'))
  const paid = (await rest(MW, `messages?thread_user_id=eq.${WK}`)).find((m) => m.body.startsWith('💸 급여 지급'))
  ok('S8 근무자에게 실지급액과 함께 💸 급여 지급', paid && /급여.*을 등록한 계좌로 보냈어요/.test(paid.body), paid && paid.body.split('\n')[1])

  // S7 전날 안내 (cron)
  await rest(MW, `jobs?id=eq.${J}`, 'PATCH', { end_date: tomorrow })
  const unauth = await fetch(`${W_}/api/cron/remind`)
  ok('S7 비밀값 없이 부르면 거절', unauth.status === 401)
  const r1 = await (await fetch(`${W_}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } })).json()
  ok('S7 내일 근무자에게 안내 보냄', r1.sent === 1 && r1.date === tomorrow, JSON.stringify(r1))
  const r2 = await (await fetch(`${W_}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } })).json()
  ok('S7 두 번 불러도 한 번만', r2.sent === 0, JSON.stringify(r2))
  const rm = (await rest(MW, `messages?thread_user_id=eq.${WK}`)).find((m) => m.body.startsWith('⏰ 내일 근무 안내'))
  ok('S7 안내에 시간·장소', rm && /\d\d:\d\d~\d\d:\d\d · 광장/.test(rm.body), rm && rm.body.split('\n').slice(1, 3).join(' / '))
  const wm = await page(W_, WK)
  await wm.goto(`${W_}/me/chat`)
  ok('S7 근무자 문의함 화면에 안내가 보임', await see(wm, '⏰ 내일 근무 안내'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
