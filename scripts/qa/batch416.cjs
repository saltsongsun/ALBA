// 묶음 416 (정기 개선 2026-11-27 19:36 KST)
// · 회사 간 자료 분리 점검 (지난 점검 batch406 뒤에 더한 기능들):
//   - 정산 탭 '일찍 찍힌 출근 n건 · 고치기/한 번에 고치기' (03:36·11:36) · 출퇴근 탭 '조기 · 고치기 ›' fix= · 여러 명 고치기 bulk= (09:36·11:36)
//   - 근무자 '담당자가 고침' 줄 · '🕒 근무 시각 고침' 알림 (05:36·07:35·09:36)
//   - 새 공고 '지난 공고는 켜 뒀어요 · 똑같이 켜기' (13:36·15:36) · 새 회사 '시작하기' 남은 칸 (17:36)
//   다른 회사(격리상사416)의 근무자·공고·시각 고침이 우리 회사(C1) 화면에 섞이지 않음
//   두 회사를 맡은 관리자(M)가 그 회사를 고르면 그때 보임 (검사가 헛돌지 않게 대조)
// · 디자인: 어두운 화면에서 '시작하기' 지금 할 단계 줄이 어두운 칸 (밝은 칸에 흰 글씨 X)
// node scripts/qa/batch416.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000416'
const N = 'aaaaaaaa-0000-4000-8000-000000041601' // 우리 회사(C1)만 맡은 관리자
const M = 'aaaaaaaa-0000-4000-8000-000000041602' // C1 관리자 + 격리상사416 대표
const U = '44444444-0000-4000-8000-000000041605' // 격리상사416 근무자 (어제 06:00 출근 · 시각 고침 알림 받음)
const J2 = 'cccccccc-0000-4000-8000-000000041601'
const MARK = ['격리행사416', '격리근무자416']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const at = (d, hm) => new Date(`${d}T${hm}:00+09:00`).toISOString()
const leaks = (t, extra = []) => [...MARK, ...extra].filter((m) => (t ?? '').includes(m))

