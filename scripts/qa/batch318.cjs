// 묶음 318 (정기 개선 2026-11-19 22:35 KST)
// · 근무자 '근무 내역 · 급여'(내 근무 · 지난 근무): 근무 시간이 끝났는데 종료를 안 누른 날은 '오늘 근무 중 / 끝나면 계산돼요' 대신
//   '근무 종료 전 / 종료를 눌러야 계산돼요' (주황 · 오늘 근무 카드의 안내와 같은 말) — 끝나기 전에는 그대로
// · 회사 간 자료 분리 점검 (최근에 바꾼 내려받기·화면): 다른 회사 관리자에게 우리 회사 신고자료 사람 수·대화 파일·서류 PDF가 안 보임
// node scripts/qa/batch318.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000318', A2 = 'aaaaaaaa-0000-4000-8000-0000000318a2'
const V1 = 'bbbbbbbb-0000-4000-8000-0000000318b1', V2 = 'bbbbbbbb-0000-4000-8000-0000000318b2'
const J1 = 'cccccccc-0000-4000-8000-000000031801', J2 = 'cccccccc-0000-4000-8000-000000031802'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const hm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16) + ':00'
const kmin = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const get = async (path, uid) => {
  const r = await fetch(`${D}${path}`, { headers: { cookie: `alba_session=${cookie(uid)}` }, redirect: 'manual' })
  return { status: r.status, text: await r.text() }
}

;(async () => {
  const today = kday()
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = job
  const [u] = await rest(`users?id=eq.${W}`)
  const { attendance: _ua, ratings: _ur, ...ub } = u
  const [app] = await rest(`applications?user_id=eq.${W}&job_id=eq.${J}`)
  const [att] = await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)
  // V1: 근무 시간이 이미 끝난 공고 (00:00~00:01)에 출근만 함 · V2: 아직 끝나기 전 공고 (1시간 전 ~ 2시간 뒤)
  const late = kmin() > 2
  const mk1 = async (V, Jx, name, phone, start, end) => {
    await rest('jobs', 'POST', { ...jb, id: Jx, title: `${name} 공고`, start_date: today, end_date: today, start_time: start, end_time: end, applications: [], attendance: [], created_at: new Date().toISOString() })
    const [jx] = await rest(`jobs?id=eq.${Jx}`)
    await rest('users', 'POST', { ...ub, id: V, name, phone, photo_at: new Date().toISOString(), created_at: '2026-10-20T00:00:00Z' })
    const [v] = await rest(`users?id=eq.${V}`)
    await rest('applications', 'POST', { ...app, id: `11111111-0000-4000-8000-0000000318${V.slice(-2)}`, user_id: V, user: v, job_id: Jx, job: jx, status: 'approved', created_at: '2026-10-20T00:00:00Z' })
    await rest('attendance', 'POST', { ...att, id: `eeeeeeee-0000-4000-8000-0000000318${V.slice(-2)}`, user_id: V, user: v, job_id: Jx, job: jx, work_date: today, clock_in: new Date(Date.now() - 60e3).toISOString(), clock_out: null, adj_in: null, adj_out: null, sched_start: null, sched_end: null, created_at: new Date().toISOString() })
  }
  if (late) await mk1(V1, J1, '종료안누름', '01031803181', '00:00:00', '00:01:00')
  await mk1(V2, J2, '근무중인사람', '01031803182', hm(Date.now() - 3600e3), hm(Date.now() + 2 * 3600e3))

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

  // ── 1. 근무 시간이 끝났는데 종료 전 → '근무 종료 전 / 종료를 눌러야 계산돼요'
  if (late) {
    const p = await mk(V1)
    for (const path of ['/me', '/me/history']) {
      await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
      const card = p.locator('[data-history-job]').first()
      const t = one(await card.innerText().catch(() => ''))
      ok(`${path}: 끝났는데 종료 전 → '근무 종료 전 · 종료를 눌러야 계산돼요' (주황)`, t.includes('근무 종료 전') && t.includes('종료를 눌러야 계산돼요') && !t.includes('끝나면 계산돼요') && (await card.locator('[data-live-shift][data-live-over]').count()) === 1 && (await card.locator('[data-live-over].text-amber-600').count()) === 1, t)
      ok(`${path}: 360px 옆으로 안 밀림`, await noSide(p))
      if (SHOTS) await card.screenshot({ path: `${SHOTS}/history-over${path.replace(/\//g, '_')}.png` }).catch(() => {})
    }
  } else console.log('SKIP  자정 바로 뒤라 끝난 공고를 만들 수 없음')

  // ── 2. 아직 근무 시간 안 → 그대로 '오늘 근무 중 / 끝나면 계산돼요'
  const q = await mk(V2)
  for (const path of ['/me', '/me/history']) {
    await q.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    const card = q.locator('[data-history-job]').first()
    const t = one(await card.innerText().catch(() => ''))
    ok(`${path}: 근무 시간 안 → 그대로 '오늘 근무 중 · 끝나면 계산돼요' (초록)`, t.includes('오늘 근무 중') && t.includes('끝나면 계산돼요') && (await card.locator('[data-live-over]').count()) === 0 && (await card.locator('[data-live-shift].text-emerald-600').count()) === 1, t)
  }

  // ── 3. 회사 간 자료 분리 (최근 바꾼 곳)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼일팔컴퍼니', seal_image: null, verified: true, join_code: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  const { attendance: _aa, ratings: _ar, ...ab } = a1
  await rest('users', 'POST', { ...ab, id: A2, name: '삼일팔관리자', phone: '01031803183', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-15T00:00:00Z' })
  const o = await mk(A2)
  await o.goto(`${D}/admin/reports?month=${today.slice(0, 7)}`, { waitUntil: 'networkidle' })
  const counts = await o.locator('[data-report-file]').evaluateAll((els) => els.map((e) => e.dataset.reportCount))
  const body = one(await o.locator('main').innerText().catch(() => ''))
  ok('다른 회사 관리자 신고자료: 파일마다 0명 · 우리 근무자 이름 없음', counts.length === 4 && counts.every((n) => n === '0') && !body.includes('종료안누름') && !body.includes('근무중인사람'), JSON.stringify(counts))
  ok('다른 회사 관리자: 우리 단체방 대화 파일 못 받음 (403)', (await get(`/admin/chat/room/${J}/export`, A2)).status === 403)
  ok('다른 회사 관리자: 우리 근무자 문의 대화 파일 못 받음 (403)', (await get(`/admin/chat/${W}/export`, A2)).status === 403)
  const pdf = await get(`/admin/docs/pdf?job=${J}`, A2)
  ok('다른 회사 관리자: 우리 공고 서류 PDF 없음 (404)', pdf.status === 404, `${pdf.status}`)
  const pdf2 = await get(`/admin/docs/pdf?id=${DOC_SIGNED}`, A2)
  ok('다른 회사 관리자: 우리 서류 하나도 PDF 없음 (404)', pdf2.status === 404, `${pdf2.status}`)
  const csv = await get(`/admin/export/daily-income?month=${today.slice(0, 7)}`, A2)
  ok('다른 회사 관리자 일용근로소득 CSV: 우리 근무자 없음 (머리줄만)', csv.status === 200 && csv.text.trim().split('\n').length === 1 && !csv.text.includes(u.name), `${csv.status} lines=${csv.text.trim().split('\n').length}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
