// 묶음 82: 정산 표를 휴대폰에서 옆으로 밀어도 이름 칸은 왼쪽에 고정 (누구 금액인지 헷갈리지 않게)
// · 공고 정산 탭: '이름은 그대로 두고 옆으로 밀면 공제·계좌·지급이 보여요 →' 안내 · 밀어도 이름 칸이 왼쪽에 · '합계 n명' 한 줄
// · 정산·신고자료: 근무자별 합계 표도 성명 칸 고정 · 360px 화면은 옆으로 안 밀림
// node scripts/qa/batch82.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // 표 안에서 옆으로 밀고, 첫 칸이 여전히 표 왼쪽에 붙어 있는지
  const pinned = async (box) => {
    const r = await box.evaluate(async (el) => {
      const before = el.querySelector('tbody td').getBoundingClientRect().left
      el.scrollLeft = 260
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
      const after = el.querySelector('tbody td').getBoundingClientRect().left
      const third = el.querySelector('tbody td:nth-child(3)').getBoundingClientRect().left
      return { wide: el.scrollWidth > el.clientWidth + 20, scrolled: el.scrollLeft, before: Math.round(before), after: Math.round(after), boxLeft: Math.round(el.getBoundingClientRect().left), third: Math.round(third) }
    })
    return r
  }

  // ── 1. 공고 정산 탭 ──
  await p.goto(`${D}/admin/jobs/${J}?tab=pay`)
  const box = p.locator('[data-pay-table]')
  await box.waitFor({ timeout: 10000 }).catch(() => {})
  ok("안내: '이름은 그대로 두고 옆으로 밀면 …'", (await p.locator('[data-swipe-hint]').isVisible()) && (await p.locator('[data-swipe-hint]').innerText()).includes('옆으로 밀면'))
  const r1 = await pinned(box)
  ok('옆으로 밀어도 이름 칸은 왼쪽에 고정', r1.wide && r1.scrolled > 100 && Math.abs(r1.after - r1.boxLeft) <= 2 && r1.third < r1.before + 200, JSON.stringify(r1))
  const total = box.locator('tbody tr').last().locator('td').first()
  ok("'합계 n명' 한 줄", (await total.evaluate((el) => el.getBoundingClientRect().height)) < 48 && /합계 \d+명/.test(await total.innerText()))
  ok('360px: 화면은 옆으로 안 밀림 (정산 탭)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 정산·신고자료 ──
  await p.goto(`${D}/admin/reports`)
  const box2 = p.locator('[data-report-table]')
  await box2.waitFor({ timeout: 10000 }).catch(() => {})
  if ((await box2.locator('tbody td').count()) > 0) {
    const r2 = await pinned(box2)
    ok('신고자료 표도 성명 칸 고정', r2.wide && Math.abs(r2.after - r2.boxLeft) <= 2, JSON.stringify(r2))
  } else ok('(이 달 근무 기록 없음: 표 없음)', true)
  ok('360px: 화면은 옆으로 안 밀림 (신고자료)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 어두운 화면: 고정 칸 바탕이 카드 색 (밝은 흰 칸이 튀지 않게) ──
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  const bg = await box2.locator('tbody td').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
  ok('어두운 화면: 고정 칸 바탕도 어둡게', !bg || !/rgb\(255, 255, 255\)/.test(bg), bg)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
