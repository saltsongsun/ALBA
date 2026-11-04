// 묶음 37: 아이폰(iOS 26~27) 키보드 버그 보정 — 키보드가 내려간 뒤에도 화면(visualViewport)이 위로 어긋나 있으면
//          (아래 탭이 화면 가운데에 뜨고 머리글이 사라지는 현상) 머리글·아래 탭·떠 있는 버튼·대화 입력칸을 그만큼 내려 제자리에
//          · 스크롤로 어긋남이 바뀌면 따라감 · 어긋난 동안 새로 나타난 칸(더보기·화면 이동)도 맞춤 · 입력 중·확대 중·컴퓨터는 그대로
//          · 어긋남이 풀리면 원래대로 · 키보드 숨김(묶음 33)은 그대로 동작
// 크로미엄에는 이 버그가 없으므로 visualViewport 값을 아이폰 버그 상태처럼 바꿔 끼워 확인
// node scripts/qa/batch37.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

// visualViewport 값을 window.__vv로 바꿔 끼울 수 있게 (아이폰 버그 흉내)
const stub = () => {
  const P = VisualViewport.prototype
  for (const k of ['offsetTop', 'height', 'scale']) {
    const d = Object.getOwnPropertyDescriptor(P, k)
    Object.defineProperty(P, k, { configurable: true, get() { const s = window.__vv; return s && k in s ? s[k] : d.get.call(this) } })
  }
}

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
    await ctx.addInitScript(stub)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  // 아이폰 버그 상태로: 키보드는 내려갔는데 화면 높이는 줄어든 채, 고정 칸 기준이 offsetTop만큼 위로
  const bug = (p, offsetTop, extra = {}) => p.evaluate(async ([o, x]) => {
    window.__vv = o == null ? null : { offsetTop: o, height: innerHeight - 260, scale: 1, ...x }
    visualViewport.dispatchEvent(new Event('resize'))
    visualViewport.dispatchEvent(new Event('scroll'))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }, [offsetTop, extra])
  const tr = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).translate : 'missing' }, sel)
  const fix = (p) => p.evaluate(() => document.documentElement.dataset.vvfix ?? null)

  // ── 1. 관리자 홈 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin`)
  await ad.locator('nav[data-admin-tabbar]').waitFor({ timeout: 10000 }).catch(() => {})
  await ad.waitForLoadState('networkidle').catch(() => {})
  ok('정상일 땐 아무것도 안 함 (보정 없음)', (await fix(ad)) === null && (await tr(ad, 'nav[data-admin-tabbar]')) === 'none' && (await tr(ad, 'header[data-app-header]')) === 'none')

  await bug(ad, 230)
  ok('어긋남 230px → 보정 켜짐', (await fix(ad)) === '230', String(await fix(ad)))
  ok('아래 탭을 230px 내려 실제 화면 아래로', (await tr(ad, 'nav[data-admin-tabbar]')) === '0px 230px', await tr(ad, 'nav[data-admin-tabbar]'))
  ok('머리글도 230px 내려 실제 화면 위로', (await tr(ad, 'header[data-app-header]')) === '0px 230px', await tr(ad, 'header[data-app-header]'))
  ok('보정 중엔 움직임 없이 바로 (transition 없음)', (await ad.locator('nav[data-admin-tabbar]').evaluate((el) => getComputedStyle(el).transitionDuration)).split(',').every((d) => parseFloat(d) === 0))

  await bug(ad, 120)
  ok('스크롤로 어긋남이 120px로 바뀌면 따라감', (await tr(ad, 'nav[data-admin-tabbar]')) === '0px 120px' && (await tr(ad, 'header[data-app-header]')) === '0px 120px')

  // 어긋난 동안 새로 나타난 칸 (더보기)
  // (크로미엄에선 보정한 만큼 탭이 실제로 내려가 화면 밖이므로 직접 누름)
  await ad.locator('nav[data-admin-tabbar] button', { hasText: '더보기' }).first().evaluate((el) => el.click())
  await ad.locator('[data-admin-more]').waitFor({ timeout: 5000 }).catch(() => {})
  await ad.waitForTimeout(100)
  ok('어긋난 동안 연 더보기 창도 맞춤', (await tr(ad, '[data-admin-more]')) === '0px 120px', await tr(ad, '[data-admin-more]'))
  await ad.locator('[data-admin-more] button[aria-label="닫기"]').evaluate((el) => el.click()).catch(() => {})

  await bug(ad, 120, { scale: 1.6 })
  ok('손가락으로 확대 중이면 보정 안 함', (await fix(ad)) === null && (await tr(ad, 'nav[data-admin-tabbar]')) === 'none')

  await bug(ad, null)
  ok('어긋남이 풀리면 원래대로 (덧붙인 값 없음)', (await fix(ad)) === null && (await ad.evaluate(() => [...document.querySelectorAll('[data-vv]')].every((el) => !el.style.translate && !el.style.getPropertyValue('--vv')))))
  const box = await ad.locator('nav[data-admin-tabbar]').boundingBox()
  ok('아래 탭이 화면 맨 아래 제자리', !!box && Math.abs(box.y + box.height - 740) <= 2, JSON.stringify(box))

  // ── 2. 근무자 문의: 아래 탭·머리글·대화 입력칸 ──
  const w = await pg(W)
  await w.goto(`${D}/me`)
  await w.locator('nav[data-bottom-nav]').waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForLoadState('networkidle').catch(() => {})
  await bug(w, 200)
  ok('근무자: 아래 탭·머리글 200px 내림', (await tr(w, 'nav[data-bottom-nav]')) === '0px 200px' && (await tr(w, 'header[data-app-header]')) === '0px 200px')
  // 어긋난 채로 다른 화면으로 → 새 화면의 대화 입력칸도 맞춤
  await w.locator('nav[data-bottom-nav] a[href="/me/chat"]').evaluate((el) => el.click())
  await w.waitForURL(/\/me\/chat/, { timeout: 10000 }).catch(() => {})
  // 문의 목록이면 회사 대화를 엶 (화면 이동 한 번 더)
  const room = w.locator(`a[href="/me/chat?co=${C1}"]`).first()
  if (await room.waitFor({ timeout: 4000 }).then(() => true, () => false)) await room.click()
  const composer = w.locator('[data-vv="end"]').first()
  await composer.waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForTimeout(150)
  const cs = await composer.evaluate((el) => ({ vv: el.style.getPropertyValue('--vv'), bottom: parseFloat(getComputedStyle(el).bottom)})).catch(() => null)
  // --tabbar-space = calc(64px + max(12px, 안전 여백)) → 76px · 붙는 기준 76 + 6 - 200
  ok('화면 이동 뒤 대화 입력칸도 붙는 기준을 200px 낮춤', !!cs && cs.vv === '200px' && Math.abs(cs.bottom - (76 + 6 - 200)) <= 1, JSON.stringify(cs))
  ok('머리글은 화면을 옮겨도 계속 맞춤', (await tr(w, 'header[data-app-header]')) === '0px 200px')

  // 입력 중(키보드가 진짜 올라와 있음)이면 보정 안 함 → 묶음 33의 키보드 숨김이 그대로
  await w.locator('textarea[name=body]').first().focus()
  await bug(w, 200)
  ok('입력 중이면 보정 안 함', (await fix(w)) === null && (await tr(w, 'nav[data-bottom-nav]')) === 'none' && (await composer.evaluate((el) => el.style.getPropertyValue('--vv'))) === '')
  await w.evaluate(() => document.activeElement?.blur())
  await bug(w, null)
  await w.locator('textarea[name=body]').first().focus()
  await w.waitForTimeout(150)
  await w.setViewportSize({ width: 360, height: 420 })
  await w.waitForFunction(() => 'kb' in document.documentElement.dataset, null, { timeout: 3000 }).catch(() => {})
  await w.waitForTimeout(400)
  ok('키보드가 올라오면 아래 탭 숨김 (그대로)', await w.evaluate(() => 'kb' in document.documentElement.dataset && getComputedStyle(document.querySelector('nav[data-bottom-nav]')).visibility === 'hidden'))
  await w.evaluate(() => document.activeElement?.blur())
  await w.setViewportSize({ width: 360, height: 740 })
  await w.waitForFunction(() => !('kb' in document.documentElement.dataset), null, { timeout: 3000 }).catch(() => {})
  await w.waitForTimeout(400)
  const nb = await w.locator('nav[data-bottom-nav]').boundingBox()
  ok('키보드가 내려가면 아래 탭이 화면 맨 아래 (그대로)', !!nb && Math.abs(nb.y + nb.height - 740) <= 2, JSON.stringify(nb))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 컴퓨터(마우스)는 보정하지 않음 ──
  const desk = await pg(W, { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } })
  await desk.goto(`${D}/me/chat?co=${C1}`)
  await desk.waitForLoadState('networkidle').catch(() => {})
  await bug(desk, 200)
  ok('컴퓨터: 보정 없음', (await fix(desk)) === null && (await tr(desk, 'header[data-app-header]')) === 'none')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
