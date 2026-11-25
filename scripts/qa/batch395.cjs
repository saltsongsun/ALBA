// 묶음 395 (정기 개선 2026-11-26 01:35 KST)
// 기능 · 회사 간 자료 분리 점검 (어제 잠근 내려받기): 둘째 회사 관리자가 잠금을 풀어도
//   · 첫째 회사 공고의 정산표·이체 목록은 못 받음 · 신고 파일에는 자기 회사 근무자만 · 첫째 회사 파일에도 둘째 회사 근무자 없음
//   · 잠금을 푼 뒤 돌아갈 곳은 정해진 화면만 (다른 사이트·엉뚱한 주소면 근무자 화면으로)
// 디자인 · 잠금을 푼 동안 신고자료·정산 탭에 '파일 열림 · n분 뒤 잠김' 한 줄 + 줄어드는 막대 (움직임 줄이기면 바로)
//   · 시간이 다 되면 자물쇠로 돌아감 · 이체 목록 복사 버튼도 잠긴 동안 자물쇠 · 360px 옆으로 안 밀림
// node scripts/qa/batch395.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac, scryptSync, randomBytes } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec = 600) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000039502'
const A2 = 'aaaaaaaa-0000-4000-8000-000000039502', U2 = '44444444-0000-4000-8000-000000039502', J2 = 'cccccccc-0000-4000-8000-000000039502'
const PIN = '583014'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const get = (p, ck) => fetch(`${D}${p}`, { headers: { cookie: ck }, redirect: 'manual' })
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args, form) =>
  p.evaluate(
    async ({ id, args, form }) => {
      let body
      const headers = { 'Next-Action': id, Accept: 'text/x-component' }
      if (form) {
        body = new FormData()
        for (const [k, v] of Object.entries(form)) body.append(`_1_${k}`, v)
        body.append('0', JSON.stringify([...args, '$K1']))
      } else {
        body = JSON.stringify(args)
        headers['Content-Type'] = 'text/plain;charset=UTF-8'
      }
      const r = await fetch(location.pathname, { method: 'POST', headers, body })
      return { status: r.status, redirect: decodeURIComponent(r.headers.get('x-action-redirect') || ''), text: await r.text() }
    },
    { id: idOf(file, name), args, form },
  )

