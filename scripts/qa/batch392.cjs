// 묶음 392 (정기 개선 2026-11-25 19:35 KST)
// 공고 맨 위 '인원이 다 찼어요 · 모집 마감'으로 마감했는데 결과를 못 들은 대기 지원자가 남으면
// → 지원자 탭으로 바로 와서 '🙏 대기 n명 미선발 알림'(파란 버튼)이 화면 가운데로 오고 둘레가 번쩍임 (#settle · HashFlash · 움직임 줄이기면 테두리만)
// · 안내 '모집을 마감했어요 … · 대기 n명에게 결과를 알려 주세요' · 마감은 그대로 됨 (대기자에게 따로 알림은 안 감 — 관리자가 눌러야)
// · 대기자가 없으면 예전처럼 공고 화면에 그대로 · 360px 옆으로 안 밀림
// node scripts/qa/batch392.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP_APP = '11111111-0000-4000-8000-000000000012', W_APP = '11111111-0000-4000-8000-000000000008'
const J4 = 'cccccccc-0000-4000-8000-000000039204'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const d2 = kst(2)
  // J: 사흘 뒤가 아닌 이틀 뒤 하루 행사 · 1명 모집 · 확정 1(근무자) + 대기 1(김지원)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d2, end_date: d2, status: 'open', headcount: 1 })
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { available_dates: null })
  // J4: 같은 하루 행사 · 확정 1(근무자) · 대기 없음
  const [j0] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j0, id: J4, title: '대기 없는 공고392', status: 'open', headcount: 1, created_at: new Date().toISOString() })
  const [wApp] = await rest(`applications?id=eq.${W_APP}`)
  await rest('applications', 'POST', { ...wApp, id: '11111111-0000-4000-8000-000000039204', job_id: J4, status: 'approved', available_dates: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const close = async (p, id) => {
    await p.goto(`${D}/admin/jobs/${id}`, { waitUntil: 'networkidle' })
    const btn = p.locator('[data-job-actions="before"] form button[data-confirm]').first()
    await btn.waitFor({ timeout: 15000 }).catch(() => {})
    const label = one(await btn.innerText().catch(() => ''))
    await btn.click()
    await p.waitForTimeout(400)
    await Promise.all([p.waitForURL((u) => u.searchParams.has('m'), { timeout: 20000 }).catch(() => {}), btn.click()])
    await p.waitForLoadState('networkidle').catch(() => {})
    return label
  }

  // ── 1. 대기 1명 남은 채로 마감 → 지원자 탭 '미선발 알림'으로
  const a = await mk()
  const label = await close(a, J)
  ok("큰 버튼 '인원이 다 찼어요 · 모집 마감'", label === '인원이 다 찼어요 · 모집 마감', label)
  const u = new URL(a.url())
  const flash = one(await a.locator('[role=status]').first().innerText().catch(() => ''))
  ok("지원자 탭 #settle 로 이동 · 안내 '모집을 마감했어요 … · 대기 1명에게 결과를 알려 주세요'", u.searchParams.get('tab') === 'apps' && u.hash === '#settle' && flash.startsWith('모집을 마감했어요') && flash.includes('· 대기 1명에게 결과를 알려 주세요'), `${u.search}${u.hash} · ${flash}`)
  ok('공고는 마감됨 · 대기자는 아직 그대로 (관리자가 눌러야 알림)', (await rest(`jobs?id=eq.${J}`))[0].status === 'closed' && (await rest(`applications?id=eq.${AP_APP}`))[0].status === 'applied')
  const settle = a.locator('#settle')
  const btn = settle.locator('button')
  await btn.and(a.locator('[data-flash]')).waitFor({ timeout: 5000 }).catch(() => {})
  ok("'🙏 대기 1명 미선발 알림' 파란 버튼이 번쩍임 (data-flash)", one(await btn.innerText().catch(() => '')) === '🙏 대기 1명 미선발 알림' && ((await btn.getAttribute('class')) ?? '').includes('btn-primary') && (await btn.getAttribute('data-flash').catch(() => null)) !== null)
  ok('버튼이 화면 안에 보임 (헤더에 안 가림)', await settle.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 56 && r.bottom <= innerHeight }).catch(() => false))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await a.waitForTimeout(100)
    await a.screenshot({ path: `${SHOTS}/close-settle.png` }).catch(() => {})
  }

  // ── 2. 움직임 줄이기: 테두리 움직임 없음 (이동·안내는 같음)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'open' })
  const r = await mk({ reducedMotion: 'reduce' })
  await close(r, J)
  const rb = r.locator('#settle button')
  await rb.and(r.locator('[data-flash]')).waitFor({ timeout: 5000 }).catch(() => {})
  ok('움직임 줄이기: #settle 로 와서 테두리만 (움직임 없음)', new URL(r.url()).hash === '#settle' && (await rb.evaluate((el) => el.hasAttribute('data-flash') && getComputedStyle(el).animationName === 'none').catch(() => false)))

  // ── 3. 대기자가 없으면 예전처럼 공고 화면 그대로
  const c = await mk()
  await close(c, J4)
  const u4 = new URL(c.url())
  ok("대기 없는 공고: 공고 화면 그대로 (#settle·지원자 탭으로 안 감) · '모집을 마감했어요 · 확정 1명에게 서명할 서류를 보냈어요'", u4.pathname === `/admin/jobs/${J4}` && !u4.hash && u4.searchParams.get('tab') === null && one(await c.locator('[role=status]').first().innerText().catch(() => '')).includes('모집을 마감했어요 · 확정 1명에게 서명할 서류를 보냈어요') && (await rest(`jobs?id=eq.${J4}`))[0].status === 'closed', `${u4.pathname}${u4.search}${u4.hash}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
