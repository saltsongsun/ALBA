// 묶음 208 (정기 개선 2026-11-12 04:36 KST)
// · 서류 서명 화면(근무자): 맨 위에 어느 회사 · 어느 공고 서류인지 한 줄 ('🏢 주식회사 테스트 · 공고 이름')
//   - 여러 회사 서류가 모두 '근로계약서'여도 서명 전에 바로 알게 · 긴 이름은 한 줄로 줄임 · 서명한 서류도 같게
//   - 관리자가 볼 때는 없음 (이미 그 회사 화면)
// · 서명할 서류가 여러 건이면: '서명 대기' 배지에서 'n/m'을 빼고 아래 진행 막대에만 (같은 숫자를 두 번 보이지 않게)
//   - 지금 서류 칸은 열 때 왼쪽부터 짧게 차오름 (0.3초 · 동작 줄이기면 바로)
// node scripts/qa/batch208.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000208'
const J2 = 'cccccccc-0000-4000-8000-0000000002c8', DOC2 = 'dddddddd-0000-4000-8000-0000000002d8', APP2 = '11111111-0000-4000-8000-0000000002a8'
const LONG = '주식회사 아주아주 이름이 긴 행사 기획 운영 대행사'
const J2T = '가을 축제 주차 안내 및 관람객 동선 정리 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const line = (p) => p.locator('[data-doc-for]')
  const badge = (p) => p.locator('.badge', { hasText: '서명 대기' }).first()
  const [j1] = await rest(`jobs?id=eq.${J}`)

  // ── 1. 서류 한 건: 어느 회사 · 어느 공고 서류인지
  const w = await pg(W)
  await w.goto(`${D}/docs/${DOC}`, { waitUntil: 'networkidle' })
  await line(w).waitFor({ timeout: 15000 }).catch(() => {})
  ok("맨 위 한 줄: '주식회사 테스트 · 공고 이름'", one(await line(w).innerText().catch(() => '')) === `주식회사 테스트 · ${j1.title}`, one(await line(w).innerText().catch(() => '')))
  ok('회사 이름은 굵게 · 건물 아이콘', (await line(w).locator('b').innerText()) === '주식회사 테스트' && (await line(w).locator('svg').count()) === 1)
  ok("배지는 '서명 대기' 하나 (한 건이면 진행 막대 없음)", one(await badge(w).innerText()) === '서명 대기' && (await w.locator('[data-doc-step]').count()) === 0)
  ok('한 줄 · 360px 옆으로 안 밀림', (await line(w).evaluate((el) => el.getBoundingClientRect().height < 26)) && (await noSide(w)))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/doc-for.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})

  // ── 2. 다른 회사 서류가 하나 더 (같은 이름 '근로계약서', 회사 이름·공고 이름이 김)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: LONG, seal_image: null })
  const j2 = { ...j1, id: J2, company_id: C2, company: { company_name: LONG }, title: J2T, start_date: kst(2), end_date: kst(2), applications: [], required_docs: [] }
  await rest('jobs', 'POST', j2)
  const [a1] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...a1, id: APP2, job_id: J2, company_id: C2, status: 'approved', position: null, available_dates: null, job: j2 })
  const [d1] = await rest(`signed_docs?id=eq.${DOC}`)
  await rest('signed_docs', 'POST', { ...d1, id: DOC2, job_id: J2, company_id: C2, created_at: new Date().toISOString() })

  await w.goto(`${D}/docs/${DOC}`, { waitUntil: 'networkidle' })
  await w.locator('[data-doc-step]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("두 건: 진행 막대 '서명할 서류 1/2' · 배지는 '서명 대기'만 (숫자를 두 번 안 보임)", (await w.getByText('서명할 서류 1/2').count()) === 1 && one(await badge(w).innerText()) === '서명 대기')
  const now = w.locator('[data-doc-step=now]')
  const anim = await now.evaluate((el) => { const s = getComputedStyle(el); return { name: s.animationName, dur: s.animationDuration, origin: s.transformOrigin } })
  ok('지금 서류 칸: 왼쪽부터 짧게 차오름 (grow · 0.3초)', anim.name === 'grow' && anim.dur === '0.3s' && anim.origin.startsWith('0px'), JSON.stringify(anim))
  ok('칸 상태: 지금 · 다음', JSON.stringify(await w.locator('[data-doc-step]').evaluateAll((l) => l.map((e) => e.dataset.docStep))) === '["now","next"]')

  await w.goto(`${D}/docs/${DOC2}`, { waitUntil: 'networkidle' })
  await line(w).waitFor({ timeout: 15000 }).catch(() => {})
  ok('다른 회사 서류: 그 회사 · 그 공고 이름으로', one(await line(w).innerText().catch(() => '')) === `${LONG} · ${J2T}`, one(await line(w).innerText().catch(() => '')))
  await w.waitForTimeout(400)
  ok('긴 이름: 한 줄 · 회사 이름은 줄임(…) · 공고 이름도 조금은 보임 · 화면 안 · 옆으로 안 밀림', (await line(w).evaluate((el) => { const c = el.querySelector('b'); const j = el.lastElementChild; const r = el.getBoundingClientRect(); return r.height < 26 && r.right <= innerWidth - 8 && getComputedStyle(c).textOverflow === 'ellipsis' && c.scrollWidth > c.clientWidth && getComputedStyle(j).textOverflow === 'ellipsis' && j.getBoundingClientRect().width > 60 })) && (await noSide(w)))
  // 순서는 '지금 연 서류의 공고 먼저' (같은 공고 서류를 이어서 서명하게 — 기존 규칙) → 이 서류가 1/2
  ok('다른 회사 서류: 진행 막대도 그대로 (지금 칸 · 다음 칸) · 배지에 숫자 없음', JSON.stringify(await w.locator('[data-doc-step]').evaluateAll((l) => l.map((e) => e.dataset.docStep))) === '["now","next"]' && (await w.getByText('서명할 서류 1/2').count()) === 1 && one(await badge(w).innerText()) === '서명 대기')
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/doc-for-long.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})

  // ── 3. 서명한 서류도 같게 (서명할 때의 회사 정보로)
  await w.goto(`${D}/docs/${DOC_SIGNED}`, { waitUntil: 'networkidle' })
  await line(w).waitFor({ timeout: 15000 }).catch(() => {})
  ok("서명한 서류: '주식회사 테스트 · 공고 이름'", one(await line(w).innerText().catch(() => '')) === `주식회사 테스트 · ${j1.title}`, one(await line(w).innerText().catch(() => '')))
  ok('인쇄할 때는 빠짐 (no-print)', ((await line(w).getAttribute('class')) ?? '').includes('no-print'))

  // ── 4. 관리자가 볼 때는 없음
  const a = await pg(A)
  await a.goto(`${D}/docs/${DOC_SIGNED}`, { waitUntil: 'networkidle' })
  await a.locator('[data-doc-pdf]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('관리자 화면에는 이 줄 없음', (await line(a).count()) === 0 && (await a.locator('[data-doc-pdf]').count()) === 1)

  // ── 5. 동작 줄이기면 바로 (움직임 없음)
  const r = await pg(W, { reducedMotion: 'reduce' })
  await r.goto(`${D}/docs/${DOC}`, { waitUntil: 'networkidle' })
  await r.locator('[data-doc-step=now]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('동작 줄이기: 차오름 없이 바로', parseFloat(await r.locator('[data-doc-step=now]').evaluate((el) => getComputedStyle(el).animationDuration)) < 0.01)

  // 정리
  await rest(`signed_docs?id=eq.${DOC2}`, 'DELETE')
  await rest(`applications?id=eq.${APP2}`, 'DELETE')
  await rest(`jobs?id=eq.${J2}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