;(async () => {
  const today = kday(0)
  const MONTH = today.slice(0, 7)
  const salt = randomBytes(16)
  await rest(`users?id=eq.${A}`, 'PATCH', { pin_hash: `s1:${salt.toString('base64')}:${scryptSync(PIN, salt, 32).toString('base64')}` })
  // 첫째 회사: 근무자(W)가 오늘 J 근무를 마침 (지급 전)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { clock_in: `${today}T00:00:00Z`, clock_out: `${today}T04:00:00Z`, paid: false })
  // 둘째 회사(확인됨) + 대표 관리자 A2 + 공고 J2 + 근무자 U2 (오늘 근무 마침)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [ua] = await rest(`users?id=eq.${A}`)
  const [w] = await rest(`users?id=eq.${W}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _ap, attendance: _at, ...jl } = job
  const [att] = await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '분리상사395', verified: true, seal_image: null, created_at: new Date().toISOString() })
  await rest('users', 'POST', { ...ua, id: A2, name: '둘째대표395', phone: '01039500001', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: new Date().toISOString() })
  await rest('users', 'POST', { ...w, id: U2, name: '분리근무자395', phone: '01039500002' })
  await rest('jobs', 'POST', { ...jl, id: J2, company_id: C2, title: '분리행사395', start_date: today, end_date: today, applications: [], attendance: [], created_at: new Date().toISOString() })
  const j2 = { ...jl, id: J2, company_id: C2, title: '분리행사395', start_date: today, end_date: today }
  await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: J2, user_id: U2, company_id: C2, status: 'approved', available_dates: null, created_at: new Date().toISOString(), job: j2, user: { id: U2, name: '분리근무자395', phone: '01039500002' } })
  const { id: _id, ...attRest } = att
  await rest('attendance', 'POST', { ...attRest, id: 'eeeeeeee-0000-4000-8000-000000039502', job_id: J2, company_id: C2, user_id: U2, job: j2, user: { ...w, id: U2, name: '분리근무자395', phone: '01039500002' } })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { company, sec, reducedMotion } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'], ...(reducedMotion ? { reducedMotion } : {}) })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(sec ? [{ name: 'alba_roster', value: roster(uid, sec), url: D }] : []), ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 회사 간 분리: 둘째 회사 관리자가 잠금을 풀어도 첫째 회사 자료는 못 받음 ──
  const ck2 = `alba_session=${cookie(A2)}; alba_roster=${roster(A2)}; hw_company=${C2}`
  const ck1 = `alba_session=${cookie(A)}; alba_roster=${roster(A)}`
  const st = await get(`/admin/export/settlement?job=${J}`, ck2)
  ok('둘째 회사(잠금 풀림): 첫째 회사 공고 정산표는 못 받음 (없는 공고)', st.status === 404, String(st.status))
  const own = await get(`/admin/export/settlement?job=${J2}`, ck2)
  const ownCsv = own.status === 200 ? await own.text() : ''
  ok('확인용: 자기 회사 공고 정산표는 받음 · 첫째 회사 근무자 없음', own.status === 200 && !ownCsv.includes('01033334444'), String(own.status))
  for (const kind of ['daily-income', 'employment', 'business-income', 'other-income']) {
    const r2 = await get(`/admin/export/${kind}?month=${MONTH}`, ck2)
    const t2 = r2.status === 200 ? await r2.text() : ''
    ok(`둘째 회사 ${kind}: 첫째 회사 근무자(이름·번호) 없음`, r2.status === 200 && !t2.includes('01033334444') && !/(^|,)근무자(,|$)/m.test(t2), String(r2.status))
  }
  const r1 = await get(`/admin/export/daily-income?month=${MONTH}`, ck1)
  const t1 = r1.status === 200 ? await r1.text() : ''
  ok('첫째 회사 일용 신고 파일: 자기 근무자는 있고 둘째 회사 근무자 없음', r1.status === 200 && t1.includes('근무자') && !t1.includes('분리근무자395') && !t1.includes('01039500002'), String(r1.status))
  // 이체 목록(계좌번호): 다른 회사 공고면 막힘
  const p2 = await mk(A2, { company: C2, sec: 600 })
  await p2.goto(`${D}/admin`, { waitUntil: 'domcontentloaded' })
  const tr = await call(p2, 'admin', 'transferList', [J])
  ok('둘째 회사: 첫째 회사 공고 이체 목록 못 받음 (계좌 없음)', tr.text.includes('공고를 찾을 수 없습니다') && !tr.text.includes('국민'), tr.text.slice(0, 120))
  // 잠금 풀기 뒤 돌아갈 곳: 정해진 화면만
  const a1 = await mk(A)
  await a1.goto(`${D}/admin/reports?month=${MONTH}&unlock=csv`, { waitUntil: 'domcontentloaded' })
  const bad = await call(a1, 'roster', 'unlockRoster', ['//evil.example/admin/reports', null], { pin: PIN })
  ok("잠금 풀기 뒤 '//다른 사이트'로는 안 감 (근무자 화면으로)", bad.redirect.startsWith('/admin/workers') && !bad.redirect.includes('evil'), bad.redirect)
  const bad2 = await call(a1, 'roster', 'unlockRoster', [`/admin/jobs/${J}?tab=pay&next=//evil.example`, null], { pin: PIN })
  ok('정산 탭 주소 뒤에 다른 값을 붙이면 근무자 화면으로', bad2.redirect.startsWith('/admin/workers'), bad2.redirect)
  const good = await call(a1, 'roster', 'unlockRoster', [`/admin/reports?month=${MONTH}`, null], { pin: PIN })
  ok('확인용: 신고자료(달) 주소로는 돌아감', good.redirect.split(';')[0] === `/admin/reports?month=${MONTH}`, good.redirect)

  // ── 2. 디자인: '파일 열림 · n분 뒤 잠김' ──
  const a = await mk(A, { sec: 600 })
  await a.goto(`${D}/admin/reports?month=${MONTH}`, { waitUntil: 'networkidle' })
  const open = a.locator('[data-report-downloads] [data-files-open]')
  await open.waitFor({ timeout: 15000 }).catch(() => {})
  ok("신고자료: '파일 열림 · 10분 뒤 잠김' 한 줄 (잠그기 버튼 없음) · 자물쇠 없음", one(await open.innerText().catch(() => '')) === '파일 열림 · 10분 뒤 잠김' && (await open.locator('button').count()) === 0 && (await a.locator('[data-report-locked]').count()) === 0, one(await open.innerText().catch(() => '')))
  const barW = await open.locator('[data-roster-time-bar]').evaluate((el) => el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width).catch(() => -1)
  ok('막대가 거의 가득 (남은 시간)', barW > 0.9, barW.toFixed(2))
  ok('한 줄 높이 · 360px 옆으로 안 밀림', (await open.evaluate((el) => el.getBoundingClientRect().height <= 40).catch(() => false)) && (await noSide(a)))
  if (SHOTS) await a.locator('[data-report-downloads]').screenshot({ path: `${SHOTS}/files-open.png` }).catch(() => {})
  // 정산 탭: 열림 줄 + 이체 목록 자물쇠 없음
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' })
  await a.locator('[data-pay-tools]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("정산 탭(잠금 풀림): '파일 열림' 한 줄 · 이체 목록 자물쇠 없음", (await a.locator('[data-files-open]').count()) === 1 && (await a.locator('[data-transfer-locked]').count()) === 0 && (await a.getByRole('button', { name: '💸 이체 목록 복사' }).count()) === 1)
  if (SHOTS) await a.locator('[data-pay-tools]').locator('xpath=..').screenshot({ path: `${SHOTS}/pay-open.png` }).catch(() => {})
  // 잠긴 정산 탭: 열림 줄 없음 · 이체 목록 버튼에 자물쇠 (이름은 그대로)
  const l = await mk(A)
  await l.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' })
  await l.locator('[data-pay-tools]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('정산 탭(잠김): 열림 줄 없음 · 이체 목록 버튼에 자물쇠', (await l.locator('[data-files-open]').count()) === 0 && (await l.locator('[data-transfer-locked]').count()) === 1 && (await l.getByRole('button', { name: '💸 이체 목록 복사' }).count()) === 1)
  ok('정산 탭 360px 옆으로 안 밀림', await noSide(l))
  // 움직임 줄이기: 막대 움직임 없음
  const rm = await mk(A, { sec: 600, reducedMotion: 'reduce' })
  await rm.goto(`${D}/admin/reports?month=${MONTH}`, { waitUntil: 'networkidle' })
  const rtr = await rm.locator('[data-files-open] [data-roster-time-bar]').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 막대가 바로 바뀜', rtr < 0.05, String(rtr))
  // 시간이 다 되면 자물쇠로
  const ex = await mk(A, { sec: 20 })
  await ex.goto(`${D}/admin/reports?month=${MONTH}`, { waitUntil: 'networkidle' })
  ok("곧 잠길 때: '파일 열림 · 1분 뒤 잠김'", one(await ex.locator('[data-files-open]').innerText().catch(() => '')) === '파일 열림 · 1분 뒤 잠김')
  await ex.locator('[data-report-file][data-report-locked]').first().waitFor({ timeout: 40000 }).catch(() => {})
  ok('시간이 다 되면 열림 줄이 사라지고 4줄 모두 자물쇠', (await ex.locator('[data-files-open]').count()) === 0 && (await ex.locator('[data-report-file][data-report-locked]').count()) === 4)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
