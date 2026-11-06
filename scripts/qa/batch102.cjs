// 묶음 102: 정기 개선 — 모집 인원 실수 막기 · 짧은 마지막 줄 없애기
// · 공고 수정: 모집 인원 아래 '지금 확정 n명' · 그보다 적게 고치면 바로 '확정 n명보다 적어요 / 확정은 그대로예요' (주황 테두리)
// · 새 공고(확정 없음)에는 안내 없음
// · 카드의 공고 제목(h3)·체크 문구(label)도 마지막 줄에 한 단어만 남지 않게 (text-wrap balance·pretty)
// node scripts/qa/batch102.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
// 마지막 줄 글자 수 (공백 빼고)
const lastLine = (loc) =>
  loc.evaluate((el) => {
    const tops = []
    const chars = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      for (let i = 0; i < n.textContent.length; i++) {
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1)
        const c = r.getClientRects()[0]
        if (c) { tops.push(Math.round(c.top)); chars.push([Math.round(c.top), n.textContent[i]]) }
      }
    }
    const lines = [...new Set(tops)].sort((a, b) => a - b)
    const last = lines.at(-1)
    return { lines: lines.length, last: chars.filter(([t]) => t >= last - 2).map(([, c]) => c).join('').trim() }
  })

;(async () => {
  // 준비: 확정 2명 (근무자 + 김지원)
  await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`, 'PATCH', { status: 'approved', held_at: null })
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
  const a = await pg(A)

  // ── 1. 공고 수정: 모집 인원 ──
  await a.goto(`${D}/admin/jobs/${J}/edit`)
  const hc = a.locator('input[name=headcount]')
  await hc.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {})
  if (!(await hc.isVisible())) await a.getByText(/일정 · 인원|일정·인원|모집 인원/).first().click().catch(() => {})
  await hc.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("모집 인원 아래 '지금 확정 2명'", (await a.locator('[data-headcount-hint]').innerText().catch(() => '')).includes('지금 확정 2명'))
  await hc.fill('1')
  await a.waitForTimeout(300)
  ok("확정보다 적게 고치면 '확정 2명보다 적어요 / 확정은 그대로예요'", /확정 2명보다 적어요\s*확정은 그대로예요/.test(await a.locator('[data-headcount-warn]').innerText().catch(() => '')))
  ok('안내 두 줄 각 한 줄 (360px)', await a.locator('[data-headcount-warn] b, [data-headcount-warn] span').evaluateAll((els) => els.length === 2 && els.every((e) => e.getBoundingClientRect().height < 20)).catch(() => false))
  await hc.fill('5')
  await a.waitForTimeout(300)
  ok('다시 늘리면 안내 사라짐', (await a.locator('[data-headcount-warn]').count()) === 0 && (await a.locator('[data-headcount-hint]').count()) === 1)

  // ── 2. 체크 문구 마지막 줄 ──
  const notify = a.locator('label', { hasText: '확정자·지원자에게 알리기' }).first()
  if (await notify.count()) {
    const r = await lastLine(notify)
    ok(`공고 수정 체크 문구: 마지막 줄이 한 단어만 남지 않음 (${JSON.stringify(r)})`, r.lines === 1 || r.last.replace(/\s/g, '').length > 3)
  } else ok('(알리기 체크 문구 없음 · 건너뜀)', true)

  // ── 3. 새 공고: 안내 없음 ──
  await a.goto(`${D}/admin/jobs/new`)
  await a.locator('form').first().waitFor().catch(() => {})
  ok('새 공고: 확정 안내 없음', (await a.locator('[data-headcount-hint], [data-headcount-warn]').count()) === 0)

  // ── 4. 근무자 화면 카드 제목 ──
  const w = await pg(W)
  await w.goto(`${D}/me`)
  await w.locator('main').waitFor()
  await w.waitForTimeout(800)
  const titles = w.locator('main h3')
  const n = await titles.count()
  let worst = null
  for (let i = 0; i < n; i++) {
    const r = await lastLine(titles.nth(i))
    if (r.lines > 1 && r.last.replace(/\s/g, '').length <= 3) worst = r
  }
  ok('내 근무: 카드 제목 마지막 줄에 한 단어만 남지 않음', worst === null, JSON.stringify(worst))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
