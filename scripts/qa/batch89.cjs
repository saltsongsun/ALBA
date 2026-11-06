// 묶음 89: 관리자 '지금 할 일' 큰 버튼 (사용자 요청 "관리자도 근무자처럼 버튼들 만들어줘 · 행사 종료하기 등등") + 정산 예정일 알리기 ("정산예정일자 고지기능 넣어줘")
// · 공고 화면 맨 위: 당일 근무 시간 '출석 체크' / 중간 날 끝 '오늘 근무 마무리 · n명 종료' / 마지막 날 끝 '🏁 행사 종료하기'(두 번) / 끝남 '정산하러 가기' / 행사 전 '지원자 확인 · 대기 n명'·'모집 마감하기' / 임시 '공개하기'
// · 행사 종료하기: 근무 중인 사람은 종료 시각으로 근무 종료 + 행사 종료 + 정산 탭 + 근무자에게 '정산 예정일 안내'(지급일 '익월 10일' → 다음 달 10일)
// · 대시보드 '오늘 진행 행사' 카드에도 같은 버튼 · 더보기의 작은 '행사 종료'는 없어짐
// · 정산 탭 '💰 정산 예정일 알리기' → 근무자 문의함 + 지난 근무에 '💰 정산 예정 …' · 360px
// node scripts/qa/batch89.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms = 0) => new Date(Date.now() + 9 * 3600e3 + ms).toISOString().slice(0, 10)
const today = kst(), tomorrow = kst(86_400_000)
const patchJob = (b) => rest(`jobs?id=eq.${J}`, 'PATCH', b)

