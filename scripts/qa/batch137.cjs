// 묶음 137 (정기 개선 2026-11-08 09:35)
// · 관리자 목록 검색 칸(근무자·공고·문의·서류): 쓰는 대로 잠깐 멈추면 바로 찾음 ('찾기'를 매번 안 눌러도 됨)
//   커서는 칸에 그대로 · 같은 양식의 다른 칸(탭·선택)도 함께 · 지우면 전체로
// node scripts/qa/batch137.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const q = () => new URL(a.url()).searchParams.get('q')

  // ── 1. 근무자 명단 ──
  await a.goto(`${D}/admin/workers`)
  const box = a.locator('input[name=q][data-live-search]')
  await box.waitFor({ timeout: 15000 })
  ok('준비: 근무자 2명', (await a.locator('h1').innerText()).includes('2명'))
  await box.click()
  await box.pressSequentially('김지', { delay: 40 })
  await a.waitForURL((u) => new URL(u).searchParams.get('q') === '김지', { timeout: 6000 }).catch(() => {})
  await a.locator('h1', { hasText: '1명' }).waitFor({ timeout: 6000 }).catch(() => {})
  ok("'김지'를 쓰고 멈추면 '찾기' 없이 바로: 주소 ?q=김지 · 1명", q() === '김지' && (await a.locator('h1').innerText()).includes('1명'), `${q()} / ${await a.locator('h1').innerText()}`)
  ok('커서는 검색 칸에 그대로', await box.evaluate((el) => document.activeElement === el))
  await box.fill('')
  await a.waitForURL((u) => !new URL(u).searchParams.get('q'), { timeout: 6000 }).catch(() => {})
  await a.locator('h1', { hasText: '2명' }).waitFor({ timeout: 6000 }).catch(() => {})
  ok('지우면 전체로 (2명)', !q() && (await a.locator('h1').innerText()).includes('2명'))
  ok('360px: 옆으로 안 밀림 (근무자)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 공고 목록: 숨은 탭 값도 함께 ──
  await a.goto(`${D}/admin/jobs?tab=past`)
  const jb = a.locator('input[name=q][data-live-search]')
  await jb.waitFor({ timeout: 15000 })
  await jb.click()
  await jb.pressSequentially('생활체육', { delay: 40 })
  await a.waitForURL((u) => new URL(u).searchParams.get('q') === '생활체육', { timeout: 6000 }).catch(() => {})
  const tabNow = await a.locator('form[role=search] input[name=tab]').inputValue().catch(() => '')
  ok("공고: 쓰는 대로 ?q=생활체육 · 보던 탭도 그대로", q() === '생활체육' && !!tabNow && new URL(a.url()).searchParams.get('tab') === tabNow, `${a.url()} / ${tabNow}`)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/jobs-live-search.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
