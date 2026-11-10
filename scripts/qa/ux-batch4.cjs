// 묶음 4: '이번 주 내 근무' 7일 한눈에(누르면 그 근무로) + 빈 화면에 병아리 이모티콘 그림 · 360px
// node scripts/qa/ux-batch4.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000000b2', APP2 = '11111111-0000-4000-8000-0000000000b2'
const NEW = '44444444-0000-4000-8000-0000000000b9'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const plus = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

;(async () => {
  // 오늘 근무(J) + 이틀 뒤 근무(J2) 확정
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const day2 = plus(j1.start_date, 2)
  const j2 = { ...j1, id: J2, title: '이틀 뒤 주차 안내', start_date: day2, end_date: day2, applications: [], required_docs: [] }
  await rest('jobs', 'POST', j2)
  const [a1] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...a1, id: APP2, job_id: J2, status: 'approved', available_dates: null, position: null, job: j2 })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('alba_install_hide_until', String(Date.now() + 9e8)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 이번 주 내 근무 ──
  const p = await pg(W)
  await p.goto(`${D}/me`)
  const week = p.locator('[data-week]')
  await week.waitFor({ timeout: 10000 }).catch(() => {})
  ok('이번 주 내 근무: 2일', /이번 주 내 근무\s*2일/.test(await week.innerText().catch(() => '')), (await week.innerText().catch(() => '')).replace(/\n/g, ' '))
  const cells = week.locator('ol > li')
  ok('7일 칸', (await cells.count()) === 7)
  ok('오늘 칸: 오늘 근무로', (await cells.nth(0).locator('a').getAttribute('href').catch(() => '')) === '#today-work')
  ok('이틀 뒤 칸: 그 근무 카드로', (await cells.nth(2).locator('a').getAttribute('href').catch(() => '')) === `#work-${APP2}`)
  ok('근무 없는 날: 누르는 칸 아님', (await cells.nth(1).locator('a').count()) === 0)
  const widths = await cells.evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().width)))
  ok('360px: 7칸이 한 줄, 같은 너비', widths.every((w) => w === widths[0] && w >= 38), JSON.stringify(widths))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 사람이 하듯: 그 칸이 화면 가운데쯤 오게 내린 뒤(다 멈춘 다음) 누름
  // (2026-11-10부터 근무 날엔 '이번 주'가 '오늘의 근무' 아래라 처음 화면 밖 — 자동 클릭이 아래 탭 줄에 가린 칸을
  //  끌어올리느라 여러 번 스크롤하면 부드러운 스크롤과 엉켜 엉뚱한 곳에 멈췄음. 앱 동작은 그대로)
  await cells.nth(2).evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight / 2, behavior: 'instant' }))
  await p.waitForTimeout(400)
  await cells.nth(2).locator('a').click()
  await p.waitForTimeout(900)
  const box = await p.locator(`#work-${APP2}`).boundingBox()
  ok('누르면 그 근무 카드가 화면에', !!box && box.y >= 0 && box.y < 600, JSON.stringify(box))

  // ── 2. 빈 화면 병아리 ──
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: NEW, name: '새회원', phone: '01099990000', attendance: [], ratings: [] })
  const n = await pg(NEW)
  const sticker = async (pg2, id) => {
    const img = pg2.locator(`[data-empty=${id}] img`)
    await img.waitFor({ timeout: 10000 }).catch(() => {})
    return img.evaluate((i) => (i.complete && i.naturalWidth > 0) || new Promise((r) => { i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false) })).catch(() => false)
  }
  await n.goto(`${D}/me`)
  ok('근무 없는 날 (내 근무): 스케줄 병아리', await sticker(n, 'schedule'))
  await n.goto(`${D}/me/chat`)
  ok('주고받은 메시지 없음 (문의): 인사 병아리', await sticker(n, 'hi'))
  for (const s of ['open', 'closed']) await rest(`jobs?status=eq.${s}`, 'PATCH', { status: 'draft' })
  await n.goto(`${D}/`)
  ok('모집 중인 공고 없음 (홈): 잠시만요 병아리', await sticker(n, 'wait'))
  ok('360px: 옆으로 안 밀림', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
