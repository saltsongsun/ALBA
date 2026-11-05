// 외주사 관리: 업체 등록 → 견적 요청 → 업체가 링크로 견적 / 관리자 기록 → 비교·선정 → 대금 지급(예정일·계산서·지급) → 대시보드·행사 비용
// node scripts/qa/vendors.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const errs = []
;(async () => {
  const b = await chromium.launch()
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message.slice(0, 120))); return p
  }
  const a = await pg(A)

  // ── 1. 업체 등록 ──
  await a.goto(`${D}/admin/vendors?tab=list`)
  ok('외주 메뉴 · 업체 없음 안내', await see(a, '등록된 외주사가 없어요'))
  const addVendor = async (v) => {
    const f = a.locator('form', { hasText: '외주사 등록' })
    await f.locator('input[name=name]').fill(v.name)
    await f.locator('input[name=category]').fill(v.category)
    await f.locator('input[name=contact_name]').fill(v.contact)
    await f.locator('input[name=phone]').fill(v.phone)
    if (v.account) {
      await f.locator('select[name=bank_name]').selectOption('KB국민은행')
      await f.locator('input[name=bank_account]').fill(v.account)
      await f.locator('input[name=account_holder]').fill(v.name)
    }
    await f.getByRole('button', { name: '외주사 등록' }).click()
    return see(a, `${v.name}을(를) 외주사로 등록했어요`, 15000)
  }
  ok('업체 등록 (계좌 포함)', await addVendor({ name: '한빛음향', category: '음향·조명', contact: '김대표', phone: '010-1111-2222', account: '123-456-789012' }))
  await a.getByText('＋ 외주사 등록').click()
  ok('업체 등록 (계좌 없음)', await addVendor({ name: '두리렌탈', category: '장비·렌탈', contact: '이실장', phone: '010-3333-5555' }))
  const vendors = await rest('vendors')
  const v1 = vendors.find((v) => v.name === '한빛음향'), v2 = vendors.find((v) => v.name === '두리렌탈')
  ok('계좌는 암호화해서 저장', !!v1?.bank_account_enc && !v1.bank_account_enc.includes('789012'), v1?.bank_account_enc?.slice(0, 12))

  // ── 2. 견적 요청 (공고 연결, 두 업체) ──
  await a.goto(`${D}/admin/vendors?tab=quotes`)
  const rf = a.locator('form', { hasText: '견적 요청 만들기' })
  await rf.locator('input[name=title]').fill('무대 음향 장비 2일')
  await rf.locator('textarea[name=details]').fill('메인 스피커 4조, 무선마이크 6개\n11/8 07:00 설치')
  await rf.locator('input[name=due_date]').fill(day(1))
  await rf.locator('select[name=job_id]').selectOption(J)
  await rf.locator('label', { hasText: '한빛음향' }).click()
  await rf.locator('label', { hasText: '두리렌탈' }).click()
  await rf.getByRole('button', { name: '견적 요청 만들기' }).click()
  ok('견적 요청 만들고 비교 화면으로', await see(a, '견적 요청을 만들었어요', 15000))
  const req = (await rest('quote_requests'))[0]
  let quotes = await rest(`quotes?request_id=eq.${req.id}`)
  ok('업체마다 입력 링크(토큰)', quotes.length === 2 && quotes.every((q) => q.token && q.token.length >= 30) && quotes[0].token !== quotes[1].token)
  const q1 = quotes.find((q) => q.vendor_id === v1.id), q2 = quotes.find((q) => q.vendor_id === v2.id)
  ok('아직 견적 없음 표시', await see(a, '아직 견적이 오지 않았어요'))
  const smsHref = await a.locator('a', { hasText: '💬 문자로 요청' }).first().getAttribute('href')
  ok('문자로 요청: 링크가 든 문구', !!smsHref && smsHref.startsWith('sms:') && decodeURIComponent(smsHref).includes('/quote/'), smsHref?.slice(0, 40))

  // ── 3. 업체가 링크로 견적 (로그인 없음) ──
  const vp = await pg(null)
  await vp.goto(`${D}/quote/${q1.token}`)
  ok('업체 화면: 요청 내용·행사 정보', (await see(vp, '한빛음향 담당자님께')) && (await see(vp, '무대 음향 장비 2일')) && (await see(vp, '메인 스피커 4조')))
  await vp.locator('input[name=amount]').fill('1,500,000')
  ok('금액을 읽기 쉽게 보여 줌', await see(vp, '1,500,000원'))
  await vp.locator('textarea[name=note]').fill('설치·철수 포함')
  await vp.getByRole('button', { name: '견적 보내기' }).click()
  ok('견적 보냄 안내', await see(vp, '1,500,000원 견적을 보냈어요', 15000))
  let qq = (await rest(`quotes?id=eq.${q1.id}`))[0]
  ok('견적 저장 (업체 직접 입력)', qq.status === 'submitted' && qq.amount === 1500000 && qq.submitted_by === 'vendor' && qq.note === '설치·철수 포함')
  await vp.goto(`${D}/quote/abcdefghijklmnopqrstuvwxyz0123`)
  ok('잘못된 링크는 없는 화면', await see(vp, '찾는 화면이 없어요'))

  // ── 4. 관리자가 전화로 받은 견적 기록 ──
  await a.goto(`${D}/admin/vendors/requests/${req.id}`)
  const card2 = a.locator('div.card', { hasText: '두리렌탈' }).filter({ hasText: '아직 견적이' })
  await card2.getByText('전화·메일로 받은 견적 기록').click()
  await card2.locator('input[name=amount]').fill('1200000')
  await card2.getByRole('button', { name: '받은 견적 기록' }).click()
  ok('관리자 기록', await see(a, '1,200,000원으로 기록했어요', 15000))
  await a.goto(`${D}/admin/vendors/requests/${req.id}`)
  ok('최저가 표시', (await a.locator('div.card', { hasText: '두리렌탈' }).filter({ hasText: '최저가' }).count()) === 1)

  // ── 5. 선정 → 대금 지급에 올라감 ──
  const pick = a.locator('div.card', { hasText: '두리렌탈' }).filter({ hasText: '최저가' })
  await pick.getByRole('button', { name: '✓ 이 업체로 선정' }).click()
  await pick.getByRole('button', { name: '1,200,000원로 선정?' }).click()
  ok('선정 → 대금 지급에 올림', await see(a, /선정했어요\. 대금 지급에 1,200,000원을 올렸어요/, 15000))
  quotes = await rest(`quotes?request_id=eq.${req.id}`)
  ok('선정·미선정 정리, 요청 마감', quotes.find((q) => q.id === q2.id).status === 'selected' && quotes.find((q) => q.id === q1.id).status === 'rejected' && (await rest(`quote_requests?id=eq.${req.id}`))[0].status === 'closed')
  let pays = await rest('vendor_payments')
  ok('지급 건 생성 (공고 연결)', pays.length === 1 && pays[0].amount === 1200000 && pays[0].job_id === J && pays[0].vendor_id === v2.id)
  await vp.goto(`${D}/quote/${q1.token}`)
  ok('떨어진 업체 화면: 다른 업체와 진행', await see(vp, '이번에는 다른 업체와 진행하게 됐어요'))
  await vp.goto(`${D}/quote/${q2.token}`)
  ok('선정된 업체 화면: 선정 안내', await see(vp, '견적이 선정됐어요'))

  // ── 6. 대금 지급: 예정일 · 지급일 지남 알림 · 계산서 · 지급 완료 ──
  await a.goto(`${D}/admin/vendors?tab=pay`)
  ok('지급 목록: 예정일 없음 · 계좌 없음 안내', (await see(a, '지급 예정일 없음')) && (await see(a, '계좌가 등록되지 않았어요')))
  const payCard = a.locator('div.card', { hasText: '두리렌탈' })
  await payCard.locator('input[name=due_date]').fill(day(-1))
  await payCard.getByRole('button', { name: '날짜 저장' }).click()
  ok('지급일 지남 표시', await see(a, '지급일 지남'))
  // (날짜 저장이 DB에 닿은 뒤에 대시보드로 — 바로 넘어가면 저장이 끊길 수 있음)
  for (let i = 0; i < 40; i++) {
    const rows = await fetch(`${MD}/rest/v1/vendor_payments`).then((r) => r.json()).catch(() => [])
    if (rows.some((r) => r.due_date === day(-1))) break
    await a.waitForTimeout(150)
  }
  await a.goto(`${D}/admin`)
  ok('대시보드: 외주 대금 지급일 지남 1건', await see(a, '외주 대금 지급일 지남'))
  await a.goto(`${D}/admin/vendors?tab=pay`)
  await a.locator('div.card', { hasText: '두리렌탈' }).getByRole('button', { name: '🧾 계산서 받음' }).click()
  ok('세금계산서 받음', await see(a, /계산서 받음 \d+\/\d+/))
  const pc = a.locator('div.card', { hasText: '두리렌탈' })
  await pc.getByRole('button', { name: '💸 지급 완료' }).click()
  await pc.getByRole('button', { name: '1,200,000원 지급 완료?' }).click()
  await a.waitForTimeout(1500)
  pays = await rest('vendor_payments')
  ok('지급 완료 (오늘 날짜)', pays[0].paid_at === day(0) && pays[0].invoice_at === day(0))

  // ── 7. 직접 등록 + 계좌 복사 ──
  await a.goto(`${D}/admin/vendors?tab=pay&job=${J}`)
  const pf = a.locator('form', { hasText: '지급 건 등록' })
  await pf.locator('select[name=vendor_id]').selectOption(v1.id)
  await pf.locator('input[name=title]').fill('조명 추가 임차')
  await pf.locator('input[name=amount]').fill('300000')
  await pf.getByRole('button', { name: '지급 건 등록' }).click()
  ok('지급 건 직접 등록', await see(a, '300,000원 지급 건을 등록했어요', 15000))
  await a.goto(`${D}/admin/vendors?tab=pay`)
  ok('계좌 있는 업체는 계좌 복사', (await a.locator('div.card', { hasText: '조명 추가 임차' }).getByRole('button', { name: '계좌 복사' }).count()) === 1)

  // ── 8. 행사 비용 합계 (정산 탭) ──
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  ok('정산 탭: 행사 비용 합계', (await see(a, '행사 비용 합계')) && (await see(a, '1,500,000원')) && (await see(a, /외주 미지급 300,000원/)))

  // ── 9. 지급한 견적은 선정 취소 못 함 · 업체 정보 ──
  await a.goto(`${D}/admin/vendors/requests/${req.id}`)
  const sel = a.locator('div.card', { hasText: '두리렌탈' }).filter({ hasText: '대금 지급에서 보기' })
  await sel.getByRole('button', { name: '선정 취소' }).click()
  await sel.getByRole('button', { name: '선정을 취소할까요?' }).click()
  ok('지급한 견적은 선정 취소 막힘', await see(a, '이미 지급한 견적은 선정을 취소할 수 없어요', 15000))
  await a.goto(`${D}/admin/vendors/${v1.id}`)
  ok('업체 정보: 견적 이력·지급', (await see(a, '견적 이력')) && (await see(a, '무대 음향 장비 2일')) && (await see(a, '조명 추가 임차')))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
