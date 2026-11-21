// 묶음 337 (정기 개선 2026-11-21 13:35 KST · 관리자 근무자 화면 '서명 대기 n건' 칩)
// · 근무자 화면 위 성실도 줄에 우리 회사 서류 중 서명 안 한 것 '서명 대기 n건' (현장에서 '서명했어요?'를 바로) — 없으면 칩 없음
// · 누르면 접힌 '서류' 칸이 펼쳐지며 그리로 내려가고 테두리가 짧게 한 번 (움직임 줄이기면 없음) · 칸 요약과 같은 수
// · 다른 회사 관리자에게는 칩 없음 (그 회사 서류만 셈) · 360px
// node scripts/qa/batch337.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const sign = (p, pre = '') => `${p}.${createHmac('sha256', SECRET).update(pre + p).digest('base64url')}`
const cookie = (u) => sign(Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'))
const roster = (u) => sign(Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'roster:')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011'
const C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-0000003370c2', A2 = 'aaaaaaaa-0000-4000-8000-0000003370a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 확인된 다른 회사(C2)와 그 대표 A2 — W에 대한 서류는 없음
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼삼칠행사', verified: true, created_at: new Date().toISOString() })
  await rest('users', 'POST', { ...a1, id: A2, name: '삼삼칠대표', phone: '01033703371', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 우리 회사 서류 1건 서명 대기인 근무자(W): 칩 '서명 대기 1건' · 칸 요약과 같은 수
  const a = await mk(A)
  await go(a, `/admin/workers/${W}`)
  const chip = a.locator('[data-sign-chip]')
  await chip.waitFor({ timeout: 10000 }).catch(() => {})
  ok("성실도 줄에 '서명 대기 1건'", (await chip.count()) === 1 && one(await chip.innerText()) === '서명 대기 1건', one(await a.locator('[data-worker-rel]').innerText().catch(() => '')))
  const fold = a.locator('#worker-docs')
  ok("서류 칸 요약도 '대기 1건' (같은 수) · 처음엔 접힘", one(await fold.locator('> summary').innerText()).includes('대기 1건') && !(await fold.evaluate((e) => e.open)))
  ok('칩 줄이 옆으로 밀리지 않음 (360px)', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/sign-chip.png` })

  // ── 2. 칩 → 서류 칸이 펼쳐지며 그리로 · 테두리가 짧게 한 번
  await chip.click()
  await a.waitForTimeout(80)
  const anim = await fold.evaluate((e) => getComputedStyle(e).animationName)
  await a.waitForTimeout(400)
  ok('누르면 주소 #worker-docs · 서류 칸이 펼쳐짐', new URL(a.url()).hash === '#worker-docs' && (await fold.evaluate((e) => e.open)))
  ok("펼쳐진 칸에 서명 대기 서류 줄 ('대기')", (await fold.locator('a[href^="/docs/"]', { hasText: '대기' }).count()) === 1)
  ok('칸 테두리가 짧게 한 번 (flash-ring)', anim === 'flash-ring', anim)
  ok('서류 칸이 화면 안에 보임', await fold.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight }))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/sign-chip-open.png` })

  // ── 3. 움직임 줄이기: 펼쳐지기만 하고 테두리 움직임은 없음
  const r = await mk(A, { reducedMotion: 'reduce' })
  await go(r, `/admin/workers/${W}`)
  await r.locator('[data-sign-chip]').click()
  await r.waitForTimeout(80)
  const anim2 = await r.locator('#worker-docs').evaluate((e) => getComputedStyle(e).animationName)
  ok('움직임 줄이기: 펼쳐지고 테두리 움직임 없음', (await r.locator('#worker-docs').evaluate((e) => e.open)) && anim2 === 'none', anim2)

  // ── 4. 서명할 서류가 없는 회원(K) · 다른 회사 관리자(A2)에게는 칩 없음
  await go(a, `/admin/workers/${K}`)
  ok('서명 대기 서류가 없으면 칩 없음', (await a.locator('[data-worker-rel]').count()) === 1 && (await a.locator('[data-sign-chip]').count()) === 0)
  const a2 = await mk(A2)
  await go(a2, `/admin/workers/${W}`)
  ok('다른 회사 관리자: 칩 없음 (그 회사 서류만 셈)', (await a2.locator('[data-sign-chip]').count()) === 0 && !one(await a2.locator('main').innerText()).includes('서명 대기'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
