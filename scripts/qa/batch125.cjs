// 묶음 125 (정기 개선 2026-11-07 18:35 · 이용 기록: 문의 대화 안에서 아래 '문의' 탭을 여러 번 누름 · 지난 근무 카드 글자를 여러 번 누름)
// · 한 회사와의 대화(/me/chat?co=…)를 보다가 아래 '문의' 탭을 누르면 대화 목록으로 (목록에서 또 누르면 그대로 맨 위로)
// · 지난 근무 카드 제목을 누르면 그 공고로 (제목 옆 ›)
// node scripts/qa/batch125.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const tab = () => w.locator('nav[data-bottom-nav] a[href="/me/chat"]')

  // ── 1. 대화 안에서 '문의' 탭 → 대화 목록 ──
  await w.goto(`${D}/me/chat`)
  await w.locator('[data-chat-list]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('준비: 문의 탭은 대화 목록부터 (회사 문의 + 단체방)', (await w.locator('[data-chat-list]').count()) === 1)
  await w.goto(`${D}/me/chat?co=${C}`)
  await w.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('준비: 회사와의 대화 화면', (await w.locator('[data-chat-list]').count()) === 0 && new URL(w.url()).search.includes('co='))
  await tab().click()
  await w.waitForURL((u) => new URL(u).pathname === '/me/chat' && !new URL(u).search, { timeout: 10000 }).catch(() => {})
  await w.locator('[data-chat-list]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("대화 안에서 '문의' 탭을 누르면 대화 목록으로", !new URL(w.url()).search && (await w.locator('[data-chat-list]').count()) === 1, w.url())
  // 목록에서 또 누르면 그대로 (맨 위로만)
  await w.evaluate(() => window.scrollTo(0, 200))
  await tab().click()
  await w.waitForTimeout(800)
  ok('목록에서 또 누르면 그대로 · 맨 위로', new URL(w.url()).pathname === '/me/chat' && !new URL(w.url()).search && (await w.evaluate(() => scrollY)) === 0)

  // ── 2. 지난 근무 제목 → 공고 ──
  await w.goto(`${D}/me/history`)
  const title = w.locator(`[data-history-job="${J}"] [data-history-title]`)
  await title.waitFor({ timeout: 15000 }).catch(() => {})
  ok('지난 근무 제목이 공고 링크 (제목 옆 ›)', (await title.getAttribute('href').catch(() => '')) === `/jobs/${J}` && (await title.innerText().catch(() => '')).trim().endsWith('›'))
  ok('360px: 옆으로 안 밀림 (지난 근무)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await w.locator(`[data-history-job="${J}"]`).screenshot({ path: `${SHOTS}/history-title.png` }).catch(() => {})
  await title.click()
  await w.waitForURL((u) => new URL(u).pathname === `/jobs/${J}`, { timeout: 10000 }).catch(() => {})
  ok('누르면 공고 화면', new URL(w.url()).pathname === `/jobs/${J}`, w.url())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