;(async () => {
  await patchJob({ start_time: '00:00:00', end_time: '23:59:00', pay_day: '익월 10일' })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await pg(A)
  const acts = a.locator('[data-job-actions]')
  const phase = () => acts.first().getAttribute('data-job-actions').catch(() => null)
  const openJob = async (q = '') => { await a.goto(`${D}/admin/jobs/${J}${q}`); await acts.first().waitFor({ timeout: 10000 }).catch(() => {}) }
  const oneLine = (loc) => loc.evaluate((el) => el.getBoundingClientRect().height < 64).catch(() => false)

  // ── 1. 대시보드: 오늘 진행 행사 카드에 '출석 체크' ──
  await a.goto(`${D}/admin`)
  const card = a.locator('[data-today-job]').first()
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  ok("대시보드 오늘 진행 행사: '출석 체크 · 근무 중 1명'", (await card.locator('[data-job-actions=live]').innerText().catch(() => '')).includes('출석 체크 · 근무 중 1명'))
  ok('360px: 옆으로 안 밀림 (대시보드)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 공고: 당일 근무 시간 → 출석 체크 ──
  await openJob()
  ok("당일 근무 시간: 큰 '출석 체크' + 근무 중·퇴근 숫자", (await phase()) === 'live' && (await acts.locator('a', { hasText: '출석 체크' }).getAttribute('href')).includes('view=check') && (await a.locator('[data-job-counts]').innerText()).includes('근무 중 1'))
  ok('큰 버튼 글자 한 줄', await oneLine(acts.locator('a', { hasText: '출석 체크' })))
  await a.locator('[data-job-more] summary').click()
  await a.waitForTimeout(400)
  ok("더보기의 작은 '행사 종료'는 없어짐 (위의 큰 버튼으로)", (await a.locator('[data-job-more]').getByRole('button', { name: '행사 종료', exact: true }).count()) === 0)

  // ── 3. 여러 날 행사의 중간 날, 종료 시각 지남 → 오늘 근무 마무리 ──
  await patchJob({ end_date: tomorrow, end_time: '00:01:00' })
  await openJob()
  ok("중간 날 끝: '오늘 근무 마무리 · 1명 종료'", (await phase()) === 'dayOver' && (await acts.innerText()).includes('오늘 근무 마무리 · 1명 종료'))

  // ── 4. 마지막 날 끝 → 행사 종료하기 ──
  await patchJob({ end_date: today })
  await openJob()
  ok("마지막 날 끝: '🏁 행사 종료하기' + '근무 중 1명은 종료 시각(00:01)으로 함께 근무 종료돼요'", (await phase()) === 'lastOver' && (await a.locator('[data-job-end-hint]').innerText()).includes('근무 중 1명은 종료 시각(00:01)으로'))
  ok('360px: 옆으로 안 밀림 (공고)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const end = acts.getByRole('button', { name: '🏁 행사 종료하기' })
  await end.click()
  await acts.getByRole('button', { name: '한 번 더 누르면 행사 종료' }).click()
  await a.waitForURL(/tab=pay/, { timeout: 15000 }).catch(() => {})
  await a.getByText('행사를 종료했어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("두 번 누르면 행사 종료 → 정산 탭 + '근무 중이던 1명은 근무 종료로 기록 · 1명에게 정산 예정일을 알렸어요'", /tab=pay/.test(a.url()) && (await a.getByText(/근무 중이던 1명은 근무 종료로 기록했어요. 1명에게 정산 예정일을 알렸어요/).count()) >= 1)
  ok("공고 상태 '행사 종료' · 근무 기록도 종료됨", (await rest(`jobs?id=eq.${J}`))[0].status === 'done' && !!(await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`))[0].clock_out)
  const wm = await rest(`messages?thread_user_id=eq.${W}`)
  const pd = wm.find((m) => m.body.startsWith('💰 정산 예정일 안내'))
  ok("근무자에게 '🏁 행사가 끝났어요' + '💰 정산 예정일 안내 … 정산 예정일: (다음 달) 10일'", wm.some((m) => m.body.startsWith('🏁 행사가 끝났어요')) && !!pd && /정산 예정일: \d{1,2}\/10\(.\)/.test(pd.body), pd?.body)
  ok("끝난 뒤: '정산하러 가기'", (await phase()) === 'done' && (await acts.getByRole('link', { name: '정산하러 가기' }).count()) === 1)

  // ── 5. 정산 탭: 정산 예정일 알리기 ──
  const pay = a.locator('[data-payday]')
  await pay.waitFor({ timeout: 10000 }).catch(() => {})
  const def = await pay.locator('input[name=payday]').inputValue().catch(() => '')
  ok('정산 예정일 칸: 지급일(익월 10일)로 날짜를 골라 둠', /^\d{4}-\d{2}-10$/.test(def), def)
  await pay.locator('input[name=payday]').fill(`${today.slice(0, 8)}28`)
  await pay.locator('input[name=memo]').fill('오후 중 순서대로 입금돼요')
  await pay.getByRole('button', { name: /명에게 알리기/ }).click()
  await a.getByText(/명에게 정산 예정일\(.*\)을 알렸어요/).first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("알리면 '1명에게 정산 예정일(…28(…))을 알렸어요'", (await a.getByText(/1명에게 정산 예정일\(\d{1,2}\/28\(.\)\)을 알렸어요/).count()) >= 1)
  ok('마지막으로 알린 날짜가 보임', /\d{1,2}\/28\(.\)/.test(await a.locator('[data-payday-last]').innerText().catch(() => '')))
  ok('360px: 옆으로 안 밀림 (정산 탭)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 6. 근무자 지난 근무: 알린 정산 예정일 ──
  const w = await pg(W)
  await w.goto(`${D}/me/history`)
  const line = w.locator(`[data-history-job="${J}"] [data-payday-line]`)
  await line.waitFor({ timeout: 10000 }).catch(() => {})
  ok("근무자 지난 근무: '💰 정산 예정 …28(…)' (담당자가 알린 날짜)", /💰 정산 예정 \d{1,2}\/28\(.\)/.test(await line.innerText().catch(() => '')))

  // ── 7. 행사 전 · 임시 저장 ──
  await patchJob({ start_date: tomorrow, end_date: tomorrow, status: 'open' })
  await openJob()
  ok("행사 전: '지원자 확인 · 대기 1명' + '모집 마감하기'", (await phase()) === 'before' && (await acts.innerText()).includes('지원자 확인 · 대기 1명') && (await acts.getByRole('button', { name: '모집 마감하기' }).count()) === 1)
  await patchJob({ status: 'draft' })
  await openJob()
  ok("임시 저장: '공개하기'", (await phase()) === 'draft' && (await acts.getByRole('button', { name: '공개하기' }).count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
