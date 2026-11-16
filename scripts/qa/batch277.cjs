// 묶음 277 (사용자 요청 2026-11-16 "지원자 화면 다시 그리는 것도 고쳐줘 · 화면 디자인들 최대한 심플 · 내근무를 두번이상 누르는거는
//   내가 내근무에 있는지 모르는거 같아 메뉴에 표시가 필요 · 문의에서 이렇게 뜨는 경우가 많은데 바로 처리하는 버튼을 띄우자")
// · 관리자 문의 대화: 근무자의 '✏️ 기록 정정 요청' 아래 '요청대로 고치기 · 그대로 두기' (출퇴근 탭으로 가지 않고 바로)
//   고치면 그 대화로 돌아와 '종료 시각을 HH:MM(으)로 고쳤어요.' · 기록이 고쳐짐 · 버튼이 사라지고 '✅ 기록 정정' 안내 한 줄
//   그대로 두기는 한 번 더 눌러야 · 기록은 그대로
// · '📍 출근 확인 요청'(위치 확인 실패) 아래 'HH:MM 출근 처리' → 그 시각으로 출근 기록
// · 버튼으로 처리한 대화는 문의함 '답장 전' · 홈 할 일에서 빠짐 (결과 안내가 답장)
// · 근무자 아래 메뉴: 지금 있는 탭은 진한 색 바탕 + 흰 글자 · 화면 위에 '내 근무 · 날짜'
//   이미 맨 위에서 '내 근무'를 또 누르면 "지금 '내 근무' 화면이에요" 말풍선 (잠시 뒤 사라짐) · 아래로 내려가 있으면 맨 위로
// · 지원자 탭: 휴대폰은 카드만 · PC는 표만 그림 (예전엔 둘 다) · 접힌 '확정' 칸은 펼칠 때 그림
// node scripts/qa/batch277.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', ATT = 'eeeeeeee-0000-4000-8000-000000000005'
const U2 = 'bbbbbbbb-0000-4000-8000-000000277002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()
const kst = (d) => new Date(new Date(d).getTime() + 9 * 3600e3)
const hm = (d) => kst(d).toISOString().slice(11, 16)
const today = kst(Date.now()).toISOString().slice(0, 10)
const md = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(`${s}T00:00:00Z`).getUTCDay()]})` }

;(async () => {
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  const attId = att?.id ?? ATT
  // 오늘 근무: 2시간 전 시작 · 10분 전 종료 → 근무자가 '실제 종료는 30분 전'이라고 정정 요청
  const inAt = ago(120), outAt = ago(10), want = ago(30)
  await rest(`attendance?id=eq.${attId}`, 'PATCH', { clock_in: inAt, clock_out: outAt, adj_in: null, adj_out: null, paid: false, note: null })
  for (const m of await rest(`messages?thread_user_id=eq.${W}`)) await rest(`messages?id=eq.${m.id}`, 'PATCH', { created_at: ago(30 * 1440), read_at: ago(30 * 1440) })
  const fixBody = (field, time) => `✏️ 기록 정정 요청\n${job.title} · ${md(today)} 근무\n기록 ${hm(inAt)}~${hm(outAt)} → 실제 ${field} ${time}\n사유: 정리하고 나왔어요`
  await rest('messages', 'POST', [
    { id: 2770001, company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, job_id: J, body: fixBody('종료', hm(want)), read_at: null, created_at: ago(5), job: { id: J, title: job.title }, sender: { name: '근무자' } },
  ])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const flash = () => decodeURIComponent(new URL(p.url()).searchParams.get('m') ?? '')

  // ── 1. 정정 요청 → 대화에서 바로 '요청대로 고치기'
  await p.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  const quick = p.locator('[data-chat-quick="fix"]')
  await quick.waitFor({ timeout: 15000 }).catch(() => {})
  const btns = await quick.locator('button').allTextContents().catch(() => [])
  ok("정정 요청 아래 '요청대로 고치기 · 그대로 두기'", btns.map(one).join('|') === '요청대로 고치기|그대로 두기', btns.map(one).join('|'))
  ok("예전 '출퇴근 탭에서 처리 →' 링크는 없음 (버튼 두 개만)", (await p.getByText('출퇴근 탭에서 처리 →').count()) === 0)
  ok("고치지 않고 글만 보내는 빠른 답장 '요청대로 기록을 고쳤어요.'는 없음", (await p.getByRole('button', { name: '요청대로 기록을 고쳤어요.' }).count()) === 0)
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) {
    await quick.scrollIntoViewIfNeeded().catch(() => {})
    await p.screenshot({ path: `${SHOTS}/chat-fix-buttons.png` }).catch(() => {})
  }
  await Promise.all([p.waitForURL(/m=/, { timeout: 30000 }).catch(() => {}), quick.getByRole('button', { name: '요청대로 고치기' }).click()])
  ok(`고치면 그 대화로 돌아와 '종료 시각을 ${hm(want)}(으)로 고쳤어요.'`, new URL(p.url()).pathname === `/admin/chat/${W}` && flash() === `종료 시각을 ${hm(want)}(으)로 고쳤어요.`, `${new URL(p.url()).pathname} · ${flash()}`)
  const [att2] = await rest(`attendance?id=eq.${attId}`)
  ok(`근무 기록의 종료 시각이 ${hm(want)}로 고쳐짐`, att2?.adj_out && hm(att2.adj_out) === hm(want), att2?.adj_out ?? 'null')
  await p.waitForLoadState('networkidle')
  ok('처리한 요청에는 버튼이 다시 안 보임', (await p.locator('[data-chat-quick]').count()) === 0)
  const done = p.locator('[data-auto-notice] summary', { hasText: '✅ 기록 정정' })
  ok("근무자에게 간 '✅ 기록 정정' 안내는 한 줄로", (await done.count()) === 1, one(await done.first().textContent().catch(() => '')))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chat-fix-done.png` }).catch(() => {})

  // ── 2. 그 뒤에 온 다른 요청(출근 시각) → '그대로 두기'는 한 번 더 눌러야 · 기록 그대로
  await rest('messages', 'POST', [
    { id: 2770002, company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, job_id: J, body: fixBody('출근', hm(ago(150))), read_at: null, created_at: new Date().toISOString(), job: { id: J, title: job.title }, sender: { name: '근무자' } },
  ])
  await p.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  const keep = p.locator('[data-chat-quick="fix"]').getByRole('button', { name: '그대로 두기' })
  await keep.click()
  await p.waitForTimeout(250)
  const armed = one(await p.locator('[data-chat-quick="fix"] button').last().textContent().catch(() => ''))
  ok("'그대로 두기' 한 번 누르면 '한 번 더 누르면 그대로 둬요'", armed === '한 번 더 누르면 그대로 둬요', armed)
  await Promise.all([p.waitForURL(/m=/, { timeout: 30000 }).catch(() => {}), p.locator('[data-chat-quick="fix"] button').last().click()])
  ok("한 번 더 → '정정하지 않고 근무자에게 알렸어요.'", flash() === '정정하지 않고 근무자에게 알렸어요.', flash())
  const [att3] = await rest(`attendance?id=eq.${attId}`)
  ok('출근 기록은 그대로 (고치지 않음)', att3?.adj_in == null && hm(att3.adj_out) === hm(want))

  // ── 3. 출근 확인 요청 → 'HH:MM 출근 처리'
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('users', 'POST', [{ ...w1, id: U2, name: '위치실패', phone: '01027700002' }])
  await rest('applications', 'POST', [{ ...wa, id: '11111111-0000-4000-8000-000000277002', user_id: U2, status: 'approved', position: null }])
  const askAt = ago(3)
  await rest('messages', 'POST', [
    { id: 2770003, company_id: C1, thread_user_id: U2, sender_id: U2, from_admin: false, job_id: J, body: `📍 출근 확인 요청\n${job.title} · 현장에 도착했는데 위치 확인이 안 돼요 (약 1,200m로 잡힘)`, read_at: null, created_at: askAt, job: { id: J, title: job.title }, sender: { name: '위치실패' }, user: { id: U2, name: '위치실패', phone: '01027700002', photo_at: null, member_type: 'worker' } },
  ])
  await p.goto(`${D}/admin/chat/${U2}`, { waitUntil: 'networkidle' })
  const arrive = p.locator('[data-chat-quick="arrive"] button')
  await arrive.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`출근 확인 요청 아래 '${hm(askAt)} 출근 처리'`, one(await arrive.textContent().catch(() => '')) === `${hm(askAt)} 출근 처리`)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/chat-arrive-button.png` }).catch(() => {})
  await Promise.all([p.waitForURL(/m=/, { timeout: 30000 }).catch(() => {}), arrive.click()])
  ok(`처리하면 그 대화로 · '${hm(askAt)} 출근으로 처리했어요.'`, new URL(p.url()).pathname === `/admin/chat/${U2}` && flash() === `${hm(askAt)} 출근으로 처리했어요.`, flash())
  const [a2] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${U2}`)
  ok('그 시각으로 출근 기록이 생김', !!a2 && hm(a2.clock_in) === hm(askAt) && a2.work_date === today)
  await p.waitForLoadState('networkidle')
  ok('처리 뒤 출근 처리 버튼이 사라짐', (await p.locator('[data-chat-quick]').count()) === 0)
  // 버튼으로 처리한 것도 답한 것: 문의함 '답장 전' · 홈 할 일에 남지 않음
  await p.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  const rowOf = (u) => p.locator(`[data-inbox-row="${u}"]`)
  ok("버튼으로 처리한 두 대화는 문의함에서 '답장 전'이 아님", (await rowOf(W).count()) === 1 && (await rowOf(U2).count()) === 1 && (await p.locator(`[data-inbox-row="${W}"] [data-inbox-noreply], [data-inbox-row="${U2}"] [data-inbox-noreply]`).count()) === 0)
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok("홈 '읽고 아직 답하지 않은 문의'에도 안 남음", (await p.locator('[data-todo="noreply"]').count()) === 0, one(await p.locator('[data-todo="noreply"]').textContent().catch(() => '')))

  // ── 4. 근무자 아래 메뉴: 지금 탭 표시
  const wctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await wctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await wctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const wp = await wctx.newPage()
  wp.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await wp.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const nav = wp.locator('nav[data-bottom-nav]')
  await wp.waitForTimeout(400)
  const ind = await nav.locator('[data-tab-indicator]').evaluate((el) => getComputedStyle(el).backgroundColor)
  const act = nav.locator('[data-tab-active]')
  const actColor = await act.evaluate((el) => getComputedStyle(el).color).catch(() => '')
  ok("지금 탭 '내 근무': 진한 파란 바탕 + 흰 글자", ind === 'rgb(37, 87, 232)' && actColor === 'rgb(255, 255, 255)' && one(await act.textContent()).endsWith('내 근무'), `${ind} · ${actColor}`)
  const name = one(await wp.locator('[data-page-name]').textContent().catch(() => ''))
  ok("화면 위에 '내 근무 · 날짜'", name === `내 근무 · ${md(today)}`, name)
  await wp.evaluate(() => scrollTo(0, 0))
  await nav.getByRole('link', { name: /내 근무/ }).click()
  const here = wp.locator('[data-tab-here]')
  const shown = await here.waitFor({ timeout: 2000 }).then(() => true, () => false)
  ok("맨 위에서 '내 근무'를 또 누르면 '지금 ‘내 근무’ 화면이에요'", shown && one(await here.textContent()) === '지금 ‘내 근무’ 화면이에요', shown ? one(await here.textContent()) : '안 보임')
  ok('말풍선도 360px 안에', await wp.evaluate(() => { const r = document.querySelector('[data-tab-here]')?.getBoundingClientRect(); return !!r && r.left >= 0 && r.right <= innerWidth && document.scrollingElement.scrollWidth <= innerWidth + 1 }))
  if (SHOTS) await wp.screenshot({ path: `${SHOTS}/nav-here.png` }).catch(() => {})
  await wp.waitForTimeout(2300)
  ok('잠시 뒤 말풍선이 사라짐', (await here.count()) === 0)
  await wp.evaluate(() => scrollTo(0, 600))
  await wp.waitForTimeout(200)
  await nav.getByRole('link', { name: /내 근무/ }).click()
  await wp.waitForTimeout(900)
  ok('아래로 내려가 있으면 맨 위로 (말풍선 없이)', (await wp.evaluate(() => scrollY)) < 4 && (await here.count()) === 0)

  // ── 5. 지원자 탭: 화면에 맞는 목록만 · 접힌 칸은 펼칠 때
  await p.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  await p.waitForFunction(() => document.querySelectorAll('table.table th').length === 0, null, { timeout: 15000 }).catch(() => {})
  ok('휴대폰: 카드만 (PC 표는 그리지 않음)', (await p.locator('[data-app-list]').count()) === 1 && (await p.locator('th', { hasText: '가능일 · 한마디' }).count()) === 0)
  const fold = p.locator('[data-app-list] [data-app-group="확정"]')
  const before = await fold.locator('.card').count()
  await fold.locator('summary').click()
  await p.waitForTimeout(300)
  const after = await fold.locator('.card').count()
  ok("접힌 '확정' 칸은 펼칠 때 카드를 그림", before === 0 && after >= 2, `${before} → ${after}`)
  const pc = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' })
  await pc.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const pp = await pc.newPage()
  pp.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await pp.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  await pp.waitForFunction(() => !document.querySelector('[data-app-list]'), null, { timeout: 15000 }).catch(() => {})
  ok('PC: 표만 (휴대폰 카드는 그리지 않음)', (await pp.locator('th', { hasText: '가능일 · 한마디' }).count()) === 1 && (await pp.locator('[data-app-list]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
