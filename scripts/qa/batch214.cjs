// 묶음 214 (사용자 요청 2026-11-12 "모집인원 미정으로 하는 것도 만들어줘 · 10명이 기획이지만 5명만 뽑을 때도 있어 · 그러면 지원했지만 안 뽑힌 애들이 연락이 와")
// · 공고 쓰기 · 고치기: '인원 미정' 체크 → 칸 이름이 '최대 인원'으로 · '공고엔 인원 미정으로 보여요' · 저장하면 그대로 남음 (DB는 그대로 — 표시 설정 칸에 저장)
// · 근무자: 공고 화면 '인원 미정 · n명 확정' (최대 숫자·칸 막대 없음) · 공고 카드 '인원 미정' (남은 자리 안 보임)
// · 관리자: 공고 화면 '확정 n명 · 인원 미정' · 공고 목록도 같게
// · 지원자 탭: 아직 모집 중인데 확정한 사람이 있으면 '마감하고 대기 n명 미선발 알림' (두 번 눌러야) → 모집 마감 + 대기자 미선발 + 알림
// · 체크를 풀면 전처럼 'n명 모집'
// node scripts/qa/batch214.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
const J5 = 'cccccccc-0000-4000-8000-00000000c214', AW = '11111111-0000-4000-8000-00000000a214', AA = '11111111-0000-4000-8000-00000000b214'
const T = '가을 축제 안내 스태프 (인원 미정)'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  // 준비: 내일 공고 (모집 10명) · 근무자 W 확정 · 지원자 AP 대기
  const nowIso = new Date().toISOString()
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const d = kst(2)
  const j5 = { ...j1, id: J5, title: T, start_date: d, end_date: d, headcount: 10, status: 'open', hidden_fields: [], applications: [{ status: 'approved' }, { status: 'applied' }], required_docs: [], created_at: nowIso }
  await rest('jobs', 'POST', j5)
  const [aw] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [aa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`)
  await rest('applications', 'POST', { ...aw, id: AW, job_id: J5, status: 'approved', available_dates: null, position: null, job: j5, created_at: nowIso })
  await rest('applications', 'POST', { ...aa, id: AA, job_id: J5, status: 'applied', available_dates: null, held_at: null, decided_at: null, job: j5, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const tbdBox = () => a.locator('input[name=headcount_tbd]')
  const openSchedule = async () => {
    if (!(await a.locator('input[name=headcount]').isVisible().catch(() => false))) await a.locator('summary', { hasText: '일정 · 인원' }).first().click()
    await a.locator('input[name=headcount]').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  }
  const save = async () => {
    await a.getByRole('button', { name: '공고 저장' }).click()
    await a.waitForURL((u) => !new URL(u).pathname.endsWith('/edit'), { timeout: 20000 }).catch(() => {})
    await a.waitForLoadState('networkidle').catch(() => {})
  }

  // ── 1. 공고 고치기: '인원 미정' 체크
  await a.goto(`${D}/admin/jobs/${J5}/edit`, { waitUntil: 'networkidle' })
  await openSchedule()
  const field = a.locator('[data-headcount-tbd]').locator('xpath=..')
  ok("처음엔 '모집 인원 *' · 체크 안 됨", one(await field.locator('label.label').first().innerText().catch(() => '')) === '모집 인원 *' && !(await tbdBox().isChecked()))
  await tbdBox().check()
  await a.waitForTimeout(200)
  ok("체크하면 '최대 인원 *' · '공고엔 ‘인원 미정’으로 보여요'", one(await field.locator('label.label').first().innerText().catch(() => '')) === '최대 인원 *' && one(await a.locator('[data-headcount-tbd-hint]').innerText().catch(() => '')) === '공고엔 ‘인원 미정’으로 보여요')
  ok('체크 칸 누르기 쉬움 (높이 36px 이상) · 안내 한 줄 (휴대폰에선 인원 칸이 한 줄 전체) · 360px 옆으로 안 밀림', (await a.locator('[data-headcount-tbd]').evaluate((el) => el.getBoundingClientRect().height >= 36)) && (await a.locator('[data-headcount-tbd-hint]').evaluate((el) => el.getBoundingClientRect().height < 22)) && (await noSide(a)))
  if (SHOTS) {
    await a.locator('input[name=headcount]').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    const box = await a.locator('input[name=headcount]').boundingBox()
    if (box) await a.screenshot({ path: `${SHOTS}/form-tbd.png`, clip: { x: 0, y: Math.max(0, box.y - 120), width: 360, height: 260 } }).catch(() => {})
  }
  await save()
  const [s1] = await rest(`jobs?id=eq.${J5}`)
  ok('저장하면 인원 미정으로 남음 (숫자 10은 최대 인원으로)', (s1.hidden_fields ?? []).includes('headcount_tbd') && s1.headcount === 10, JSON.stringify(s1.hidden_fields))
  // 가짜 DB는 지원 행에 붙은 공고 사본을 따라 바꾸지 않음 → 맞춰 줌
  await rest(`applications?id=eq.${AW}`, 'PATCH', { job: { ...j5, hidden_fields: s1.hidden_fields } })
  await rest(`applications?id=eq.${AA}`, 'PATCH', { job: { ...j5, hidden_fields: s1.hidden_fields } })
  await a.goto(`${D}/admin/jobs/${J5}/edit`, { waitUntil: 'networkidle' })
  await openSchedule()
  ok('다시 열어도 체크된 채', await tbdBox().isChecked())

  // ── 2. 근무자 화면
  const w = await mk(W)
  await w.goto(`${D}/jobs/${J5}`, { waitUntil: 'networkidle' })
  const row = w.locator('[data-job-tbd]')
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("공고 화면: '인원 미정 · 1명 확정' (10명 모집·칸 막대 없음)", one(await row.innerText().catch(() => '')) === '인원 미정 · 1명 확정' && !(await w.locator('body').innerText()).includes('10명 모집'), one(await row.innerText().catch(() => '')))
  if (SHOTS) await row.locator('xpath=ancestor::div[1]').screenshot({ path: `${SHOTS}/job-tbd-row.png` }).catch(() => {})
  const g = await mk(null)
  await g.goto(`${D}/`, { waitUntil: 'networkidle' })
  const card = g.locator('a[href="/jobs/' + J5 + '"]').first()
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const ct = one(await card.innerText().catch(() => ''))
  ok("공고 카드: '인원 미정' (남은 자리·칸 막대 없음)", (await card.locator('[data-card-tbd]').count()) === 1 && !ct.includes('자리 남음') && !ct.includes('마감 임박') && !ct.includes('/10명'), ct.slice(0, 160))
  ok('360px 옆으로 안 밀림 (홈)', await noSide(g))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/card-tbd.png` }).catch(() => {})

  // ── 3. 관리자: 공고 화면 · 지원자 탭 '마감하고 대기 n명 미선발 알림'
  await a.goto(`${D}/admin/jobs/${J5}?tab=apps`, { waitUntil: 'networkidle' })
  ok("관리자 공고 화면·지원자 탭: '확정 1명 · 인원 미정 · 대기 1명' (모집 10명 대신)", (await a.locator('body').innerText()).includes('확정 1명 · 인원 미정 · 대기 1명') && !(await a.locator('body').innerText()).includes('모집 10명'))
  const cn = a.locator('[data-close-notify] button')
  await cn.waitFor({ timeout: 15000 }).catch(() => {})
  ok("모집 중 · 확정 1명 · 대기 1명: '🙏 마감하고 대기 1명 미선발 알림'", one(await cn.innerText().catch(() => '')) === '🙏 마감하고 대기 1명 미선발 알림')
  ok('버튼 한 줄 · 화면 안', await cn.evaluate((el) => el.getBoundingClientRect().height < 44 && el.getBoundingClientRect().right <= innerWidth - 8))
  if (SHOTS) {
    await cn.scrollIntoViewIfNeeded().catch(() => {})
    const box = await cn.boundingBox()
    if (box) await a.screenshot({ path: `${SHOTS}/close-notify.png`, clip: { x: 0, y: Math.max(0, box.y - 160), width: 360, height: 240 } }).catch(() => {})
  }
  await cn.click()
  await a.waitForTimeout(500)
  ok("첫 누름: '모집 마감 · 대기 1명에게 알릴까요?' (아직 그대로)", one(await cn.innerText().catch(() => '')).includes('모집 마감 · 대기 1명에게 알릴까요?') && (await rest(`jobs?id=eq.${J5}`))[0].status === 'open')
  await cn.click()
  const done = await a.getByText('모집을 마감하고 대기 1명에게 미선발을 알렸어요').first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  ok("두 번째 누름: '모집을 마감하고 대기 1명에게 미선발을 알렸어요'", done)
  const [s2] = await rest(`jobs?id=eq.${J5}`)
  const apps = await rest(`applications?job_id=eq.${J5}`)
  ok('공고는 모집 마감 · 대기자는 미선발 · 확정자는 그대로', s2.status === 'closed' && apps.find((x) => x.id === AA)?.status === 'rejected' && apps.find((x) => x.id === AW)?.status === 'approved', `${s2.status} ${apps.map((x) => x.status).join(',')}`)
  const msg = (await rest('messages')).filter((m) => m.thread_user_id === AP && m.job_id === J5 && (m.body ?? '').startsWith('🙏 이번엔 함께하지 못해요'))
  ok("대기자에게 '모집이 마감돼 이번에는 함께하지 못하게 됐어요' 안내 (확정자에게는 안 감)", msg.length === 1 && msg[0].body.includes('모집이 마감돼') && (await rest('messages')).filter((m) => m.thread_user_id === W && m.job_id === J5 && (m.body ?? '').startsWith('🙏')).length === 0)
  ok('처리 뒤 버튼 사라짐', (await a.locator('[data-close-notify]').count()) === 0)

  // ── 4. 체크를 풀면 전처럼
  await rest(`jobs?id=eq.${J5}`, 'PATCH', { status: 'open' })
  await a.goto(`${D}/admin/jobs/${J5}/edit`, { waitUntil: 'networkidle' })
  await openSchedule()
  await tbdBox().uncheck()
  await save()
  const [s3] = await rest(`jobs?id=eq.${J5}`)
  ok('체크를 풀면 표시도 빠짐', !(s3.hidden_fields ?? []).includes('headcount_tbd'))
  await w.goto(`${D}/jobs/${J5}`, { waitUntil: 'networkidle' })
  await w.waitForTimeout(300)
  ok("근무자 화면도 다시 '10명 모집'", (await w.locator('[data-job-tbd]').count()) === 0 && (await w.locator('body').innerText()).includes('10명 모집'))

  // 정리
  await rest(`applications?id=eq.${AW}`, 'DELETE')
  await rest(`applications?id=eq.${AA}`, 'DELETE')
  await rest(`jobs?id=eq.${J5}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
