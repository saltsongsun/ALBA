// 묶음 46: 우리 회사 모집 QR — 공고 목록 '공고 모음 링크' 옆 'QR' → 인쇄용 화면(회사 이름·QR·링크·QR 인쇄·링크 복사)
//          · QR 링크는 그 회사 공고 모음(/?co=회사) · 모집 중 공고가 없으면 안내 + 새 공고 등록 · 다른 회사 관리자는 자기 회사 QR
//          관리자 공고 화면을 불러오는 동안 공고 화면 모양 회색 자리(admin-job) · 360px
// node scripts/qa/batch46.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  // (만든 시각을 다르게 — 최고 관리자 A의 기본 회사가 첫 회사로 남게: companies.cjs와 같음)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [admin1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...admin1, id: A2, name: '이회사관리', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 공고 목록 → QR ──
  const a = await pg(A)
  await a.goto(`${D}/admin/jobs`)
  const link = a.locator('[data-poster-link]')
  await link.waitFor({ timeout: 10000 }).catch(() => {})
  ok("공고 모음 링크 옆 'QR'", (await link.getAttribute('href').catch(() => '')) === '/admin/jobs/poster')
  ok('360px: 옆으로 안 밀림 (공고 목록)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await link.click()
  await a.waitForURL(/\/admin\/jobs\/poster/, { timeout: 10000 }).catch(() => {})
  const poster = a.locator('[data-poster]')
  await poster.waitFor({ timeout: 10000 }).catch(() => {})
  const pt = (await poster.innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("QR 화면: '주식회사 테스트 모집 공고' + 안내 + 링크", pt.includes('주식회사 테스트 모집 공고') && pt.includes('휴대폰 카메라로 찍으면') && pt.includes(`/?co=${C1}`), pt.slice(0, 160))
  ok('QR 그림 있음 (svg)', (await a.locator('[data-poster-qr] svg').count()) === 1)
  ok("'QR 인쇄'·'링크 복사' 버튼", (await a.getByRole('button', { name: 'QR 인쇄' }).count()) === 1 && (await a.getByRole('button', { name: '링크 복사' }).count()) === 1)
  ok('모집 중 공고가 있으면 없음 안내 안 뜸', (await a.locator('[data-poster-empty]').count()) === 0)
  ok('360px: 옆으로 안 밀림 (QR)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 다른 회사 관리자: 자기 회사 QR (첫 회사 링크·이름 없음) ──
  const a2 = await pg(A2)
  await a2.goto(`${D}/admin/jobs/poster`)
  await a2.locator('[data-poster]').waitFor({ timeout: 10000 }).catch(() => {})
  const t2 = (await a2.locator('[data-poster]').innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok('두 번째 회사: 자기 회사 이름·링크 (첫 회사 것 없음)', t2.includes('두번째컴퍼니 모집 공고') && t2.includes(`/?co=${C2}`) && !t2.includes(C1) && !t2.includes('주식회사 테스트'), t2.slice(0, 160))
  ok("모집 중 공고가 없으면 안내 + '새 공고 등록 →'", (await a2.locator('[data-poster-empty]').count()) === 1 && (await a2.locator('[data-poster-empty] a[href="/admin/jobs/new"]').count()) === 1)

  // ── 3. 관리자 공고 화면 회색 자리 ──
  await fetch(`${MD}/__latency?ms=400`)
  await a.goto(`${D}/admin/jobs`)
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.evaluate(() => { window.__skel = []; new MutationObserver(() => { document.querySelectorAll('[data-skeleton]').forEach((s) => window.__skel.push(s.getAttribute('data-skeleton'))) }).observe(document.body, { subtree: true, childList: true }) })
  await a.locator(`a[href="/admin/jobs/${J}"]`).first().click()
  await a.waitForURL(new RegExp(`/admin/jobs/${J}`), { timeout: 20000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  const sk = await a.evaluate(() => [...new Set(window.__skel)])
  ok('공고 화면으로 갈 때: 공고 화면 모양 회색 자리 (admin-job)', sk.includes('admin-job'), JSON.stringify(sk))
  await fetch(`${MD}/__latency?ms=5`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
