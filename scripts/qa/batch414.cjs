// 묶음 414 (정기 개선 2026-11-27 15:36 KST)
// 기능 · 새 공고 쓰기: '지난 공고는 켜 뒀어요 · 똑같이 켜기' 칩을 두 설정에도
//   - '현장에서만 근무 시작 가능' (켜면 위치 안내가 바로 따라옴)
//   - '지원하면 바로 확정' (접힌 '공개 설정'에도 '지난 공고는 바로 확정' 배지 · 켜면 사라짐)
//   · 이 회사의 가장 최근 공고만 따라감 (다른 회사 공고는 안 봄) · 기본값은 그대로(꺼짐) · 공고 수정 화면엔 없음
//   · 칩으로 켜고 등록하면 켠 채로 저장
// 인터랙션 · 배지 0.25초 톡 (움직임 줄이기면 없음) · 360px 옆 스크롤 없음 · 배지 한 줄
// node scripts/qa/batch414.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const OTHER_CO = '41400000-0000-4000-8000-000000000414', OTHER_JOB = '41400000-0000-4000-8000-000000000999'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  await rest(`jobs?id=eq.${J}`, 'PATCH', { gps_required: true, auto_approve: true, early_clamp: false })
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
  const box = (n, p = a) => p.locator(`#job-form input[name="${n}"]`)
  const chip = (n, p = a) => p.locator(`[data-same-as-last="${n}"]`)
  const done = (n, p = a) => p.locator(`[data-same-as-last-done="${n}"]`)
  const badge = (p = a) => p.locator('[data-fold-last="auto_approve"]')
  const pubFold = (p = a) => p.locator('details:has(input[name="auto_approve"])')

  // ── 1. 지난 공고: 현장 출근 · 바로 확정 켬, 조기 인정 끔
  await open()
  ok("'현장에서만 근무 시작' 아래 '지난 공고는 켜 뒀어요 · 똑같이 켜기'", (await chip('gps_required').count()) === 1 && one(await chip('gps_required').innerText().catch(() => '')) === '지난 공고는 켜 뒀어요 · 똑같이 켜기')
  ok("'지원하면 바로 확정' 아래 칩도 (접힌 칸 안)", (await chip('auto_approve').count()) === 1)
  ok('지난 공고가 끈 설정(조기 인정)엔 칩 없음', (await chip('early_clamp').count()) === 0)
  ok('기본값은 그대로 (둘 다 꺼짐)', (await box('gps_required').isChecked()) === false && (await box('auto_approve').isChecked()) === false)
  ok("접힌 '공개 설정'에 '지난 공고는 바로 확정' 배지", (await pubFold().getAttribute('open')) === null && (await badge().isVisible().catch(() => false)) && one(await badge().innerText().catch(() => '')) === '지난 공고는 바로 확정')
  ok('배지 한 줄 · 제목과 같은 줄', await badge().evaluate((el) => { const r = el.getBoundingClientRect(), t = el.parentElement.getBoundingClientRect(); return r.height < 26 && r.right <= innerWidth - 16 && t.height < 30 }).catch(() => false))
  const ba = await badge().evaluate((el) => { const s = getComputedStyle(el); return { name: s.animationName, dur: s.animationDuration } }).catch(() => ({}))
  ok('배지 0.25초 톡', ba.name === 'pop' && parseFloat(ba.dur) === 0.25, JSON.stringify(ba))
  ok('360px 옆 스크롤 없음', await noSide(a))
  if (SHOTS) { await chip('gps_required').scrollIntoViewIfNeeded(); await a.waitForTimeout(300); await a.screenshot({ path: `${SHOTS}/414-gps.png` }) }

  // ── 2. 현장 출근 칩 → 켜짐 · 위치가 비었으면 안내가 바로
  await chip('gps_required').click()
  ok('현장 출근: 누르면 켜짐 + ✓ 줄', (await box('gps_required').isChecked()) && (await done('gps_required').count()) === 1 && (await chip('gps_required').count()) === 0)
  ok("위치가 비어 있으면 '행사장 위치가 비어 있어요' 바로", await a.locator('[data-gps-need]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  // 지난 장소 칩으로 좌표 채움 → 안내 사라짐
  await a.locator('[data-recent="place"] button').first().click()
  ok('지난 장소를 넣으면 위치 안내가 사라짐', await a.locator('[data-gps-need]').waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false))

  // ── 3. 공개 설정: 펼쳐서 칩 → 켜짐 · 배지 사라짐
  await pubFold().locator('summary').click()
  await chip('auto_approve').scrollIntoViewIfNeeded()
  if (SHOTS) { await a.waitForTimeout(300); await a.screenshot({ path: `${SHOTS}/414-auto.png` }) }
  await chip('auto_approve').click()
  ok('바로 확정: 누르면 켜짐 + ✓ 줄', (await box('auto_approve').isChecked()) && (await done('auto_approve').count()) === 1)
  ok('켜면 배지가 사라짐', (await badge().count()) === 0)
  await box('auto_approve').click()
  ok('다시 끄면 칩·배지가 다시', (await chip('auto_approve').count()) === 1 && (await badge().count()) === 1)
  await chip('auto_approve').click()
  if (SHOTS) { await a.waitForTimeout(300); await a.screenshot({ path: `${SHOTS}/414-auto-done.png` }) }

  // ── 4. 등록 → 켠 채로 저장
  await a.fill('#job-form input[name="title"]', '배치414 지난공고처럼')
  const d7 = new Date(Date.now() + 9 * 3600e3 + 7 * 864e5).toISOString().slice(0, 10)
  for (const n of ['start_date', 'end_date']) {
    const el = a.locator(`#job-form input[name="${n}"]`)
    if (await el.count()) await el.evaluate((e, v) => { if (!e.value) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })) } }, d7)
  }
  const before = new Set(((await rest('jobs?select=id')) ?? []).map((j) => j.id))
  await a.locator('#job-form button[type="submit"]').last().click()
  await a.waitForURL((u) => /\/admin\/jobs\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 15000 }).catch(() => {})
  const made = ((await rest('jobs?select=id,title,gps_required,auto_approve,lat,lng')) ?? []).find((j) => !before.has(j.id) && j.title === '배치414 지난공고처럼')
  ok('등록하면 켠 채로 저장 (현장 출근 · 바로 확정)', made?.gps_required === true && made?.auto_approve === true && made?.lat != null, JSON.stringify(made ?? null))
  if (made) await rest(`jobs?id=eq.${made.id}`, 'DELETE')

  // ── 5. 지난 공고가 끔 → 칩·배지 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { gps_required: false, auto_approve: false })
  await open()
  ok('지난 공고가 꺼 뒀으면 칩·배지 없음', (await chip('gps_required').count()) === 0 && (await chip('auto_approve').count()) === 0 && (await badge().count()) === 0)

  // ── 6. 회사 분리: 다른 회사의 더 최근 공고만 켬 → 안 따라감
  const [jj] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...jj, id: OTHER_JOB, company_id: OTHER_CO, title: '다른 회사 공고414', gps_required: true, auto_approve: true, early_clamp: true, created_at: new Date().toISOString() })
  await open()
  ok('다른 회사 공고의 설정은 따라가지 않음', (await a.locator('[data-same-as-last]').count()) === 0 && (await badge().count()) === 0 && !(await a.content()).includes('다른 회사 공고414'))
  await rest(`jobs?id=eq.${OTHER_JOB}`, 'DELETE')

  // ── 7. 공고 수정 화면엔 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { gps_required: true, auto_approve: true })
  await a.goto(`${D}/admin/jobs/${J}/edit`, { waitUntil: 'networkidle' })
  ok('공고 수정 화면엔 칩·배지 없음', (await a.locator('[data-same-as-last]').count()) === 0 && (await badge().count()) === 0)

  // ── 8. 움직임 줄이기: 배지 톡 없음
  const r = await ctxOf(true)
  await open(r)
  const rd = await badge(r).evaluate((el) => parseFloat(getComputedStyle(el).animationDuration)).catch(() => 9)
  ok('움직임 줄이기: 배지 톡 없음', rd < 0.001, String(rd))

  await rest(`jobs?id=eq.${J}`, 'PATCH', { gps_required: false, auto_approve: false })
  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch414: ${fails} FAIL` : '== batch414: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
