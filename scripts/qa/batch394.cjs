// 묶음 394 (보안 점검 후속 A·B · 사용자 요청 2026-11-25 "A·B 바로 진행해줘")
// A · 회원 id가 화면 데이터(HTML·RSC)로 새지 않음: 놀이터 주간 랭킹 · 함께 일한 사람 (버튼은 그대로 동작)
//   · 공고 조회수: 비회원 표시 쿠키에 서명 — 같은 표시는 한 번만, 가짜 표시를 바꿔 보내도 한 곳에서 한 시간 60번까지만
//   · 견적 링크 비밀값(/quote/…)은 사용 기록에 '/quote/[token]'으로만
// B · 주민번호·계좌가 든 파일(신고 파일 4종·정산표·이체 목록)은 명단 잠금(비밀번호 한 번 더)을 푼 10분 안에만
//   · 잠긴 채 누르면 그 화면 잠금 카드(신고 파일 잠금 / 정산 파일 잠금) → 비밀번호 → 원래 화면으로 → 바로 받기
//   · 수기 출퇴근 기록은 공고 기간 안·오늘까지만 (오지 않은 날은 '수기 등록은 그날부터') · 360px 옆으로 안 밀림
// node scripts/qa/batch394.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac, scryptSync, randomBytes } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
const P = 'bbbbbbbb-0000-4000-8000-0000003940b1', Q = 'bbbbbbbb-0000-4000-8000-0000003940b2'
const PIN = '583014'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
const get = (p, cookies) => fetch(`${D}${p}`, { headers: { cookie: cookies, 'user-agent': UA }, redirect: 'manual' })

const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args, form) =>
  p.evaluate(
    async ({ id, args, form }) => {
      const body = new FormData()
      for (const [k, v] of Object.entries(form)) body.append(`_1_${k}`, v)
      body.append('0', JSON.stringify([...args, '$K1']))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return { status: r.status, redirect: decodeURIComponent(r.headers.get('x-action-redirect') || ''), text: await r.text() }
    },
    { id: idOf(file, name), args, form },
  )
const said = (r, msg) => r.text.includes(msg) || r.redirect.includes(msg)