;(async () => {
  const y = kday(-1)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [w] = await rest(`users?id=eq.${W}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [att] = await rest(`attendance?id=eq.${ATT}`)
  const { applications: _a, attendance: _t, ...jl } = job
  // 우리 회사 공고(J)는 조기 인정·현장 출근·바로 확정 모두 꺼 둠 → 새 공고 칩이 나오면 다른 회사 것을 따라간 것
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: false, gps_required: false, auto_approve: false })

  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사416', join_code: 'ISO416', seal_image: null, company_address: null, created_at: ago(5) })
  const admin = (id, name, phone) => rest('users', 'POST', { ...a, id, name, phone, is_super: false })
  await admin(N, '한회사관리자416', '01041600001')
  await admin(M, '두회사관리자416', '01041600002')
  await rest('users', 'POST', { ...w, id: U, name: '격리근무자416', phone: '01041600005', birth_date: '1995-05-05', role: 'worker', active: true, careers: [], photo_at: null, created_at: ago(300), attendance: [], ratings: [] })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C1, user_id: M, role: 'admin', created_at: ago(5) })
  await rest('company_members', 'POST', { company_id: C2, user_id: M, role: 'owner', created_at: ago(5) })
  // 격리상사416 공고: 어제 09:00~18:00 · 조기 인정 끔 (그래서 06:00 출근이 '일찍 찍힌 출근') · 가장 최근 공고이고 세 설정을 켜 둠
  const j2 = { ...jl, id: J2, company_id: C2, company: { company_name: '격리상사416' }, title: '격리행사416', start_date: kday(-2), end_date: kday(0), start_time: '09:00:00', end_time: '18:00:00', status: 'open', early_clamp: false, gps_required: true, auto_approve: true, created_at: new Date().toISOString() }
  await rest('jobs', 'POST', { ...j2, applications: [], attendance: [] })
  await rest('applications', 'POST', { id: 'ffffffff-0000-4000-8000-000000041601', job_id: J2, user_id: U, company_id: C2, status: 'approved', available_dates: null, position: null, message: null, held_at: null, contract_received_at: null, created_at: ago(90), job: j2, user: { id: U, name: '격리근무자416', phone: '01041600005' } })
  await rest('attendance', 'POST', { ...att, id: 'eeeeeeee-0000-4000-8000-000000041601', job_id: J2, company_id: C2, user_id: U, work_date: y, clock_in: at(y, '06:00'), clock_out: at(y, '18:00'), adj_in: null, adj_out: null, paid: false, note: null })
  // U가 받은 '🕒 근무 시각 고침' (격리상사416이 보냄)
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: U, sender_id: M, from_admin: true, company_id: C2, job_id: J2, body: `🕒 근무 시각 고침\n격리행사416 · 출근 06:00 → 09:00\n::b:history::`, created_at: ago(1), read_at: null })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company, dark = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript((d) => { try { if (d) localStorage.setItem('theme', 'dark'); sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, dark)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid, 600), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const body = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
    await p.waitForTimeout(150)
    return p.locator('body').innerText().catch(() => '')
  }

  // ── 대조: 두 회사 관리자 M이 격리상사416을 고르면 그 회사 것이 보임 (검사가 헛돌지 않는지)
  const m2 = await pg(M, C2)
  let t = await body(m2, `/admin/jobs/${J2}?tab=pay`)
  ok("대조 · 격리상사416을 고르면 정산 탭에 '일찍 찍힌 출근'과 그 근무자", t.includes('격리근무자416') && (await m2.locator('[data-pay-early]').count()) === 1, leaks(t).join(','))
  t = await body(m2, '/admin/jobs/new')
  ok("대조 · 격리상사416 새 공고엔 '똑같이 켜기' 칩 (그 회사 지난 공고가 켜 둠)", (await m2.locator('[data-same-as-last]').count()) >= 2)
  t = await body(m2, '/admin')
  ok("대조 · 격리상사416 홈 '시작하기' 1단계에 남은 칸", (await m2.locator('[data-info-bar]').count()) === 1 || (await m2.locator('[data-start-steps]').count()) === 0)

  // ── 1. 우리 회사만 맡은 N: 정산·출퇴근 탭 (fix= · bulk= 로 다른 회사 사람을 넣어도)
  const n = await pg(N)
  t = await body(n, `/admin/jobs/${J}?tab=pay`)
  ok('N · 우리 공고 정산 탭에 다른 회사 사람·공고 없음', leaks(t).length === 0, leaks(t).join(','))
  t = await body(n, `/admin/jobs/${J}?tab=att&date=${y}&fix=${U}#att-${U}`)
  ok('N · 출퇴근 탭 fix=다른 회사 사람 → 이름 안 나옴', leaks(t).length === 0, leaks(t).join(','))
  t = await body(n, `/admin/jobs/${J}?tab=att&date=${y}&bulk=${U},${W}&in=09:00&from=pay#bulk-adjust`)
  ok('N · bulk=다른 회사 사람 → 목록·미리 고름에 안 나옴', leaks(t).length === 0 && (await n.locator(`[data-bulk-adjust-form] input[value="${U}"]`).count()) === 0, leaks(t).join(','))
  t = await body(n, `/admin/jobs/${J2}?tab=pay`)
  ok('N · 다른 회사 공고 정산 탭 주소 → 내용 없음', leaks(t).length === 0, leaks(t).join(','))
  t = await body(n, `/admin/jobs/${J2}?tab=att&date=${y}&fix=${U}`)
  ok('N · 다른 회사 공고 출퇴근 탭 주소 → 내용 없음', leaks(t).length === 0, leaks(t).join(','))

  // ── 2. 새 공고: 다른 회사의 '가장 최근 공고' 설정을 따라가지 않음
  t = await body(n, '/admin/jobs/new')
  ok("N · 새 공고 '똑같이 켜기' 칩·배지 없음 (우리 공고는 다 꺼 둠)", (await n.locator('[data-same-as-last]').count()) === 0 && (await n.locator('[data-fold-last]').count()) === 0 && leaks(t).length === 0)

  // ── 3. 홈: 다른 회사 이름·사람 없음 (N은 한 회사만)
  t = await body(n, '/admin')
  ok('N · 홈에 다른 회사 것 없음', leaks(t, ['격리상사416']).length === 0, leaks(t, ['격리상사416']).join(','))

  // ── 4. 두 회사 관리자 M이 우리 회사(C1)를 골랐을 때: 다른 회사는 이름·숫자만, 사람·공고 이름 없음
  const m1 = await pg(M, C1)
  for (const path of [`/admin/jobs/${J}?tab=pay`, `/admin/jobs/${J}?tab=att&date=${y}&bulk=${U}&in=09:00`, '/admin/jobs/new', '/admin']) {
    t = await body(m1, path)
    ok(`M(C1) · ${path.split('?')[0]} 에 다른 회사 사람·공고 없음`, leaks(t).length === 0, leaks(t).join(','))
  }

  // ── 5. 근무자 쪽: W(우리 회사 근무자 · 다른 회사에도 지원 안 함)에게 U의 '시각 고침'·'담당자가 고침' 없음
  const wp = await pg(W)
  for (const path of ['/me', '/me/history', '/me/chat']) {
    t = await body(wp, path)
    ok(`W · ${path} 에 다른 사람·회사의 시각 고침 없음`, leaks(t).length === 0 && !t.includes('출근 06:00 → 09:00'), leaks(t).join(','))
  }
  // 대조: U 본인은 자기 알림을 봄
  const up = await pg(U)
  t = await body(up, '/me/chat')
  ok("대조 · U 본인은 '격리상사416' 문의함에 시각 고침 알림이 있음", t.includes('격리상사416') || t.includes('근무 시각 고침'), t.slice(0, 80))

  // ── 6. 디자인: 어두운 화면에서 '시작하기' 지금 할 단계 줄이 어두운 칸
  const dk = await pg(M, C2, true)
  await dk.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const next = dk.locator('[data-next-step]')
  if (await next.count()) {
    const lum = await next.evaluate((el) => {
      const c = document.createElement('canvas').getContext('2d'); c.fillStyle = getComputedStyle(el).backgroundColor; c.fillRect(0, 0, 1, 1)
      const [r, g, bb] = c.getImageData(0, 0, 1, 1).data; return (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255
    })
    ok('어두운 화면: 지금 할 단계 줄 배경이 어두움 (흰 글씨가 보이게)', lum < 0.35, lum.toFixed(2))
  } else ok('어두운 화면: 시작하기 카드 (지금 할 단계)', false)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch416: ${fails} FAIL` : '== batch416: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
