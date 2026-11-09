// 묶음 162 (사용자 요청 2026-11-09 "회사 전체를 볼 수 있는 운영센터는 아예 다른 페이지를 원해 / 최상위 관리자 송순민에게만 볼 수 있는 권한")
// · 운영센터 = 관리자 화면 밖 따로 (/ops): 회사 고르기·관리자 메뉴·아래 탭 없음 · 어두운 머리줄 '운영센터' · '관리자 화면'으로 돌아가기
// · 볼 수 있는 사람은 주인 한 사람 (실제: lib/owner의 송순민 · 시험: OPS_OWNER_IDS=가짜 관리자)
//   다른 최고 관리자·근무자는 없는 화면(404) · 메뉴에도 안 보임 · 로그인 전이면 로그인으로
// · 예전 주소 /admin/ops → /ops
// node scripts/qa/batch162.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C = '99999999-0000-4000-8000-000000000099'
const S2 = 'aaaaaaaa-0000-4000-8000-0000000162a2' // 다른 최고 관리자
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 다른 최고 관리자 한 명 (같은 회사 대표)
  const [a0] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a0, id: S2, name: '다른최고', phone: '01016216200', is_super: true, role: 'admin' })
  await rest('company_members', 'POST', { company_id: C, user_id: S2, role: 'owner', created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const path = (p) => new URL(p.url()).pathname

  // ── 1. 주인: 따로 된 운영센터
  const o = await pg(A)
  await o.goto(`${D}/admin/ops`)
  await o.waitForURL((u) => new URL(u).pathname === '/ops', { timeout: 10000 }).catch(() => {})
  ok('예전 주소 /admin/ops → /ops', path(o) === '/ops', o.url())
  await o.locator('[data-ops]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('운영센터 내용이 보임', (await o.locator('[data-ops]').count()) > 0)
  const head = o.locator('[data-ops-header]')
  ok("머리줄 '운영센터' (어두운 바탕) · 관리자 메뉴·아래 탭·회사 고르기 없음",
    (await head.innerText().catch(() => '')).includes('운영센터') &&
    (await head.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')) !== 'rgba(0, 0, 0, 0)' &&
    (await o.locator('[data-admin-tabbar]').count()) === 0 && (await o.locator('nav[aria-label="관리자 메뉴"]').count()) === 0)
  ok("'관리자 화면'으로 돌아가는 링크", (await o.locator('[data-ops-to-admin]').getAttribute('href')) === '/admin')
  ok('360px 옆으로 안 밀림 · 머리줄 한 줄', (await o.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)) && (await head.evaluate((el) => el.getBoundingClientRect().height <= 60)))
  if (SHOTS) await o.screenshot({ path: `${SHOTS}/ops-page.png` }).catch(() => {})
  // 관리자 화면 더보기: 주인에게만 '운영센터 ↗'
  await o.goto(`${D}/admin`)
  await o.locator('[data-admin-tabbar] button').last().click()
  await o.locator('[data-admin-more]').waitFor({ timeout: 5000 }).catch(() => {})
  ok("주인 더보기에 '운영센터 ↗' → /ops", (await o.locator('[data-admin-more] a[href="/ops"]').count()) === 1)

  // ── 2. 다른 최고 관리자: 없는 화면 · 메뉴에도 없음
  const s2 = await pg(S2)
  const r1 = await s2.goto(`${D}/ops`)
  ok('다른 최고 관리자 /ops → 404 (운영센터 내용 없음)', r1?.status() === 404 && (await s2.locator('[data-ops]').count()) === 0, String(r1?.status()))
  await s2.goto(`${D}/admin/ops`)
  await s2.waitForLoadState('networkidle').catch(() => {})
  ok('다른 최고 관리자 /admin/ops → 역시 못 봄', (await s2.locator('[data-ops]').count()) === 0)
  await s2.goto(`${D}/admin`)
  await s2.locator('[data-admin-tabbar] button').last().click()
  await s2.locator('[data-admin-more]').waitFor({ timeout: 5000 }).catch(() => {})
  ok("다른 최고 관리자 더보기: '운영센터' 없음 (회사 관리 등은 그대로)", (await s2.locator('[data-admin-more] a[href="/ops"]').count()) === 0 && (await s2.locator('[data-admin-more] a[href="/admin/companies"]').count()) === 1)

  // ── 3. 근무자 · 로그인 전
  const w = await pg(W)
  const r2 = await w.goto(`${D}/ops`)
  ok('근무자 /ops → 404', r2?.status() === 404 && (await w.locator('[data-ops]').count()) === 0, String(r2?.status()))
  const g = await pg(null)
  await g.goto(`${D}/ops`)
  await g.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {})
  ok('로그인 전 /ops → 로그인 (돌아올 곳 /ops)', path(g) === '/login' && new URL(g.url()).searchParams.get('next') === '/ops', g.url())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
