// 묶음 247 (정기 개선 2026-11-14 11:35 KST)
// · 출퇴근 탭: '현황 복사' — 확정·근무 중·퇴근·미출근·지각 숫자와 배치별 'n/m'만 (이름·번호 없이 대표·고객사에 바로 보고)
// · 전문가 프로필: 뒤로 가기 '← 내 일' (아래 탭 이름과 같게) · '다 채우면 확정·대금이 빨라져요' (급여 대신)
// · 하루짜리 공고의 지원 '한마디' 칩에서 '모든 날짜 가능해요' 뺌 (여러 날 행사에만)
// node scripts/qa/batch247.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003'
const UX = 'bbbbbbbb-0000-4000-8000-0000000247e1', UN = 'bbbbbbbb-0000-4000-8000-0000000247a1'
const J1 = 'cccccccc-0000-4000-8000-0000000247d1', J3 = 'cccccccc-0000-4000-8000-0000000247d3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const today = kst(0)
  // 근무자는 09:20에 출근 (09:00 시작 → 지각 20분)
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { work_date: today, clock_in: `${today}T00:20:00.000Z`, clock_out: null })
  // 지원용: 내일 하루짜리 공고 · 내일부터 사흘짜리 공고 / 사진 있는 새 회원 · 전문가 회원
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  await rest('jobs', 'POST', { ...base, id: J1, title: '내일 하루 안내 스태프', start_date: kst(1), end_date: kst(1), start_time: '09:00:00', end_time: '18:00:00', status: 'open', created_at: new Date().toISOString() })
  await rest('jobs', 'POST', { ...base, id: J3, title: '사흘 안내 스태프', start_date: kst(1), end_date: kst(3), start_time: '09:00:00', end_time: '18:00:00', status: 'open', created_at: new Date().toISOString() })
  const [ap] = await rest(`users?id=eq.${AP}`)
  await rest('users', 'POST', { ...ap, id: UN, name: '새봄', phone: '01024700001', created_at: '2026-11-01T00:00:00Z', attendance: [], ratings: [] })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: UX, name: '라온', phone: '01024700009', member_type: 'expert', photo_at: null, created_at: '2026-11-01T00:00:00Z', attendance: [], ratings: [] })

  const b = await chromium.launch()
  const errs = []
  const page = async (uid, opt = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opt })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 출퇴근 탭 '현황 복사'
  const a = await page(A, { permissions: ['clipboard-read', 'clipboard-write'] })
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`, { waitUntil: 'networkidle' })
  const btn = a.getByRole('button', { name: '현황 복사' })
  await btn.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'현황 복사'는 '명단 복사' 바로 앞", await a.evaluate(() => {
    const bs = [...document.querySelectorAll('button')].map((x) => x.textContent.trim())
    const i = bs.indexOf('현황 복사')
    return i >= 0 && bs[i + 1] === '명단 복사'
  }))
  await btn.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
  await a.waitForTimeout(300)
  // 누르면 글자가 '복사됨 ✓'로 바뀌므로 자리는 누르기 전에 잼
  const bx = await btn.locator('xpath=..').boundingBox()
  await btn.click()
  ok("누르면 '복사됨 ✓'", one(await a.locator('button', { hasText: '복사됨' }).first().innerText().catch(() => '')) === '복사됨 ✓')
  if (SHOTS && bx) {
    await a.waitForTimeout(250)
    await a.screenshot({ path: `${SHOTS}/att-status-copy.png`, clip: { x: 0, y: Math.max(0, bx.y - 150), width: 360, height: 210 } }).catch(() => {})
  }
  const clip = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  const lines = clip.split('\n')
  ok('첫 줄: [공고 이름] 날짜 시각 출근 현황', /^\[경상남도 생활체육대축전 행사장 안내 스태프\] \d{1,2}\/\d{1,2}\([일월화수목금토]\) \d{1,2}:\d\d 출근 현황$/.test(lines[0] ?? ''), lines[0])
  ok("둘째 줄: '확정 1명 · 근무 중 1 · 퇴근 0 · 미출근 0 · 지각 1'", /^확정 1명 · 근무 중 1 · 퇴근 0 · (출근 전|미출근|기록 없음) 0 · 지각 1$/.test(lines[1] ?? ''), lines[1])
  ok("셋째 줄: 배치별 'A게이트 1/1'", lines[2] === 'A게이트 1/1' && lines.length === 3, JSON.stringify(lines.slice(2)))
  ok('이름·전화번호는 안 들어감 (바로 밖으로 보내도 되게)', !/010|근무자|김지원/.test(clip), clip.replace(/\n/g, ' / '))
  // 명단 복사는 그대로 (이름·연락처)
  await a.waitForTimeout(1900)
  await a.getByRole('button', { name: '명단 복사' }).click()
  const clip2 = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok('명단 복사는 그대로 (배치별 이름·연락처)', clip2.includes('■ A게이트') && clip2.includes('근무자 010-3333-4444'), clip2.replace(/\n/g, ' / '))
  ok('360px 옆으로 안 밀림 (출퇴근 탭 · 할 일 칩은 줄 안에서 넘김)', await noSide(a))
  // 근무 중이 0명이면 '근무 중 0'으로 (지각은 여전히 1)
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { clock_out: `${today}T00:30:00.000Z` })
  await a.reload({ waitUntil: 'networkidle' })
  await a.getByRole('button', { name: '현황 복사' }).click()
  const clip3 = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok("퇴근하면 '근무 중 0 · 퇴근 1'", /확정 1명 · 근무 중 0 · 퇴근 1 · (출근 전|미출근|기록 없음) 0 · 지각 1/.test(clip3), clip3.split('\n')[1])
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { clock_out: null })

  // ── 2. 전문가 프로필 문구
  const x = await page(UX)
  await x.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  const xt = one(await x.locator('main').innerText().catch(() => ''))
  ok("전문가: 뒤로 가기 '← 내 일'", (await x.getByRole('link', { name: '← 내 일' }).count()) === 1)
  ok("전문가: '다 채우면 확정·대금이 빨라져요'", xt.includes('다 채우면 확정·대금이 빨라져요') && !xt.includes('급여가 빨라져요'))
  ok('360px 옆으로 안 밀림 (전문가 프로필)', await noSide(x))
  if (SHOTS) await x.screenshot({ path: `${SHOTS}/expert-profile-top.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})
  const wk = await page(W)
  await wk.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  const wt = one(await wk.locator('main').innerText())
  ok("알바는 그대로 '← 내 근무' · (정보 채우기 칸이 있으면) '확정·급여가 빨라져요'", (await wk.getByRole('link', { name: '← 내 근무' }).count()) === 1 && (!wt.includes('정보 채우기') || wt.includes('다 채우면 확정·급여가 빨라져요')), wt.slice(0, 80))

  // ── 3. 하루짜리 공고엔 '모든 날짜 가능해요' 칩 없음
  const n = await page(UN)
  const chips = async () => (await n.locator('#message').locator('xpath=..').locator('button').allInnerTexts()).map(one)
  await n.goto(`${D}/jobs/${J1}`, { waitUntil: 'networkidle' })
  await n.locator('#message').waitFor({ timeout: 15000 }).catch(() => {})
  const c1 = await chips()
  ok("하루짜리 공고: '+ 모든 날짜 가능해요' 없음 · 다른 칩은 그대로", c1.length === 5 && !c1.includes('+ 모든 날짜 가능해요') && c1.includes('+ 일찍 도착할 수 있어요'), JSON.stringify(c1))
  ok('360px 옆으로 안 밀림 (하루짜리 지원)', await noSide(n))
  if (SHOTS) {
    await n.locator('#message').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await n.waitForTimeout(300)
    const bx = await n.locator('#message').locator('xpath=..').boundingBox()
    if (bx) await n.screenshot({ path: `${SHOTS}/apply-chips-oneday.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(200, bx.height + 16) } }).catch(() => {})
  }
  await n.goto(`${D}/jobs/${J3}`, { waitUntil: 'networkidle' })
  await n.locator('#message').waitFor({ timeout: 15000 }).catch(() => {})
  const c3 = await chips()
  ok("사흘짜리 공고: '+ 모든 날짜 가능해요' 있음", c3.length === 6 && c3.includes('+ 모든 날짜 가능해요'), JSON.stringify(c3))
  await n.getByRole('button', { name: '+ 모든 날짜 가능해요' }).click()
  ok('누르면 한마디 칸에 들어감', (await n.locator('#message').inputValue()) === '모든 날짜 가능해요')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
