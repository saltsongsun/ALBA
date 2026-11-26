// 묶음 403 (정기 개선 2026-11-26 19:35 KST)
// 기능 · 근무자 '내 근무' 오늘 카드: 보낸 '늦어요'·출근 확인 요청을 담당자가 봤는지 한 줄
//   · 아직이면 '담당자가 아직 안 읽었어요' → 읽으면 '✓ 담당자가 읽었어요 · HH:MM' → 답장이 오면 '담당자: …' (누르면 그 회사 문의함)
//   · 앱이 보낸 자동 알림(⏰ 등)은 답장으로 안 셈 · 알림보다 먼저 온 답장, 다른 회사 답장은 안 셈
// 디자인 · 바뀐 줄만 톡 나타남 (0.25초 · 움직임 줄이기면 끔 — globals.css 전체 규칙) · 360px 한 줄
// node scripts/qa/batch403.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000040302'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000403${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const kstHm = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16)

;(async () => {
  const today = kday(0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _b, ...jl } = job
  const TITLE = jl.title
  const [w] = await rest(`users?id=eq.${W}`)
  const person = async (n, name) => {
    const u = { ...w, id: U(n), name, phone: `010403000${String(n).padStart(2, '0')}`, attendance: [], ratings: [] }
    await rest('users', 'POST', u)
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J, user_id: U(n), company_id: C1, status: 'approved', available_dates: null, created_at: new Date().toISOString(), job: jl, user: { ...u } })
  }
  const msg = (n, row) => rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: U(n), read_at: null, ...row })
  const late = (n, ago = 600e3) => {
    const id = crypto.randomUUID()
    return msg(n, { id, sender_id: U(n), from_admin: false, company_id: C1, job_id: J, body: `🕒 지각 알림\n${TITLE} · 약 20분 늦어요 (도착 예정 10:20)`, created_at: new Date(Date.now() - ago).toISOString() }).then(() => id)
  }
  const reply = (n, body, ago, cid = C1) => msg(n, { sender_id: A, from_admin: true, company_id: cid, job_id: null, body, created_at: new Date(Date.now() - ago).toISOString() })

  for (const [n, name] of [[1, '늦어요403'], [2, '현장403'], [3, '자동알림403'], [4, '남의답장403'], [5, '먼저답장403']]) await person(n, name)
  const late1 = await late(1)
  await msg(2, { sender_id: U(2), from_admin: false, company_id: C1, job_id: J, body: `📍 출근 확인 요청\n${TITLE} · 현장인데 위치 확인이 안 돼요 (약 80m)`, created_at: new Date(Date.now() - 300e3).toISOString() })
  const late3 = await late(3)
  await rest(`messages?id=eq.${late3}`, 'PATCH', { read_at: new Date(Date.now() - 400e3).toISOString() })
  await reply(3, `⏰ 출근 확인\n${TITLE} · 근무 시작을 눌러 주세요`, 200e3) // 앱 자동 알림 → 답장 아님
  await late(4)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사403', verified: true, seal_image: null, created_at: new Date(Date.now() + 1000).toISOString() })
  await reply(4, '남의회사 답장이에요', 100e3, C2) // 다른 회사 문의함 → 안 셈
  await reply(5, '먼저 보낸 답장', 1200e3) // 늦어요보다 먼저 → 안 셈
  await late(5)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const seenOn = async (p, scope) => {
    await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
    const box = p.locator(scope)
    await box.first().waitFor({ timeout: 15000 }).catch(() => {})
    const line = box.locator('[data-told-seen]').first()
    return { box, line, kind: await line.getAttribute('data-told-seen').catch(() => null), text: one(await line.innerText().catch(() => '')), href: await line.getAttribute('href').catch(() => null) }
  }

  // ── 1. 늦어요: 아직 안 읽음 → 읽음 → 답장
  const p1 = await pg(U(1))
  const s1 = await seenOn(p1, '[data-late-sent]')
  ok("아직: '담당자가 아직 안 읽었어요'", s1.kind === 'unread' && s1.text === '담당자가 아직 안 읽었어요', JSON.stringify([s1.kind, s1.text]))
  ok('원래 알림 글은 그대로 (🕒 … 알렸어요.)', /알렸어요\./.test(one(await s1.box.innerText().catch(() => ''))))
  if (SHOTS) await s1.box.screenshot({ path: `${SHOTS}/late-unread.png` }).catch(() => {})
  const readAt = new Date(Date.now() - 120e3).toISOString()
  await rest(`messages?id=eq.${late1}`, 'PATCH', { read_at: readAt })
  const s2 = await seenOn(p1, '[data-late-sent]')
  ok(`읽음: '✓ 담당자가 읽었어요 · ${kstHm(readAt)}'`, s2.kind === 'read' && s2.text === `✓ 담당자가 읽었어요 · ${kstHm(readAt)}`, s2.text)
  ok('읽음 줄은 톡 나타남 (pop · 0.25초)', await s2.line.evaluate((el) => getComputedStyle(el).animationName === 'pop' && getComputedStyle(el).animationDuration === '0.25s').catch(() => false))
  if (SHOTS) await s2.box.screenshot({ path: `${SHOTS}/late-read.png` }).catch(() => {})
  await reply(1, '네, 조심히 오세요.', 60e3)
  const s3 = await seenOn(p1, '[data-late-sent]')
  ok("답장: '담당자: 네, 조심히 오세요.'", s3.kind === 'reply' && s3.text.startsWith('담당자: 네, 조심히 오세요.'), s3.text)
  ok('누르면 그 회사 문의함', s3.href === `/me/chat?co=${C1}`, s3.href)
  ok('답장 줄 한 줄 · 360px 옆으로 안 밀림', (await s3.line.evaluate((el) => el.getBoundingClientRect().height < 30).catch(() => false)) && (await noSide(p1)))
  if (SHOTS) await s3.box.screenshot({ path: `${SHOTS}/late-reply.png` }).catch(() => {})
  await s3.line.click()
  await p1.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {})
  ok('답장 줄을 누르면 문의함으로', new URL(p1.url()).pathname === '/me/chat' && new URL(p1.url()).searchParams.get('co') === C1, p1.url())

  // ── 2. 앱 자동 알림(⏰)은 답장으로 안 셈 → 읽음 그대로
  const s4 = await seenOn(await pg(U(3)), '[data-late-sent]')
  ok('자동 알림은 답장 아님 → 읽음 줄', s4.kind === 'read', JSON.stringify([s4.kind, s4.text]))

  // ── 3. 다른 회사 답장 · 알림보다 먼저 온 답장은 안 셈
  const s5 = await seenOn(await pg(U(4)), '[data-late-sent]')
  ok('다른 회사 문의함 답장은 안 셈 (아직 안 읽음)', s5.kind === 'unread' && !/남의회사/.test(s5.text), JSON.stringify([s5.kind, s5.text]))
  const s6 = await seenOn(await pg(U(5)), '[data-late-sent]')
  ok('늦어요보다 먼저 온 답장은 안 셈', s6.kind === 'unread', JSON.stringify([s6.kind, s6.text]))

  // ── 4. 출근 확인 요청 대기 상자에도 같은 줄
  const p2 = await pg(U(2))
  const s7 = await seenOn(p2, '[data-arrive-wait]')
  ok("출근 확인 요청: '담당자가 아직 안 읽었어요'", s7.kind === 'unread', JSON.stringify([s7.kind, s7.text]))
  await reply(2, '확인했어요. 바로 처리할게요.', 30e3)
  const s8 = await seenOn(p2, '[data-arrive-wait]')
  ok("출근 확인 요청 답장: '담당자: 확인했어요. …'", s8.kind === 'reply' && s8.text.startsWith('담당자: 확인했어요.'), s8.text)
  ok('360px 옆으로 안 밀림 (출근 확인)', await noSide(p2))
  if (SHOTS) await s8.box.screenshot({ path: `${SHOTS}/arrive-reply.png` }).catch(() => {})

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
