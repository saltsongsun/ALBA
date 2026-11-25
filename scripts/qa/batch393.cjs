// 묶음 393 (정기 개선 2026-11-25 21:35 KST)
// 여러 날 행사 지원: 한마디 '모든 날짜 가능해요'와 고른 날이 어긋나지 않게
// · 날짜를 일부만 고른 채 '+ 모든 날짜 가능해요'를 누르면 남은 날이 모두 골라짐 (✓ 톡)
// · 그 뒤에 날짜를 빼면 한 줄 '‘모든 날짜 가능’인데 n일만 골랐어요 · 모두 고르기' (톡) → 누르면 모두 골라지고 줄이 사라짐
// · 칩을 다시 눌러 말을 빼면 줄도 사라짐 · 직접 쳐서 넣어도 같음 · '모두 선택/해제' 누름 반응 · 360px 한 줄 · 옆으로 안 밀림
// node scripts/qa/batch393.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const NW = 'bbbbbbbb-0000-4000-8000-000000039301'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const d1 = kst(1), d2 = kst(2), d3 = kst(3)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d1, end_date: d3, status: 'open', headcount: 5 })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: NW, name: '새지원자393', phone: '01039300001', photo_at: '2026-10-29T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(NW), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  const box = (d) => p.locator(`input[name=dates][value="${d}"]`)
  const chip = (d) => p.locator(`label[data-day="${d}"] span`).first()
  await box(d1).waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  const checked = async () => [await box(d1).isChecked(), await box(d2).isChecked(), await box(d3).isChecked()]
  const hint = p.locator('[data-says-all]')
  const phrase = p.locator('[data-phrase-chip]', { hasText: '모든 날짜 가능해요' })
  const msg = p.locator('#message')

  ok('처음엔 세 날 모두 골라져 있음 · 안내 줄 없음', (await checked()).every(Boolean) && (await hint.count()) === 0)
  // 이틀을 빼고 → '모든 날짜 가능해요' 칩을 누르면 다시 모두 골라짐
  await chip(d2).click()
  await chip(d3).click()
  ok('둘째·셋째 날을 뺌 → 첫날만', JSON.stringify(await checked()) === '[true,false,false]')
  await phrase.click()
  await p.waitForTimeout(250)
  ok("'+ 모든 날짜 가능해요'를 누르면 한마디에 들어가고 남은 날이 모두 골라짐 (✓ 톡)", (await msg.inputValue()).includes('모든 날짜 가능해요') && (await checked()).every(Boolean) && (await p.locator(`label[data-day="${d3}"] [data-day-check]`).getAttribute('class').catch(() => '')).includes('animate-pop'))
  ok('모두 골랐으니 안내 줄 없음', (await hint.count()) === 0)
  // 그 뒤에 하루를 빼면 한 줄 안내
  await chip(d2).click()
  await hint.waitFor({ timeout: 5000 }).catch(() => {})
  ok("날짜를 빼면 '‘모든 날짜 가능’인데 2일만 골랐어요 · 모두 고르기' (톡 · 한 줄)", one(await hint.innerText().catch(() => '')) === '‘모든 날짜 가능’인데 2일만 골랐어요 모두 고르기' && ((await hint.getAttribute('class')) ?? '').includes('animate-pop') && (await hint.evaluate((el) => el.getBoundingClientRect().height < 34).catch(() => false)), one(await hint.innerText().catch(() => '')))
  ok('360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) {
    await hint.scrollIntoViewIfNeeded().catch(() => {})
    await p.waitForTimeout(300)
    await p.locator('form:has(#message)').first().screenshot({ path: `${SHOTS}/says-all.png` }).catch(() => {})
  }
  await p.locator('[data-says-all-fix]').click()
  await p.waitForTimeout(250)
  ok("'모두 고르기' → 세 날 모두 · 안내 줄 사라짐", (await checked()).every(Boolean) && (await hint.count()) === 0)
  // 칩으로 말을 빼면 날짜를 빼도 안내 없음
  await phrase.click()
  await chip(d3).click()
  await p.waitForTimeout(250)
  ok("칩으로 '모든 날짜 가능해요'를 빼면 날짜를 빼도 안내 없음", !(await msg.inputValue()).includes('모든 날짜 가능해요') && JSON.stringify(await checked()) === '[true,true,false]' && (await hint.count()) === 0)
  // 직접 쳐서 넣어도 같음
  await msg.fill('')
  await msg.type('저는 모든 날짜 가능해요')
  await p.waitForTimeout(250)
  ok('직접 쳐서 넣어도 남은 날이 모두 골라짐', (await checked()).every(Boolean))
  ok("'모두 해제' 누름 반응 (누르면 살짝 작아짐)", ((await p.locator('[data-days-all]').getAttribute('class')) ?? '').includes('active:scale-95'))

  // 지원하면 고른 날 그대로
  await p.getByRole('button', { name: /으로 지원하기/ }).click()
  const again = p.getByRole('button', { name: '한 번 더 누르면 지원돼요' })
  if (await again.count()) await again.click()
  await p.waitForLoadState('networkidle').catch(() => {})
  await p.waitForTimeout(800)
  const [app] = (await rest(`applications?job_id=eq.${J}&user_id=eq.${NW}`)) ?? []
  ok('지원 → 세 날 모두 · 한마디 그대로', !!app && JSON.stringify((app.available_dates ?? [d1, d2, d3]).slice().sort()) === JSON.stringify([d1, d2, d3]) && (app.message ?? '').includes('모든 날짜 가능해요'), JSON.stringify(app ? [app.available_dates, app.message] : null))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
