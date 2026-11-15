// 묶음 270 (정기 개선 2026-11-16 06:35 KST)
// · 공고 '서류' 탭: 계약서에 들어갈 회사 정보(사업자번호·주소·직인·문의 연락처)가 비어 있으면 맨 위에
//   '계약서에 회사 주소 · 직인 빈칸 / 서명 전에 채우면 계약서에 들어가요 · 채우기 ›' (서명된 서류는 그때 정보 그대로라 서명 전에 채우게)
//   → 누르면 회사 설정의 첫 빈 칸으로 · 저장하면 '공고 서류로 돌아가기 →' (그 공고 서류 탭으로)
//   셋 이상 비면 '계약서에 회사 정보 n곳이 빈칸' + 아래에 이름들 · 서명이 다 끝났거나 다 채운 회사면 안 보임
// · 근무자 후기 화면: '공고 이름 · 🏢' 다음 줄에 회사 이름만 넘어가던 것 → 회사(첫 글자 표시) 한 줄 + 공고 이름 한 줄
// node scripts/qa/batch270.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const oneLine = (loc) => loc.evaluate((el) => { const c = getComputedStyle(el); const r = document.createRange(); r.selectNodeContents(el); return Math.round(el.getBoundingClientRect().height / parseFloat(c.lineHeight)) === 1 && r.getBoundingClientRect().width <= el.clientWidth + 1 }).catch(() => false)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  // 회사 주소·직인을 비움 (서류 하나는 서명 전)
  await rest(`companies?id=eq.${C1}`, 'PATCH', { company_address: null, seal_image: null })
  const docs = (await rest(`signed_docs?job_id=eq.${J}`)) ?? []
  if (!docs.some((d) => d.status === 'pending')) await rest(`signed_docs?id=eq.${docs[0].id}`, 'PATCH', { status: 'pending', signed_at: null })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const as = async (u) => { await ctx.clearCookies(); await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }]) }
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 서류 탭: 빈칸 두 곳
  await as(A)
  await p.goto(`${D}/admin/jobs/${J}?tab=docs`, { waitUntil: 'networkidle' })
  const row = p.locator('[data-docs-missing]')
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'계약서에 회사 주소 · 직인 빈칸'", one(await row.locator('[data-docs-missing-head]').textContent().catch(() => '')) === '계약서에 회사 주소 · 직인 빈칸' && (await row.getAttribute('data-docs-missing')) === 'company_address seal')
  ok("아래 '서명 전에 채우면 계약서에 들어가요' · 오른쪽 '채우기 ›'", one(await row.locator('[data-docs-missing-sub]').textContent().catch(() => '')) === '서명 전에 채우면 계약서에 들어가요' && one(await row.textContent().catch(() => '')).endsWith('채우기 ›'))
  ok('누르면 회사 설정의 첫 빈 칸(회사 주소)', (await row.getAttribute('href')) === `/admin/settings?job=${J}#company_address`)
  ok('두 줄 모두 한 줄씩 · 360px 옆으로 안 밀림', (await oneLine(row.locator('[data-docs-missing-head]'))) && (await oneLine(row.locator('[data-docs-missing-sub]'))) && (await noSide(p)))
  if (SHOTS) {
    await row.scrollIntoViewIfNeeded().catch(() => {})
    await p.waitForTimeout(400)
    await row.screenshot({ path: `${SHOTS}/docs-missing.png` }).catch(() => {})
  }

  // ── 2. 채우기 → 설정의 회사 주소 칸 (커서) → 저장하면 '공고 서류로 돌아가기 →'
  await row.click()
  await p.waitForURL((u) => u.pathname === '/admin/settings', { timeout: 15000 }).catch(() => {})
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(900)
  ok('설정 화면 회사 주소 칸에 커서', await p.evaluate(() => document.activeElement?.getAttribute('name') === 'company_address'))
  await p.fill('input[name="company_address"]', '서울 중구 세종대로 110')
  await p.locator('form#settings-form button[type="submit"]', { hasText: '설정 저장' }).last().click()
  const back = p.locator('[data-settings-back]')
  await back.waitFor({ timeout: 15000 }).catch(() => {})
  const card = p.locator('[data-settings-next]')
  ok("저장 뒤 '저장했어요 · 남은 1가지도 채우면 좋아요' + '공고 서류로 돌아가기 →'", one(await card.locator('p b').textContent().catch(() => '')) === '저장했어요' && one(await card.locator('p > span').first().textContent().catch(() => '')) === '남은 1가지도 채우면 좋아요', one(await card.textContent().catch(() => '')))
  ok('버튼은 그 공고 서류 탭으로', one(await back.textContent().catch(() => '')) === '공고 서류로 돌아가기 →' && (await back.getAttribute('href')) === `/admin/jobs/${J}?tab=docs`)
  if (SHOTS) {
    await p.waitForTimeout(600)
    await card.screenshot({ path: `${SHOTS}/settings-back.png` }).catch(() => {})
  }
  await back.click()
  await p.waitForURL((u) => u.pathname === `/admin/jobs/${J}`, { timeout: 15000 }).catch(() => {})
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("돌아오면 남은 '계약서에 직인 빈칸'만", one(await row.locator('[data-docs-missing-head]').textContent().catch(() => '')) === '계약서에 직인 빈칸' && (await row.getAttribute('href')) === `/admin/settings?job=${J}#seal`)

  // ── 3. 셋 이상 비면 'n곳' + 이름들 · 다 채우면 안 보임 · 그냥 들어간 설정엔 돌아가기 없음
  await rest(`companies?id=eq.${C1}`, 'PATCH', { business_no: null, company_address: null, contact_phone: null })
  await p.reload({ waitUntil: 'networkidle' })
  ok("'계약서에 회사 정보 4곳이 빈칸' + '사업자등록번호 · 회사 주소 · 직인 · 문의 연락처'", one(await row.locator('[data-docs-missing-head]').textContent().catch(() => '')) === '계약서에 회사 정보 4곳이 빈칸' && one(await row.locator('[data-docs-missing-sub]').textContent().catch(() => '')) === '사업자등록번호 · 회사 주소 · 직인 · 문의 연락처' && (await noSide(p)))
  await rest(`companies?id=eq.${C1}`, 'PATCH', { business_no: c1.business_no, company_address: c1.company_address, contact_phone: c1.contact_phone, seal_image: c1.seal_image })
  await p.reload({ waitUntil: 'networkidle' })
  ok('다 채운 회사면 안 보임', (await p.locator('[data-signed-bar]').count()) === 1 && (await row.count()) === 0)
  // 서명이 다 끝났으면 (빈칸이 있어도) 안 보임 — 서명된 서류는 그때 정보 그대로
  await rest(`companies?id=eq.${C1}`, 'PATCH', { seal_image: null })
  for (const d of docs) if (d.status !== 'void') await rest(`signed_docs?id=eq.${d.id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await p.reload({ waitUntil: 'networkidle' })
  ok('서명이 다 끝났으면 안 보임', (await p.locator('[data-signed-bar]').count()) === 1 && (await row.count()) === 0)
  await rest(`companies?id=eq.${C1}`, 'PATCH', { seal_image: c1.seal_image })
  await p.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await p.fill('input[name="company_address"]', '서울 중구')
  await p.locator('form#settings-form button[type="submit"]', { hasText: '설정 저장' }).last().click()
  await p.waitForTimeout(2000)
  ok("그냥 들어간 설정엔 '돌아가기' 없음 (저장했습니다 그대로)", (await p.locator('[data-settings-back]').count()) === 0 && (await p.locator('[data-settings-next]').count()) === 0)

  // ── 4. 근무자 후기 화면: 회사 한 줄 + 공고 이름 한 줄
  await as(W)
  await p.goto(`${D}/me/review/${J}`, { waitUntil: 'networkidle' })
  const co = p.locator('[data-review-company]')
  await co.waitFor({ timeout: 15000 }).catch(() => {})
  ok("회사 줄: '테' 표시(주식회사 뺀 첫 글자) + '주식회사 테스트' (한 줄)", one(await co.locator('[data-company-mark]').textContent().catch(() => '')) === '테' && one(await co.textContent().catch(() => '')) === '테주식회사 테스트' && (await co.evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 99)) <= 24, one(await co.textContent().catch(() => '')))
  const jobLine = p.locator('[data-review-job]')
  ok("공고 이름 줄에 '🏢'·'·' 없이 이름만", one(await jobLine.textContent().catch(() => '')) === '경상남도 생활체육대축전 행사장 안내 스태프' && (await noSide(p)), one(await jobLine.textContent().catch(() => '')))
  if (SHOTS) await p.locator('h1').locator('xpath=..').screenshot({ path: `${SHOTS}/review-head.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
