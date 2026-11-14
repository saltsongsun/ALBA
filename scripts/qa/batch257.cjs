// 묶음 257 (정기 개선 2026-11-15 05:35 KST)
// · 근무자 공고 화면: 담당자가 공고를 고쳐 '🔔 일정 변경'이 왔으면 맨 위에 무엇이 어떻게 바뀌었는지
//   (변경 알림을 누르면 이 화면으로 오는데, 어디가 바뀐 건지 표시가 없어 내용을 하나하나 비교해야 했음)
//   '시간 09:00~18:00 → 10:00~18:00' (예전 값 줄 긋기) · 안 읽었으면 '새' + [✓ 확인했어요] → '✓ 확인함' (화면 그대로)
//   확정·지원한 사람에게만 · 지원하지 않은 사람·다른 공고 변경은 안 보임 · 끝난 공고엔 안 보임
// · 취소된 행사 안내의 '문의함 보기'는 그 회사 문의함으로 (?co=) — 여러 회사에서 일하면 대화 목록부터 나오던 것
// node scripts/qa/batch257.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000257d2'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 준비: 우리 회사 내일 공고 J2 · 근무자 확정 (지원자 김지원은 이 공고에 지원 안 함)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const jb = { ...base, id: J2, title: '내일 박람회 안내', start_date: kst(1), end_date: kst(1), meeting_point: null, required_docs: [], created_at: new Date().toISOString() }
  await rest('jobs', 'POST', jb)
  await rest('applications', 'POST', { ...wApp, id: '11111111-0000-4000-8000-0000002570a2', job_id: J2, position: null, available_dates: null, job: jb })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)
  const box = w.locator('[data-job-change]')

  // ── 1. 변경 전: 칸 없음
  await w.goto(`${D}/jobs/${J2}`, { waitUntil: 'networkidle' })
  ok('변경이 없으면 칸 없음', (await box.count()) === 0)

  // ── 2. 관리자가 공고를 고침 (시작 10:00 · 집결 정문 앞) → 근무자 공고 화면 맨 위에
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/${J2}/edit`, { waitUntil: 'networkidle' })
  await a.locator('input[name=start_time]').evaluate((el) => (el.value = '10:00'))
  await a.locator('input[name=meeting_point]').evaluate((el) => (el.value = '정문 앞 안내 천막'))
  await a.getByRole('button', { name: '공고 저장' }).click()
  await a.getByText(/바뀐 내용을 알렸어요/).first().waitFor({ timeout: 15000 }).catch(() => {})
  await w.goto(`${D}/jobs/${J2}`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  const rows = (await box.locator('[data-change-row]').allTextContents()).map(one)
  ok("맨 위에 바뀐 것: '시간 09:00~18:00 → 10:00~18:00' · '집결 없음 → 정문 앞 안내 천막'", JSON.stringify(rows) === JSON.stringify(['시간 09:00~18:00 → 10:00~18:00', '집결 없음 → 정문 앞 안내 천막']), JSON.stringify(rows))
  ok("머리줄 '🔔 …에 일정이 바뀌었어요 새' · 공고 카드보다 위", /^🔔 \d{1,2}\/\d{1,2}\([일월화수목금토]\)에 일정이 바뀌었어요새$/.test(one(await box.locator('a span').first().textContent().catch(() => ''))) && (await box.locator('[data-notice-new]').count()) === 1 && (await box.evaluate((el) => !!el.nextElementSibling?.classList.contains('card') && el.getBoundingClientRect().bottom <= el.nextElementSibling.getBoundingClientRect().top).catch(() => false)), one(await box.locator('a span').first().textContent().catch(() => '')))
  ok('칸을 누르면 그 회사 문의함 (?co=)', (await box.locator('a').first().getAttribute('href')) === `/me/chat?co=${C1}`)
  ok('360px 옆으로 안 밀림 · 줄마다 한 줄', (await noSide(w)) && (await box.locator('a').first().evaluate((el) => [...el.children].every((c) => c.getBoundingClientRect().height < 24)).catch(() => false)))
  if (SHOTS) {
    await w.evaluate(() => scrollTo(0, 0))
    await w.waitForTimeout(400)
    await w.screenshot({ path: `${SHOTS}/job-change-top.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})
  }

  // ── 3. [✓ 확인했어요] → '✓ 확인함' · 화면 그대로 · 그 글만 읽음
  await box.getByRole('button', { name: '✓ 확인했어요' }).click()
  await box.locator('[data-notice-acked]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 '✓ 확인함' (톡) · 버튼 없음 · 공고 화면 그대로", (await box.getAttribute('data-change-note')) === 'read' && one(await box.locator('[data-notice-acked]').textContent().catch(() => '')) === '✓ 확인함' && (await box.getByRole('button').count()) === 0 && new URL(w.url()).pathname === `/jobs/${J2}`)
  const ms = await rest(`messages?thread_user_id=eq.${W}`)
  ok('그 변경 글만 읽음 (담당자 다른 답장은 그대로)', ms.filter((m) => m.job_id === J2 && m.body.startsWith('🔔 일정 변경')).every((m) => !!m.read_at) && ms.find((m) => m.id === 2)?.read_at === null)
  if (SHOTS) {
    await w.evaluate(() => scrollTo(0, 0))
    await w.waitForTimeout(400)
    await w.screenshot({ path: `${SHOTS}/job-change-acked.png`, clip: { x: 0, y: 0, width: 360, height: 360 } }).catch(() => {})
  }

  // ── 4. 지원하지 않은 사람에겐 안 보임 · 다른 공고 변경은 안 섞임
  const ap = await mk(AP)
  await ap.goto(`${D}/jobs/${J2}`, { waitUntil: 'networkidle' })
  ok('지원하지 않은 사람에겐 칸 없음', (await ap.locator('[data-job-change]').count()) === 0)
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  ok('다른 공고 화면엔 이 변경이 안 보임', (await w.locator('[data-job-change]').count()) === 0)

  // ── 5. 끝난 공고엔 안 보임
  await rest(`jobs?id=eq.${J2}`, 'PATCH', { start_date: kst(-3), end_date: kst(-2) })
  await w.goto(`${D}/jobs/${J2}`, { waitUntil: 'networkidle' })
  ok('끝난 공고엔 칸 없음', (await box.count()) === 0)

  // ── 6. 취소된 행사: '문의함 보기'는 그 회사 문의함
  await rest(`jobs?id=eq.${J2}`, 'PATCH', { start_date: kst(1), end_date: kst(1), status: 'cancelled' })
  await w.goto(`${D}/jobs/${J2}`, { waitUntil: 'networkidle' })
  const inbox = w.getByRole('link', { name: '문의함 보기' })
  ok("취소된 행사: '문의함 보기' → 그 회사 문의함 (?co=) · 변경 칸은 안 보임", (await inbox.getAttribute('href').catch(() => '')) === `/me/chat?co=${C1}` && (await box.count()) === 0, await inbox.getAttribute('href').catch(() => ''))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
