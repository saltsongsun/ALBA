// 묶음 265 (정기 개선 2026-11-15 20:35 KST)
// · 새 공고 등록 '공고에 보일 내용' → 추가 조건: '최근 [지난 공고 조건 3개 · 휴게 시간, 식사, 교통]' 칩 하나로 우리 회사 가장 최근 공고의 조건을 한 번에
//   (회사마다 휴게·식사·교통 조건이 거의 같아 매번 다시 치던 것 · 다른 회사 공고 조건은 안 가져옴)
//   같은 이름 줄이 이미 있으면 빈 내용만 채우고 그 칸이 한 번 반짝 · 새 줄은 톡 나타남 · 누른 칩은 ✓
//   접혀 있어도 제목 옆 요약에 '지난 공고 조건 3개 불러오기' · 공고 수정 화면엔 없음
// node scripts/qa/batch265.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000002650c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (min) => new Date(Date.now() - min * 60e3).toISOString()

;(async () => {
  // 우리 회사 가장 최근 공고 (조건 3개) · 그보다 늦게 올린 다른 회사 공고 (조건 다름 — 안 가져와야 함)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  await rest('jobs', 'POST', {
    ...base, id: 'cccccccc-0000-4000-8000-0000002650d1', title: '지난 박람회 안내', created_at: ago(5),
    conditions: [{ label: '휴게 시간', value: '12:00~13:00 점심' }, { label: '식사', value: '점심 도시락 제공' }, { label: '교통', value: '셔틀버스 08:00 시청역 2번 출구' }, { label: '빈 줄', value: '' }],
  })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른기획' })
  await rest('jobs', 'POST', { ...base, id: 'cccccccc-0000-4000-8000-0000002650d2', company_id: C2, title: '다른 회사 공고', created_at: ago(1), conditions: [{ label: '숙박', value: '다른 회사 숙소' }] })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 접힌 채로 요약에 보임
  await p.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
  const fold = p.locator('details', { hasText: '공고에 보일 내용' }).first()
  await fold.waitFor({ timeout: 15000 }).catch(() => {})
  ok("접힌 제목 옆 요약: '지난 공고 조건 3개 불러오기'", one(await fold.locator('summary').innerText().catch(() => '')).includes('지난 공고 조건 3개 불러오기'), one(await fold.locator('summary').innerText().catch(() => '')))
  await fold.locator('summary').click()
  const chip = fold.locator('[data-recent="conditions"] button')
  await chip.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("칩: '지난 공고 조건 3개 · 휴게 시간, 식사, 교통' (우리 회사 것만 · 빈 줄 뺌)", one(await chip.textContent().catch(() => '')) === '지난 공고 조건 3개 · 휴게 시간, 식사, 교통', one(await chip.textContent().catch(() => '')))
  const rowH = await fold.locator('[data-recent="conditions"]').evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 99)
  ok('칩 줄 한 줄 · 360px 옆으로 안 밀림', rowH < 40 && (await noSide(p)), `${rowH}px`)

  // ── 2. '식사' 줄을 먼저 빈 채로 넣어 둠 → 칩을 누르면 식사는 내용만 채우고(반짝) 휴게·교통은 새 줄
  await fold.getByRole('button', { name: '＋ 식사' }).click()
  await p.waitForTimeout(100)
  await chip.click()
  await p.waitForTimeout(150)
  const hidden = JSON.parse((await fold.locator('input[name=conditions]').inputValue().catch(() => '[]')) || '[]')
  ok("조건 3줄: 식사(채움) · 휴게 시간 · 교통", JSON.stringify(hidden) === JSON.stringify([{ label: '식사', value: '점심 도시락 제공' }, { label: '휴게 시간', value: '12:00~13:00 점심' }, { label: '교통', value: '셔틀버스 08:00 시청역 2번 출구' }]), JSON.stringify(hidden))
  const mealInput = fold.locator('input[aria-label="식사 내용"]')
  const fl = await mealInput.evaluate((el) => ({ f: el.hasAttribute('data-filled'), a: getComputedStyle(el).animationName })).catch(() => null)
  ok('이미 있던 식사 칸은 한 번 반짝 (data-filled)', fl?.f === true && fl.a === 'flash-ring', JSON.stringify(fl))
  const newRow = await fold.locator('input[aria-label="교통 내용"]').evaluate((el) => getComputedStyle(el.closest('li')).animationName).catch(() => '')
  ok('새 줄은 톡 나타남', newRow === 'pop', newRow)
  ok("누른 칩은 '✓' · 눌림 표시", one(await chip.textContent().catch(() => '')).startsWith('✓') && (await chip.getAttribute('aria-pressed')) === 'true')
  ok('다른 회사 조건(숙박)은 안 들어옴', !hidden.some((c) => c.label === '숙박'))
  if (SHOTS) {
    await fold.locator('[data-recent="conditions"]').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    const bx = await fold.locator('[data-recent="conditions"]').boundingBox()
    const ul = await mealInput.evaluate((el) => { const r = el.closest('ul').getBoundingClientRect(); return { y: r.y, h: r.height } }).catch(() => null)
    if (bx && ul) await p.screenshot({ path: `${SHOTS}/new-job-recent-conditions.png`, clip: { x: 0, y: Math.max(0, bx.y - 20), width: 360, height: Math.min(360, ul.y + ul.h - bx.y + 70) } }).catch(() => {})
  }

  // ── 3. 공고 수정 화면엔 없음
  await p.goto(`${D}/admin/jobs/${J}/edit`, { waitUntil: 'networkidle' })
  const f2 = p.locator('details', { hasText: '공고에 보일 내용' }).first()
  await f2.waitFor({ timeout: 15000 }).catch(() => {})
  ok('수정 화면엔 지난 조건 칩·요약 없음', (await f2.count()) === 1 && (await f2.locator('[data-recent="conditions"]').count()) === 0 && !one(await f2.locator('summary').innerText().catch(() => '')).includes('불러오기'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
