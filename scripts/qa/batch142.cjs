// 묶음 142 (사용자 요청 2026-11-08 "관리자 편의성 · 반복적인 일을 해야 할 때 한 번에")
// · 지원자 탭: '모두 고르기'(보이는 대기 지원자만 · 휴대폰 카드/PC 표 중복 없이) → 아래 막대에서 '미선발 n명' · '선택 n명 확정'
// · 대시보드 '확정 대기 지원자': 여러 공고의 지원자를 골라 한 번에 확정 · 미선발 (공고별 남은 자리를 넘으면 한 번 더)
// · 다른 회사 지원은 끼워 넣어도 처리 안 됨 (company_id 확인)
// node scripts/qa/batch142.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const X = '33333333-0000-4000-8000-0000000014a1', Y = '33333333-0000-4000-8000-0000000014a2'
const XA = '11111111-0000-4000-8000-0000000014a1', YA = '11111111-0000-4000-8000-0000000014a2'
const OX = '11111111-0000-4000-8000-0000000014ff' // 다른 회사의 대기 지원
const C2 = '99999999-0000-4000-8000-0000000014c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const statusOf = async (id) => (await rest(`applications?id=eq.${id}`))[0]?.status

;(async () => {
  // 준비: 대기 지원자 3명 (기존 김지원 + 둘) · 모집 2명(확정 1명) · 다른 회사 대기 지원 1건
  // (오후 6시 뒤에 돌려도 '끝난 행사 · 확정?' 확인에 걸리지 않게 공고 날짜를 내일로)
  const tmr = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { headcount: 2, start_date: tmr, end_date: tmr })
  const [apApp] = await rest(`applications?id=eq.${AP_APP}`)
  const [apUser] = await rest(`users?id=eq.${AP}`)
  for (const [id, aid, name] of [[X, XA, '박하나'], [Y, YA, '최둘']]) {
    const u = { ...(apUser ?? apApp.user), id, name, phone: `0105555${id.slice(-4)}`, created_at: new Date().toISOString() }
    await rest('users', 'POST', u)
    await rest('applications', 'POST', { ...apApp, id: aid, user_id: id, user: { ...apApp.user, id, name, phone: u.phone }, held_at: null, status: 'applied', created_at: new Date().toISOString() })
  }
  await rest('applications', 'POST', { ...apApp, id: OX, company_id: C2, job_id: 'cccccccc-0000-4000-8000-0000000014c2', user_id: X, status: 'applied', job: { ...apApp.job, id: 'cccccccc-0000-4000-8000-0000000014c2' } })

  const b = await chromium.launch()
  const errs = []

  // ── PC: 표 머리의 '모두 고르기'는 보이는 칸만 (휴대폰 카드 칸까지 두 번 세지 않음)
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    await p.goto(`${D}/admin/jobs/${J}?tab=apps`)
    const all = p.locator('th [data-pick-all] input')
    await all.waitFor({ timeout: 15000 }).catch(() => {})
    ok('PC 표 머리에 모두 고르기 칸', await all.isVisible().catch(() => false))
    await all.check()
    const bar = p.locator('[data-bulk-bar]')
    await bar.waitFor({ timeout: 5000 }).catch(() => {})
    ok("PC: '3명 골랐어요' (카드 칸과 겹쳐 6명이 되지 않음)", (await bar.innerText().catch(() => '')).includes('3명 골랐어요'), (await bar.innerText().catch(() => '')).replace(/\n/g, ' / '))
    await bar.getByRole('button', { name: '선택 해제' }).click()
    await p.waitForTimeout(200)
    ok('선택 해제 → 막대 사라짐', (await bar.count()) === 0)
    await ctx.close()
  }

  // ── 휴대폰 지원자 탭: 모두 고르기 → 하나 풀기 → 미선발 2명 (두 번 눌러야)
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  const group = a.locator('[data-app-group="대기"]').first()
  await group.waitFor({ timeout: 15000 }).catch(() => {})
  ok("대기 무리 머리: '대기 3명' + '모두 고르기'", (await group.locator('h3').first().innerText().catch(() => '')) === '대기 3명' && (await group.locator('[data-pick-all]').isVisible()))
  const bar = a.locator('[data-bulk-bar]')
  ok('아무도 안 고르면 막대 없음', (await bar.count()) === 0)
  await group.locator('[data-pick-all] input').check()
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  await a.waitForTimeout(350) // 아래에서 올라오는 움직임이 끝난 뒤
  const t1 = await bar.innerText().catch(() => '')
  ok("모두 고르기 → '3명 골랐어요 · 확정 후 4/2명'", t1.includes('3명 골랐어요') && t1.includes('확정 후 4/2명'), t1.replace(/\n/g, ' / '))
  // 휴대폰 아래 탭(떠 있는 유리 막대)에 가리지 않게 그 위에 붙음
  const aboveTabs = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight - 64 && r.top >= 0 })
  ok('막대가 아래 탭 위에 보임 (가리지 않음)', await aboveTabs(bar))
  ok('모집 인원을 넘으면 노란 글씨', await bar.locator('[data-bulk-after]').evaluate((el) => el.className.includes('amber')))
  ok("PickAll 글자 '모두 풀기'로 바뀜", (await group.locator('[data-pick-all]').innerText()).includes('모두 풀기'))
  // 김지원(기존 지원자)은 풀기
  await a.locator(`[data-app-group="대기"] input[name="app"][value="${AP_APP}"]`).first().uncheck()
  await a.waitForTimeout(150)
  ok('하나 풀면 모두 고르기 칸은 반쯤(-) 표시', await group.locator('[data-pick-all] input').evaluate((el) => el.indeterminate))
  ok("막대 '2명 골랐어요'", (await bar.innerText()).includes('2명 골랐어요'))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/apps-bulk.png` })
  const rej = bar.getByRole('button', { name: /^미선발 2명$/ })
  ok("'미선발 2명' · '선택 2명 확정' 두 버튼", (await rej.count()) === 1 && (await bar.getByRole('button', { name: '선택 2명 확정' }).count()) === 1)
  // 360px: 막대 버튼이 한 줄 (확인 문구일 때도)
  const oneLine = async () => bar.locator('button[data-confirm]').evaluateAll((bs) => bs.every((b) => b.getBoundingClientRect().height < 40) && bs[0].getBoundingClientRect().top === bs[1].getBoundingClientRect().top)
  ok('막대 버튼 한 줄', await oneLine())
  await rej.click()
  ok("첫 누름: '미선발 알림 보낼까요?' (아직 처리 안 됨)", (await bar.locator('button[data-confirm="armed"]').innerText()) === '미선발 알림 보낼까요?' && (await statusOf(XA)) === 'applied')
  ok('확인 문구일 때도 한 줄', await oneLine())
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await Promise.all([a.waitForURL(/m=/, { timeout: 15000 }).catch(() => {}), bar.locator('button[data-confirm="armed"]').click()])
  const m1 = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok("'2명을 미선발로 정하고 2명에게 알렸어요.'", m1 === '2명을 미선발로 정하고 2명에게 알렸어요.', m1)
  ok('고른 둘은 미선발 · 안 고른 김지원은 그대로 대기', (await statusOf(XA)) === 'rejected' && (await statusOf(YA)) === 'rejected' && (await statusOf(AP_APP)) === 'applied')
  const mx = await rest(`messages?thread_user_id=eq.${X}`)
  ok('미선발 근무자에게 결과 알림 (문의함)', mx.some((m) => String(m.body).includes('함께하지 못하게 됐어요')))
  const logs = await rest('audit_logs')
  ok('기록(audit)에 남음', logs.some((r) => JSON.stringify(r).includes('app.reject_selected')))

  // ── 대시보드: 여러 명 골라 한 번에 확정 · 다른 회사 지원은 끼워 넣어도 무시
  await rest(`applications?id=eq.${XA}`, 'PATCH', { status: 'applied', decided_at: null })
  await rest(`applications?id=eq.${YA}`, 'PATCH', { status: 'applied', decided_at: null })
  await a.goto(`${D}/admin`)
  const pend = a.locator('#pending')
  await pend.waitFor({ timeout: 15000 }).catch(() => {})
  const pick = pend.locator('[data-pick-all]').first()
  ok("대시보드 '확정 대기 지원자' 옆 '모두 고르기'", await pick.isVisible().catch(() => false))
  const hdr = await pend.locator('h2').evaluate((el) => el.getBoundingClientRect().height)
  ok('제목 한 줄 (모두 고르기와 같은 줄)', hdr < 34, String(hdr))
  await pick.locator('input').check()
  const dbar = a.locator('[data-bulk-bar]')
  await dbar.waitFor({ timeout: 5000 }).catch(() => {})
  await a.waitForTimeout(350)
  const shown = await pend.locator('input[name="app"]').evaluateAll((els) => els.filter((e) => e.checkVisibility()).length)
  ok(`대시보드: 보이는 ${shown}명 모두 골라짐`, (await dbar.innerText()).includes(`${shown}명 골랐어요`), (await dbar.innerText()).replace(/\n/g, ' / '))
  ok('대시보드 막대도 아래 탭 위에 보임', await aboveTabs(dbar))
  ok('여러 공고라 확정 후 인원 줄은 없음', (await dbar.locator('[data-bulk-after]').count()) === 0)
  // 다른 회사 지원 id를 몰래 끼워 넣음
  await a.evaluate((id) => { const i = document.createElement('input'); i.type = 'checkbox'; i.name = 'app'; i.value = id; i.checked = true; i.setAttribute('form', 'bulk-approve'); i.hidden = true; document.body.append(i) }, OX)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/dash-bulk.png` })
  const conf = dbar.locator('button[data-confirm]').nth(1)
  await conf.click()
  ok("모집 2명 공고에 3명 → '인원 넘는 공고 · 확정?'", (await dbar.locator('button[data-confirm="armed"]').innerText()) === '인원 넘는 공고 · 확정?', await dbar.locator('button[data-confirm="armed"]').innerText().catch(() => ''))
  ok('확인 문구일 때도 한 줄', await dbar.locator('button[data-confirm]').evaluateAll((bs) => bs.every((b) => b.getBoundingClientRect().height < 40)))
  await Promise.all([a.waitForURL(/m=/, { timeout: 15000 }).catch(() => {}), dbar.locator('button[data-confirm="armed"]').click()])
  const m2 = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok(`'${shown}명을 확정했어요. 근무자에게 알렸어요.' (대시보드로 돌아옴)`, m2 === `${shown}명을 확정했어요. 근무자에게 알렸어요.` && new URL(a.url()).pathname === '/admin', `${a.url()} ${m2}`)
  ok('고른 지원 모두 확정', (await statusOf(XA)) === 'approved' && (await statusOf(YA)) === 'approved' && (await statusOf(AP_APP)) === 'approved')
  ok('다른 회사 지원은 그대로 (처리 안 됨)', (await statusOf(OX)) === 'applied')
  const my = await rest(`messages?thread_user_id=eq.${Y}`)
  ok('확정 알림 (문의함)', my.some((m) => String(m.body).includes('근무가 확정됐어요') || String(m.title ?? '').includes('확정')))
  const docs = await rest(`signed_docs?user_id=eq.${Y}&job_id=eq.${J}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  ok('확정하면 서명할 서류도 만들어짐', !(job.required_docs ?? []).length || docs.length > 0, `${docs.length}`)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