;(async () => {
  const today = kday(0)
  const MONTH = today.slice(0, 7)
  // 관리자 A 비밀번호 (명단 잠금 풀기)
  const salt = randomBytes(16)
  await rest(`users?id=eq.${A}`, 'PATCH', { pin_hash: `s1:${salt.toString('base64')}:${scryptSync(PIN, salt, 32).toString('base64')}` })
  // 근무자 W: 오늘 J 근무를 마쳤고 아직 지급 전 (이체 목록 대상)
  // (근무 시간은 공고 시간 안 고정 09:00~13:00 KST — 지금 시각과 상관없이 금액이 생기게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { clock_in: `${today}T00:00:00Z`, clock_out: `${today}T04:00:00Z`, paid: false })
  // 랭킹: 참여한 근무자 둘 (오늘 출석 → 점수 있음)
  const [k] = await rest(`users?id=eq.${AP}`)
  const { attendance: _a, ratings: _r, ...ub } = k
  for (const [id, name, phone, nickname] of [[P, '구사일', '01039400001', '랭커394'], [Q, '구사이', '01039400002', '구경394']]) {
    await rest('users', 'POST', { ...ub, id, name, phone, nickname, role: 'worker', member_type: 'worker', photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
    await rest('community_rank_members', 'POST', { user_id: id, created_at: '2026-11-20T00:00:00Z' })
    await rest('community_checkins', 'POST', { user_id: id, day: today })
  }
  // 함께 일한 사람: 기능 켜기 · 김지원(AP)도 같은 공고에서 출근 · 별명
  await rest('audit_logs', 'POST', { actor_id: A, action: 'feature.coworkers', detail: 'on', created_at: new Date().toISOString() })
  await rest('attendance', 'POST', { job_id: J, user_id: AP, work_date: today, clock_in: new Date(Date.now() - 4 * 3600e3).toISOString(), clock_out: null })
  await rest(`users?id=eq.${W}`, 'PATCH', { nickname: '주차왕394' })
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽394' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { unlocked = false, perms = [] } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', permissions: perms })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(unlocked ? [{ name: 'alba_roster', value: roster(uid), url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── A1. 놀이터 랭킹: 별명은 보이고 회원 id는 화면 데이터에 없음 ──
  const q = await mk(Q)
  await q.goto(`${D}/community/play`, { waitUntil: 'networkidle' })
  await q.locator('[data-rank-row]').first().waitFor({ timeout: 10000 }).catch(() => {})
  const rankText = one(await q.locator('[data-rank]').innerText().catch(() => ''))
  ok("랭킹에 별명 '랭커394' 보임", rankText.includes('랭커394'), rankText.slice(0, 120))
  const playHtml = await q.content()
  const playRsc = await (await get('/community/play', `alba_session=${cookie(Q)}`).then((r) => r)).text()
  const playFlight = await fetch(`${D}/community/play`, { headers: { cookie: `alba_session=${cookie(Q)}`, RSC: '1', 'user-agent': UA } }).then((r) => r.text())
  ok('랭킹: 다른 참여자 회원 id가 HTML·RSC 어디에도 없음', ![playHtml, playRsc, playFlight].some((t) => t.includes(P)), [playHtml, playRsc, playFlight].map((t) => t.includes(P)).join(','))

  // ── A2. 함께 일한 사람: 회원 id 없음 · '내 지원 보여 주기'는 그대로 ──
  const w = await mk(W)
  await w.goto(`${D}/community/coworkers`, { waitUntil: 'networkidle' })
  await w.locator('[data-coworker-list]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("함께 일한 사람: '새벽394' 보임", one(await w.locator('[data-coworker]').first().innerText().catch(() => '')).includes('새벽394'))
  const cwHtml = await w.content()
  const cwFlight = await fetch(`${D}/community/coworkers`, { headers: { cookie: `alba_session=${cookie(W)}`, RSC: '1', 'user-agent': UA } }).then((r) => r.text())
  ok('함께 일한 사람: 상대 회원 id가 HTML·RSC에 없음 (버튼 값은 암호화)', !cwHtml.includes(AP) && !cwFlight.includes(AP), `${cwHtml.includes(AP)},${cwFlight.includes(AP)}`)
  await w.getByRole('button', { name: '내 지원 보여 주기' }).click()
  await w.locator('[data-coworker=sharing]').waitFor({ timeout: 8000 }).catch(() => {})
  const links = (await rest('coworker_links')) ?? []
  ok("'내 지원 보여 주기' 그대로 동작 (주차왕 → 새벽 한 줄)", links.some((l) => l.from_id === W && l.to_id === AP) && (await w.locator('[data-coworker=sharing]').count()) === 1)
  ok('함께 일한 사람 360px 옆으로 안 밀림', await noSide(w))

  // ── A3. 공고 조회수: 서명한 비회원 표시 ──
  const views = async () => ((await rest(`job_views?job_id=eq.${J}`)) ?? []).length
  const v0 = await views()
  const first = await fetch(`${D}/api/jobs/${J}/view`, { method: 'POST', headers: { 'user-agent': UA } })
  const setc = first.headers.get('set-cookie') ?? ''
  const vid = (setc.match(/hw_vid=([^;]+)/) ?? [])[1] ?? ''
  ok('처음 보면 서명한 표시를 받음 (표시.서명)', /^[A-Za-z0-9_-]{16,40}\.[A-Za-z0-9_-]{22}$/.test(vid), vid)
  const v1 = await views()
  for (let i = 0; i < 3; i++) await fetch(`${D}/api/jobs/${J}/view`, { method: 'POST', headers: { cookie: `hw_vid=${vid}`, 'user-agent': UA } })
  ok('같은 표시로 다시 보면 한 번만 셈', v1 === v0 + 1 && (await views()) === v1, `${v0}→${v1}→${await views()}`)
  // 가짜 표시를 바꿔 가며 70번 (예전 모양 · 가짜 서명 섞어서)
  for (let i = 0; i < 70; i++) {
    const fake = randomBytes(16).toString('base64url') + (i % 2 ? `.${randomBytes(16).toString('base64url')}` : '')
    await fetch(`${D}/api/jobs/${J}/view`, { method: 'POST', headers: { cookie: `hw_vid=${fake}`, 'user-agent': UA } })
  }
  const added = (await views()) - v1
  ok('가짜 표시를 바꿔 보내도 한 곳에서 한 시간 60번까지만 셈', added <= 60 && added > 0, `+${added}`)

  // ── A4. 견적 링크 비밀값은 사용 기록에 남지 않음 ──
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
  await fetch(`${D}/api/t`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, origin: D }, body: JSON.stringify({ s: 'sess394abcdef', k: 'view', p: `/quote/${token}`, r: `/quote/${token}` }) })
  await new Promise((r) => setTimeout(r, 400))
  const ev = ((await rest('usage_events')) ?? []).filter((e) => String(e.path ?? '').startsWith('/quote'))
  ok("견적 화면 기록은 '/quote/[token]'으로만 · 비밀값 없음", ev.length > 0 && ev.every((e) => e.path === '/quote/[token]') && !JSON.stringify(ev).toLowerCase().includes(token.toLowerCase()), JSON.stringify(ev.map((e) => [e.path, e.prev ?? e.ref ?? null])))

  // ── B1. 주민번호·계좌 파일: 잠금 안 풀면 잠금 화면으로 ──
  const sess = `alba_session=${cookie(A)}`
  for (const kind of ['daily-income', 'business-income', 'other-income', 'employment']) {
    const r = await get(`/admin/export/${kind}?month=${MONTH}`, sess)
    ok(`잠금 안 풀면 ${kind} 파일 대신 신고자료 잠금 화면으로`, r.status === 303 && r.headers.get('location') === `/admin/reports?month=${MONTH}&unlock=csv` && !(r.headers.get('content-disposition') ?? ''), `${r.status} ${r.headers.get('location')}`)
  }
  const st = await get(`/admin/export/settlement?job=${J}`, sess)
  ok('잠금 안 풀면 정산표 대신 정산 탭 잠금 화면으로', st.status === 303 && st.headers.get('location') === `/admin/jobs/${J}?tab=pay&unlock=csv`, `${st.status} ${st.headers.get('location')}`)
  const open1 = await get(`/admin/export/daily-income?month=${MONTH}`, `${sess}; alba_roster=${roster(A)}`)
  ok('잠금을 풀었으면 신고 파일 그대로 받음', open1.status === 200 && (open1.headers.get('content-disposition') ?? '').includes('attachment'), String(open1.status))
  const open2 = await get(`/admin/export/settlement?job=${J}`, `${sess}; alba_roster=${roster(A)}`)
  ok('잠금을 풀었으면 정산표 그대로 받음', open2.status === 200 && (open2.headers.get('content-disposition') ?? '').includes('attachment'), String(open2.status))
  // 다른 관리자의 잠금 표로는 안 열림
  const other = await get(`/admin/export/daily-income?month=${MONTH}`, `${sess}; alba_roster=${roster(W)}`)
  ok('다른 사람의 잠금 표로는 안 열림', other.status === 303, String(other.status))

  // ── B2. 신고자료 화면: 잠김 표시 → 누르면 잠금 카드 → 비밀번호 → 돌아와서 바로 받기 ──
  const a = await mk(A)
  await a.goto(`${D}/admin/reports?month=${MONTH}`, { waitUntil: 'networkidle' })
  await a.locator('[data-report-files]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('신고 파일 4줄 모두 잠김 표시 (자물쇠)', (await a.locator('[data-report-file][data-report-locked]').count()) === 4)
  if (SHOTS) await a.locator('[data-report-downloads]').screenshot({ path: `${SHOTS}/reports-locked.png` }).catch(() => {})
  await Promise.all([a.waitForURL(/unlock=csv/, { timeout: 15000 }).catch(() => {}), a.locator('[data-report-file=daily]').click()])
  await a.locator('[data-roster-lock]').waitFor({ timeout: 10000 }).catch(() => {})
  const lockTxt = one(await a.locator('[data-roster-lock]').innerText().catch(() => ''))
  ok("잠금 카드 '신고 파일 잠금' · 주민등록번호 안내 · '잠금 풀기'", lockTxt.includes('신고 파일 잠금') && lockTxt.includes('주민등록번호가 있어') && lockTxt.includes('잠금 풀기'), lockTxt.slice(0, 120))
  ok('신고 파일 잠금 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/reports-lock.png` }).catch(() => {})
  await a.locator('#roster-pin').fill(PIN)
  await Promise.all([a.waitForURL((u) => u.pathname === '/admin/reports' && !u.searchParams.has('unlock'), { timeout: 15000 }).catch(() => {}), a.getByRole('button', { name: '잠금 풀기' }).click()])
  await a.locator('[data-report-files]').waitFor({ timeout: 15000 }).catch(() => {})
  const back = new URL(a.url())
  ok('비밀번호 → 같은 달 신고자료로 돌아옴 · 자물쇠 사라짐', back.searchParams.get('month') === MONTH && (await a.locator('[data-report-locked]').count()) === 0, a.url())
  const dl = a.waitForEvent('download', { timeout: 10000 }).catch(() => null)
  await a.locator('[data-report-file=daily]').click()
  await a.waitForTimeout(300)
  if (await a.locator('[data-report-file-warn]').count()) await a.locator('[data-report-file=daily]').click()
  const file = await dl
  const csv = file ? await fs.promises.readFile(await file.path(), 'utf8').catch(() => '') : ''
  ok('풀린 뒤엔 바로 받아짐 (일용근로 신고 CSV)', csv.replace(/^\uFEFF/, '').startsWith('귀속연월,성명,주민등록번호'), csv.slice(0, 40))

  // ── B3. 정산 탭: 정산표·이체 목록 잠금 → 정산 파일 잠금 → 다시 정산 탭 ──
  const pa = await mk(A, { perms: ['clipboard-read', 'clipboard-write'] })
  await pa.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' })
  await pa.locator('[data-pay-tools]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("정산표 엑셀 칸 자물쇠 표시", (await pa.locator('[data-pay-csv-locked]').count()) === 1)
  await Promise.all([pa.waitForURL(/unlock=transfer/, { timeout: 15000 }).catch(() => {}), pa.getByRole('button', { name: '💸 이체 목록 복사' }).click()])
  await pa.locator('[data-roster-lock]').waitFor({ timeout: 10000 }).catch(() => {})
  const payLock = one(await pa.locator('[data-roster-lock]').innerText().catch(() => ''))
  ok("이체 목록 복사 → '정산 파일 잠금' (계좌번호 안내)", payLock.includes('정산 파일 잠금') && payLock.includes('계좌번호가 있어'), payLock.slice(0, 100))
  ok('정산 파일 잠금 360px 옆으로 안 밀림', await noSide(pa))
  if (SHOTS) await pa.screenshot({ path: `${SHOTS}/pay-lock.png` }).catch(() => {})
  await pa.locator('#roster-pin').fill(PIN)
  await Promise.all([pa.waitForURL((u) => u.searchParams.get('tab') === 'pay' && !u.searchParams.has('unlock'), { timeout: 15000 }).catch(() => {}), pa.getByRole('button', { name: '잠금 풀기' }).click()])
  await pa.locator('[data-pay-tools]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('정산 탭으로 돌아옴 · 자물쇠 사라짐', (await pa.locator('[data-pay-csv-locked]').count()) === 0 && (await pa.locator('[data-pay-csv]').count()) === 1)
  await pa.getByRole('button', { name: '💸 이체 목록 복사' }).click()
  ok('풀린 뒤엔 이체 목록이 바로 복사됨', await pa.getByText(/명 이체 목록을 복사했어요/).first().waitFor({ timeout: 8000 }).then(() => true, () => false))

  // ── B4. 수기 출퇴근: 공고 기간 안·오늘까지만 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: kday(2) })
  const fu = await call(pa, 'admin', 'addAttendance', [J], { user_id: W, work_date: kday(1), in: '09:00', out: '18:00' })
  ok('오지 않은 날 기록은 막힘', said(fu, '아직 오지 않은 날은 넣을 수 없어요'), fu.redirect.slice(0, 120))
  const outR = await call(pa, 'admin', 'addAttendance', [J], { user_id: W, work_date: kday(-5), in: '09:00', out: '18:00' })
  ok('공고 기간 밖 날짜는 막힘', said(outR, '안의 날짜만 넣을 수 있어요'), outR.redirect.slice(0, 120))
  ok('막힌 기록은 저장 안 됨', ((await rest(`attendance?user_id=eq.${W}`)) ?? []).every((x) => x.work_date !== kday(1) && x.work_date !== kday(-5)))
  await pa.goto(`${D}/admin/jobs/${J}?tab=att&date=${kday(1)}`, { waitUntil: 'networkidle' })
  await pa.locator('[data-att-row]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const row = pa.locator(`[data-att-row="${W}"]`)
  if (await row.locator('summary').first().count()) await row.locator('summary').first().click().catch(() => {})
  ok("오지 않은 날: '수기 등록은 그날부터 할 수 있어요' (등록 칸 없음)", (await pa.locator('[data-att-add-later]').count()) > 0 && (await pa.getByText('수기로 출퇴근 등록').count()) === 0)
  ok('출퇴근 탭 360px 옆으로 안 밀림', await noSide(pa))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
