// 묶음 234 (정기 개선 2026-11-13 13:35 KST)
// · 회사 공고 모음(/?co=회사): 이 회사에 지원한 사람은 '내 지원' 줄 옆에 '문의' 버튼 → 이 회사 담당자와의 문의로 바로
//   (문의는 지원·대화가 있는 회사만 열리므로 지원한 회사에서만 보여 줌) · 줄이 좁아져 '확정 대기' → '대기'
// · 담당자 답장을 아직 안 읽었으면 '문의' 버튼에 숫자가 톡 (읽으면 사라짐)
// node scripts/qa/batch234.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const C1 = '99999999-0000-4000-8000-000000000099', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  // 공고가 끝나지 않게 (저녁에 돌려도 '지금 공고'로 남게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(1), end_date: kst(1) })
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
  const CO = `/?co=${C1}`

  // ── 1. 지원만 한 사람: '내 지원 · 대기 1건' + '문의'
  const ap = await mk(AP)
  await ap.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  const mine = ap.locator('[data-company-mine]')
  const ask = ap.locator('[data-company-ask]')
  await mine.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'내 지원 · 대기 1건 내 근무 →' 옆에 '문의' (이 회사 문의로)", one(await mine.innerText()) === '내 지원 · 대기 1건 내 근무 →' && one(await ask.innerText()) === '문의' && (await ask.getAttribute('href')) === `/me/chat?co=${C1}`, one(await mine.innerText().catch(() => '')))
  const fit = await mine.evaluate((el) => { const t = el.querySelector('span'); const r = el.getBoundingClientRect(); return { cut: t.scrollWidth > t.clientWidth + 1, h: Math.round(r.height) } })
  const askBox = await ask.boundingBox()
  ok('한 줄 · 잘리지 않음 · 누르기 쉬운 높이 · 360px 옆으로 안 밀림', !fit.cut && fit.h >= 40 && fit.h < 52 && askBox && askBox.height >= 40 && (await noSide(ap)), JSON.stringify(fit))
  ok('안 읽은 답장이 없으면 숫자 없음', (await ask.getAttribute('data-company-ask')) === '0' && (await ask.locator('span[aria-hidden]').count()) === 0)

  // ── 2. 담당자 답장(안 읽음) → '문의'에 1
  await rest('messages', 'POST', { thread_user_id: AP, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: '내일 오전에 확정 알려 드릴게요.', read_at: null, created_at: new Date().toISOString() })
  await ap.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  const badge = ask.locator('span[aria-hidden]')
  ok("안 읽은 답장 1개: '문의'에 숫자 1이 톡", one(await badge.innerText().catch(() => '')) === '1' && ((await badge.getAttribute('class')) ?? '').includes('animate-pop') && ((await ask.getAttribute('aria-label')) ?? '').includes('안 읽은 답장 1개'))
  if (SHOTS) {
    const bx = await ap.locator('section.card').first().boundingBox()
    if (bx) await ap.screenshot({ path: `${SHOTS}/company-ask.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: bx.height + 16 } }).catch(() => {})
  }
  await ask.click()
  await ap.waitForURL((u) => new URL(u).pathname === '/me/chat', { timeout: 15000 }).catch(() => {})
  ok('누르면 이 회사 문의 대화가 바로 열림 (담당자 답장이 보임)', await ap.getByText('내일 오전에 확정 알려 드릴게요.').first().waitFor({ timeout: 10000 }).then(() => true, () => false))
  await ap.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  ok('읽고 나면 숫자 사라짐', (await ask.locator('span[aria-hidden]').count()) === 0)

  // ── 3. 확정된 사람: '내 지원 · 확정 1건' + '문의'
  const w = await mk(W)
  await w.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  ok("확정된 사람: '내 지원 · 확정 1건 내 근무 →' + '문의'", one(await w.locator('[data-company-mine]').innerText().catch(() => '')) === '내 지원 · 확정 1건 내 근무 →' && (await w.locator('[data-company-ask]').count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
