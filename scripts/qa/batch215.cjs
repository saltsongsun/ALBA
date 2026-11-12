// 묶음 215 (정기 개선 2026-11-12 11:35 KST · 사용자 요청 '안 뽑힌 지원자가 연락 와'의 이어서)
// · 대시보드 '확인할 일': 끝난 행사(지난 30일)인데 결과를 못 들은 대기 지원자 → 공고 이름 / 아래 작은 줄 '끝난 행사 · 결과 안 알림' + 오른쪽 '미선발 알림'
//   - 두 번 눌러야 (첫 누름 'n명에게 알릴까요?') → 대시보드로 돌아와 '대기 n명 미선발 · 알림을 보냈어요' · 줄이 사라짐
//   - 보류한 지원자는 세지도 알리지도 않음
// · 근무자 공고 화면: 확정 없이 행사가 끝났으면 '행사가 끝나 이번에는 확정되지 않았어요.' (진행 단계·지원 취소·'확정되면 알려 드릴게요' 없음) + 다른 알바 보기
// · 공고 목록 · 새 공고 쓰기를 여는 동안 각 화면 모양의 불러오는 화면 (대시보드 모양 대신)
// node scripts/qa/batch215.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
const J6 = 'cccccccc-0000-4000-8000-00000000c215', AW = '11111111-0000-4000-8000-00000000a215', AH = '11111111-0000-4000-8000-00000000b215'
const T = '지난 주말 플리마켓 안내'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  // 준비: 사흘 전에 끝난 공고 (모집 중으로 남음) · 근무자 W 대기 · 지원자 AP 대기지만 보류
  const nowIso = new Date().toISOString()
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const d = kst(-3)
  const j6 = { ...j1, id: J6, title: T, start_date: d, end_date: d, status: 'open', hidden_fields: [], applications: [{ status: 'applied' }, { status: 'applied' }], required_docs: [], created_at: nowIso }
  await rest('jobs', 'POST', j6)
  const [aw] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [aa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`)
  await rest('applications', 'POST', { ...aw, id: AW, job_id: J6, status: 'applied', available_dates: null, position: null, held_at: null, decided_at: null, job: j6, created_at: nowIso })
  await rest('applications', 'POST', { ...aa, id: AH, job_id: J6, status: 'applied', available_dates: null, held_at: nowIso, decided_at: null, job: j6, created_at: nowIso })

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

  // ── 1. 근무자: 확정 없이 끝난 행사
  const w = await mk(W)
  await w.goto(`${D}/jobs/${J6}`, { waitUntil: 'networkidle' })
  const res = w.locator('[data-app-result]')
  await res.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무자: '행사가 끝나 이번에는 확정되지 않았어요.'", (await res.getAttribute('data-app-result').catch(() => '')) === 'lapsed' && one(await res.innerText().catch(() => '')) === '행사가 끝나 이번에는 확정되지 않았어요.', one(await res.innerText().catch(() => '')))
  const body1 = await w.locator('main').innerText().catch(() => '')
  ok("진행 단계 · '지원 취소' · '확정되면 알려 드릴게요' · 답 시간 안내 없음", (await w.locator('[data-apply-steps]').count()) === 0 && !body1.includes('지원 취소') && !body1.includes('확정되면 알려 드릴게요') && (await w.locator('[data-reply-time]').count()) === 0)
  ok("다음 할 일: '모집 중인 다른 알바 보기 →'", (await w.getByRole('link', { name: '모집 중인 다른 알바 보기 →' }).count()) === 1)
  ok('360px 옆으로 안 밀림 (공고 화면)', await noSide(w))
  if (SHOTS) await res.locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/worker-lapsed.png` }).catch(() => {})

  // ── 2. 대시보드 '확인할 일' 줄
  const a = await mk(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const row = a.locator(`[data-todo="lapsed-${J6}"]`)
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  const rowText = one(await row.locator('a').innerText().catch(() => ''))
  ok(`'${T}' / 아래 작은 줄 '끝난 행사 · 결과 안 알림' · 1명 (보류한 사람은 빼고)`, rowText === `${T} 끝난 행사 · 결과 안 알림 1명`, rowText)
  ok('줄을 누르면 그 공고 지원자 탭으로', (await row.locator('a').getAttribute('href')) === `/admin/jobs/${J6}?tab=apps`)
  const btn = row.locator('[data-lapsed-notify] button')
  // 공고 이름이 잘려도 보이게 이름이 위 · 설명은 아래 작은 줄 (두 줄 · 줄마다 한 줄로 잘림)
  const lines = await row.locator('a > span.flex-1 > span').evaluateAll((l) => l.map((x) => x.getBoundingClientRect().height))
  ok("오른쪽 '미선발 알림' 버튼 · 공고 이름과 설명이 각각 한 줄 · 화면 안 · 옆으로 안 밀림", one(await btn.innerText().catch(() => '')) === '미선발 알림' && lines.length === 2 && lines.every((h) => h < 26) && (await row.evaluate((el) => el.getBoundingClientRect().height < 64)) && (await btn.evaluate((el) => el.getBoundingClientRect().right <= innerWidth - 8)) && (await noSide(a)))
  if (SHOTS) {
    await row.scrollIntoViewIfNeeded().catch(() => {})
    await row.locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/todo-lapsed.png` }).catch(() => {})
  }
  await btn.click()
  await a.waitForTimeout(400)
  ok("첫 누름: '1명에게 알릴까요?' (아직 그대로)", one(await btn.innerText().catch(() => '')) === '1명에게 알릴까요?' && (await rest(`applications?id=eq.${AW}`))[0].status === 'applied')
  ok('확인 문구도 화면 안 · 옆으로 안 밀림', (await btn.evaluate((el) => el.getBoundingClientRect().right <= innerWidth - 8)) && (await noSide(a)))
  if (SHOTS) await row.screenshot({ path: `${SHOTS}/todo-lapsed-armed.png` }).catch(() => {})
  await btn.click()
  const done = await a.getByText('대기 1명 미선발 · 알림을 보냈어요').first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  ok("두 번째 누름: 대시보드에 '대기 1명 미선발 · 알림을 보냈어요'", done && new URL(a.url()).pathname === '/admin')
  const apps = await rest(`applications?job_id=eq.${J6}`)
  ok('대기자는 미선발 · 보류한 사람은 그대로', apps.find((x) => x.id === AW)?.status === 'rejected' && apps.find((x) => x.id === AH)?.status === 'applied', apps.map((x) => x.status).join(','))
  const msgs = await rest('messages')
  const mw = msgs.filter((m) => m.thread_user_id === W && m.job_id === J6 && (m.body ?? '').startsWith('🙏 이번엔 함께하지 못해요'))
  ok("근무자에게 '이번에는 함께하지 못하게 됐어요' 알림 · 보류한 사람에겐 안 감", mw.length === 1 && mw[0].body.includes('이번에는 함께하지 못하게 됐어요') && msgs.filter((m) => m.thread_user_id === AP && m.job_id === J6).length === 0, JSON.stringify(mw.map((m) => m.body.slice(0, 90))))
  ok('처리 뒤 그 줄이 사라짐', (await a.locator(`[data-todo="lapsed-${J6}"]`).count()) === 0)

  // ── 3. 근무자: 이제 미선발 결과
  await w.goto(`${D}/jobs/${J6}`, { waitUntil: 'networkidle' })
  ok("근무자: '이번에는 함께하지 못하게 됐어요.'", (await w.locator('[data-app-result]').getAttribute('data-app-result').catch(() => '')) === 'rejected')

  // ── 4. 불러오는 화면: 공고 목록 · 새 공고 쓰기
  // 링크가 화면 모양(불러오는 화면)을 미리 받아 둔 뒤, 화면 내용 응답만 1.5초 늦춤 (느린 휴대폰 망처럼)
  const slow = (path) => async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch'] && new URL(route.request().url()).pathname === path) await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {})
  }
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  const listLink = a.locator('a[href="/admin/jobs"]').filter({ visible: true }).first()
  await listLink.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForTimeout(500)
  await a.route('**/admin/jobs**', slow('/admin/jobs'))
  await listLink.click()
  const sk1 = a.locator('[data-skeleton="admin-jobs"]')
  const shown1 = await sk1.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('공고 목록을 여는 동안 목록 모양 (대시보드 모양 아님)', shown1 && (await sk1.locator('.card').count()) >= 4)
  if (SHOTS && shown1) await a.waitForTimeout(400).then(() => a.screenshot({ path: `${SHOTS}/jobs-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 740 } })).catch(() => {}) // 화면 넘김(밀려 들어오기)이 끝난 뒤
  ok('불러오는 화면도 360px 옆으로 안 밀림 (목록)', await noSide(a))
  await a.getByRole('heading', { name: '공고 · 출퇴근' }).waitFor({ timeout: 15000 }).catch(() => {})
  await a.unroute('**/admin/jobs**')
  ok('다 열리면 공고 목록', (await sk1.count()) === 0 && (await a.getByRole('heading', { name: '공고 · 출퇴근' }).count()) === 1)

  await a.waitForLoadState('networkidle').catch(() => {})
  await a.waitForTimeout(500)
  await a.route('**/admin/jobs/new**', slow('/admin/jobs/new'))
  await a.getByRole('link', { name: '+ 새 공고 등록' }).first().click()
  const sk2 = a.locator('[data-skeleton="job-form"]')
  const shown2 = await sk2.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('새 공고 쓰기를 여는 동안 쓰기 모양 (모집 대상 두 칸 · 칸 카드 · 아래 버튼)', shown2 && (await sk2.locator('.border-2').count()) === 2 && (await sk2.locator('.card').count()) >= 5)
  if (SHOTS && shown2) await a.waitForTimeout(400).then(() => a.screenshot({ path: `${SHOTS}/form-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 740 } })).catch(() => {})
  ok('불러오는 화면도 360px 옆으로 안 밀림 (쓰기)', await noSide(a))
  await a.locator('input[name=title]').waitFor({ timeout: 15000 }).catch(() => {})
  await a.unroute('**/admin/jobs/new**')
  ok('다 열리면 공고 쓰기 화면', (await sk2.count()) === 0 && (await a.locator('input[name=title]').count()) === 1)

  // 정리
  await rest(`applications?id=eq.${AW}`, 'DELETE')
  await rest(`applications?id=eq.${AH}`, 'DELETE')
  await rest(`jobs?id=eq.${J6}`, 'DELETE')
  for (const m of mw) await rest(`messages?id=eq.${m.id}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
