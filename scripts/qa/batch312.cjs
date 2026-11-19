// 묶음 312 (정기 개선 2026-11-19 10:35 KST)
// · 현장 QR 긴급 투입 화면: 어느 회사에 합류하는지 '🏢 회사 이름' (여러 회사가 함께 쓰는 앱 · 로그인 전에도)
//   이 회사와 처음이면 합류 칸에 '회사 · 처음 일하는 회사예요 / 합류하면 이 회사 담당자가 내 정보를 봐요' (이미 일한 회사면 없음)
// · 긴급 투입 화면을 여는 동안 같은 모양의 불러오기 화면 (현장 데이터가 느려도 빈 화면이 오래 보이지 않게)
// node scripts/qa/batch312.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const N = '33333333-0000-4000-8000-0000000312a1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const code = createHmac('sha256', SECRET).update(`join|${J}|${kday()}`).digest('base64url').slice(0, 12)

;(async () => {
  // 이 회사와 처음인 근무자 (지원·근무 기록 없음)
  const [u] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: N, name: '처음근무자', phone: '01031203120', created_at: '2026-10-20T00:00:00Z' })
  const [co] = await rest(`companies?id=eq.99999999-0000-4000-8000-000000000099`)
  const coName = co.company_name

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const url = `${D}/join/${J}?c=${encodeURIComponent(code)}`

  // ── 1. 로그인 전: 회사 이름이 보임 (처음 안내는 로그인 뒤에)
  const g = await mk(null)
  await g.goto(url, { waitUntil: 'networkidle' })
  ok(`로그인 전에도 '🏢 ${coName}'`, one(await g.locator('[data-join-company]').textContent().catch(() => '')) === `🏢 ${coName}`)
  ok('로그인 전: 가입·로그인 버튼 그대로 · 처음 안내는 없음', (await g.getByRole('link', { name: '1분 가입' }).count()) === 1 && (await g.locator('[data-join-first]').count()) === 0)

  // ── 2. 이 회사와 처음인 근무자: 합류 칸에 처음 안내
  const n = await mk(N)
  await n.goto(url, { waitUntil: 'networkidle' })
  const first = one(await n.locator('[data-join-first]').textContent().catch(() => ''))
  ok(`처음인 회사: '${coName} · 처음 일하는 회사예요 · 합류하면 이 회사 담당자가 내 정보를 봐요'`, first.includes(`${coName} · 처음 일하는 회사예요`) && first.includes('합류하면 이 회사 담당자가 내 정보를 봐요'), first)
  ok("'바로 합류하기' 버튼 그대로", (await n.getByRole('button', { name: '바로 합류하기' }).count()) === 1)
  ok('360px 옆으로 안 밀림 (긴급 투입)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/join-first-company.png` })

  // ── 3. 이미 이 회사에 지원한 근무자: 처음 안내 없음 (회사 이름은 보임)
  const k = await mk(K)
  await k.goto(url, { waitUntil: 'networkidle' })
  ok('이미 이 회사에 지원한 근무자: 처음 안내 없음 · 회사 이름은 그대로', (await k.locator('[data-join-first]').count()) === 0 && (await k.locator('[data-join-company]').count()) === 1)
  // 이미 확정된 근무자: 출근 안내 그대로
  const w = await mk(W)
  await w.goto(url, { waitUntil: 'networkidle' })
  ok("이미 확정된 근무자: '이미 근무가 확정됐어요' 그대로 · 처음 안내 없음", (await w.getByText('이미 근무가 확정됐어요').count()) === 1 && (await w.locator('[data-join-first]').count()) === 0)

  // ── 4. 여는 동안 같은 모양 (응답만 늦춤)
  const s = await mk(N)
  await s.goto(`${D}/me`, { waitUntil: 'networkidle' })
  // 링크처럼 먼저 불러오기 모양까지 받아 둔 뒤(prefetch) → 화면 내용 응답만 늦춤 (느린 현장 데이터처럼)
  await s.evaluate((u) => window.next?.router?.prefetch(u), `/join/${J}?c=${encodeURIComponent(code)}`)
  await s.waitForLoadState('networkidle').catch(() => {})
  await s.waitForTimeout(800)
  await s.route('**/join/**', async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {})
  })
  await s.evaluate((u) => window.next?.router?.push(u), `/join/${J}?c=${encodeURIComponent(code)}`)
  const sk = s.locator('[data-skeleton="join"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('여는 동안 긴급 투입 모양 (공고 카드 + 합류 카드)', shown && (await sk.locator('.card').count()) === 2, `shown=${shown}`)
  if (SHOTS && shown) await s.screenshot({ path: `${SHOTS}/join-skeleton.png` })
  await s.locator('[data-join-company]').waitFor({ timeout: 15000 }).catch(() => {})
  await s.unroute('**/join/**')
  ok('다 열리면 실제 화면 (불러오기 모양은 사라짐)', (await s.locator('[data-join-company]').count()) === 1 && (await sk.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
