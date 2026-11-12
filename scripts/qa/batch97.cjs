// 묶음 97: 정기 개선 — 서명이 먼저 (근무자 휴대폰)
// · 오늘 근무에 서명 안 한 서류가 있으면 홈 맨 위 카드가 '출퇴근 전 서명이 남았어요 · 서명 →' (누르면 그 서류)
// · 확정된 공고 화면: 진행 칸이 화면 아래쪽이라 안 보이면 아래 바 '서류 n건 서명이 남았어요 · 서명하기' (진행 칸이 보이면 숨음)
// · 서명하면 카드는 다시 '출퇴근 →' · 아래 바 없음
// node scripts/qa/batch97.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 저녁(18시 뒤)에 돌려도 같은 결과: 가짜 공고(오늘 9~18시)를 오늘 23:59까지로 — 종료 시각이 지나면 홈 카드가 '근무 종료를 아직 안 눌렀어요'로 바뀌어서
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  const docs = (await rest(`signed_docs?user_id=eq.${W}`)).filter((d) => d.status === 'pending' && d.job_id === J)
  const docId = docs[0]?.id
  ok('준비: 오늘 근무에 서명 안 한 서류', !!docId)
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const hero = w.locator('[data-today-hero]')

  // ── 1. 홈 카드: 서명이 먼저 ──
  await w.goto(`${D}/`)
  await hero.waitFor({ timeout: 10000 }).catch(() => {})
  // (가짜 데이터의 근무자는 이미 출근해 있어서 '근무 중 · 서명이 남았어요' — 출근 전이면 '출퇴근 전 서명이 남았어요' · 묶음 118)
  ok("홈 카드: '… 서명이 남았어요' + '서명 →'", (await hero.getAttribute('data-today-sign')) === '' && (await hero.innerText()).includes('서명이 남았어요') && (await hero.innerText()).includes('서명 →'))
  ok('카드 제목 한 줄 (360px)', await hero.locator('span.block').first().evaluate((el) => el.getBoundingClientRect().height < 26))
  ok('누르면 그 서류로', (await hero.getAttribute('href')) === `/docs/${docId}`)
  ok('360px: 옆으로 안 밀림 (홈)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 공고 화면: 아래 바 ──
  await w.goto(`${D}/jobs/${J}`)
  await w.locator('main').waitFor()
  await w.waitForTimeout(600)
  const bar = w.getByRole('link', { name: '서명하기', exact: true })
  ok("아래 바 '서류 1건 서명이 남았어요 · 서명하기'", (await bar.isVisible().catch(() => false)) && (await w.getByText('서류 1건 서명이 남았어요').isVisible()) && (await bar.getAttribute('href')) === `/docs/${docId}`)
  const nav = await w.locator('nav[data-bottom-nav]').boundingBox()
  const bb = await bar.boundingBox()
  ok('아래 바는 아래 탭 위에', !!nav && !!bb && bb.y + bb.height <= nav.y + 1, JSON.stringify({ bar: bb && Math.round(bb.y + bb.height), nav: nav && Math.round(nav.y) }))
  await w.locator('[data-sign-cta]').scrollIntoViewIfNeeded()
  await w.waitForTimeout(700)
  ok('진행 칸이 보이면 아래 바는 숨음', (await bar.count()) === 0)
  ok('360px: 옆으로 안 밀림 (공고)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 서명하면 다시 '출퇴근 →' · 아래 바 없음 ──
  await rest(`signed_docs?id=eq.${docId}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await w.goto(`${D}/`)
  await hero.waitFor({ timeout: 10000 }).catch(() => {})
  ok("서명 뒤 홈 카드: '출퇴근 →' (내 근무로)", (await hero.getAttribute('data-today-sign')) === null && (await hero.innerText()).includes('출퇴근 →') && (await hero.getAttribute('href')) === '/me')
  await w.goto(`${D}/jobs/${J}`)
  await w.locator('main').waitFor()
  await w.waitForTimeout(600)
  ok('서명 뒤 공고 화면: 서명 아래 바 없음', (await w.getByRole('link', { name: '서명하기', exact: true }).count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
