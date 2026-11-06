// 묶음 92: 기타소득 8.8% (12만 5천원 이하 공제 없음) + 지난 정산도 출근·퇴근 시각을 고쳐 바로 반영
// · 공고 수정의 세금 메뉴에 '기타소득 8.8%' · 정산: 한 사람·한 공고 지급액 12만 5천원 이하면 소득세 0, 넘으면 지급액의 8% + 지방세 0.8%
// · 임금명세서 대신 '기타소득 지급명세서' · 신고자료에 '기타소득 지급명세 CSV'
// · 정산 탭 이름 아래 '✏️ 시간 수정'(여러 날이면 날짜별) → 그날 기록 수정 칸이 열린 채로 → 저장하면 정산 탭으로 돌아와 금액이 바뀜
// node scripts/qa/batch92.cjs <default 앱> <default 가짜>
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
const num = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0

;(async () => {
  // 준비: 사흘짜리 행사(그제~오늘) · 그제 하루 09:00~18:00 끝난 근무
  const d2 = kst(-2 * 86_400_000), d1 = kst(-86_400_000)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d2, end_date: kst(), start_time: '09:00:00', end_time: '18:00:00', tax_type: 'other' })
  const [wAtt] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  const day = (d) => ({ ...wAtt, id: undefined, work_date: d, clock_in: new Date(`${d}T09:00:00+09:00`).toISOString(), clock_out: new Date(`${d}T18:00:00+09:00`).toISOString(), note: null, paid: false })
  await rest('attendance', 'POST', day(d2))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wRow = async () => {
    await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
    const row = a.locator('[data-pay-table] tbody tr', { hasText: '근무자' }).first()
    await row.waitFor({ timeout: 10000 }).catch(() => {})
    const cells = await row.locator('td').allInnerTexts().catch(() => [])
    return { row, gross: num(cells[3]), tax: num(cells[4]), local: num(cells[5]) }
  }

  // ── 1. 기타소득: 12만 5천원 이하 → 공제 없음 ──
  const r1 = await wRow()
  ok(`기타소득 · 지급액 ${r1.gross.toLocaleString()}원 (12만 5천원 이하) → 소득세·지방세 0`, r1.gross > 0 && r1.gross <= 125000 && r1.tax === 0 && r1.local === 0, JSON.stringify(r1))

  // ── 2. 근무 하루 더 → 12만 5천원 넘음 → 8% + 0.8% ──
  await rest('attendance', 'POST', day(d1))
  const r2 = await wRow()
  const want = Math.floor((r2.gross * 0.08) / 10) * 10
  ok(`지급액 ${r2.gross.toLocaleString()}원 → 소득세 ${want.toLocaleString()}원(8%) · 지방세 ${(Math.floor(want / 100) * 10).toLocaleString()}원`, r2.gross > 125000 && r2.tax === want && r2.local === Math.floor(want / 100) * 10, JSON.stringify(r2))

  // ── 3. 명세서·공고 메뉴·신고자료 ──
  await a.goto(`${D}/print/payslip/${J}/${W}`)
  ok("명세서 제목 '기타소득 지급명세서' + 기타소득세 줄", (await a.locator('h1').first().innerText().catch(() => '')).includes('기타소득 지급명세서') && (await a.getByText('기타소득세').count()) >= 1)
  await a.goto(`${D}/admin/jobs/${J}/edit`)
  const radio = a.locator('label', { hasText: '기타소득 8.8%' })
  await radio.first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("공고 수정 세금 메뉴에 '기타소득 8.8%' (선택돼 있음)", (await radio.count()) >= 1 && (await radio.locator('input').isChecked()))
  const fold = a.locator('[data-other-income-note]')
  if (!(await fold.isVisible().catch(() => false))) await a.getByText('세금 · 보험 공제').first().click().catch(() => {})
  await fold.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("안내 '12만 5천원 이하면 세금이 없어요'", (await fold.innerText().catch(() => '')).includes('12만 5천원 이하'))
  await a.goto(`${D}/admin/reports?month=${kst().slice(0, 7)}`)
  ok("신고자료에 '기타소득 지급명세 CSV'", (await a.locator('[data-export-other]').getAttribute('href').catch(() => '')).startsWith('/admin/export/other-income?month='))

  // ── 4. 지난 정산 고치기: 정산 탭 → 그날 기록 수정 → 저장 → 정산 탭 ──
  const { row } = await wRow()
  const links = row.locator('[data-pay-edit] a')
  ok("정산 탭 이름 아래 날짜별 '✏️ 날짜' 수정 링크 (여러 날)", (await links.count()) >= 2)
  await links.first().click()
  await a.waitForURL(/tab=att.*fix=/, { timeout: 10000 }).catch(() => {})
  const form = a.locator('form[data-att-edit=open]')
  await form.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  ok('그날 기록 수정 칸이 열린 채로', await form.isVisible().catch(() => false))
  await form.locator('input[name=adj_out]').fill(`${d2}T15:00`)
  await form.getByRole('button', { name: /저장/ }).click()
  await a.waitForURL(/tab=pay/, { timeout: 15000 }).catch(() => {})
  await a.getByText('근무 기록을 고쳤어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("저장하면 정산 탭으로 '근무 기록을 고쳤어요. 정산 금액에 바로 반영했어요.'", /tab=pay/.test(a.url()) && (await a.getByText('정산 금액에 바로 반영했어요').count()) >= 1)
  const r3 = await wRow()
  ok(`퇴근을 15:00으로 고치면 지급액이 줄어듦 (${r2.gross.toLocaleString()} → ${r3.gross.toLocaleString()})`, r3.gross < r2.gross)
  ok('360px: 정산 탭 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
