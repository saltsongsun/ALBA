// 묶음 402 (정기 개선 2026-11-26 17:35 KST)
// 기능 · 근무자 상세 이름 아래 '오늘 근무' 한 줄 (관리자 문의 대화 머리와 같은 기준 · lib/todayWork)
//   · 근무 중 'HH:MM 시작' · 시작 시각이 지났는데 출근 기록이 없으면 '미출근 · HH:MM 시작' (예전 대화 머리는 '출근 전'으로 남았음)
//   · 오늘 '늦어요'를 보냈으면 '· HH:MM 도착', 현장 위치 확인 요청이면 '· 현장 확인 요청'
//   · 근무일을 고른 사람은 오늘이 그 날일 때만 '오늘' (아니면 '다음 근무 M/D')
//   · 다른 회사 공고의 출근·늦어요는 섞이지 않음 (이 회사 공고 · 이 회사 출퇴근 · 이 회사 문의함만)
// 디자인 · 근무 중·미출근은 점이 살짝 깜빡임 (움직임 줄이기면 점만) · 한 줄 · 360px 옆으로 안 밀림
// node scripts/qa/batch402.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000040202'
const J2 = 'cccccccc-0000-4000-8000-000000040202'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000402${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const kstHm = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16)
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const fmtDate = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${WEEK[new Date(d + 'T00:00:00Z').getUTCDay()]})` }

;(async () => {
  const today = kday(0), tomorrow = kday(1)
  // 오늘~내일 이틀짜리 · 하루 종일 (시작 시각은 이미 지남)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: tomorrow, start_time: '00:00:00', end_time: '23:59:00' })
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _b, ...jl } = job
  const TITLE = jl.title
  const [w] = await rest(`users?id=eq.${W}`)
  const people = {}
  const person = async (n, name) => {
    people[U(n)] = { ...w, id: U(n), name, phone: `010402000${String(n).padStart(2, '0')}`, attendance: [], ratings: [] }
    await rest('users', 'POST', people[U(n)])
  }
  const approve = (uid, jid, cid, jobRow, dates = null) =>
    rest('applications', 'POST', { id: crypto.randomUUID(), job_id: jid, user_id: uid, company_id: cid, status: 'approved', available_dates: dates, created_at: new Date().toISOString(), job: jobRow, user: { ...people[uid] } })
  const say = (n, jid, cid, body, ago = 600e3) =>
    rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: U(n), sender_id: U(n), from_admin: false, company_id: cid, job_id: jid, body, created_at: new Date(Date.now() - ago).toISOString(), read_at: null })

  await person(1, '늦어요402')
  await person(2, '현장402')
  await person(3, '내일만402')
  await person(4, '말없음402')
  for (const n of [1, 2, 4]) await approve(U(n), J, C1, jl)
  await approve(U(3), J, C1, jl, [tomorrow])
  await say(1, J, C1, `🕒 지각 알림\n${TITLE} · 약 20분 늦어요 (도착 예정 10:20)`)
  await say(2, J, C1, `📍 출근 확인 요청\n${TITLE} · 현장인데 위치 확인이 안 돼요 (약 80m)`)
  await say(4, J, C1, `🕒 지각 알림\n${TITLE} · 약 10분 늦어요 (도착 예정 09:10)`, 26 * 3600e3) // 어제 것 → 안 셈

  // 다른 회사 C2: 늦어요402가 거기서는 근무 중 + 그 회사로 '11:11 도착' 늦어요 → 우리 회사 줄에 섞이면 안 됨
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사402', verified: true, seal_image: null, created_at: new Date(Date.now() + 1000).toISOString() })
  const j2 = { ...jl, id: J2, company_id: C2, title: '남의행사402', status: 'open', start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00', created_at: new Date().toISOString() }
  await rest('jobs', 'POST', { ...j2, applications: [], attendance: [] })
  await approve(U(1), J2, C2, j2)
  await rest('attendance', 'POST', { id: crypto.randomUUID(), job_id: J2, user_id: U(1), company_id: C2, work_date: today, clock_in: new Date(Date.now() - 1800e3).toISOString(), clock_out: null, paid: false })
  await say(1, J2, C2, `🕒 지각 알림\n남의행사402 · 약 30분 늦어요 (도착 예정 11:11)`, 300e3)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const detail = async (uid) => {
    await a.goto(`${D}/admin/workers/${uid}`, { waitUntil: 'networkidle' })
    const line = a.locator('[data-worker-today]')
    await line.waitFor({ timeout: 15000 }).catch(() => {})
    return {
      line,
      text: one(await line.innerText().catch(() => '')),
      state: await line.getAttribute('data-work-state').catch(() => null),
      href: await line.getAttribute('href').catch(() => null),
      dot: await line.locator('span[aria-hidden]').first().getAttribute('class').catch(() => ''),
      ping: await line.locator('.animate-ping').count().catch(() => 0),
      oneLine: await line.evaluate((el) => el.getBoundingClientRect().height < 40 && getComputedStyle(el.querySelector('.truncate')).whiteSpace === 'nowrap').catch(() => false),
    }
  }

  // ── 1. 근무 중 (가짜 DB 기본: W 오늘 출근 · 퇴근 전)
  const [att] = (await rest(`attendance?user_id=eq.${W}`)).filter((x) => x.work_date === today && !x.clock_out)
  const w1 = await detail(W)
  ok(`근무 중: '오늘 근무 중 · ${att ? kstHm(att.clock_in) : '?'} 시작 · 공고'`, !!att && w1.text === `오늘 근무 중 · ${kstHm(att.clock_in)} 시작 · ${TITLE}` && w1.state === 'working', w1.text)
  ok('누르면 그 공고 출퇴근 탭 (오늘 날짜)', w1.href === `/admin/jobs/${J}?tab=att&date=${today}`, w1.href)
  ok('초록 점 + 깜빡이는 고리 · 한 줄', /bg-emerald-500/.test(w1.dot) && w1.ping === 1 && w1.oneLine)
  ok('깜빡임은 움직임 줄이기면 꺼짐 (motion-reduce:hidden)', await w1.line.locator('.animate-ping').getAttribute('class').then((c) => /motion-reduce:hidden/.test(c)).catch(() => false))
  if (SHOTS) await w1.line.locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/detail-working.png` }).catch(() => {})

  // ── 2. 미출근 + 늦어요 (우리 회사 것만: 10:20 · 다른 회사 근무 중·11:11은 안 섞임)
  const u1 = await detail(U(1))
  ok(`늦어요: '미출근 · 00:00 시작 · 10:20 도착 · 공고'`, u1.text === `미출근 · 00:00 시작 · 10:20 도착 · ${TITLE}` && u1.state === 'absent', u1.text)
  ok('빨간 점 + 깜빡임', /bg-rose-500/.test(u1.dot) && u1.ping === 1)
  ok('다른 회사 근무·늦어요는 안 보임 (남의행사402 · 11:11 없음)', !/남의행사402|11:11|근무 중/.test(u1.text))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await u1.line.locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/detail-late.png` }).catch(() => {})

  // ── 3. 현장 확인 요청 · 아무 말 없음 · 어제 늦어요는 안 셈
  const u2 = await detail(U(2))
  ok(`현장: '미출근 · 00:00 시작 · 현장 확인 요청 · 공고'`, u2.text === `미출근 · 00:00 시작 · 현장 확인 요청 · ${TITLE}`, u2.text)
  const u4 = await detail(U(4))
  ok(`말 없음(어제 늦어요는 안 셈): '미출근 · 00:00 시작 · 공고'`, u4.text === `미출근 · 00:00 시작 · ${TITLE}` && (await u4.line.locator('[data-work-told]').count()) === 0, u4.text)

  // ── 4. 근무일을 고른 사람: 오늘이 그 날이 아니면 '다음 근무 M/D 00:00'
  const u3 = await detail(U(3))
  ok(`내일만: '다음 근무 ${fmtDate(tomorrow)} 00:00 · 공고' (오늘 아님)`, u3.text === `다음 근무 ${fmtDate(tomorrow)} 00:00 · ${TITLE}` && u3.state === 'next' && u3.ping === 0, u3.text)

  // ── 5. 문의 대화 머리도 같은 줄 (예전엔 시작 뒤에도 '출근 전')
  await a.goto(`${D}/admin/chat/${U(1)}`)
  await a.locator('[data-vv="end"]').waitFor({ timeout: 15000 }).catch(() => {})
  const chat = one(await a.locator('[data-chat-work]').innerText().catch(() => ''))
  ok('대화 머리: 근무자 상세와 같은 글', chat === u1.text, chat)
  ok('대화 머리 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await a.locator('[data-chat-work]').locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/chat-late.png` }).catch(() => {})

  // ── 6. 시작 전: '오늘 HH:MM~23:59 · 출근 전' (깜빡임 없음) — 저녁 9시 넘으면 시작 시각을 못 미뤄 건너뜀
  const hmNow = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16)
  if (hmNow < '21:00') {
    const later = new Date(Date.now() + 9 * 3600e3 + 2 * 3600e3).toISOString().slice(11, 16)
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: `${later}:00` })
    const u4b = await detail(U(4))
    ok(`시작 전: '오늘 ${later}~23:59 · 출근 전 · 공고' (깜빡임 없음)`, u4b.text === `오늘 ${later}~23:59 · 출근 전 · ${TITLE}` && u4b.state === 'before' && u4b.ping === 0, u4b.text)
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00' })
  } else ok('시작 전 확인은 저녁 9시 뒤라 건너뜀', true)

  // ── 7. 다른 회사에만 지원한 사람은 우리 회사 화면에 줄이 없음
  await person(5, '남의사람402')
  await approve(U(5), J2, C2, j2)
  await a.goto(`${D}/admin/workers/${U(5)}`, { waitUntil: 'networkidle' })
  ok('우리 회사와 관계없는 사람: 오늘 근무 줄 없음', (await a.locator('[data-worker-today]').count()) === 0)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
