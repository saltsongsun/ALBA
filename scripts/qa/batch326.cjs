// 묶음 326 (정기 개선 2026-11-20 15:36 KST)
// · 지원 칸 '한마디': 내가 전에 지원할 때 쓴 말이 있으면 '지난번에 쓴 말 …' 한 줄 → 누르면 그대로 들어감 (한 번 더 누르면 빠짐)
//   내 지원서에서만 (다른 사람 말은 안 보임) · 쓴 적 없으면 줄 없음
// · 빠른 문구 칩: 넣으면 '✓ …'로 바뀌고(살짝 튐 · 움직임 줄이기면 바로) 한 번 더 누르면 빠짐 · 칸을 직접 고쳐도 같이 맞춰짐
// node scripts/qa/batch326.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000326a2', N = 'bbbbbbbb-0000-4000-8000-0000000326b1'
const KMSG = '행사장 안내 경험 있어요. 당일 아침 일찍 도착 가능합니다'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 뒤 모집 중인 새 공고 (김지원·새 회원 모두 아직 지원 안 함)
  const [j0] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j0, id: J2, title: '테스트 회사 다음 행사 안내', start_date: kday(3), end_date: kday(3), applications: [], created_at: '2026-11-01T00:00:00Z' })
  // 지원한 적 없는 새 회원 (사진 있음 → 지원 칸이 바로 보임)
  const [u] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: N, name: '새봄이', phone: '01032603261', created_at: '2026-11-10T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('#message').waitFor({ timeout: 15000 }).catch(() => {}); await p.waitForTimeout(300) }
  const val = (p) => p.locator('#message').inputValue()

  // ── 1. 전에 쓴 한마디가 있는 회원: '지난번에 쓴 말' 한 줄 → 누르면 들어감 / 한 번 더 누르면 빠짐
  const k = await mk(K)
  await go(k, `/jobs/${J2}`)
  const last = k.locator('[data-last-message]')
  const lt = one(await last.textContent().catch(() => ''))
  ok("'지난번에 쓴 말' 줄에 내 지난 한마디", (await last.count()) === 1 && lt.startsWith('지난번에 쓴 말') && lt.includes('행사장 안내 경험 있어요'), lt)
  ok('처음엔 칸 비어 있음 (저절로 넣지 않음)', (await val(k)) === '')
  ok('한 줄 · 360px 옆으로 밀림 없음', await k.evaluate(() => { const e = document.querySelector('[data-last-message]'); return e.getBoundingClientRect().height < 44 && e.getBoundingClientRect().right <= innerWidth }) && (await noSide(k)))
  if (SHOTS) {
    await k.locator('#message').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await k.waitForTimeout(250)
    await k.screenshot({ path: `${SHOTS}/apply-last-before.png` })
  }
  await last.click()
  ok('누르면 그 말이 그대로 들어감', (await val(k)) === KMSG, await val(k))
  ok("줄이 '✓ 넣었어요'로 바뀜 (눌린 상태)", one(await last.textContent()).startsWith('✓ 넣었어요') && (await last.getAttribute('aria-pressed')) === 'true')

  // ── 2. 빠른 문구 칩: 넣으면 ✓ · 한 번 더 누르면 빠짐 (지난 말과 함께)
  await k.getByRole('button', { name: '+ 차량 있어요' }).click()
  ok('칩 누르면 뒤에 붙음', (await val(k)) === `${KMSG}, 차량 있어요`, await val(k))
  const car = k.locator('[data-phrase-chip][aria-pressed="true"]')
  ok("넣은 칩은 '✓ 차량 있어요'", (await car.count()) === 1 && one(await car.textContent()) === '✓ 차량 있어요')
  if (SHOTS) await k.screenshot({ path: `${SHOTS}/apply-last-after.png` })
  await car.click()
  ok('한 번 더 누르면 빠지고 쉼표도 정리', (await val(k)) === KMSG, await val(k))
  ok("다시 '+ 차량 있어요'", (await k.getByRole('button', { name: '+ 차량 있어요' }).count()) === 1)
  await last.click()
  ok("'✓ 넣었어요' 한 번 더 누르면 지난 말도 빠짐", (await val(k)) === '' && one(await last.textContent()).startsWith('지난번에 쓴 말'), await val(k))

  // ── 3. 칸에 직접 쳐도 칩 상태가 맞춰짐
  await k.locator('#message').fill('일찍 도착할 수 있어요 그리고 운전 가능')
  await k.waitForTimeout(150)
  ok('직접 친 말과 같은 칩은 ✓', (await k.locator('[data-phrase-chip][aria-pressed="true"]').count()) === 1 && one(await k.locator('[data-phrase-chip][aria-pressed="true"]').textContent()) === '✓ 일찍 도착할 수 있어요')
  await k.locator('#message').fill('')
  await k.waitForTimeout(150)
  ok('칸을 비우면 ✓ 모두 풀림', (await k.locator('[data-phrase-chip][aria-pressed="true"]').count()) === 0)

  // ── 4. 지난 말 넣고 지원 → 그 말로 저장
  await last.click()
  const submit = k.getByRole('button', { name: /김지원님으로 지원하기/ })
  await submit.click()
  await k.waitForTimeout(250)
  await k.getByRole('button', { name: /한 번 더 누르면/ }).click().catch(() => submit.click())
  await k.waitForLoadState('networkidle')
  await k.waitForTimeout(800)
  const [saved] = (await rest(`applications?job_id=eq.${J2}&user_id=eq.${K}`)) ?? []
  ok('지원서에 지난 한마디가 그대로 저장', saved?.message === KMSG, saved?.message ?? '(없음)')

  // ── 5. 지원한 적 없는 회원: 줄 없음 · 다른 사람 말 안 보임
  const n = await mk(N)
  await go(n, `/jobs/${J2}`)
  ok('지원서가 없으면 지난 말 줄 없음', (await n.locator('#message').count()) === 1 && (await n.locator('[data-last-message]').count()) === 0)
  ok('다른 회원이 쓴 한마디는 화면에 없음', !(await n.locator('main').textContent()).includes('행사장 안내 경험 있어요'))
  ok('빠른 문구 칩은 그대로 (하루짜리: 5개)', (await n.locator('[data-phrase-chip]').count()) === 5)

  // ── 6. 움직임 줄이기: ✓ 칩이 튀지 않음
  const r = await mk(N, { reducedMotion: 'reduce' })
  await go(r, `/jobs/${J2}`)
  await r.getByRole('button', { name: '+ 체력 자신 있어요' }).click()
  const anim = await r.locator('[data-phrase-chip][aria-pressed="true"]').evaluate((e) => getComputedStyle(e).animationName + '|' + getComputedStyle(e).animationDuration)
  // 전체 규칙(globals.css)이 길이를 0에 가깝게 (예: 1e-05s) 줄임
  const [an, dur] = anim.split('|')
  ok('움직임 줄이기: 애니메이션 없음 (바로 ✓)', an === 'none' || parseFloat(dur) <= 0.001, anim)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
