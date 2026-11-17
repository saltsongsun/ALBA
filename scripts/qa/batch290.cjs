// 묶음 290 (사용자 요청 2026-11-17 "좁을 때 글자가 많으면 넘치는 경우가 많아서 해당 부분 수정해줘")
// · 태블릿처럼 좁은 넓은 화면(640~1023px)에서도 표 대신 휴대폰과 같은 카드: 홈 확정 대기 지원자 · 공고 목록 · 근무자 명단 · 지원자 탭
//   (전엔 640px부터 표라 공고 이름이 낱말마다 꺾이고, 명단은 오른쪽 칸이 잘렸음)
// · 1024px부터 표 · 표의 연락처 칸은 번호 한 줄 + 그 아래 전화·문자 나란히 (제각각 꺾여 줄이 높아지지 않게)
// node scripts/qa/batch290.cjs <default 앱> <default 가짜> <shots>
const { chromium } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const PAGES = [
  ['홈 확정 대기', '/admin'],
  ['공고 목록', '/admin/jobs'],
  ['근무자 명단', '/admin/workers'],
  ['지원자 탭', `/admin/jobs/${J}?tab=apps`],
]

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const at = async (width) => {
    const ctx = await b.newContext({ viewport: { width, height: 1000 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 태블릿(768 · 1000px): 표 없이 카드 · 옆으로 안 밀림
  for (const w of [768, 1000]) {
    const p = await at(w)
    for (const [name, path] of PAGES) {
      await p.goto(D + path, { waitUntil: 'networkidle' })
      // 지원자 탭은 목록을 조금 늦게 그림
      if (path.includes('tab=apps')) await p.locator('[data-app-list]').waitFor({ timeout: 15000 }).catch(() => {})
      const tables = await p.locator('main table').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length)
      const cards = await p.locator('main .lg\\:hidden').evaluateAll((els) => els.filter((e) => e.offsetParent !== null && e.children.length > 0).length)
      ok(`${w}px ${name}: 표 대신 카드 · 옆으로 안 밀림`, tables === 0 && cards >= 1 && (await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)), `표 ${tables} · 카드 묶음 ${cards}`)
      if (SHOTS && w === 768) await p.screenshot({ path: `${SHOTS}/${w}-${path.split('/')[2] || 'dash'}${path.includes('apps') ? '-apps' : ''}.png` }).catch(() => {})
    }
  }

  // ── 2. 1024px: 표 · 표가 틀 안에 들어감 · 연락처는 번호 한 줄 + 전화·문자 나란히
  const p = await at(1024)
  for (const [name, path] of PAGES) {
    await p.goto(D + path, { waitUntil: 'networkidle' })
    await p.locator('main table').first().waitFor({ timeout: 15000 }).catch(() => {})
    const t = await p.locator('main table').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({ over: e.parentElement.scrollWidth > e.parentElement.clientWidth + 1 })))
    ok(`1024px ${name}: 표 · 틀 안에 들어감 (옆으로 넘치지 않음)`, t.length === 1 && !t[0].over, JSON.stringify(t))
    if (name !== '공고 목록') {
      const row = await p.locator('main table [data-contact-stack]').first().evaluate((el) => {
        const [num, btns] = el.children
        const [call, sms] = btns.querySelectorAll('a')
        return { numOneLine: num.getClientRects().length === 1 && num.getBoundingClientRect().height < 24, sameRow: Math.abs(call.getBoundingClientRect().top - sms.getBoundingClientRect().top) < 2, below: call.getBoundingClientRect().top >= num.getBoundingClientRect().bottom - 1 }
      }).catch(() => null)
      ok(`1024px ${name}: 연락처 번호 한 줄 · 그 아래 전화·문자 나란히`, !!row && row.numOneLine && row.sameRow && row.below, JSON.stringify(row))
    }
    if (SHOTS) await p.locator('main table').first().screenshot({ path: `${SHOTS}/1024-${path.split('/')[2] || 'dash'}${path.includes('apps') ? '-apps' : ''}.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
