// 묶음 96: 정기 개선 — 공고 삭제 실수 막기 · 지각/조기 시간 읽기 쉽게
// · 아직 안 끝난 행사에 확정된 근무자가 있으면 '삭제'를 막고 '행사가 취소됐나요?'(근무자에게 알림)로 안내
// · 이미 지난 행사(근무 기록 없음)는 확정자가 있어도 삭제됨
// · 출퇴근 탭 '조기 75분' → '조기 1시간 15분'
// node scripts/qa/batch96.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
const J2 = 'cccccccc-0000-4000-8000-0000000000d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms = 0) => new Date(Date.now() + 9 * 3600e3 + ms).toISOString().slice(0, 10)
const today = kst(), past = kst(-3 * 86_400_000)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const del = async (id) => {
    await a.goto(`${D}/admin/jobs/${id}`)
    await a.locator('[data-more-toggle]').click()
    const btn = a.locator('[data-more-panel]').getByRole('button', { name: '삭제' })
    await btn.click()
    await a.locator('[data-more-panel]').getByRole('button', { name: '정말 삭제?' }).click()
    await a.waitForLoadState('networkidle').catch(() => {})
    await a.waitForTimeout(800)
  }

  // ── 1. 오늘 행사 · 확정 1명(근무 기록 없음) → 삭제 막힘 ──
  await fetch(`${MD}/rest/v1/attendance?job_id=eq.${J}`, { method: 'DELETE' })
  await fetch(`${MD}/rest/v1/signed_docs?job_id=eq.${J}`, { method: 'DELETE' })
  await del(J)
  const msg = "확정된 근무자 1명이 있어 삭제하지 않았어요"
  ok(`아직 안 끝난 행사 + 확정자 → '${msg} … 행사가 취소됐나요?' 안내`, (await a.getByText(msg).count()) >= 1 && (await a.getByText(/행사가 취소됐나요\?'로 취소하면 근무자에게 알려져요/).count()) >= 1)
  ok('공고는 그대로 남음', (await rest(`jobs?id=eq.${J}`)).length === 1)

  // ── 2. 이미 지난 행사는 확정자가 있어도 삭제 ──
  const [job] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...job, id: J2, title: '지난 행사 삭제 테스트', start_date: past, end_date: past, status: 'closed' })
  const [ap] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...ap, id: undefined, job_id: J2, user_id: AP, status: 'approved', job: { ...job, id: J2, start_date: past, end_date: past } })
  await del(J2)
  ok("지난 행사(근무 기록 없음)는 삭제 → '공고를 삭제했습니다.'", (await rest(`jobs?id=eq.${J2}`)).length === 0 && (await a.getByText('공고를 삭제했습니다.').count()) >= 1)

  // ── 3. 출퇴근 탭: 조기 75분 → '조기 1시간 15분' ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '09:00:00', end_time: '18:00:00' })
  await rest('attendance', 'POST', { job_id: J, user_id: W, company_id: job.company_id, work_date: today, clock_in: new Date(`${today}T07:45:00+09:00`).toISOString(), clock_out: null, note: null, paid: false })
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  await a.locator('main').waitFor()
  await a.waitForTimeout(600)
  ok("출퇴근 탭: '조기 1시간 15분' (분만 길게 쓰지 않음)", (await a.getByText('조기 1시간 15분').count()) >= 1 && (await a.getByText('조기 75분').count()) === 0)
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
