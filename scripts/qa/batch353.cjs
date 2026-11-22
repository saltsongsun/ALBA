// 묶음 353 (정기 개선 2026-11-22 20:35 KST)
// · 새로 합류한 회사 (사흘 안에 관리자로 승인된 곳 · 대표가 아닌 관리자):
//   - 다른 회사를 보고 있으면 관리자 홈 '다른 회사' 줄에 그 회사 칩 + '새로 합류' (할 일이 없어도) → 누르면 그 회사로
//   - 그 회사를 보면 한 줄 '<회사> 관리자가 됐어요 · 대표 <이름> ›' → 누르면 회사 설정의 관리자 목록 · ×로 닫으면 다시 안 보임
//   - 사흘이 지나면 · 대표(직접 만든 회사)면 · 최고 관리자면 안 보임 · 맡지 않은 회사는 안 나옴
// · 디자인: 출퇴근 탭 이모지를 선 아이콘으로 (근무시간 변경 시계 · 여러 명 고치기 연필 · 서명 안 함 · 귀가 조치 집) + 정산 탭 '시간 수정' 연필
// node scripts/qa/batch353.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000353', C3 = '99999999-0000-4000-8000-000000003533'
const N = 'aaaaaaaa-0000-4000-8000-000000000353' // 둘째상사 대표 → 기본 회사(주식회사 테스트)에 오늘 관리자로 합류
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  // 둘째상사353 (N이 대표 · 오래전) · 셋째상사353 (N은 안 맡음 · 다른 관리자가 오늘 합류)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째상사353', seal_image: null, created_at: iso(now) })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '셋째상사353', seal_image: null, created_at: iso(now + 1000) })
  await rest('users', 'POST', { ...a, id: N, name: '새합류353', phone: '01035300001', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: N, role: 'owner', created_at: '2026-10-01T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: iso(now - 3600e3) }) // 한 시간 전 승인
  const owner = one((await rest(`users?id=eq.${A}`))[0]?.name)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const company = (p) => p.locator('header select[name=company]').inputValue().catch(() => '')
  const note = (p) => p.locator(`[data-news="joined-${C1}"]`)
  const joinedChip = (p, name) => p.locator('[data-other-companies] form', { hasText: name }).locator('[data-other-joined]')

  // ── 1. 자기 회사(둘째상사)를 보고 있을 때: '다른 회사' 줄에 주식회사 테스트 + '새로 합류'
  const n = await pg(N, C2)
  await n.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await n.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  ok('지금 회사는 둘째상사353', (await company(n)) === C2, await company(n))
  ok("다른 회사 줄: '주식회사 테스트' 칩에 '새로 합류'", (await joinedChip(n, '주식회사 테스트').count()) === 1 && one(await joinedChip(n, '주식회사 테스트').innerText()) === '새로 합류')
  ok('대표로 만든 지금 회사엔 환영 줄 없음', (await n.locator('[data-news^="joined-"]').count()) === 0)
  ok('맡지 않은 셋째상사353은 안 나옴', !(await n.locator('[data-other-companies]').innerText().catch(() => '')).includes('셋째상사353'))
  ok('360px 옆으로 안 밀림 (다른 회사 줄)', await noSide(n))
  if (SHOTS) await n.locator('[data-other-companies]').screenshot({ path: `${SHOTS}/joined-chip.png` }).catch(() => {})

  // ── 2. 칩을 누르면 그 회사로 → 한 줄 '주식회사 테스트 관리자가 됐어요 · 대표 <이름> ›'
  await Promise.all([
    n.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => {}),
    n.locator('[data-other-companies] form', { hasText: '주식회사 테스트' }).locator('button').click(),
  ])
  await n.waitForLoadState('networkidle').catch(() => {})
  await note(n).waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 주식회사 테스트로 바뀜', (await company(n)) === C1, await company(n))
  const t = one(await note(n).innerText().catch(() => ''))
  ok(`환영 줄 '주식회사 테스트 관리자가 됐어요 · 대표 ${owner} ›'`, t.startsWith(`주식회사 테스트 관리자가 됐어요 · 대표 ${owner} ›`), t)
  const nb = await note(n).boundingBox().catch(() => null)
  ok('한 줄 (높이 ≤ 52px) · 360px 옆으로 안 밀림', !!nb && nb.height <= 52 && (await noSide(n)), JSON.stringify(nb))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/joined-note.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})
  ok("이 회사를 보면 '다른 회사' 줄에 이 회사의 '새로 합류'는 없음", (await n.locator('[data-other-joined]').count()) === 0)
  // 누르면 회사 설정의 관리자 목록
  await n.locator(`[data-news="joined-${C1}"] a`).click()
  await n.waitForURL((u) => u.pathname === '/admin/settings', { timeout: 15000 }).catch(() => {})
  await n.locator('#admins').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  ok('누르면 회사 설정 · 관리자 목록(#admins)', new URL(n.url()).pathname === '/admin/settings' && new URL(n.url()).hash === '#admins' && (await n.locator('#admins').count()) === 1, n.url())
  // × 닫으면 다시 안 보임
  await n.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await note(n).waitFor({ timeout: 15000 }).catch(() => {})
  await note(n).locator('[data-news-close]').click().catch(() => {})
  await n.waitForTimeout(200)
  ok('× 누르면 사라짐', (await note(n).count()) === 0)
  await n.reload({ waitUntil: 'networkidle' })
  await n.waitForTimeout(500)
  ok('다시 열어도 안 보임 (이 휴대폰)', (await note(n).count()) === 0)

  // ── 3. 사흘이 지나면 안 보임 (환영 줄 · '새로 합류' 칩 둘 다)
  await rest(`company_members?company_id=eq.${C1}&user_id=eq.${N}`, 'PATCH', { created_at: iso(now - 4 * 864e5) })
  const n2 = await pg(N, C1)
  await n2.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await n2.waitForTimeout(500)
  ok('나흘 전에 합류: 환영 줄 없음', (await n2.locator('[data-news^="joined-"]').count()) === 0)
  const n3 = await pg(N, C2)
  await n3.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok("나흘 전에 합류: '새로 합류' 칩 없음", (await n3.locator('[data-other-joined]').count()) === 0)

  // ── 4. 최고 관리자는 안 보임
  const sa = await pg(A, C1)
  await sa.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await sa.waitForTimeout(500)
  ok('최고 관리자: 환영 줄·새로 합류 없음', (await sa.locator('[data-news^="joined-"]').count()) === 0 && (await sa.locator('[data-other-joined]').count()) === 0)

  // ── 5. 출퇴근 탭: 선 아이콘 (이모지 없음)
  await sa.goto(`${D}/admin/jobs/${J}?tab=att`, { waitUntil: 'networkidle' })
  const shift = sa.locator('#shift > summary')
  ok("'근무시간 변경 · 퇴근 연장' 시계 선 아이콘", one(await shift.innerText().catch(() => '')) === '근무시간 변경 · 퇴근 연장' && (await shift.locator('svg').count()) === 1)
  const bulk = sa.locator('[data-bulk-adjust] > summary')
  ok("'여러 명 시간 한 번에 고치기' 연필 선 아이콘", (await bulk.count()) === 0 || (one(await bulk.innerText()) === '여러 명 시간 한 번에 고치기' && (await bulk.locator('svg').count()) === 1))
  const dismiss = sa.locator('[data-att-dismiss]').first()
  ok("'귀가 조치 (불성실 근무)' 집 선 아이콘", (await dismiss.count()) === 0 || (one(await dismiss.innerText()) === '귀가 조치 (불성실 근무)' && (await dismiss.locator('svg').count()) === 1))
  const attText = await sa.locator('main').innerText()
  ok('출퇴근 탭에 🕒·✍️·📝·🏠·✏️ 없음', !/[🕒✍📝🏠✏]/u.test(attText))
  ok('출퇴근 탭 360px 옆으로 안 밀림', await noSide(sa))
  if (SHOTS) await sa.locator('#shift').screenshot({ path: `${SHOTS}/att-icons.png` }).catch(() => {})
  await sa.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' })
  const edit = sa.locator('[data-pay-edit] a').first()
  ok("정산 탭 '시간 수정' 연필 선 아이콘 (✏️ 없음)", (await edit.count()) === 0 || ((await edit.locator('svg').count()) === 1 && !(await edit.innerText()).includes('✏')))

  // ── 6. 움직임 줄이기: '새로 합류' 칩이 튀어나오지 않음
  await rest(`company_members?company_id=eq.${C1}&user_id=eq.${N}`, 'PATCH', { created_at: iso(now - 3600e3) })
  const r = await pg(N, C2, { reducedMotion: 'reduce' })
  await r.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const dur = await r.locator('[data-other-joined]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로 보임', dur < 0.05, String(dur))

  // 정리: 다른 묶음이 N을 볼 일은 없지만 합류 기록은 되돌려 둠
  await rest(`company_members?company_id=eq.${C1}&user_id=eq.${N}`, 'DELETE')
  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
