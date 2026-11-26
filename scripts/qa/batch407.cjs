// 묶음 407 (정기 개선 2026-11-27 01:36 KST)
// 디자인 · 놀이터 '내 배지' 칸: 진행 막대를 칸 맨 아래에 붙여 같은 줄의 막대 높이가 맞음
//   (설명이 한 줄인 칸 '서류 서명 5건'과 두 줄인 칸 '두 회사에서 일하기'가 한 줄에 있어도)
//   + 채운 부분은 열 때 왼쪽부터 짧게 차오름 (0.3초 · 움직임 줄이기면 바로)
// node scripts/qa/batch407.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, , SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const open = async (reduce) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    await p.goto(`${D}/community/play`, { waitUntil: 'networkidle' })
    await p.locator('[data-badges]').waitFor({ timeout: 15000 }).catch(() => {})
    return p
  }

  const p = await open(false)
  // 줄마다 (칸 윗선이 같은 것끼리) 막대 윗선이 같은지 · 설명 줄 수가 서로 다른 줄이 하나 이상 있는지(검사가 헛돌지 않게)
  const rows = await p.evaluate(() => {
    const out = new Map()
    for (const li of document.querySelectorAll('[data-badges] li[data-badge]')) {
      const bar = li.querySelector('[data-badge-bar]')
      if (!bar) continue
      const goal = li.querySelector('span.text-balance')
      const lh = parseFloat(getComputedStyle(goal).lineHeight) || 14
      const top = Math.round(li.getBoundingClientRect().top)
      const r = out.get(top) ?? []
      r.push({ key: li.dataset.badge, bar: Math.round(bar.getBoundingClientRect().top), lines: Math.round(goal.getBoundingClientRect().height / lh) })
      out.set(top, r)
    }
    return [...out.values()].filter((r) => r.length > 1)
  })
  const mixed = rows.filter((r) => new Set(r.map((x) => x.lines)).size > 1)
  ok('준비: 설명이 한 줄·두 줄 섞인 배지 줄이 있음', mixed.length > 0, JSON.stringify(rows.map((r) => r.map((x) => `${x.key}:${x.lines}`))))
  const bad = rows.filter((r) => Math.max(...r.map((x) => x.bar)) - Math.min(...r.map((x) => x.bar)) > 1)
  ok('같은 줄의 진행 막대 높이가 맞음 (1px 안)', rows.length > 0 && bad.length === 0, JSON.stringify(bad.map((r) => r.map((x) => `${x.key}@${x.bar}`))))
  const fill = p.locator('[data-badge-bar] span span').first()
  ok('채운 부분은 왼쪽부터 차오름 (grow · 0.3초)', await fill.evaluate((el) => { const s = getComputedStyle(el); return s.animationName === 'grow' && s.animationDuration === '0.3s' && s.transformOrigin.startsWith('0px') }).catch(() => false))
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) {
    const grid = p.locator('[data-badges] ul').first()
    await grid.scrollIntoViewIfNeeded()
    await p.waitForTimeout(500)
    await grid.screenshot({ path: `${SHOTS}/badges.png` }).catch(() => {})
  }

  // 움직임 줄이기: 막대는 바로 다 그려짐 (애니메이션 사실상 없음)
  const r = await open(true)
  ok('움직임 줄이기: 막대 애니메이션 없음', await r.locator('[data-badge-bar] span span').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) < 0.01).catch(() => false))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
