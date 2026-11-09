// 묶음 164 (정기 개선 2026-11-10 00:35)
// · 대시보드 '확정 대기 지원자': 마지막 날 근무까지 끝난 행사면 '끝난 행사' 표시 · 확정은 한 번 더 묻기 ('끝난 행사 · 확정?')
//   여러 명 골라 확정할 때도 '끝난 행사 n명 · 확정?' (밤에 끝난 행사를 확정하는 실수 막기 · 미선발·보류는 그대로)
// · 외주 업체 탭: 업체가 없으면 등록 칸만 펼친 채 '아직 없어요' 표시 (아래 '없어요' 카드와 같은 말 두 번이던 것)
// node scripts/qa/batch164.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const kst = new Date(Date.now() + 9 * 3600e3)
  const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  const card = a.locator('#pending .card', { has: a.locator('[data-dash-decide]') }).first()

  // ── 1. 끝난 행사 (오늘 00:00~00:30 · 마지막 날)
  if (mins < 35) console.log('SKIP  00:35 전이라 끝난 행사 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:30:00' })
    await a.goto(`${D}/admin`)
    await card.waitFor({ timeout: 15000 }).catch(() => {})
    ok("대기 지원자 카드에 '끝난 행사'", (await card.locator('[data-pending-ended]').innerText().catch(() => '')) === '끝난 행사')
    ok('공고 제목 줄 한 줄 · 360px 옆으로 안 밀림', (await card.locator('[data-pending-ended]').locator('..').evaluate((el) => el.getBoundingClientRect().height < 28)) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/ended-pending.png` }).catch(() => {})
    const approve = card.locator('[data-dash-decide] form').first().locator('button')
    await approve.click()
    await a.waitForTimeout(300)
    ok("확정 첫 누름: '끝난 행사 · 확정?' (아직 그대로 대기)", (await approve.innerText()).trim() === '끝난 행사 · 확정?' && (await rest(`applications?id=eq.${APP}`))[0]?.status === 'applied', await approve.innerText())

    // 여러 명 골라 확정: 끝난 행사 n명
    const [ap] = await rest(`applications?id=eq.${APP}`)
    await rest('applications', 'POST', { ...ap, id: '11111111-0000-4000-8000-000000001640', user_id: 'bbbbbbbb-0000-4000-8000-000000001640', user: { ...ap.user, id: 'bbbbbbbb-0000-4000-8000-000000001640', name: '대기둘' }, status: 'applied', held_at: null, created_at: new Date().toISOString() })
    await a.reload()
    // 휴대폰 카드와 넓은 화면 표가 함께 있어 보이는 칸만
    const boxes = a.locator('#pending input[name=app]:visible')
    await boxes.first().waitFor({ timeout: 15000 }).catch(() => {})
    for (const box of await boxes.all()) await box.check()
    const bar = a.locator('[data-bulk-bar]')
    await bar.waitFor({ timeout: 5000 }).catch(() => {})
    await a.waitForTimeout(350)
    const go = bar.locator('button[data-confirm]').last()
    await go.click()
    await a.waitForTimeout(300)
    ok("여러 명 확정: '끝난 행사 2명 · 확정?'", (await go.innerText()).includes('끝난 행사 2명 · 확정?'), await go.innerText())
  }

  // ── 2. 아직 근무 시간 안 (끝 23:59): 표시 없음 · 확정 바로
  if (mins >= 23 * 60 + 58) console.log('SKIP  23:58 넘어 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
    await a.goto(`${D}/admin`)
    await card.waitFor({ timeout: 15000 }).catch(() => {})
    ok("근무 시간 안: '끝난 행사' 없음", (await a.locator('[data-pending-ended]').count()) === 0)
  }

  // ── 3. 외주 업체 탭: 업체가 없으면 등록 칸 + '아직 없어요' (따로 카드 없음)
  await a.goto(`${D}/admin/vendors?tab=list`)
  await a.locator('[data-vendor-empty]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("업체 없음: '아직 없어요' · 등록 칸 펼침 · '등록된 외주사가 없어요' 카드 없음", (await a.locator('[data-vendor-empty]').count()) === 1 && (await a.locator('input[name=name]').isVisible()) && (await a.getByText('등록된 외주사가 없어요').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
