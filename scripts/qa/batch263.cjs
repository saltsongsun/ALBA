// 묶음 263 (정기 개선 2026-11-15 15:35 KST)
// · 근무자 '내 정보' 맨 위 카드: '내 정보를 보는 회사 [다][테] 2곳 ⌄' 접힌 한 줄 — 내 계좌·연락처·사진을 볼 수 있는 회사
//   (지원한 적이 있거나 소속된 곳 · 관리자 화면과 같은 기준 · 지원 안 한 회사는 안 나옴) · 첫 글자는 3곳까지 겹쳐서
//   펼치면 '지원한 회사 담당자만 볼 수 있어요' + 회사 이름 칩 (누르면 그 회사 화면 · 차례로 톡 나타남, 움직임 줄이기면 바로)
//   아직 없으면 '0곳' · '아직 없어요 · 지원하면 그 회사 담당자만 봐요' · 전문가 화면엔 없음
// · 문의함: 회사 줄이 같은 건물 아이콘 대신 회사 이름 첫 글자 ('주식회사' 같은 말은 빼고)
// node scripts/qa/batch263.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000002630c2', C3 = '99999999-0000-4000-8000-0000002630c3'
const NEW = 'bbbbbbbb-0000-4000-8000-000000026301', PRO = 'bbbbbbbb-0000-4000-8000-000000026302'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 다른 회사 '(주)다른기획'에 지원 (확정 아님) · '지원 안 한 회사'는 공고만 있음
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '(주)다른기획', contact_phone: '01099990000' })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '지원 안 한 회사', contact_phone: '01088880000' })
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const j2 = { ...base, id: 'cccccccc-0000-4000-8000-0000002630d2', company_id: C2, title: '다른 회사 축제 스태프', start_date: kst(2), end_date: kst(2) }
  await rest('jobs', 'POST', j2)
  await rest('jobs', 'POST', { ...base, id: 'cccccccc-0000-4000-8000-0000002630d3', company_id: C3, title: '지원 안 한 공고', start_date: kst(3), end_date: kst(3) })
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...wa, id: '11111111-0000-4000-8000-0000002630a2', job_id: j2.id, company_id: C2, status: 'pending', position: null, job: { ...j2, company: { company_name: '(주)다른기획' } } })
  await rest('messages', 'POST', { id: 926301, thread_user_id: W, sender_id: null, from_admin: true, company_id: C2, job_id: j2.id, body: '지원 고마워요. 결과는 내일 알려 드려요.', read_at: null, created_at: new Date().toISOString() })
  // 새 근무자 (지원한 곳 없음) · 전문가
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: NEW, name: '새근무자', phone: '01026302630', created_at: new Date().toISOString() })
  await rest('users', 'POST', { ...w1, id: PRO, name: '전문가', phone: '01026312631', member_type: 'expert', created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const as = async (u) => { await ctx.clearCookies(); await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }]) }
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const box = p.locator('[data-seen-by]')

  // ── 1. 두 회사에 지원한 근무자: 접힌 한 줄 '내 정보를 보는 회사 [다][테] 2곳' → 펼치면 이름 순 칩
  await as(W)
  await p.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  const summary = box.locator('summary')
  const marks = async () => (await box.locator('[data-seen-marks] [data-company-mark]').allTextContents()).map(one)
  ok("맨 위 카드 안 접힌 한 줄: '내 정보를 보는 회사' · 첫 글자 [다, 테] · '2곳'", (await box.evaluate((el) => !el.open && !!el.closest('[data-profile-hero]')).catch(() => false)) && one(await summary.locator('b').textContent().catch(() => '')) === '내 정보를 보는 회사' && JSON.stringify(await marks()) === '["다","테"]' && one(await box.locator('[data-seen-count]').textContent().catch(() => '')) === '2곳', JSON.stringify(await marks()))
  ok('접힌 줄은 한 줄 높이 · 화살표는 오른쪽 하나만 (기본 왼쪽 화살표 없음)', (await summary.evaluate((el) => el.getBoundingClientRect().height).catch(() => 99)) < 32 && (await summary.evaluate((el) => getComputedStyle(el, '::before').display).catch(() => '')) === 'none')
  await summary.click()
  const chips = box.locator('[data-seen-co]')
  await chips.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("펼치면 '지원한 회사 담당자만 볼 수 있어요'", one(await box.locator('[data-seen-note]').textContent().catch(() => '')) === '지원한 회사 담당자만 볼 수 있어요')
  const names = (await chips.allTextContents()).map(one)
  ok("칩: ['다(주)다른기획', '테주식회사 테스트'] (첫 글자 + 이름 · '(주)'·'주식회사'는 첫 글자에서 뺌)", JSON.stringify(names) === JSON.stringify(['다(주)다른기획', '테주식회사 테스트']), JSON.stringify(names))
  ok('지원 안 한 회사는 안 나옴', !names.some((n) => n.includes('지원 안 한')))
  ok('칩을 누르면 그 회사 화면 (/?co=)', (await chips.nth(0).getAttribute('href')) === `/?co=${C2}` && (await chips.nth(1).getAttribute('href')) === `/?co=${C1}`)
  await p.waitForTimeout(300) // 화살표 도는 움직임(0.2초)이 끝난 뒤
  const anim = await box.locator('li').first().evaluate((el) => ({ name: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration })).catch(() => null)
  ok('칩이 톡 나타남 (0.32초 이하) · 펼침 화살표가 돌아감', anim?.name === 'pop' && parseFloat(anim.dur) <= 0.32 && (await summary.locator('svg').last().evaluate((el) => { const s = getComputedStyle(el); return s.rotate === '180deg' || s.transform !== 'none' }).catch(() => false)), JSON.stringify(anim))
  const hs = await chips.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  ok('칩 한 줄 · 360px 옆으로 안 밀림', hs.every((h) => h < 40) && (await noSide(p)), JSON.stringify(hs))
  if (SHOTS) {
    const hero = p.locator('[data-profile-hero]')
    await hero.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await p.evaluate(() => scrollBy(0, -70))
    await p.waitForTimeout(500)
    await hero.screenshot({ path: `${SHOTS}/profile-seen-by.png` }).catch(() => {})
  }
  await chips.nth(0).click()
  await p.waitForURL((u) => u.search.includes(C2), { timeout: 15000 }).catch(() => {})
  ok('눌러서 그 회사 화면으로', new URL(p.url()).searchParams.get('co') === C2, p.url())

  // ── 2. 문의함: 회사 줄은 첫 글자
  await p.goto(`${D}/me/chat`, { waitUntil: 'networkidle' })
  const rowMarks = await p.locator('[data-chat-row="company"]').evaluateAll((els) => els.map((el) => ({ t: el.querySelector('b')?.textContent?.trim(), m: el.querySelector('[data-company-mark]')?.textContent?.trim(), svg: !!el.querySelector('span[aria-hidden] > svg') })))
  const byT = Object.fromEntries(rowMarks.map((x) => [x.t, x.m]))
  ok("문의함 회사 줄: '(주)다른기획' → '다' · '주식회사 테스트' → '테' (건물 아이콘 대신)", byT['(주)다른기획'] === '다' && byT['주식회사 테스트'] === '테' && rowMarks.every((x) => !x.svg), JSON.stringify(rowMarks))
  if (SHOTS) {
    await p.waitForTimeout(400)
    const list = p.locator('[data-chat-row="company"]').first().locator('xpath=ancestor::ul[1]')
    await list.screenshot({ path: `${SHOTS}/inbox-marks.png` }).catch(() => {})
  }

  // ── 3. 8곳: 첫 글자는 3곳까지 · '8곳' · 펼치면 8곳 모두
  for (let i = 0; i < 6; i++) {
    const cid = `99999999-0000-4000-8000-00000026310${i}`
    await rest('companies', 'POST', { ...c1, id: cid, company_name: `행사회사${i + 1}` })
    // 가짜 DB는 지원의 회사를 공고 회사로 맞추므로 회사마다 공고 하나씩
    const jx = { ...base, id: `cccccccc-0000-4000-8000-00000026312${i}`, company_id: cid, title: `지난 행사 ${i + 1}`, start_date: kst(-10 - i), end_date: kst(-10 - i) }
    await rest('jobs', 'POST', jx)
    await rest('applications', 'POST', { ...wa, id: `11111111-0000-4000-8000-00000026311${i}`, job_id: jx.id, company_id: cid, status: 'rejected', position: null, job: jx })
  }
  await p.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  ok("8곳: 첫 글자 3개 · '8곳' · 접힌 줄 한 줄", (await marks()).length === 3 && one(await box.locator('[data-seen-count]').textContent().catch(() => '')) === '8곳' && (await summary.evaluate((el) => el.getBoundingClientRect().height).catch(() => 99)) < 32)
  await summary.click()
  await p.waitForTimeout(300)
  ok('펼치면 8곳 모두', (await chips.evaluateAll((els) => els.filter((e) => e.checkVisibility()).length)) === 8)

  // ── 4. 지원한 곳이 없는 새 근무자
  await as(NEW)
  await p.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  await summary.click().catch(() => {})
  ok("새 근무자: '0곳' · 첫 글자 없음 · 펼치면 '아직 없어요 · 지원하면 그 회사 담당자만 봐요' · 칩 없음", (await marks()).length === 0 && one(await box.locator('[data-seen-count]').textContent().catch(() => '')) === '0곳' && one(await box.locator('[data-seen-note]').textContent().catch(() => '')) === '아직 없어요 · 지원하면 그 회사 담당자만 봐요' && (await chips.count()) === 0)

  // ── 5. 전문가 화면엔 없음
  await as(PRO)
  await p.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  ok('전문가 내 정보엔 이 칸 없음', (await p.locator('h1, h2').count()) > 0 && (await box.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
