// 묶음 413 (정기 개선 2026-11-27 13:36 KST)
// 기능 · 새 공고 쓰기: 이 회사의 가장 최근 공고가 '일찍 누른 출근은 공고 시작 시각부터 인정'을 켜 뒀으면
//   체크 아래 '지난 공고는 켜 뒀어요 · 똑같이 켜기' → 누르면 켜지고 '✓ 지난 공고처럼 켰어요' (0.25초 톡)
//   · 다시 끄면 칩이 다시 · 직접 켜면 칩이 사라짐 · 기본값은 그대로(꺼짐) · 등록하면 켠 채로 저장
//   · 지난 공고가 꺼 뒀거나 다른 회사 공고만 켜 뒀으면 안 보임 · 공고 수정 화면엔 안 보임
// 디자인 · 새 공고도 처음부터 '공고 시간대로 일하면 하루 …원' (기본 시간·시급 · 예전엔 한 칸을 고쳐야 나타남)
//   · 시급을 바꾸면 금액이 0.25초 톡 (계산은 그대로)
// 인터랙션 · 움직임 줄이기에선 톡 없이 바로 바뀜 · 360px 옆 스크롤 없음
// node scripts/qa/batch413.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const OTHER_CO = '41300000-0000-4000-8000-000000000413', OTHER_JOB = '41300000-0000-4000-8000-000000000999'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: true })
  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (reduce = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await ctxOf()
  const open = async (p = a) => { await p.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' }); return p }
  const box = (p = a) => p.locator('#job-form input[name="early_clamp"]')
  const chip = (p = a) => p.locator('[data-same-as-last="early_clamp"]')
  const done = (p = a) => p.locator('[data-same-as-last-done="early_clamp"]')

  // ── 1. 지난 공고가 켜 둠 → 칩 보임 · 체크는 기본 꺼짐 그대로
  await open()
  ok("새 공고: '지난 공고는 켜 뒀어요 · 똑같이 켜기' 칩", (await chip().count()) === 1 && one(await chip().innerText().catch(() => '')) === '지난 공고는 켜 뒀어요 · 똑같이 켜기', one(await chip().innerText().catch(() => '')))
  ok('기본값은 그대로 (꺼짐)', (await box().isChecked().catch(() => true)) === false)
  ok('칩이 체크 줄 바로 아래 · 글자 칸과 줄 맞춤', await a.evaluate(() => {
    const c = document.querySelector('[data-same-as-last="early_clamp"]'), l = document.querySelector('#job-form input[name="early_clamp"]').closest('label')
    const cr = c.getBoundingClientRect(), lr = l.getBoundingClientRect(), tr = l.querySelector('span').getBoundingClientRect()
    return cr.top >= lr.bottom - 8 && cr.top - lr.bottom < 12 && Math.abs(cr.left - tr.left) <= 2 && cr.right <= innerWidth - 8
  }).catch(() => false))
  ok('칩이 한 줄 (360px)', await chip().evaluate((el) => el.getBoundingClientRect().height < 40).catch(() => false), String(await chip().evaluate((el) => el.getBoundingClientRect().height).catch(() => '')))
  ok('360px 옆 스크롤 없음', await noSide(a))
  await chip().scrollIntoViewIfNeeded().catch(() => {})
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/413-chip.png` })

  // ── 2. 누르면 켜짐 + '✓ 지난 공고처럼 켰어요' 톡 (0.25초)
  await chip().click()
  ok('누르면 체크가 켜짐', await box().isChecked().catch(() => false))
  ok("'✓ 지난 공고처럼 켰어요'로 바뀜 · 칩은 사라짐", (await done().count()) === 1 && one(await done().innerText().catch(() => '')) === '✓ 지난 공고처럼 켰어요' && (await chip().count()) === 0)
  const anim = await done().evaluate((el) => { const s = getComputedStyle(el); return { name: s.animationName, dur: s.animationDuration } }).catch(() => ({}))
  ok('톡 0.25초 (150~300ms)', anim.name && anim.name !== 'none' && parseFloat(anim.dur) >= 0.15 && parseFloat(anim.dur) <= 0.3, JSON.stringify(anim))
  ok('체크 칸이 잠깐 반짝 (넣은 표시)', !!(await box().getAttribute('data-filled').catch(() => null)))
  if (SHOTS) { await a.waitForTimeout(300); await a.screenshot({ path: `${SHOTS}/413-done.png` }) }

  // ── 3. 다시 끄면 칩이 다시 · 직접 켜면 칩이 사라짐
  await box().click()
  ok('다시 끄면 칩이 다시 보임', (await chip().count()) === 1 && (await done().count()) === 0)
  await box().click()
  ok('직접 켜면 칩·완료 줄 모두 없음', (await chip().count()) === 0 && (await done().count()) === 0)
  await box().click()

  // ── 4. 칩으로 켜고 등록 → 켠 채로 저장
  await open()
  await a.fill('#job-form input[name="title"]', '배치413 지난공고처럼')
  const d7 = new Date(Date.now() + 9 * 3600e3 + 7 * 864e5).toISOString().slice(0, 10)
  await a.locator('#job-form input[name="start_date"]').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }, d7)
  const ed = a.locator('#job-form input[name="end_date"]')
  if (await ed.count()) await ed.evaluate((el, v) => { if (!el.value) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) } }, d7)
  await chip().click()
  const before = new Set(((await rest('jobs?select=id')) ?? []).map((j) => j.id))
  await a.locator('#job-form button[type="submit"]').last().click()
  await a.waitForURL((u) => /\/admin\/jobs\/[0-9a-f-]{36}/.test(u.pathname) && !u.pathname.endsWith('/new'), { timeout: 15000 }).catch(() => {})
  const made = ((await rest('jobs?select=id,title,early_clamp')) ?? []).find((j) => !before.has(j.id) && j.title === '배치413 지난공고처럼')
  ok('등록하면 켠 채로 저장 (early_clamp=true)', made?.early_clamp === true, JSON.stringify(made ?? null))
  if (made) await rest(`jobs?id=eq.${made.id}`, 'DELETE')

  // ── 4b. 하루 예상 금액: 처음부터 보임 · 시급 바꾸면 금액 톡
  await open()
  const gross = a.locator('[data-est-gross]')
  const g0 = one(await gross.innerText().catch(() => ''))
  ok("새 공고: 처음부터 '공고 시간대로 일하면 하루 …원'", /원$/.test(g0) && one(await gross.locator('xpath=..').innerText().catch(() => '')).startsWith('공고 시간대로 일하면 하루'), g0)
  const hw = a.locator('#job-form input[name="hourly_wage"]')
  if (await hw.count()) {
    await hw.fill('12000')
    await hw.dispatchEvent('change')
    await a.waitForTimeout(80)
    const g1 = one(await gross.innerText().catch(() => ''))
    const an = await gross.evaluate((el) => { const s = getComputedStyle(el); return { name: s.animationName, dur: s.animationDuration } }).catch(() => ({}))
    ok('시급을 바꾸면 금액이 바뀌고 0.25초 톡', g1 !== g0 && an.name === 'pop' && parseFloat(an.dur) === 0.25, `${g0} → ${g1} ${JSON.stringify(an)}`)
  } else ok('시급 칸 있음', false)
  ok('360px 옆 스크롤 없음 (예상 금액)', await noSide(a))

  // ── 5. 지난 공고가 꺼 둠 → 안 보임
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: false })
  await open()
  ok('지난 공고가 꺼 뒀으면 칩 없음', (await chip().count()) === 0 && (await box().count()) === 1)

  // ── 6. 회사 분리: 다른 회사의 더 최근 공고만 켜 둠 → 안 보임
  const [jj] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...jj, id: OTHER_JOB, company_id: OTHER_CO, title: '다른 회사 공고', early_clamp: true, created_at: new Date().toISOString() })
  await open()
  ok('다른 회사 공고가 켜 둔 건 따라가지 않음', (await chip().count()) === 0)
  await rest(`jobs?id=eq.${OTHER_JOB}`, 'DELETE')

  // ── 7. 공고 수정 화면엔 안 보임 (지난 공고가 켜 둬도)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: true })
  await a.goto(`${D}/admin/jobs/${J}/edit`, { waitUntil: 'networkidle' })
  ok('공고 수정 화면엔 칩 없음', (await chip().count()) === 0)

  // ── 8. 움직임 줄이기: 톡 없이 바로
  const r = await ctxOf(true)
  await open(r)
  await chip(r).click()
  const ra = await done(r).evaluate((el) => getComputedStyle(el).animationName).catch(() => 'x')
  ok('움직임 줄이기: 톡 없이 바로 바뀜', (await box(r).isChecked().catch(() => false)) && (ra === 'none' || ra === ''), ra)

  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: false })
  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch413: ${fails} FAIL` : '== batch413: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
