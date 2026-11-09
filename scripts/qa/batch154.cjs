// 묶음 154 (정기 개선 2026-11-09 04:35)
// · 내 근무 '오늘의 근무': 이미 근무 중인데 서명할 서류가 남았으면 (담당자가 출석 체크로 시작해 줬거나 시작 뒤 서류가 새로 옴)
//   예전엔 '서명하면 근무를 시작할 수 있어요'만 보이고 '근무 종료' 버튼이 없어 퇴근을 못 눌렀음
//   → '근무 종료'는 그대로 + 아래 짧은 한 줄 '서명할 서류 n건이 남았어요 · 서명 ›'
// · 주간 근무·주휴: 근무자 줄마다 15시간까지 얼마나 찼는지 얇은 막대 · 15시간 미만이면 '15시간까지 n시간'
// node scripts/qa/batch154.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)) } return null }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 근무 중 + 서명 안 한 서류 1건 (가짜 DB 기본 상태) → '근무 종료' 그대로
  await rest(`jobs?id=eq.${J}`, 'PATCH', { lat: null, lng: null, gps_required: false })
  const w = await pg(W)
  await w.goto(`${D}/me`)
  const panel = w.locator('#clock')
  await panel.waitFor({ timeout: 15000 }).catch(() => {})
  const end = panel.locator('button', { hasText: '근무 종료' }).first()
  ok("근무 중이면 서류가 남아도 '근무 종료' 버튼", (await end.count()) === 1)
  ok("'서명하면 근무를 시작할 수 있어요'는 안 보임 (이미 시작함)", (await w.locator('[data-sign-before-start]').count()) === 0)
  const left = w.locator('[data-sign-left]')
  const lt = (await left.innerText().catch(() => '')).replace(/\n/g, ' ')
  ok("아래 한 줄 '서명할 서류 1건이 남았어요 · 서명 ›' → 그 서류", lt.includes('서명할 서류 1건이 남았어요') && lt.includes('서명 ›') && (await left.getAttribute('href').catch(() => '')) === `/docs/${DOC}`, lt)
  ok('한 줄 (꺾이지 않음) · 360px 옆으로 안 밀림', (await left.evaluate((el) => el.getBoundingClientRect().height < 48).catch(() => false)) && (await wide(w)))
  if (SHOTS) await panel.locator('xpath=..').screenshot({ path: `${SHOTS}/working-sign-left.png` }).catch(() => {})
  // 두 번 눌러 종료
  await end.click()
  await w.waitForTimeout(300)
  await panel.locator('button', { hasText: '한 번 더 누르면 종료' }).first().click().catch(() => {})
  const done = await until(async () => {
    const [att] = await rest(`attendance?user_id=eq.${W}`)
    return att?.clock_out ? att : null
  })
  ok('근무 종료가 기록됨', !!done)

  // ── 2. 주간 근무·주휴: 15시간까지 막대
  const a = await pg(A)
  await a.goto(`${D}/admin/weekly`)
  const row = a.locator('[data-weekly-person]').first()
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  const rt = (await row.innerText().catch(() => '')).replace(/\n/g, ' | ')
  ok("15시간 미만: '8시간 · 15시간까지 7시간'", rt.includes('8시간 · 15시간까지 7시간'), rt)
  await a.waitForTimeout(1100) // 막대가 자라는 움직임이 끝난 뒤
  const ratio = await row.locator('[data-weekly-bar]').evaluate((el) => el.firstElementChild.getBoundingClientRect().width / el.getBoundingClientRect().width).catch(() => -1)
  ok('막대가 8/15만큼 참 (약 53%)', Math.abs(ratio - 8 / 15) < 0.03, ratio.toFixed(3))
  ok('줄 둘째 글자 한 줄 · 360px 옆으로 안 밀림', (await row.locator('span.text-xs').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)) && (await wide(a)))
  if (SHOTS) await a.locator('[data-weekly-people]').screenshot({ path: `${SHOTS}/weekly-bar.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
