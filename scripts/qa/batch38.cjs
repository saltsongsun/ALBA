// 묶음 38: 새 공고 화면 — 이 회사 계약서·명세서에 들어갈 정보(사업자번호·주소·직인·연락처)가 비어 있으면 미리 알려 주고
//          '회사 설정에서 채우기 →'로 첫 빈 칸에 바로 (대시보드 '회사 정보 채우기'도 같은 기준) · 다 채우면 안내 없음
//          서명할 서류: 읽는 만큼 머리글 아래 얇은 막대가 채워짐 (근무자만 · 서명 전만) · 360px
// node scripts/qa/batch38.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099'
const DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 계약서에 들어갈 회사 정보가 비어 있으면: 새 공고 화면에서 미리 알림 ──
  const [co] = await rest(`companies?id=eq.${C1}`)
  await rest(`companies?id=eq.${C1}`, 'PATCH', { business_no: null, seal_image: null })
  const ad = await pg(A)
  await ad.goto(`${D}/admin/jobs/new`)
  const note = ad.locator('[data-setup-missing]')
  await note.waitFor({ timeout: 10000 }).catch(() => {})
  const txt = (await note.innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("새 공고: '계약서에 들어갈 회사 정보가 비어 있어요' + 빈 것 (사업자등록번호 · 직인)", txt.includes('계약서에 들어갈 회사 정보가 비어 있어요') && txt.includes('사업자등록번호 · 직인') && !txt.includes('회사 주소'), txt)
  ok('공고는 그대로 올릴 수 있음 (막지 않음)', (await ad.locator('form button[type=submit]').count()) > 0)
  ok('360px: 옆으로 안 밀림 (새 공고)', await wide(ad))
  const link = note.getByRole('link', { name: /회사 설정에서 채우기/ })
  ok("'회사 설정에서 채우기 →'는 첫 빈 칸(사업자등록번호)으로", (await link.getAttribute('href').catch(() => '')) === '/admin/settings#business_no')
  await link.click()
  await ad.waitForURL(/\/admin\/settings/, { timeout: 10000 }).catch(() => {})
  await ad.waitForFunction(() => document.activeElement?.getAttribute('name') === 'business_no', null, { timeout: 5000 }).catch(() => {})
  ok('회사 설정의 사업자등록번호 칸에 커서', await ad.evaluate(() => document.activeElement?.getAttribute('name') === 'business_no'))

  // 대시보드 '시작하기'의 '회사 정보 채우기'도 같은 기준 (첫 빈 칸)
  await ad.goto(`${D}/admin`)
  await ad.waitForLoadState('networkidle').catch(() => {})
  ok("대시보드 '회사 정보 채우기' → 첫 빈 칸", (await ad.locator('a[href="/admin/settings#business_no"]').count()) > 0)

  // 사업자번호만 채우면 → 남은 것: 직인
  await rest(`companies?id=eq.${C1}`, 'PATCH', { business_no: co.business_no || '123-45-67890' })
  await ad.goto(`${D}/admin/jobs/new`)
  await note.waitFor({ timeout: 10000 }).catch(() => {})
  const txt2 = (await note.innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok('남은 것만: 직인 · 링크는 직인 칸으로', txt2.includes('비어 있는 것: 직인') && (await note.getByRole('link').getAttribute('href').catch(() => '')) === '/admin/settings#seal', txt2)

  // 다 채우면 안내 없음
  await rest(`companies?id=eq.${C1}`, 'PATCH', { business_no: co.business_no || '123-45-67890', seal_image: co.seal_image || 'data:image/png;base64,iVBORw0KGgo=' })
  await ad.goto(`${D}/admin/jobs/new`)
  await ad.locator('form').first().waitFor({ timeout: 10000 }).catch(() => {})
  await ad.waitForLoadState('networkidle').catch(() => {})
  ok('다 채우면 새 공고 화면에 안내 없음', (await note.count()) === 0)

  // ── 2. 서명할 서류: 읽는 만큼 막대가 채워짐 ──
  const w = await pg(W)
  await w.goto(`${D}/docs/${DOC}`)
  await w.locator('#sign').waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForLoadState('networkidle').catch(() => {})
  const bar = w.locator('[data-read-progress]')
  ok('서명 전 서류: 읽기 막대 있음 (화면 전환 칸 밖, body 바로 아래)', (await bar.count()) === 1 && (await bar.evaluate((el) => el.parentElement === document.body && !el.closest('.page-in'))))
  const scale = () => bar.evaluate((el) => { const m = getComputedStyle(el).transform; return m === 'none' ? 1 : new DOMMatrix(m).a })
  const top = await bar.evaluate((el) => Math.round(el.getBoundingClientRect().top))
  ok('막대는 머리글 바로 아래 (56px)', top === 56, String(top))
  const s0 = await scale()
  ok('맨 위에선 거의 비어 있음', s0 < 0.05, String(s0))
  await w.evaluate(() => window.scrollTo(0, (document.scrollingElement.scrollHeight - innerHeight) / 2))
  await w.waitForTimeout(300)
  const s1 = await scale()
  ok('반쯤 내리면 반쯤 채워짐', s1 > 0.35 && s1 < 0.65, String(s1))
  await w.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight))
  await w.waitForTimeout(300)
  const s2 = await scale()
  ok('끝까지 내리면 가득', s2 > 0.95, String(s2))
  ok('360px: 옆으로 안 밀림 (서류)', await wide(w))

  // 관리자가 볼 때·서명한 뒤에는 없음
  await ad.goto(`${D}/docs/${DOC}`)
  await ad.waitForLoadState('networkidle').catch(() => {})
  ok('관리자 화면엔 막대 없음', (await ad.locator('[data-read-progress]').count()) === 0)
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await w.goto(`${D}/docs/${DOC}`)
  await w.waitForLoadState('networkidle').catch(() => {})
  ok('서명한 서류엔 막대 없음', (await w.locator('[data-read-progress]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
