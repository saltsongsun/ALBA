// 묶음 206 (정기 개선 2026-11-12 01:36 KST)
// · 여러 회사를 맡은 관리자: 새 공고 화면에 어느 회사 공고로 올라가는지 (제목 아래 한 줄 + 등록 버튼 '○○에 공고 등록')
//   - 위에서 회사를 바꾸면 새 공고 화면에 그대로 남음 (전에는 공고 목록으로 나갔음) → 바꾼 회사 이름으로
//   - 한 회사만 맡은 관리자는 전처럼 (회사 줄 없음 · 버튼 '공고 등록')
//   - 등록하면 지금 고른 회사의 공고로 저장됨
// · 쓴 내용이 있는데 위의 회사 고르기를 바꾸면: 한 번 멈추고 '저장하지 않았어요 · 한 번 더 고르면 회사가 바뀌어요'
//   (고르기는 지금 회사로 되돌아감 · 4초 안에 다시 고르면 바뀜) · 쓴 내용이 없으면 바로 바뀜 · 회사 설정 화면도 같게
// node scripts/qa/batch206.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000206'
const M = 'aaaaaaaa-0000-4000-8000-000000020601', N = 'aaaaaaaa-0000-4000-8000-000000020602'
const LONG = '주식회사 아주아주 이름이 긴 행사 기획 운영 대행사'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const nowIso = new Date().toISOString()
  // 준비: 두 번째 회사(이름이 김) · 관리자 M(두 회사 모두) · 관리자 N(첫 회사만) — 둘 다 최고 관리자가 아님
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: LONG, seal_image: null, created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자', phone: '01020600001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자', phone: '01020600002', is_super: false })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const line = (p) => p.locator('[data-job-company]')
  const btn = (p) => p.locator('[data-job-submit] button[type=submit]')
  const pick = (p) => p.locator('header select[name=company]')
  const warn = (p) => p.locator('[data-unsaved="warn"]')

  // ── 1. 두 회사를 맡은 관리자: 새 공고 화면에 올라갈 회사
  const m = await pg(M, C1)
  await m.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
  ok("제목 아래 '주식회사 테스트 공고로 올라가요'", one(await line(m).innerText().catch(() => '')) === '주식회사 테스트 공고로 올라가요', one(await line(m).innerText().catch(() => '')))
  const sub = (p) => p.locator('[data-job-submit-company]')
  ok("등록 버튼: '공고 등록' + 아래 작게 '주식회사 테스트'", one(await btn(m).textContent()) === '공고 등록주식회사 테스트' && one(await sub(m).textContent()) === '주식회사 테스트', one(await btn(m).textContent()))
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/new-job-company.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})

  // ── 2. 위에서 회사를 바꾸면 새 공고 화면에 그대로 (쓴 내용이 없으면 바로 바뀜)
  await pick(m).selectOption(C2)
  await m.waitForFunction((n) => document.querySelector('[data-job-company]')?.textContent?.includes(n), LONG, { timeout: 15000 }).catch(() => {})
  ok('회사를 바꿔도 새 공고 화면에 그대로 (공고 목록으로 나가지 않음)', new URL(m.url()).pathname === '/admin/jobs/new', m.url())
  ok('바꾼 회사 이름으로 (제목 아래 · 버튼)', one(await line(m).innerText().catch(() => '')) === `${LONG} 공고로 올라가요` && one(await sub(m).textContent()) === LONG)
  await m.waitForTimeout(400)
  ok('긴 회사 이름: 한 줄 (제목 아래 · 버튼 아래 줄 — 넘치면 줄임) · 버튼 두 줄 높이 · 옆으로 안 밀림', (await line(m).evaluate((el) => el.getBoundingClientRect().height < 26)) && (await sub(m).evaluate((el) => el.getBoundingClientRect().height < 20 && getComputedStyle(el).textOverflow === 'ellipsis')) && (await btn(m).evaluate((el) => el.getBoundingClientRect().height <= 66 && el.scrollWidth <= el.clientWidth + 1)) && (await noSide(m)))
  if (SHOTS) await m.locator('[data-job-submit]').screenshot({ path: `${SHOTS}/new-job-button-long.png` }).catch(() => {})

  // ── 3. 쓴 내용이 있는데 회사를 바꾸려 하면: 한 번 멈춤
  await m.locator('input[name=title]').fill('바꾸기 전에 쓰던 공고')
  await m.waitForTimeout(300)
  await pick(m).selectOption(C1)
  await warn(m).waitFor({ timeout: 5000 }).catch(() => {})
  ok("한 번 멈추고 '저장하지 않았어요 · 한 번 더 고르면 회사가 바뀌어요'", one(await warn(m).innerText().catch(() => '')) === '저장하지 않았어요 · 한 번 더 고르면 회사가 바뀌어요', one(await warn(m).innerText().catch(() => '')))
  await m.waitForTimeout(800)
  ok('회사 고르기는 지금 회사로 되돌아감 · 쓴 내용 그대로 · 화면 그대로', (await pick(m).inputValue()) === C2 && (await m.locator('input[name=title]').inputValue()) === '바꾸기 전에 쓰던 공고' && new URL(m.url()).pathname === '/admin/jobs/new')
  ok('안내가 흔들리며 나타남 (animate-shake) · 한 줄 · 화면 안', ((await warn(m).locator('p').getAttribute('class')) ?? '').includes('animate-shake') && (await warn(m).locator('p').evaluate((el) => { const r = el.getBoundingClientRect(); return r.height < 44 && r.left >= 8 && r.right <= innerWidth - 8 })))
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/switch-warn.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})
  // 4초 안에 다시 고르면 바뀜
  await pick(m).selectOption(C1)
  await m.waitForFunction(() => document.querySelector('[data-job-company]')?.textContent?.includes('주식회사 테스트'), null, { timeout: 15000 }).catch(() => {})
  ok('다시 고르면 바뀜 (새 공고 화면 그대로 · 회사 이름 바뀜)', new URL(m.url()).pathname === '/admin/jobs/new' && one(await line(m).innerText().catch(() => '')) === '주식회사 테스트 공고로 올라가요', m.url())

  // ── 4. 등록하면 지금 고른 회사(두 번째 회사)의 공고로 저장됨
  await pick(m).selectOption(C2)
  await m.waitForFunction((n) => document.querySelector('[data-job-company]')?.textContent?.includes(n), LONG, { timeout: 15000 }).catch(() => {})
  const day = kstDay(Date.now() + 3 * 864e5)
  await m.locator('input[name=title]').fill('두 번째 회사 새 공고')
  for (const [n, v] of [['event_name', '두 번째 회사 행사'], ['location_name', '시민광장'], ['start_date', day], ['end_date', day], ['start_time', '09:00'], ['end_time', '18:00'], ['headcount', '3']]) {
    const f = m.locator(`[name=${n}]`).first()
    if (await f.count()) await f.fill(v).catch(() => {})
  }
  await btn(m).click()
  await m.waitForURL((u) => /^\/admin\/jobs\/[0-9a-f-]{36}$/.test(new URL(u).pathname), { timeout: 20000 }).catch(() => {})
  const saved = (await rest('jobs')).find((j) => j.title === '두 번째 회사 새 공고')
  ok('등록하면 고른 회사의 공고로 저장 (두 번째 회사)', saved?.company_id === C2, `${saved?.company_id} · ${m.url()}`)

  // ── 5. 회사 설정 화면도 같게 (쓴 내용이 있으면 한 번 멈춤 · 아래 바에 같은 말)
  await m.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await m.locator('input[name=company_address]').fill('바꾸기 전에 쓰던 주소')
  await m.waitForTimeout(300)
  await pick(m).selectOption(C1)
  await m.waitForTimeout(600)
  ok("회사 설정: 아래 바에 '저장하지 않았어요 · 한 번 더 고르면 회사가 바뀌어요'", (await m.locator('[data-unsaved="warn"]').count()) === 1 && one(await m.locator('[data-unsaved="warn"]').innerText()).startsWith('저장하지 않았어요 · 한 번 더 고르면 회사가 바뀌어요') && (await pick(m).inputValue()) === C2 && (await m.locator('input[name=company_address]').inputValue()) === '바꾸기 전에 쓰던 주소')
  // 저장하고 나면 바로 바뀜
  await m.locator('[data-unsaved] button[form=settings-form]').click()
  await m.locator('[data-saved-toast]').waitFor({ timeout: 15000 }).catch(() => {})
  await m.waitForTimeout(400)
  await pick(m).selectOption(C1)
  await m.waitForFunction(() => document.querySelector('header select[name=company]')?.value === '99999999-0000-4000-8000-000000000099' && !document.querySelector('[data-unsaved="warn"]'), null, { timeout: 15000 }).catch(() => {})
  ok('저장하고 나면 멈추지 않고 바로 바뀜 (회사 설정 화면 그대로)', (await pick(m).inputValue()) === C1 && new URL(m.url()).pathname === '/admin/settings', m.url())

  // ── 6. 한 회사만 맡은 관리자: 전처럼
  const n = await pg(N)
  await n.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
  ok("한 회사만 맡은 관리자: 회사 줄 없음 · 버튼 '공고 등록'만", (await line(n).count()) === 0 && (await sub(n).count()) === 0 && one(await btn(n).innerText()) === '공고 등록')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
