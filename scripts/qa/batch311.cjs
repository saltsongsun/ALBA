// 묶음 311 (정기 개선 2026-11-19 08:35 KST)
// · 서명 화면: 서명란이 화면에 보이는 동안 아래 탭을 내려 숨김 (아래쪽까지 그리다 탭을 눌러 다른 화면으로 가는 일 막기 · 키보드와 같은 방식)
//   서명란이 화면 밖이면 다시 보임 · 화면을 떠나면 원래대로
// · 홈 인사 줄: 오늘 근무가 있으면 그 상태부터 ('오늘 근무 중' / '오늘 근무 마침' / '오늘 근무 있음') — 근무 중인데 '공고를 골라 지원해 보세요'가 나오지 않게
// node scripts/qa/batch311.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011'
const N = '33333333-0000-4000-8000-0000000311a1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 지원한 적 없는 새 근무자
  const [u] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: N, name: '새근무자', phone: '01031103110', created_at: '2026-10-20T00:00:00Z' })
  const [doc] = (await rest(`signed_docs?user_id=eq.${W}`)).filter((d) => d.status === 'pending')

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const hello = async (p) => one(await p.getByRole('link', { name: /안녕하세요/ }).first().textContent().catch(() => ''))

  // ── 1. 홈 인사 줄
  const w = await mk(W)
  await w.goto(`${D}/`, { waitUntil: 'networkidle' })
  const h1 = await hello(w)
  ok("오늘 근무 중인 근무자: 인사 줄 '오늘 근무 중' (지원 권유 문구 없음)", h1.includes('오늘 근무 중') && !h1.includes('공고를 골라 지원해 보세요'), h1)
  ok('360px 옆으로 안 밀림 (홈)', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/home-hello-working.png` })
  const k = await mk(K)
  await k.goto(`${D}/`, { waitUntil: 'networkidle' })
  const h2 = await hello(k)
  ok("확정 대기만 있는 근무자: 그대로 '확정 대기 1건' (오늘 근무 문구 없음)", h2.includes('확정 대기 1건') && !h2.includes('오늘 근무'), h2)
  const n = await mk(N)
  await n.goto(`${D}/`, { waitUntil: 'networkidle' })
  const h3 = await hello(n)
  ok("지원한 적 없는 근무자: 그대로 '함께하고 싶은 공고를 골라 지원해 보세요'", h3.includes('함께하고 싶은 공고를 골라 지원해 보세요'), h3)

  // ── 2. 서명 화면: 서명란이 보이면 아래 탭이 내려감
  ok('서명할 서류 준비', !!doc)
  await w.goto(`${D}/docs/${doc.id}`, { waitUntil: 'networkidle' })
  const nav = w.locator('[data-bottom-nav]').first()
  const signing = () => w.evaluate(() => document.documentElement.hasAttribute('data-signing'))
  const navShown = () => nav.evaluate((el) => getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.5).catch(() => false)
  await w.evaluate(() => window.scrollTo(0, 0))
  await w.waitForTimeout(500)
  const pad = w.locator('[data-sign-pad]')
  const padTop = await pad.evaluate((el) => el.getBoundingClientRect().top)
  const padH = await pad.evaluate((el) => el.getBoundingClientRect().height)
  // 처음 화면에 서명란이 거의 안 보이면(20% 미만) 탭은 그대로
  const farBelow = (740 - padTop) / padH < 0.2
  ok('처음(서명란이 거의 안 보임): 아래 탭 보임', farBelow ? !(await signing()) && (await navShown()) : true, `padTop=${Math.round(padTop)} h=${Math.round(padH)}`)
  await pad.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await w.waitForTimeout(600)
  ok('서명란이 보이면 아래 탭이 내려가 숨음 (html[data-signing])', (await signing()) && !(await navShown()))
  const padBox = await pad.locator('canvas').boundingBox()
  const navBox = await nav.boundingBox()
  ok('서명란 위에 아래 탭이 겹치지 않음', !!padBox && (!navBox || !(await navShown()) || navBox.y >= padBox.y + padBox.height), JSON.stringify({ pad: padBox && Math.round(padBox.y + padBox.height), nav: navBox && Math.round(navBox.y) }))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/sign-no-tabbar.png` })
  // 서명란 아래쪽 끝까지 그려도 다른 화면으로 가지 않음
  const before = w.url()
  if (padBox) {
    await w.mouse.move(padBox.x + 30, padBox.y + padBox.height - 8)
    await w.mouse.down()
    await w.mouse.move(padBox.x + 200, padBox.y + padBox.height - 4, { steps: 8 })
    await w.mouse.up()
  }
  await w.waitForTimeout(400)
  ok('서명란 아래쪽까지 그려도 화면 그대로', w.url() === before)
  await w.evaluate(() => window.scrollTo(0, 0))
  await w.waitForTimeout(600)
  ok('서명란이 화면 밖으로 가면 아래 탭이 다시 보임', farBelow ? !(await signing()) && (await navShown()) : true)
  // 움직임 줄이기: 바로 숨고 보임 (전환 없음)
  await w.emulateMedia({ reducedMotion: 'reduce' })
  await pad.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await w.waitForTimeout(300)
  ok('움직임 줄이기에서도 서명란이 보이면 숨음', (await signing()) && !(await navShown()))
  ok('360px 옆으로 안 밀림 (서명)', await noSide(w))
  // 다른 화면으로 가면 표시가 사라짐
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok('서명 화면을 떠나면 아래 탭은 원래대로', !(await signing()) && (await navShown()))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
