// 묶음 207 (정기 개선 2026-11-12 02:41 KST)
// · 여러 회사를 맡은 관리자: 회사 설정 화면에 지금 어느 회사 설정인지 (제목 아래 '○○ 설정이에요' + 저장 버튼 아래 줄에 회사 이름)
//   - 직인·사업자번호·기본 시급을 다른 회사에 잘못 넣지 않게 · 한 회사만 맡은 관리자는 전처럼
//   - 버튼 이름 기록은 '설정 저장'·'공고 등록' 그대로 (회사 이름이 행동 기록에 섞이지 않게)
// · 내 근무: 오늘 근무의 서류는 오늘의 근무 카드에 '서명 ›' 한 줄로만 (위 '서명할 서류' 카드에 같은 안내를 또 보이지 않게)
//   - 다른 공고(내일 근무 등)의 서류만 위 카드에 남음 · 바로 가기(/me#sign-docs)는 남은 쪽으로 가서 누를 곳이 번쩍임
// node scripts/qa/batch207.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000207'
const M = 'aaaaaaaa-0000-4000-8000-000000020701', N = 'aaaaaaaa-0000-4000-8000-000000020702'
const J2 = 'cccccccc-0000-4000-8000-0000000002c7', DOC2 = 'dddddddd-0000-4000-8000-0000000002d7', APP2 = '11111111-0000-4000-8000-0000000002a7'
const LONG = '주식회사 아주아주 이름이 긴 행사 기획 운영 대행사'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const nowIso = new Date().toISOString()
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ════ 1. 내 근무: 오늘 근무의 서류는 한 번만 ════
  const att0 = await rest(`attendance?user_id=eq.${W}`)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  const w = await pg(W)
  const card = w.locator('[data-sign-card]')
  const before = w.locator('[data-sign-before-start]')
  const ids = () => w.evaluate(() => document.querySelectorAll('#sign-docs').length)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await before.waitFor({ timeout: 15000 }).catch(() => {})
  ok("출근 전: 오늘의 근무 카드에 '서류 1건에 서명하면 근무를 시작할 수 있어요 · 서명 ›'", one(await before.innerText().catch(() => '')).includes('서류 1건에 서명하면 근무를 시작할 수 있어요'))
  ok("위 '서명할 서류가 n건 있어요' 카드는 없음 (같은 안내를 두 번 안 보임)", (await card.count()) === 0 && (await w.getByText(/서명할 서류가 \d+건 있어요/).count()) === 0)
  ok('바로 가기 자리(#sign-docs)는 오늘의 근무 카드의 서명 줄 · 하나만', (await before.getAttribute('id')) === 'sign-docs' && (await ids()) === 1)
  ok('360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/me-sign-once.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})

  // 문의 채팅 '서류 서명하러 가기'(/me#sign-docs)로 오면: 서명 줄이 화면 안 · 둘레가 번쩍임
  await w.goto('about:blank') // 같은 화면에서 #만 바꾸면 새로 열리지 않음 → 다른 데서 오는 것처럼
  await w.goto(`${D}/me#sign-docs`, { waitUntil: 'networkidle' })
  const flashed = await w.waitForFunction(() => document.querySelector('[data-sign-before-start]')?.hasAttribute('data-flash'), null, { timeout: 4000 }).then(() => true, () => false)
  ok("바로 가기로 오면 서명 줄이 번쩍임 (data-flash) · 화면 안", flashed && (await before.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/me-sign-flash.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})
  ok('번쩍임은 잠깐 (3초 남짓 뒤 사라짐)', await w.waitForFunction(() => !document.querySelector('[data-flash]'), null, { timeout: 6000 }).then(() => true, () => false))

  // ════ 2. 다른 공고(내일 근무)의 서류는 위 카드에 남음 ════
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const [app1] = await rest(`applications?user_id=eq.${W}&job_id=eq.${J}`)
  const [doc1] = await rest(`signed_docs?user_id=eq.${W}&status=eq.pending`)
  const tomorrow = kstDay(Date.now() + 86400e3)
  const j2 = { ...j1, id: J2, title: '내일 무대 스태프', start_date: tomorrow, end_date: tomorrow, applications: [], required_docs: [], created_at: nowIso }
  await rest('jobs', 'POST', j2)
  await rest('applications', 'POST', { ...app1, id: APP2, job_id: J2, job: j2, available_dates: null, created_at: nowIso })
  await rest('signed_docs', 'POST', { ...doc1, id: DOC2, job_id: J2, title: '내일 서약서', created_at: nowIso })
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const cardText = one(await card.innerText().catch(() => ''))
  ok("위 카드: '서명할 서류가 1건 있어요' · 내일 근무 서류만 (오늘 근무 서류는 빠짐)", cardText.includes('서명할 서류가 1건 있어요') && cardText.includes('내일 서약서') && cardText.includes('내일 무대 스태프') && !cardText.includes('근로계약서'), cardText)
  ok('오늘의 근무 카드의 서명 줄은 그대로', one(await before.innerText().catch(() => '')).includes('서류 1건에 서명하면'))
  ok('바로 가기 자리는 위 카드 하나 (오늘 줄에는 id 없음)', (await card.getAttribute('id')) === 'sign-docs' && (await before.getAttribute('id')) === null && (await ids()) === 1)
  await w.goto('about:blank') // 같은 화면에서 #만 바꾸면 새로 열리지 않음 → 다른 데서 오는 것처럼
  await w.goto(`${D}/me#sign-docs`, { waitUntil: 'networkidle' })
  const flashedTop = await w.waitForFunction(() => document.querySelector('[data-sign-card] a')?.hasAttribute('data-flash'), null, { timeout: 4000 }).then(() => true, () => false)
  ok('바로 가기로 오면 위 카드의 첫 서류가 번쩍임', flashedTop)
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/me-sign-other.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})

  // ════ 3. 근무 중(담당자가 출석 체크로 시작)인데 서류가 남았으면: '서명할 서류 1건이 남았어요' 한 줄만 ════
  for (const a of att0) await rest('attendance', 'POST', a)
  await rest(`signed_docs?id=eq.${DOC2}`, 'DELETE')
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const left = w.locator('[data-sign-left]')
  await left.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무 중: '서명할 서류 1건이 남았어요 · 서명 ›' 한 줄 · 위 카드 없음", one(await left.innerText().catch(() => '')).includes('서명할 서류 1건이 남았어요') && (await card.count()) === 0)
  ok('바로 가기 자리는 그 한 줄', (await left.getAttribute('id')) === 'sign-docs' && (await ids()) === 1)
  ok('360px 옆으로 안 밀림 (근무 중)', await noSide(w))
  // 정리
  await rest(`applications?id=eq.${APP2}`, 'DELETE')
  await rest(`jobs?id=eq.${J2}`, 'DELETE')

  // ════ 4. 여러 회사를 맡은 관리자: 회사 설정 화면 ════
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: LONG, seal_image: null, created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자', phone: '01020700001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자', phone: '01020700002', is_super: false })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })
  const line = (p) => p.locator('[data-settings-company]')
  const sub = (p) => p.locator('[data-settings-submit-company]')
  const btn = (p) => p.locator('#settings-form button[type=submit]').last()

  const m = await pg(M, C1)
  await m.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await line(m).waitFor({ timeout: 15000 }).catch(() => {})
  ok("제목 아래 '주식회사 테스트 설정이에요'", one(await line(m).innerText().catch(() => '')) === '주식회사 테스트 설정이에요', one(await line(m).innerText().catch(() => '')))
  ok("저장 버튼: '설정 저장' + 아래 작게 '주식회사 테스트'", one(await btn(m).textContent()) === '설정 저장주식회사 테스트' && one(await sub(m).textContent()) === '주식회사 테스트', one(await btn(m).textContent()))
  ok("버튼 이름 기록은 '설정 저장' 그대로 (회사 이름이 섞이지 않게)", (await btn(m).getAttribute('data-track')) === '설정 저장')
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/settings-company.png`, clip: { x: 0, y: 0, width: 360, height: 260 } }).catch(() => {})

  const m2 = await pg(M, C2)
  await m2.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await line(m2).waitFor({ timeout: 15000 }).catch(() => {})
  ok('다른 회사로 바꾸면 그 회사 이름으로', one(await line(m2).innerText().catch(() => '')) === `${LONG} 설정이에요` && one(await sub(m2).textContent()) === LONG)
  await m2.waitForTimeout(300)
  ok('긴 회사 이름: 제목 아래 한 줄 (넘치면 줄임 · \'설정이에요\'는 보임) · 버튼 두 줄 높이 · 옆으로 안 밀림',
    (await line(m2).evaluate((el) => el.getBoundingClientRect().height < 26 && el.lastElementChild.getBoundingClientRect().right <= innerWidth)) &&
    (await sub(m2).evaluate((el) => el.getBoundingClientRect().height < 20 && getComputedStyle(el).textOverflow === 'ellipsis')) &&
    (await btn(m2).evaluate((el) => el.getBoundingClientRect().height <= 66 && el.getBoundingClientRect().right <= innerWidth - 8)) &&
    (await noSide(m2)))
  if (SHOTS) {
    await btn(m2).scrollIntoViewIfNeeded().catch(() => {})
    await btn(m2).screenshot({ path: `${SHOTS}/settings-button-long.png` }).catch(() => {})
  }

  // 한 회사만 맡은 관리자는 전처럼
  const n = await pg(N, C1)
  await n.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await btn(n).waitFor({ timeout: 15000 }).catch(() => {})
  ok("한 회사만: 회사 줄 없음 · 버튼 '설정 저장'", (await line(n).count()) === 0 && one(await btn(n).textContent()) === '설정 저장')

  // 새 공고 버튼도 이름 기록은 '공고 등록' 그대로
  await m.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
  await m.locator('[data-job-submit-company]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("새 공고 버튼 이름 기록도 '공고 등록' 그대로", (await m.locator('[data-job-submit] button[type=submit]').getAttribute('data-track')) === '공고 등록')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
