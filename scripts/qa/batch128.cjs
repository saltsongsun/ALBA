// 묶음 128 (정기 개선 2026-11-07 23:35)
// · 서류(서명) 화면을 여는 동안 빈 화면 대신 서류 종이·서명란 모양 자리 (DocSkeleton)
// · 외주 업체 계좌 칸도 '국민 123456-01-123456'을 붙여 넣으면 은행은 고르고 계좌번호만 (묶음 127과 같게)
// node scripts/qa/batch128.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 서류 화면 불러오는 동안 서류 모양 자리 ──
  const doc = (await rest(`signed_docs?user_id=eq.${W}`)).find((d) => d.status === 'pending' && d.job_id === J)
  ok('준비: 서명할 서류', !!doc)
  const w = await pg(W)
  await w.goto(`${D}/me`)
  await w.locator('main').waitFor()
  // 서류 화면 응답을 잠깐 늦춰서 불러오는 동안의 화면을 봄 (RSC 요청만)
  // (미리 받기 요청은 그대로 두어 '불러오는 중' 모양을 먼저 받게 하고, 실제 화면 요청만 늦춤)
  await w.route((u) => u.pathname === `/docs/${doc.id}`, async (route) => {
    if (!route.request().headers()['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })
  // 내 근무의 서명 카드 링크를 눌러 앱 안에서 이동
  const link = w.locator(`a[href="/docs/${doc.id}"]`).first()
  await link.waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForTimeout(1200)
  await link.click()
  const sk = w.locator('[data-skeleton="doc"]')
  const seen = await sk.waitFor({ timeout: 3000 }).then(() => true, () => false)
  ok('여는 동안: 서류 종이·서명란 모양 자리', seen)
  if (seen && SHOTS) await w.screenshot({ path: `${SHOTS}/doc-skeleton.png` }).catch(() => {})
  if (seen) ok('360px: 옆으로 안 밀림 (서류 자리)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await w.locator('[data-sign-pad]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('다 열리면 진짜 서명란', (await w.locator('[data-sign-pad]').count()) === 1 && (await sk.count()) === 0)

  // ── 2. 외주 업체 계좌 칸 붙여 넣기 ──
  const a = await pg(A)
  await a.goto(`${D}/admin/vendors?tab=list`)
  const f = a.locator('form', { hasText: '외주사 등록' })
  await f.locator('input[name=bank_account]').waitFor({ timeout: 15000 }).catch(() => {})
  await f.locator('input[name=bank_account]').evaluate((el, t) => { el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }, '국민 123456-01-123456 홍길동')
  await a.waitForTimeout(200)
  const v = await f.evaluate((form) => ({ bank: form.querySelector('select[name=bank_name]').value, acct: form.querySelector('input[name=bank_account]').value }))
  ok("외주 업체: '국민 123456-01-123456 홍길동' → KB국민은행 · 123456-01-123456", v.bank === 'KB국민은행' && v.acct === '123456-01-123456', JSON.stringify(v))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
