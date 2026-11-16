// 묶음 272 (정기 개선 2026-11-16 10:35 KST)
// · 여러 회사를 맡은 관리자: 다른 회사 오늘 행사에서 서명 안 한 사람 → 홈 '다른 회사에 확인할 일 · 두번째기획 서명 안 함 1 오늘 행사 1'
//   · 회사 고르기 목록에도 '두번째기획 · 서명 안 함 1 · 오늘 행사 1' (회사를 바꿔 보지 않아도 근무 시작이 막힌 사람을 알게)
//   이미 서명한 사람·종이 계약 공고는 안 셈 · 우리 회사(지금 회사) 일은 '확인할 일'에만
// · 서류 메뉴 '서명 대기'만 볼 때: 'PDF 받기' 카드 대신 없음 · 공고마다 PDF 대신 '서명 요청 ›' (그 공고 서류 탭 서명 안 한 사람 칸으로)
//   서명 전 서류 줄엔 PDF 버튼 없이 '보기'만 · 전체 보기에서는 서명한 서류 PDF 그대로
// node scripts/qa/batch272.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000002720c2'
const J2 = 'cccccccc-0000-4000-8000-0000002720d2', JP = 'cccccccc-0000-4000-8000-0000002720d3', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const today = kst(0), now = new Date().toISOString()
  // 두 번째 회사(같은 관리자) · 오늘 행사 J2(앱 서명) · 근무자 W 서명 전 / 다른 근무자는 서명함 · 종이 계약 공고 JP는 서명 전이어도 안 셈
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: now })
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const day = { start_date: today, end_date: today, status: 'open' }
  await rest('jobs', 'POST', { ...base, ...day, id: J2, company_id: C2, title: '두번째 회사 오늘 행사', contract_method: 'app' })
  await rest('jobs', 'POST', { ...base, ...day, id: JP, company_id: C2, title: '두번째 회사 종이 계약 행사', contract_method: 'paper' })
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [doc] = await rest(`signed_docs?id=eq.${DOC}`)
  const U2 = 'bbbbbbbb-0000-4000-8000-000000027202'
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: U2, name: '서명한사람', phone: '01027200002', created_at: now })
  for (const [i, uid, jid, st] of [[1, W, J2, 'pending'], [2, U2, J2, 'signed'], [3, W, JP, 'pending']]) {
    await rest('applications', 'POST', { ...wa, id: `11111111-0000-4000-8000-0000002720a${i}`, job_id: jid, user_id: uid, company_id: C2, status: 'approved', available_dates: null, job: { ...base, ...day, id: jid, company: { company_name: '두번째기획' } } })
    await rest('signed_docs', 'POST', { ...doc, id: `dddddddd-0000-4000-8000-0000002720b${i}`, job_id: jid, user_id: uid, company_id: C2, status: st, signed_at: st === 'signed' ? now : null })
  }
  // 우리 회사(지금 회사) 근로계약서는 서명 전 그대로 (DOC)
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'pending', signed_at: null })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 홈: 다른 회사 서명 안 함
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const card = p.locator('[data-other-companies]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const ct = one(await card.innerText().catch(() => ''))
  ok("'다른 회사에 확인할 일 · 두번째기획 서명 안 함 1 오늘 행사 2' (서명한 사람·종이 계약 공고는 안 셈)", ct === '다른 회사에 확인할 일 두번째기획 서명 안 함 1 오늘 행사 2', ct)
  ok("'서명 안 함' 숫자는 빨강", (await card.locator('[data-other-unsigned] b.text-rose-600').count()) === 1)
  ok('칩 한 줄 · 360px 옆으로 안 밀림', (await card.locator('button').first().evaluate((el) => el.getBoundingClientRect().height < 40).catch(() => false)) && (await noSide(p)))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/other-unsigned.png` }).catch(() => {})

  // ── 2. 회사 고르기 목록
  const opt = one(await p.locator(`header select[name=company] option[value="${C2}"]`).innerText().catch(() => ''))
  ok("회사 고르기: '두번째기획 · 서명 안 함 1 · 오늘 행사 2'", opt === '두번째기획 · 서명 안 함 1 · 오늘 행사 2', opt)

  // ── 3. 서류 메뉴 '서명 대기'
  await p.goto(`${D}/admin/docs?status=pending`, { waitUntil: 'networkidle' })
  const grp = p.locator(`[data-docs-job="${J}"]`)
  await grp.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'PDF 받기' 카드 없음 (서명 대기만 볼 때)", (await p.locator('[data-docs-bulk]').count()) === 0)
  const nudge = grp.locator('[data-docs-job-nudge]')
  ok("공고 줄 '서명 요청 ›' → 그 공고 서류 탭 서명 안 한 사람 칸", one(await nudge.textContent().catch(() => '')) === '서명 요청 ›' && (await nudge.getAttribute('href')) === `/admin/jobs/${J}?tab=docs#unsigned` && (await grp.locator('[data-docs-job-pdf]').count()) === 0)
  ok("서명 전 줄엔 PDF 없이 '보기'만", (await grp.locator(`[data-doc-row="${DOC}"] [data-doc-pdf]`).count()) === 0 && (await grp.locator(`[data-doc-row="${DOC}"] a`, { hasText: '보기' }).count()) === 1)
  ok('다른 회사 서류는 안 보임 (지금 회사 것만)', (await p.locator('[data-docs-job="' + J2 + '"]').count()) === 0)
  ok('360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) await grp.screenshot({ path: `${SHOTS}/docs-pending-nudge.png` }).catch(() => {})
  await nudge.click()
  await p.waitForURL((u) => u.pathname === `/admin/jobs/${J}` && u.hash === '#unsigned', { timeout: 15000 }).catch(() => {})
  await p.locator('#unsigned').waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 '서명 안 한 1명' 칸", one(await p.locator('#unsigned b').first().textContent().catch(() => '')) === '서명 안 한 1명')

  // ── 4. 전체 보기: 서명한 서류는 PDF 그대로 · 'PDF 받기' 카드도
  await p.goto(`${D}/admin/docs`, { waitUntil: 'networkidle' })
  const signedRow = p.locator('[data-doc-row="dddddddd-0000-4000-8000-000000000005"]')
  await signedRow.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  ok("전체 보기: 'PDF 받기' 카드 · 서명한 서류 줄 PDF 있음 · 서명 전 줄은 없음", (await p.locator('[data-docs-bulk]').count()) === 1 && (await signedRow.locator('[data-doc-pdf]').count()) === 1 && (await p.locator(`[data-doc-row="${DOC}"] [data-doc-pdf]`).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
