// 묶음 123 (정기 개선 2026-11-07 14:35 · 이용 기록: 커뮤니티를 열고 2초 안에 나감 · 글 0개)
// · 글이 하나도 없으면 빈 화면 대신 '첫 글을 남겨 주세요 · 이런 글로 시작해 보세요' 세 줄
//   (현장 꿀팁 나누기 · 처음이라 궁금한 것 묻기 · 오늘 근무 이야기) → 누르면 분류·제목 첫머리가 채워진 글쓰기
// · 분류 탭이 비어 있으면 '첫 글 쓰기'가 그 분류로 · 회사 관리자도 글을 쓸 수 있어 같은 시작 줄이 보임
// node scripts/qa/batch123.cjs <default 앱> <default 가짜> <shots>
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
  ok('준비: 커뮤니티 글 0개', (await rest('community_posts')).length === 0)
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

  // ── 1. 근무자: 빈 커뮤니티 → 이런 글로 시작해 보세요 ──
  const w = await pg(W)
  await w.goto(`${D}/community`)
  const st = w.locator('[data-community-starters]')
  await st.waitFor({ timeout: 15000 }).catch(() => {})
  const items = await st.locator('[data-starter]').evaluateAll((els) => els.map((e) => ({ c: e.dataset.starter, t: e.innerText.replace(/\n/g, ' | '), href: e.getAttribute('href') })))
  ok("'첫 글을 남겨 주세요 · 이런 글로 시작해 보세요' 세 줄 (꿀팁 · 질문 · 오늘 근무)", items.map((i) => i.c).join() === 'tip,question,free' && items[0].t.includes('현장 꿀팁 나누기') && items[1].t.includes('처음이라 궁금한 것 묻기'), JSON.stringify(items))
  ok('줄마다 한 줄씩 · 360px 안', (await st.locator('[data-starter] span.block').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1))) && (await wide(w)))
  if (SHOTS) await st.screenshot({ path: `${SHOTS}/starters.png` }).catch(() => {})
  await st.locator('[data-starter=tip]').click()
  await w.waitForURL((u) => new URL(u).pathname === '/community/new', { timeout: 10000 }).catch(() => {})
  await w.locator('#post-title').waitFor({ timeout: 10000 }).catch(() => {})
  ok("누르면 글쓰기: 분류 '꿀팁' · 제목 '현장 꿀팁: '", (await w.locator('#post-title').inputValue()) === '현장 꿀팁: ' && (await w.locator('input[name=category][value=tip]').isChecked()))

  // ── 2. 분류 탭이 비어 있으면 그 분류로 첫 글 쓰기 ──
  await w.goto(`${D}/community?c=question`)
  await w.locator('main').waitFor()
  ok("'질문' 탭이 비면 '첫 글 쓰기'가 질문 글쓰기로", (await w.getByRole('link', { name: /첫 글 쓰기/ }).first().getAttribute('href').catch(() => '')) === '/community/new?c=question' && (await w.locator('[data-community-starters]').count()) === 0)

  // ── 3. 회사 관리자(글쓰기 가능): 같은 시작 줄 ──
  const a = await pg(A)
  await a.goto(`${D}/community`)
  await a.locator('[data-community-starters]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('관리자도 글을 쓸 수 있어 시작 줄 세 개', (await a.locator('[data-community-starters] [data-starter]').count()) === 3 && (await wide(a)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
