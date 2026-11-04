// 묶음 47: 새 회사 대시보드 — 공고가 없으면 '진행 중인 공고가 없어요' + 새 공고 등록 · '시작하기' 공고 모음 링크 칸에 'QR'(인쇄용)
//          · 처음 모집하는 회사(지원자가 한 번도 없음)의 '인원이 모자라요'는 '예전 근무자에게 알리기' 대신 '공고 링크·QR로 알리기'
//          · 지원자가 있었던 회사는 그대로 · 360px
// node scripts/qa/batch47.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', J2 = 'cccccccc-0000-4000-8000-0000000000c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null, business_no: null, company_address: null, contact_phone: null, created_at: '2026-10-15T00:00:00Z' })
  const [admin1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...admin1, id: A2, name: '이회사관리', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const dash = async (p) => { await p.goto(`${D}/admin`); await p.locator('main').waitFor({ timeout: 10000 }).catch(() => {}); await p.waitForLoadState('networkidle').catch(() => {}) }

  // ── 1. 공고가 하나도 없는 새 회사 ──
  const n = await pg(A2)
  await dash(n)
  const empty = n.locator('[data-dash-jobs-empty]')
  ok("진행·예정 공고: '진행 중인 공고가 없어요' + 새 공고 등록", (await empty.innerText().catch(() => '')).includes('진행 중인 공고가 없어요') && (await empty.locator('a[href="/admin/jobs/new"]').count()) === 1)
  ok('360px: 옆으로 안 밀림 (새 회사)', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 첫 공고를 올린 새 회사 (오늘 시작 · 지원자 없음) ──
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: '새내기행사' }, title: '새내기 행사 안내 스태프', applications: [], required_docs: [] })
  await dash(n)
  ok('공고가 생기면 빈 화면 안내 없음', (await n.locator('[data-dash-jobs-empty]').count()) === 0)
  const qr = n.locator('[data-start-share] [data-start-qr]')
  ok("시작하기 '공고 모음 링크' 칸에 'QR' → 인쇄용 QR 화면", (await qr.getAttribute('href').catch(() => '')) === '/admin/jobs/poster')
  const shortShare = n.locator('[data-short-share]')
  ok("인원이 모자라요: '공고 링크·QR로 알리기' (알릴 예전 근무자가 없어서)", (await shortShare.innerText().catch(() => '')).includes('공고 링크·QR로 알리기') && (await shortShare.getAttribute('href')) === '/admin/jobs/poster' && !(await n.locator('main').innerText()).includes('예전 근무자에게 알리기'))
  ok("설명도 '아직 지원자가 없어요 · 링크·QR' (예전 근무자 이야기 없음)", (await n.locator('main').innerText()).includes('아직 지원자가 없어요. 공고 모음 링크를 단톡방에 올리거나 QR을 붙여'))
  ok('360px: 옆으로 안 밀림 (첫 공고)', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await shortShare.click()
  await n.waitForURL(/\/admin\/jobs\/poster/, { timeout: 10000 }).catch(() => {})
  ok('누르면 우리 회사 모집 QR', (await n.locator('[data-poster]').innerText().catch(() => '')).includes('새내기행사 모집 공고'))

  // ── 3. 지원자가 있었던 회사는 그대로 ──
  const a = await pg(A)
  await dash(a)
  const t = await a.locator('main').innerText()
  ok("지원자가 있었던 회사: '공고 링크·QR로 알리기' 없음 (대기 확정·예전 근무자 알리기 그대로)", (await a.locator('[data-short-share]').count()) === 0 && (t.includes('확정하러 가기') || t.includes('예전 근무자에게 알리기') || !t.includes('명 부족')))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
