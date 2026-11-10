// 묶음 173 (정기 개선 2026-11-10 10:35 KST)
// · 직인 그림이 깨져 있으면: 서류(서명 화면·계약서 인쇄)에선 그림을 숨기고 '(인)'만 · 회사 설정에선 '직인 그림이 / 깨졌어요' (옆 '직인 바꾸기')
//   (깨진 그림 표시와 '직인' 글자가 계약서에 찍히지 않게) · 멀쩡한 직인은 그대로 보임
// · 관리자 공고 화면 '근무 중 n | 퇴근 n': 자동 새로 고침으로 숫자가 바뀌면 톡 (LiveNumber)
// node scripts/qa/batch173.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004', CO = '99999999-0000-4000-8000-000000000099'
// 1×1 빨간 점 PNG (멀쩡한 직인 대신)
const GOOD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

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
  const sealState = (p) =>
    p.evaluate(() => ({
      imgs: [...document.querySelectorAll('img[alt="직인"]')].map((i) => ({ ok: i.complete && i.naturalWidth > 0 })),
      marks: [...document.querySelectorAll('span')].filter((s) => s.textContent === '(인)').length,
    }))

  // ── 1. 깨진 직인(가짜 DB 기본): 서명 화면에선 그림 없이 '(인)'만
  const w = await pg(W)
  await w.goto(`${D}/docs/${DOC}`)
  await w.locator('[data-sign-pad]').waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForTimeout(500)
  const s1 = await sealState(w)
  ok("서명 화면: 깨진 직인 그림은 숨김 · '(인)'은 그대로", s1.imgs.length === 0 && s1.marks >= 1, JSON.stringify(s1))

  // 관리자 계약서 인쇄 화면도
  const a = await pg(A)
  await a.goto(`${D}/print/contract/${J}`)
  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForTimeout(500)
  const s2 = await sealState(a)
  ok("계약서 인쇄: 깨진 직인 그림 없음 · '(인)' 있음", s2.imgs.length === 0 && s2.marks >= 1, JSON.stringify(s2))

  // 회사 설정: '직인 그림이 깨졌어요 · 다시 올려 주세요'
  await a.goto(`${D}/admin/settings`)
  const broken = a.locator('[data-seal-broken]')
  ok("회사 설정: '직인 그림이 / 깨졌어요' 두 줄 (바로 옆 '직인 바꾸기')", await broken.waitFor({ timeout: 15000 }).then(async () => (await broken.innerText()).replace(/\s+/g, ' ').trim() === '직인 그림이 깨졌어요' && (await broken.evaluate((el) => [...el.querySelectorAll('span.block')].every((c) => c.getBoundingClientRect().height < 20))), () => false))
  if (SHOTS) await broken.locator('xpath=..').screenshot({ path: `${SHOTS}/seal-broken.png` }).catch(() => {})

  // ── 2. 멀쩡한 직인: 그대로 보임
  await rest(`companies?id=eq.${CO}`, 'PATCH', { seal_image: GOOD })
  await rest('settings?id=eq.1', 'PATCH', { seal_image: GOOD })
  await w.goto(`${D}/docs/${DOC}`)
  await w.locator('[data-sign-pad]').waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForTimeout(500)
  const s3 = await sealState(w)
  ok('멀쩡한 직인은 서명 화면에 그대로', s3.imgs.length >= 1 && s3.imgs.every((i) => i.ok), JSON.stringify(s3))
  await a.goto(`${D}/admin/settings`)
  await a.locator('img[alt="직인"]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('멀쩡한 직인은 회사 설정에도 그대로 (깨짐 안내 없음)', (await a.locator('[data-seal-broken]').count()) === 0 && (await a.locator('img[alt="직인"]').count()) >= 1)

  // ── 3. 관리자 공고 '근무 중 1 | 퇴근 0' → 퇴근하면 '근무 중 0 | 퇴근 1' 톡
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await a.goto(`${D}/admin/jobs/${J}?tab=att`)
  const counts = a.locator('[data-job-counts]')
  await counts.waitFor({ timeout: 15000 }).catch(() => {})
  const c1 = (await counts.innerText()).replace(/\s+/g, ' ').trim()
  ok("처음 '근무 중 1 | 퇴근 0'", c1.startsWith('근무 중 1 | 퇴근 0'), c1)
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: new Date().toISOString() })
  await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const moved = await a.waitForFunction(() => (document.querySelector('[data-job-counts]')?.textContent ?? '').replace(/\s+/g, ' ').includes('근무 중 0'), null, { timeout: 10000 }).then(() => true, () => false)
  const c2 = (await counts.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  ok("퇴근하면 '근무 중 0 | 퇴근 1'", moved && c2.startsWith('근무 중 0 | 퇴근 1'), c2)
  ok('바뀐 숫자가 톡 (bump)', await counts.evaluate((el) => [...el.querySelectorAll('[data-value]')].some((n) => n.classList.contains('animate-bump'))).catch(() => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
