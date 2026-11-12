// 묶음 147 (정기 개선 2026-11-08 21:35)
// · 공고 화면 '단톡방 모집 문구'는 모집 중일 때만 (마감·종료·취소·지난 행사면 숨김 → 끝난 공고를 다시 올리는 실수 막기 · 화면 짧게)
//   숨기면 PC에서 빈 오른쪽 칸 없이 위 카드가 넓게
// · 서류의 전화번호를 보기 좋게: 서울 '0212345678' → 02-1234-5678 (예전엔 021-234-5678로 잘못 보임)
// node scripts/qa/batch147.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  // 저녁(18시 뒤)에 돌려도 같은 결과: 가짜 공고(오늘 9~18시)를 오늘 23:59까지로 — 근무 시간이 지나면 모집 문구 칸이 숨겨져서
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts) => {
    const ctx = await b.newContext({ locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A, { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } })
  const card = a.locator('[data-recruit-text]')
  const [j] = await rest(`jobs?id=eq.${J}`)

  // ── 1. 모집 중: 문구 칸 있음
  await a.goto(`${D}/admin/jobs/${J}`)
  await a.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('모집 중: 단톡방 모집 문구 칸', (await card.count()) === 1)
  // ── 2. 마감: 숨김
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'closed' })
  await a.reload()
  await a.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('모집 마감: 문구 칸 없음', (await card.count()) === 0)
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // PC: 오른쪽 빈 칸 없이 위 카드가 넓게
  const pc = await mk(A, { viewport: { width: 1280, height: 900 } })
  await pc.goto(`${D}/admin/jobs/${J}`)
  await pc.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  const wide = await pc.locator('[data-job-tabs]').evaluate((tabs) => {
    const grid = tabs.parentElement.querySelector(':scope > div.grid')
    const first = grid?.firstElementChild?.getBoundingClientRect()
    return first ? first.width / grid.getBoundingClientRect().width : 0
  })
  ok('PC: 마감이면 위 카드가 줄 전체 폭', wide > 0.95, String(wide))
  // ── 3. 다시 모집 중이어도 지난 행사면 숨김
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'open', start_date: kst(Date.now() - 3 * 864e5), end_date: kst(Date.now() - 2 * 864e5) })
  await a.reload()
  await a.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('지난 행사: 문구 칸 없음', (await card.count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: j.status, start_date: j.start_date, end_date: j.end_date })
  await a.reload()
  await a.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('되돌리면 다시 보임', (await card.count()) === 1)

  // ── 4. 서류의 전화번호 모양 (회사 0212345678 → 02-1234-5678 · 근무자 010-3333-4444)
  const w = await mk(W, { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } })
  await w.goto(`${D}/docs/${DOC}`)
  await w.getByText('전화:').first().waitFor({ timeout: 15000 }).catch(() => {})
  const body = await w.locator('main').innerText()
  ok("회사 전화 '02-1234-5678' (021-234-5678 아님)", body.includes('전화: 02-1234-5678') && !body.includes('021-234-5678'), (body.match(/전화: [^\n]+/) || [''])[0])
  ok("근무자 연락처 '010-3333-4444'", body.includes('연락처: 010-3333-4444'))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
