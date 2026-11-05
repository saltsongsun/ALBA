// 묶음 68 (정기 개선): 확정된 근무자 공고 화면에 '서류 서명하기' 버튼 + 인원 줄 칸 막대
// · 확정됐는데 서명 안 한 서류가 있으면 '서류 서명하기'(가장 먼저 온 서류로 바로) · 2건 이상이면 '(2건)'
//   이때 '출퇴근하러 가기'는 회색(보조) · 다 서명하면 버튼이 사라지고 출퇴근 버튼이 다시 파랑
// · 인원 줄: 모집 인원만큼 칸, 확정된 만큼 참
// node scripts/qa/batch68.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004', DOC2 = 'dddddddd-0000-4000-8000-0000000000e8'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 공고는 내일까지 (저녁에도 끝나지 않게) · 모집 6명
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: kstDate(new Date(Date.now() + 86400e3)), headcount: 6 })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const wk = await ctx.newPage()
  wk.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async () => {
    await wk.goto(`${D}/jobs/${J}`)
    await wk.getByText('근무가 확정됐어요.').first().waitFor({ timeout: 10000 }).catch(() => {})
  }
  const clockLink = () => wk.locator('a[href="/me"]', { hasText: /출퇴근하러 가기|내 근무 보기/ }).first()

  // ── 1. 서명 안 한 서류 1건 → '서류 서명하기' (그 서류로) ──
  await open()
  const cta = wk.locator('[data-sign-cta]')
  ok("확정 + 서명 전: '서류 서명하기' 버튼", (await cta.count()) === 1 && (await cta.getAttribute('href')) === `/docs/${DOC}` && (await cta.innerText()).trim() === '서류 서명하기', await cta.innerText().catch(() => ''))
  ok("이때 '출퇴근하러 가기'는 회색 (보조)", ((await clockLink().getAttribute('class')) || '').includes('btn-gray'))
  ok('360px: 옆으로 안 밀림', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 인원 줄: 6칸 중 1칸 ──
  const bar = await wk.locator('dd [role=img][aria-label*="명 중"]').first().evaluate((e) => ({ slots: e.dataset.slots, filled: e.dataset.filled })).catch(() => null)
  ok('인원 줄: 6명 모집 → 6칸 중 1칸', bar?.slots === '6' && bar?.filled === '1', JSON.stringify(bar))

  // ── 3. 서류 2건 → '(2건)' · 먼저 온 서류로 ──
  const [doc] = await rest(`signed_docs?id=eq.${DOC}`)
  await rest('signed_docs', 'POST', { ...doc, id: DOC2, title: '개인정보 동의서', created_at: '2026-10-02T00:00:00Z' })
  await open()
  ok("서류 2건: '서류 서명하기 (2건)' · 먼저 온 서류로", (await cta.innerText()).trim() === '서류 서명하기 (2건)' && (await cta.getAttribute('href')) === `/docs/${DOC}`, await cta.innerText().catch(() => ''))

  // ── 4. 누르면 그 서류 화면 ──
  await cta.click()
  await wk.waitForURL(`**/docs/${DOC}`, { timeout: 10000 }).catch(() => {})
  ok('누르면 서류 화면으로', new URL(wk.url()).pathname === `/docs/${DOC}`, wk.url())

  // ── 5. 다 서명하면 버튼이 사라지고 출퇴근 버튼이 다시 파랑 ──
  for (const id of [DOC, DOC2]) await rest(`signed_docs?id=eq.${id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await open()
  ok('모두 서명: 서명 버튼 없음 · 출퇴근 버튼 파랑', (await cta.count()) === 0 && ((await clockLink().getAttribute('class')) || '').includes('btn-primary'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
