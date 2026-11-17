// 묶음 288 (사용자 요청 2026-11-17 "채용 중인 인원 안 보이는 게 기본이고 보이기 기능을 켤 수 있게")
// · 근무자 화면(공고 카드 · 공고 화면): 남은 자리('n자리 남음' · '마감 임박 · n자리') · 칸 막대 · 'n명 모집 · m명 확정'은 기본으로 숨김
//   (표시가 없는 예전 공고도 숨김 · DB는 그대로 — 공고 표시 설정 칸에 '켰음' 표시)
// · 공고 쓰기·고치기: '모집 인원' 칸 바로 아래 '근무자에게 인원 보이기' (기본 꺼짐) → 켜고 저장하면 근무자에게 보임 · 끄면 다시 숨김
//   '공고에 보일 내용' 스위치 목록에서는 인원이 빠짐 (한 곳에서만 정함)
// · 관리자 화면의 인원 표시는 그대로
// node scripts/qa/batch288.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 내일 하루짜리 · 10명 모집 · 표시 설정 없음 (예전 공고와 같음)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(1), end_date: kday(1), headcount: 10, status: 'open', hidden_fields: [] })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const g = await mk(null)
  const card = () => g.locator(`a[href="/jobs/${J}"]`).first()
  const seeCard = async () => {
    await g.goto(`${D}/`, { waitUntil: 'networkidle' })
    await card().waitFor({ timeout: 15000 }).catch(() => {})
    const t = one(await card().innerText().catch(() => ''))
    return { t, bar: await card().locator('[role=img][aria-label*="명 중"]').count() }
  }
  const seeJob = async () => {
    await g.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
    const t = one(await g.locator('main').innerText().catch(() => ''))
    return { t, bar: await g.locator('main dd [role=img][aria-label*="명 중"]').count() }
  }

  // ── 1. 기본: 근무자에게 인원이 안 보임
  const c0 = await seeCard()
  ok("공고 카드: '자리 남음'·'마감 임박'·'명 확정'·칸 막대 없음 (모집중 배지는 그대로)", !/자리 남음|마감 임박|명 확정/.test(c0.t) && c0.bar === 0 && c0.t.includes('모집중'), c0.t.slice(0, 120))
  ok('360px 옆으로 안 밀림 (홈)', await noSide(g))
  if (SHOTS) await card().screenshot({ path: `${SHOTS}/card-hidden.png` }).catch(() => {})
  const j0 = await seeJob()
  ok("공고 화면: 'n명 모집 · m명 확정'·칸 막대 없음", !/명 모집 · \d+명 확정/.test(j0.t) && j0.bar === 0)

  // ── 2. 관리자: 공고 고치기 · '모집 인원' 바로 아래 '근무자에게 인원 보이기' (꺼짐)
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/${J}/edit`, { waitUntil: 'networkidle' })
  if (!(await a.locator('input[name=headcount]').isVisible().catch(() => false))) await a.locator('summary', { hasText: '일정 · 인원' }).first().click()
  await a.locator('input[name=headcount]').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const show = a.locator('[data-headcount-show] input')
  ok("'근무자에게 인원 보이기'는 기본 꺼짐 · 안내 줄 없음", (await show.count()) === 1 && !(await show.isChecked()) && (await a.locator('[data-headcount-show-hint]').count()) === 0)
  ok("'인원 미정'과 한 줄 · 누르기 쉬움(36px 이상)", await a.locator('[data-headcount-show]').evaluate((el) => { const t = document.querySelector('[data-headcount-tbd]').getBoundingClientRect(); const r = el.getBoundingClientRect(); return Math.abs(r.top - t.top) < 4 && r.height >= 36 }))
  const fold = a.locator('details', { hasText: '공고에 보일 내용' }).first()
  ok("'공고에 보일 내용' 스위치 목록에는 인원이 없음 (한 곳에서만)", (await fold.locator('input[name=show_fields][value=headcount]').count()) === 0 && (await a.locator('input[name=show_fields][value=headcount]').count()) === 1)
  await show.check()
  await a.waitForTimeout(250)
  ok("켜면 '공고에 ‘남은 자리’가 보여요' (한 줄)", one(await a.locator('[data-headcount-show-hint]').innerText().catch(() => '')) === '공고에 ‘남은 자리’가 보여요' && (await a.locator('[data-headcount-show-hint]').evaluate((el) => el.getBoundingClientRect().height < 22)))
  ok('360px 옆으로 안 밀림 (공고 고치기)', await noSide(a))
  if (SHOTS) {
    await a.locator('input[name=headcount]').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    const box = await a.locator('input[name=headcount]').boundingBox()
    if (box) await a.screenshot({ path: `${SHOTS}/form-show.png`, clip: { x: 0, y: Math.max(0, box.y - 110), width: 360, height: 250 } }).catch(() => {})
  }
  const save = async () => {
    await a.getByRole('button', { name: '공고 저장' }).click()
    await a.waitForURL((u) => !new URL(u).pathname.endsWith('/edit'), { timeout: 20000 }).catch(() => {})
    await a.waitForLoadState('networkidle').catch(() => {})
  }
  await save()
  const [s1] = await rest(`jobs?id=eq.${J}`)
  ok("저장하면 '켰음' 표시가 남음 (다른 표시 항목은 그대로 보임)", (s1.hidden_fields ?? []).includes('headcount_shown') && !(s1.hidden_fields ?? []).some((k) => ['estimate', 'break', 'tax', 'docs'].includes(k)), JSON.stringify(s1.hidden_fields))

  // ── 3. 켠 뒤: 근무자에게 남은 자리 · 칸 막대 · 'n명 모집'
  const c1 = await seeCard()
  ok("공고 카드: 남은 자리('자리 남음' 또는 '마감 임박') · 칸 막대 보임", /\d+자리 남음|마감 임박 · \d+자리/.test(c1.t) && c1.bar === 1, c1.t.slice(0, 120))
  if (SHOTS) await card().screenshot({ path: `${SHOTS}/card-shown.png` }).catch(() => {})
  const j1 = await seeJob()
  ok("공고 화면: '10명 모집 · n명 확정' · 칸 막대", /10명 모집 · \d+명 확정/.test(j1.t) && j1.bar === 1)

  // ── 4. 다시 끄면 숨김
  await a.goto(`${D}/admin/jobs/${J}/edit`, { waitUntil: 'networkidle' })
  if (!(await a.locator('input[name=headcount]').isVisible().catch(() => false))) await a.locator('summary', { hasText: '일정 · 인원' }).first().click()
  ok('다시 열면 켜진 채', await show.isChecked().catch(() => false))
  await show.uncheck()
  await save()
  const [s2] = await rest(`jobs?id=eq.${J}`)
  const c2 = await seeCard()
  ok('끄고 저장하면 다시 숨김', !(s2.hidden_fields ?? []).includes('headcount_shown') && !/자리 남음|마감 임박|명 확정/.test(c2.t) && c2.bar === 0)

  // ── 5. 새 공고도 기본 꺼짐 · 관리자 공고 목록의 인원은 그대로
  await a.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
  if (!(await a.locator('input[name=headcount]').isVisible().catch(() => false))) await a.locator('summary', { hasText: '일정 · 인원' }).first().click()
  ok('새 공고: 근무자에게 인원 보이기 꺼짐', (await a.locator('[data-headcount-show] input').count()) === 1 && !(await a.locator('[data-headcount-show] input').isChecked()))
  await a.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' })
  ok("관리자 공고 목록: 확정/모집 인원은 그대로 ('/10')", (await a.locator(`a[href="/admin/jobs/${J}"]`).first().innerText().catch(() => '')).includes('/10'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
