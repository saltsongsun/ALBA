// 묶음 349 (정기 개선 2026-11-22 12:35 KST)
// · 여러 회사를 맡은 관리자의 문의함: 맨 위 '다른 회사 새 문의 · 회사명 n' (회사 이름과 수만 · 글 내용은 안 보임)
//   - 누르면 그 회사로 바꾸고 문의함에 그대로 · 그 회사에 새 문의가 한 사람뿐이면 그 대화가 바로 열림
//   - 맡은 회사만 (최고 관리자는 모든 회사) · 지금 보는 회사·새 문의 없는 회사는 안 나옴 · 한 회사만 맡으면 줄 없음
//   - 바꾸는 서버 동작이 다시 확인: 맡지 않은 회사로 바꿔 달라고 보내도 안 바뀜
// · 문의함 디자인: '모든 대화 저장'·단체방 줄의 이모지를 선 아이콘으로 · 거르기 칩 누름 반응(0.2초)
// node scripts/qa/batch349.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000349', C3 = '99999999-0000-4000-8000-000000000350'
const M = 'aaaaaaaa-0000-4000-8000-000000000349', N = 'aaaaaaaa-0000-4000-8000-000000000350'
const U = (n) => `44444444-0000-4000-8000-0000000349${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  // 회사 둘 더: 두번째상사(M이 맡음 · 새 문의는 한 사람) · 세번째상사(M은 안 맡음 · 새 문의 두 사람)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째상사', seal_image: null, created_at: iso(now) })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '세번째상사', seal_image: null, created_at: iso(now + 1000) })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자', phone: '01034900001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자', phone: '01034900002', is_super: false })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: iso(now) })
  for (const n of [1, 2, 3]) await rest('users', 'POST', { id: U(n), name: `문의자${n}`, phone: `0103490000${n}`, birth_date: '1995-05-05', photo_at: null, careers: [], role: 'worker', active: true })
  let mid = 349000
  const msg = (company_id, uid, body, readAt = null) =>
    rest('messages', 'POST', { id: mid++, company_id, thread_user_id: uid, sender_id: uid, from_admin: false, body, job_id: null, read_at: readAt, created_at: iso(now - 60_000 + mid), user: { id: uid, name: `문의자${uid.slice(-1)}`, phone: `0103490000${uid.slice(-1)}`, photo_at: null, member_type: 'worker' } })
  await msg(C2, U(1), '두번째상사비밀글하나')
  await msg(C2, U(1), '두번째상사비밀글둘')
  await msg(C2, U(2), '이미 읽은 글', iso(now)) // 읽은 글은 세지 않음
  await msg(C3, U(2), '세번째상사비밀글')
  await msg(C3, U(3), '세번째상사비밀글2')

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const strip = (p) => p.locator('[data-inbox-others]')
  const chip = (p, co) => p.locator(`[data-inbox-other="${co}"]`)
  const company = (p) => p.locator('header select[name=company]').inputValue().catch(() => '')

  // ── 1. 두 회사를 맡은 관리자 · 첫 회사 문의함: 두번째상사 2 (세번째상사는 안 맡아서 없음)
  const m = await pg(M, C1)
  await m.goto(`${D}/admin/chat`)
  await strip(m).waitFor({ timeout: 15000 }).catch(() => {})
  const t1 = one(await strip(m).innerText().catch(() => ''))
  ok("맨 위 '다른 회사 새 문의 두번째상사 2'", t1 === '다른 회사 새 문의 두번째상사 2', t1)
  ok('맡지 않은 회사(세번째상사)·지금 회사는 안 나옴', !t1.includes('세번째상사') && (await chip(m, C3).count()) === 0 && (await chip(m, C1).count()) === 0)
  ok('글 내용은 안 보임 (회사 이름과 수만)', !(await m.locator('body').innerText()).includes('비밀글'))
  ok('한 사람뿐이라 그 대화를 열 주소가 들어 있음', (await chip(m, C2).locator('input[name=open]').getAttribute('value').catch(() => '')) === `/admin/chat/${U(1)}` && (await chip(m, C2).locator('input[name=back]').getAttribute('value').catch(() => '')) === '/admin/chat')
  const box = await strip(m).boundingBox().catch(() => null)
  const search = await m.locator('[data-chat-search]').boundingBox().catch(() => null)
  ok('제목 아래 · 검색칸 위 한 줄 (높이 ≤ 36px) · 360px 옆으로 안 밀림', !!box && !!search && box.y < search.y && box.height <= 36 && (await noSide(m)), JSON.stringify(box))
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/inbox-others.png` }).catch(() => {})
  // 누르면 그 회사로 + 그 대화가 바로 열림
  await chip(m, C2).locator('button[type=submit]').click()
  await m.waitForURL((u) => u.pathname === `/admin/chat/${U(1)}`, { timeout: 15000 }).catch(() => {})
  await m.getByText('두번째상사비밀글둘').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 두번째상사로 바꾸고 그 사람 대화가 열림', new URL(m.url()).pathname === `/admin/chat/${U(1)}` && (await company(m)) === C2 && (await m.getByText('두번째상사비밀글둘').count()) >= 1, `${m.url()} ${await company(m)}`)
  ok("'두번째상사 화면으로 바꿨어요' 안내", (await m.getByText('두번째상사 화면으로 바꿨어요').count()) >= 1)
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/inbox-others-opened.png` }).catch(() => {})

  // ── 2. 이제 두번째상사 문의함: 첫 회사(주식회사 테스트)에 새 문의가 있으면 그쪽이 보임 · 두번째상사는 안 나옴
  const c1Unread = ((await rest(`messages?company_id=eq.${C1}&from_admin=eq.false&read_at=is.null`)) ?? []).length
  await m.goto(`${D}/admin/chat`)
  await m.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  await m.waitForTimeout(400)
  const t2 = one(await strip(m).innerText().catch(() => ''))
  ok('지금 회사(두번째상사)는 줄에 없음', (await chip(m, C2).count()) === 0, t2)
  ok(c1Unread ? `첫 회사 새 문의 ${c1Unread} 표시` : '첫 회사 새 문의가 없으면 줄 없음', c1Unread ? t2 === `다른 회사 새 문의 주식회사 테스트 ${c1Unread}` : (await strip(m).count()) === 0, `${c1Unread} | ${t2}`)

  // ── 3. 바꿔 달라는 회사를 맡지 않은 회사로 바꿔 보내도 안 바뀜 (서버가 다시 확인)
  if (c1Unread) {
    await chip(m, C1).locator('input[name=company]').evaluate((el, v) => { el.value = v }, C3)
    await chip(m, C1).locator('button[type=submit]').click()
    await m.waitForLoadState('networkidle').catch(() => {})
    await m.waitForTimeout(500)
    ok('맡지 않은 회사로는 안 바뀜 · 그 회사 글도 안 보임', (await company(m)) !== C3 && !(await m.locator('body').innerText()).includes('세번째상사비밀글'), `${m.url()} ${await company(m)}`)
  } else ok('맡지 않은 회사로는 안 바뀜 (건너뜀: 첫 회사 새 문의 없음)', true)

  // ── 4. 대화를 열어 읽으면 그 회사는 줄에서 빠짐 → 새 글이 오면 다시 1
  const s = await pg(A, C1)
  await s.goto(`${D}/admin/chat`)
  await strip(s).waitFor({ timeout: 15000 }).catch(() => {})
  ok('읽은 회사(두번째상사)는 빠지고 세번째상사 2만', (await chip(s, C2).count()) === 0 && one(await strip(s).innerText().catch(() => '')) === '다른 회사 새 문의 세번째상사 2', one(await strip(s).innerText().catch(() => '')))
  await msg(C2, U(1), '두번째상사새글')
  // 최고 관리자: 두번째상사 1 · 세번째상사 2 (두 사람 → 문의함에 그대로)
  await s.goto(`${D}/admin/chat`)
  await strip(s).waitFor({ timeout: 15000 }).catch(() => {})
  ok('최고 관리자: 두 회사 칩 (새 글 온 두번째상사 1)', (await chip(s, C2).count()) === 1 && one(await chip(s, C2).innerText()) === '두번째상사 1' && (await chip(s, C3).count()) === 1 && one(await chip(s, C3).innerText()) === '세번째상사 2', one(await strip(s).innerText().catch(() => '')))
  ok('두 사람이면 열 대화 없음', (await chip(s, C3).locator('input[name=open]').count()) === 0)
  await chip(s, C3).locator('button[type=submit]').click()
  await s.waitForFunction((c) => document.querySelector('header select[name=company]')?.value === c, C3, { timeout: 15000 }).catch(() => {})
  await s.locator('[data-inbox-row]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('누르면 세번째상사 문의함에 그대로 (두 대화 보임)', new URL(s.url()).pathname === '/admin/chat' && (await company(s)) === C3 && (await s.locator(`[data-inbox-row="${U(2)}"]`).count()) === 1 && (await s.locator(`[data-inbox-row="${U(3)}"]`).count()) === 1, `${s.url()} ${await company(s)}`)

  // ── 5. 한 회사만 맡은 관리자: 줄 없음
  const n = await pg(N, C1)
  await n.goto(`${D}/admin/chat`)
  await n.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('한 회사만 맡으면 줄 없음 · 다른 회사 이름도 안 보임', (await strip(n).count()) === 0 && !(await n.locator('body').innerText()).includes('두번째상사'))

  // ── 6. 디자인: 선 아이콘 · 거르기 칩 누름 반응 · 움직임 줄이기
  const exp = n.locator('[data-inbox-export]')
  ok("'모든 대화 저장'은 선 아이콘 (이모지 없음)", (await exp.locator('svg').count()) === 1 && !(await exp.innerText()).includes('⬇') && one(await exp.innerText()) === '모든 대화 저장')
  const roomIcon = n.locator('[data-room-icon]').first()
  ok('단체방 줄 아이콘도 선 아이콘', (await n.locator('[data-room-row]').count()) === 0 || ((await roomIcon.locator('svg').count()) === 1 && !(await roomIcon.innerText()).includes('👥')))
  const chipT = await n.locator('a[href="/admin/chat?unread=1"]').first().evaluate((el) => getComputedStyle(el).transitionDuration).catch(() => '')
  ok('거르기 칩 0.2초 반응', chipT.split(',').some((d) => d.trim() === '0.2s'), chipT)
  const r = await pg(M, C1, { reducedMotion: 'reduce' })
  await r.goto(`${D}/admin/chat`)
  await strip(r).waitFor({ timeout: 15000 }).catch(() => {})
  const dur = await chip(r, C2).evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 칩이 튀어나오지 않음', dur < 0.05, String(dur))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
