// 묶음 175 (정기 개선 2026-11-10 12:35 KST)
// · 관리자 문의 목록: 지금 이 회사에서 근무 중인 사람은 사진 오른쪽 아래 초록 점 ('지금 근무 중') — 현장에서 온 문의를 먼저 보게
//   (퇴근하면 점 없음 · 다른 회사 근무는 안 셈)
// · 내 정보 '정보 채우기' 막대: 채운 칸이 왼쪽부터 차례로 차오름 (0.26초 · 80ms씩 · '움직임 줄이기'면 바로)
// node scripts/qa/batch175.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 문의 목록: 근무 중(가짜 DB 기본 · 오늘 출근 · 퇴근 전)이면 초록 점
  const a = await pg(A)
  const row = a.locator(`a[href="/admin/chat/${W}"]`).first()
  await a.goto(`${D}/admin/chat`)
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  const dot = row.locator('[data-inbox-working]')
  ok("근무 중인 근무자: 사진 옆 초록 점 ('지금 근무 중')", (await dot.count()) === 1 && (await dot.getAttribute('aria-label')) === '지금 근무 중')
  ok('점은 사진 오른쪽 아래 · 360px 옆으로 안 밀림', (await dot.evaluate((el) => { const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect(); return r.right <= p.right + 1 && r.bottom <= p.bottom + 1 && r.left > p.left })) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  if (SHOTS) await row.screenshot({ path: `${SHOTS}/inbox-working.png` }).catch(() => {})
  // 퇴근하면 점 없음
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: new Date().toISOString() })
  await a.goto(`${D}/admin/chat`)
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok('퇴근하면 초록 점 없음', (await row.locator('[data-inbox-working]').count()) === 0)
  // 다른 회사 근무 기록은 안 셈
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: null, company_id: 'ffffffff-0000-4000-8000-000000000099' })
  await a.goto(`${D}/admin/chat`)
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok('다른 회사에서 근무 중이면 이 회사 목록엔 점 없음', (await row.locator('[data-inbox-working]').count()) === 0)

  // ── 2. 내 정보 '정보 채우기' 막대: 채운 칸이 차례로
  const w = await pg(W)
  await w.goto(`${D}/me/profile`)
  const bar = w.locator('[data-profile-bar]')
  await bar.waitFor({ timeout: 15000 }).catch(() => {})
  const fills = await bar.evaluate((el) => [...el.querySelectorAll('[data-profile-fill]')].map((f) => { const s = getComputedStyle(f); return [s.animationName, s.animationDuration, s.animationDelay] }))
  const segs = await bar.evaluate((el) => el.children.length)
  ok('채운 칸만 차오름 (짧게 0.26초 · 80ms씩)', fills.length >= 1 && fills.length < segs && fills.every(([n, d], i) => n === 'grow' && d === '0.26s' && fills[i][2] === `${(i * 0.08).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}s`.replace(/^0s$/, '0s')), JSON.stringify(fills))
  await w.waitForTimeout(500)
  ok('다 차오르면 칸을 꽉 채움', await bar.evaluate((el) => [...el.querySelectorAll('[data-profile-fill]')].every((f) => Math.abs(f.getBoundingClientRect().width - f.parentElement.getBoundingClientRect().width) < 1)))
  ok('360px 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const r = await pg(W, { reducedMotion: 'reduce' })
  await r.goto(`${D}/me/profile`)
  await r.locator('[data-profile-bar]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("'움직임 줄이기'면 움직이지 않음", await r.locator('[data-profile-bar]').evaluate((el) => [...el.querySelectorAll('[data-profile-fill]')].every((f) => parseFloat(getComputedStyle(f).animationDuration) < 0.01)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
