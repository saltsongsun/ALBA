// 묶음 155 (정기 개선 2026-11-09 05:35)
// · 마지막 서류에 서명하면: 오늘 그 공고 근무일이고 아직 시작 전이면 '내 근무'의 '근무 시작' 버튼으로 바로
//   ('서명을 모두 마쳤어요. 이제 근무를 시작할 수 있어요.' · 버튼이 화면 가운데 · 둘레가 번쩍)
//   (예전엔 내 근무 맨 위로 가서 아래로 내려 버튼을 찾아야 했음) · 이미 근무 중이면 예전처럼 내 근무로만
// · 문의 채팅 '근무 시작하러 가기'(/me#clock)로 와도 시작 전 버튼이 번쩍 (예전엔 근무 중일 때 '종료' 버튼만)
// node scripts/qa/batch155.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const btn = p.locator('#today-work button[data-clock-main]').first()
  // 부드럽게 스크롤되므로 움직임이 끝난 뒤에 확인
  const inView = () => p.waitForTimeout(900).then(() => btn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })).catch(() => false)

  // 준비: 출근 전 · 현장 위치 확인 없음 · 오늘 근무일 (가짜 DB 근무자는 이미 근무 중이라 기록을 지움)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await rest(`jobs?id=eq.${J}`, 'PATCH', { lat: null, lng: null, gps_required: false, end_time: '23:59:00' })

  // ── 1. 마지막 서류에 서명 → 근무 시작 버튼으로 바로
  await p.goto(`${D}/docs/${DOC}`)
  const pad = p.locator('[data-sign-pad]')
  await pad.waitFor({ timeout: 15000 }).catch(() => {})
  await pad.scrollIntoViewIfNeeded()
  await p.waitForTimeout(400)
  const box = await pad.boundingBox()
  await p.mouse.move(box.x + 30, box.y + 90)
  await p.mouse.down()
  for (let i = 1; i <= 10; i++) await p.mouse.move(box.x + 30 + i * 18, box.y + 90 + (i % 2 ? -25 : 25))
  await p.mouse.up()
  await p.locator('input[name=agree]').check()
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  await p.waitForURL((u) => u.pathname === '/me', { timeout: 15000 }).catch(() => {})
  const u = new URL(p.url())
  ok("내 근무 '근무 시작' 자리로 (#clock)", u.pathname === '/me' && u.hash === '#clock', p.url())
  ok("'서명을 모두 마쳤어요. 이제 근무를 시작할 수 있어요.'", await p.getByText('서명을 모두 마쳤어요. 이제 근무를 시작할 수 있어요.').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  await btn.waitFor({ timeout: 10000 }).catch(() => {})
  ok("버튼은 '근무 시작'", ((await btn.innerText().catch(() => '')) ?? '').includes('근무 시작'), await btn.innerText().catch(() => ''))
  const flashed = await p.waitForFunction(() => !!document.querySelector('#today-work [data-clock-main][data-flash]'), null, { timeout: 3000 }).then(() => true, () => false)
  ok('버튼 둘레가 번쩍 (data-flash)', flashed)
  ok('버튼이 화면 안 (아래로 내려 찾지 않아도 됨)', await inView())
  ok('서명 안내 칸은 없음 (다 서명함)', (await p.locator('[data-sign-before-start]').count()) === 0)
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 시작 시각이 지났으면 나오는 안내: 굵은 한 줄 + 작은 한 줄 (360px에서 세 줄로 꺾이지 않게)
  const late = p.locator('#today-work [data-start-late]').first()
  if (await late.count()) {
    const lines = await late.evaluate((el) => [...el.querySelectorAll('b, span.block')].map((x) => Math.round(x.getBoundingClientRect().height)))
    ok("늦음 안내 '시작 시각(..)이 n 지났어요' / '도착했다면 근무 시작을 눌러 주세요' 두 줄", lines.length === 2 && lines.every((h) => h < 24) && (await late.innerText()).includes('도착했다면 근무 시작을 눌러 주세요'), JSON.stringify(lines))
  } else console.log('SKIP  아직 시작 전이라 늦음 안내 확인 생략')
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/signed-to-start.png` }).catch(() => {})

  // ── 2. 문의 채팅 '근무 시작하러 가기'(/me#clock)로 와도 시작 전 버튼이 번쩍
  await p.goto(`${D}/me`)
  await btn.waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(500)
  ok('그냥 들어오면 번쩍이지 않음', (await p.locator('[data-flash]').count()) === 0)
  // 다른 화면(문의함)에서 오는 것처럼 (같은 화면에서 주소 끝만 바꾸면 화면이 다시 그려지지 않음)
  await p.goto(`${D}/me/chat`).catch(() => {})
  await p.goto(`${D}/me#clock`)
  await btn.waitFor({ timeout: 10000 }).catch(() => {})
  ok('#clock으로 오면 시작 전에도 번쩍 · 화면 안', (await p.waitForFunction(() => !!document.querySelector('[data-clock-main][data-flash]'), null, { timeout: 3000 }).then(() => true, () => false)) && (await inView()))
  ok('번쩍이는 버튼은 하나', (await p.locator('[data-flash]').count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
