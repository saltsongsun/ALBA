// 묶음 3: 공고 목록 '🆕 새 공고' (이 휴대폰에서 지난번에 본 뒤로 새로 올라온 공고) + 관리자 대시보드 숫자 0→N 올라가기 · 360px
// node scripts/qa/ux-batch3.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000000a2'
const KEY = 'hw-jobs-seen-at'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 방금 올라온 공고 하나 (기존 공고는 10월에 올라옴)
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, title: '방금 올라온 매표소 안내', created_at: new Date().toISOString(), applications: [], required_docs: [] })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const card = (t) => p.locator('#jobs ~ .stagger a.card-link', { hasText: t })

  // ── 1. 새 공고 ──
  await p.goto(`${D}/`)
  await card('방금 올라온 매표소 안내').waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(400)
  ok('처음 온 사람: 새 공고 표시 없음 (전부 새 것이라 의미 없음)', (await p.locator('[data-new-job], [data-new-jobs]').count()) === 0)
  ok('본 때를 이 휴대폰에 저장', Number(await p.evaluate((k) => localStorage.getItem(k), KEY)) > 0)
  // 한 시간 전에 마지막으로 봤다고 치고 다시 열기
  await p.evaluate((k) => localStorage.setItem(k, String(Date.now() - 3600e3)), KEY)
  await p.reload()
  await card('방금 올라온 매표소 안내').waitFor({ timeout: 10000 }).catch(() => {})
  await p.locator('[data-new-jobs]').waitFor({ timeout: 3000 }).catch(() => {})
  ok('지난번 이후 새 공고 1개', (await p.locator('[data-new-jobs]').innerText().catch(() => '')).includes('새 공고 1개'))
  ok('새로 올라온 공고 카드: 🆕 새 공고', (await card('방금 올라온 매표소 안내').locator('[data-new-job]').count()) === 1)
  ok('예전 공고 카드: 표시 없음', (await card('행사장 안내 스태프').locator('[data-new-job]').count()) === 0)
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 앱 안에서 다른 화면에 갔다 와도 같은 기준 (보는 도중 표시가 사라지지 않게)
  await p.locator('nav[data-bottom-nav] a[href="/me"]').click()
  await p.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 8000 }).catch(() => {})
  await p.locator('nav[data-bottom-nav] a[href="/"]').click()
  await card('방금 올라온 매표소 안내').waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(400)
  ok('앱 안에서 오가도 표시 유지', (await card('방금 올라온 매표소 안내').locator('[data-new-job]').count()) === 1)
  // 다음에 앱을 새로 열면 이미 본 공고라 표시 없음
  await p.reload()
  await card('방금 올라온 매표소 안내').waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(400)
  ok('다음에 새로 열면: 이미 본 공고라 표시 없음', (await p.locator('[data-new-job], [data-new-jobs]').count()) === 0)

  // ── 2. 대시보드 숫자 0 → N ──
  const seen = async (reduce) => {
    const c = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await c.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    // 숫자 칸에 보인 값을 모두 기록
    await c.addInitScript(() => {
      window.__nums = []
      new MutationObserver((ms) => {
        for (const m of ms) {
          const el = m.target.nodeType === 3 ? m.target.parentElement : m.target
          if (el?.dataset?.value !== undefined) window.__nums.push([el.dataset.value, el.textContent])
        }
      }).observe(document, { subtree: true, childList: true, characterData: true })
    })
    const ap = await c.newPage()
    ap.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    await ap.goto(`${D}/admin`)
    await ap.waitForTimeout(1500)
    const finals = await ap.locator('a.card-link [data-value]').evaluateAll((l) => l.map((e) => [e.dataset.value, e.textContent]))
    const log = await ap.evaluate(() => window.__nums)
    await c.close()
    return { finals, log }
  }
  const r1 = await seen(false)
  const big = r1.finals.filter(([v]) => Number(v) >= 2)
  ok('대시보드: 끝나면 실제 숫자', r1.finals.length >= 4 && r1.finals.every(([v, t]) => t === Number(v).toLocaleString('ko-KR')), JSON.stringify(r1.finals))
  ok('대시보드: 2 이상인 숫자는 0부터 올라감', big.length === 0 || big.every(([v]) => r1.log.some(([lv, t]) => lv === v && Number(t.replace(/,/g, '')) < Number(v))), JSON.stringify(r1.log.slice(0, 12)))
  const r2 = await seen(true)
  ok('움직임 줄이기 설정: 바로 실제 숫자 (올라가지 않음)', r2.log.every(([v, t]) => t === Number(v).toLocaleString('ko-KR')), JSON.stringify(r2.log.slice(0, 6)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
