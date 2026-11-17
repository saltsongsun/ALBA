// 묶음 295 (정기 개선 2026-11-18 01:35 KST)
// · 관리자 홈 '결과를 기다리는 지원자' 카드: 결과가 늦어 '🙏 지원 결과 안내'(정중한 기다림 안내)가 자동으로 간 사람에게 '🙏 기다림 안내' 표시
//   (근무자가 무슨 말을 들었는지 알고 정하게 · 누르면 그 대화) · 다른 회사 문의함에 간 안내는 세지 않음 · 넓은 화면 표에도
// · 단체방(관리자)의 처리 안내(참여했어요 등)도 문의 대화처럼 머리글 바로 아래에 떠서 보임
// · 안내를 달고 열린 대화 화면(?m=)이 맨 위로 올라가 버리던 것: 사람이 손대지 않았으면 다시 맨 아래(최근 대화)로 · 직접 올린 건 그대로
// node scripts/qa/batch295.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const J2 = 'cccccccc-0000-4000-8000-000000029501', A3 = 'aaaaaaaa-0000-4000-8000-0000000295a3'
const HEAD = '🙏 지원 결과 안내'
const NOTE = `${HEAD}\n경상남도 생활체육대축전 행사장 안내 스태프에 지원해 주셔서 진심으로 감사드려요.\n행사 일정과 업무 배치를 정리하는 데 시간이 조금 더 걸리고 있어요.\n기다리시게 해서 죄송해요. 정리되는 대로 바로 알려 드릴게요.`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 내일 근무 J · 김지원(AP)은 결과 전
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(1), end_date: kday(1), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, viewport = { width: 360, height: 740 }) => {
    const ctx = await b.newContext({ ...(viewport.width < 600 ? devices['Galaxy S9+'] : {}), viewport, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const dash = async (p = a) => {
    await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  }
  const badge = (p = a) => p.locator('[data-pending-noted]:visible')

  // ── 1. 안내가 간 적 없으면 표시 없음 · 같은 사람이라도 다른 회사 공고에 간 안내는 세지 않음
  await dash()
  ok('결과를 기다리는 지원자 카드가 보임', (await a.locator(`main a[href="/admin/workers/${AP}"]:visible`).count()) >= 1)
  ok('안내가 간 적 없으면 표시 없음', (await badge().count()) === 0)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J2, company_id: C2, company: { company_name: '남의회사' }, title: '남의회사 행사 스태프', applications: [], attendance: [], created_at: new Date().toISOString() })
  await rest('messages', 'POST', { id: 2950001, thread_user_id: AP, sender_id: null, from_admin: true, company_id: C2, job_id: J2, body: NOTE, read_at: null, created_at: new Date(Date.now() - 60e3).toISOString() })
  await dash()
  ok('다른 회사 공고에 간 안내는 세지 않음', (await badge().count()) === 0)

  // ── 2. 우리 회사 문의함에 자동 안내가 가면: '🙏 기다림 안내'
  await rest('messages', 'POST', { id: 2950002, thread_user_id: AP, sender_id: null, from_admin: true, company_id: C1, job_id: J, body: NOTE, read_at: null, created_at: new Date(Date.now() - 30e3).toISOString() })
  await dash()
  const bd = badge().first()
  await bd.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'🙏 기다림 안내' 표시 (한 번)", (await badge().count()) === 1 && one(await bd.textContent()) === '🙏 기다림 안내')
  ok('누르면 그 사람과의 대화로', (await bd.getAttribute('href')) === `/admin/chat/${AP}`)
  ok('공고 이름과 한 줄 · 카드 안에 들어감', await bd.evaluate((el) => {
    const row = el.parentElement
    const title = row.querySelector('a')
    const card = el.closest('.card').getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return Math.abs(title.getBoundingClientRect().top - r.top) < 8 && r.right <= card.right + 1 && r.left >= card.left - 1
  }))
  ok('360px 옆으로 안 밀림 (관리자 홈)', await noSide(a))
  if (SHOTS) await bd.evaluate((el) => el.closest('.card').scrollIntoView({ block: 'center' })).then(() => a.waitForTimeout(400)).then(() => bd.evaluate((el) => el.closest('.card'))).then(() => a.locator('[data-pending-noted]:visible').first().locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/pending-noted.png` })).catch(() => {})
  await bd.click()
  await a.waitForURL((u) => u.pathname === `/admin/chat/${AP}`, { timeout: 15000 }).catch(() => {})
  const note = a.locator('main ol li', { hasText: '행사 일정과 업무 배치를 정리하는 데' }).last()
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  ok('대화에서 간 안내 문장을 바로 봄', new URL(a.url()).pathname === `/admin/chat/${AP}` && (await note.count()) === 1, a.url())

  // ── 3. 넓은 화면(표)에도 같은 표시
  const wide = await mk(A, { width: 1280, height: 900 })
  await dash(wide)
  const wb = badge(wide).first()
  ok('넓은 화면 표에도 공고 이름 옆에 표시', (await badge(wide).count()) === 1 && (await wb.evaluate((el) => !!el.closest('td'))))

  // ── 4. 단체방: 위에서 '참여하기'를 누르면 다시 맨 아래로 내려가도 처리 안내는 머리글 바로 아래에 떠서 보임
  const t0 = Date.now() - 60 * 60e3
  for (let i = 0; i < 30; i++) await rest('job_chat', 'POST', { id: `77777777-0000-4000-8000-0000002950${String(i).padStart(2, '0')}`, job_id: J, company_id: C1, sender_id: A, from_admin: true, body: `안내 ${i + 1} · 내일 행사 준비 사항을 확인해 주세요`, pinned_at: null, created_at: new Date(t0 + i * 1000).toISOString() })
  // 공고를 올리지 않은 같은 회사 관리자 (단체방에 아직 참여 안 함)
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A3, name: '박담당', phone: '01029502950', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: A3, role: 'admin', created_at: new Date().toISOString() })
  const c = await mk(A3)
  await c.goto(`${D}/admin/chat/room/${J}`, { waitUntil: 'networkidle' })
  const join = c.locator('[data-room-join] button')
  await join.waitFor({ timeout: 15000 }).catch(() => {})
  await join.click()
  const msg = '단체방에 참여했어요. 알림을 받아요.'
  const flash = c.locator('[data-flash-floating] [role=status]', { hasText: msg })
  await flash.waitFor({ timeout: 15000 }).catch(() => {})
  await c.waitForTimeout(800)
  const fb = await flash.boundingBox().catch(() => null)
  ok("참여하기 → '단체방에 참여했어요' 안내가 머리글 바로 아래에", (await flash.count()) === 1 && (await c.locator('[data-room-join]').count()) === 0 && !!fb && fb.y >= 56 && fb.y + fb.height < 220, JSON.stringify({ fb }))
  ok('360px 옆으로 안 밀림 (단체방)', await noSide(c))

  // ── 5. 안내를 달고 열린 대화(?m=)도 맨 아래(최근 대화)에 그대로 · 안내는 위에 떠서 보임
  //    (전엔 주소에서 안내를 지운 뒤 화면을 새로 받으며 맨 위로 올라가 버렸음)
  for (let i = 0; i < 25; i++) await rest('messages', 'POST', { id: 2950100 + i, thread_user_id: AP, sender_id: AP, from_admin: false, company_id: C1, job_id: null, body: `문의 ${i + 1} · 내일 집합 장소를 다시 알려 주세요`, read_at: new Date().toISOString(), created_at: new Date(t0 + i * 1000).toISOString() })
  for (const [name, url] of [['단체방', `/admin/chat/room/${J}`], ['문의 대화', `/admin/chat/${AP}`]]) {
    await c.goto(`${D}${url}?m=${encodeURIComponent('처리했어요.')}`, { waitUntil: 'networkidle' })
    const f = c.locator('[data-flash-floating] [role=status]', { hasText: '처리했어요.' })
    await f.waitFor({ timeout: 8000 }).catch(() => {})
    await c.waitForTimeout(1500)
    const box = await f.boundingBox().catch(() => null)
    const end = await c.evaluate(() => document.documentElement.scrollHeight - (scrollY + innerHeight) < 240 && scrollY > 100)
    ok(`${name}: 안내를 달고 열어도 맨 아래(최근 대화) 그대로 · 안내는 위에`, end && !!box && box.y >= 56 && box.y + box.height < 220, JSON.stringify({ end, box }))
    if (SHOTS && name === '단체방') await c.screenshot({ path: `${SHOTS}/room-flash.png` }).catch(() => {})
  }
  // 사람이 직접 위로 올리면 그대로 둠 (끌어내리지 않음)
  await c.goto(`${D}/admin/chat/room/${J}`, { waitUntil: 'networkidle' })
  await c.waitForTimeout(300)
  await c.mouse.wheel(0, -5000)
  await c.waitForTimeout(800)
  ok('직접 위로 올리면 끌어내리지 않음', await c.evaluate(() => scrollY < 50))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
