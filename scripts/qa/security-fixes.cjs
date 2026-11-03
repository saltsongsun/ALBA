// 보안 점검에서 고친 것: 화면에 없는 요청을 직접 만들어 보내도 서버가 막는지 (조작된 요청 흉내)
// · 비밀번호 초기화·주민번호 보기·근무 기록 추가·평가는 이 회사와 실제로 일한 근무자만 · 관리자 계정은 못 건드림
// · 휴대폰 번호(로그인 번호)는 최고 관리자만 · 관리자 계정은 지원 못 함 · 앱 알림 문구 흉내 메시지 막음
// · 알림 주소는 브라우저 푸시 서비스만 · 로그인 뒤 이동 주소에 탭 문자 → 다른 사이트로 못 감
// · 관계없는 공고의 명세서 막힘 · 담당자 번호는 로그인해야 보임 · 엑셀 수식 막음 · 탈퇴 회원 숨김 · 로그아웃
// node scripts/qa/security-fixes.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac, scryptSync, randomBytes } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const hash = (pin) => { const salt = randomBytes(16); return `s1:${salt.toString('base64')}:${scryptSync(pin, salt, 32).toString('base64')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', A3 = 'aaaaaaaa-0000-4000-8000-0000000000a3', J2 = 'cccccccc-0000-4000-8000-0000000000c2'
const OUT = '44444444-0000-4000-8000-0000000000e1', GONE = '44444444-0000-4000-8000-0000000000e2'
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

// 서버 함수 id (빌드 결과에서 파일·이름으로 찾음)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => {
  const id = Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
  if (!id) throw new Error(`서버 함수 못 찾음: ${file}.${name}`)
  return id
}
// 화면 안에서 서버 함수를 직접 부름 (보안 쿠키가 실리게). form이 있으면 마지막 인자로 FormData
const call = (p, file, name, args, form) =>
  p.evaluate(
    async ({ id, args, form }) => {
      const headers = { 'Next-Action': id, Accept: 'text/x-component' }
      let body
      if (form) {
        // React와 같은 순서: 폼 칸 먼저, 맨 끝에 인자 목록 ('0')
        body = new FormData()
        for (const [k, v] of Object.entries(form)) body.append(`_1_${k}`, v)
        body.append('0', JSON.stringify([...args, '$K1']))
      } else {
        body = JSON.stringify(args)
        headers['Content-Type'] = 'text/plain;charset=UTF-8'
      }
      const r = await fetch(location.pathname, { method: 'POST', headers, body })
      const text = await r.text()
      return { status: r.status, redirect: decodeURIComponent(r.headers.get('x-action-redirect') || ''), text }
    },
    { id: idOf(file, name), args, form },
  )
const said = (r, msg) => r.text.includes(msg) || r.redirect.includes(msg)

;(async () => {
  // ── 준비: 두 번째 회사(확인됨)와 그 회사 대표 관리자 A2 · 그 회사 일반 관리자 A3 · 그 회사 공고 J2 ──
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, verified: true, created_at: '2026-10-15T00:00:00Z' })
  const [admin1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...admin1, id: A2, name: '이회사관리', phone: '01022223333', is_super: false })
  await rest('users', 'POST', { ...admin1, id: A3, name: '일반관리', phone: '01022224444', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  await rest('company_members', 'POST', { company_id: C2, user_id: A3, role: 'admin' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: '두번째컴퍼니' }, title: '두번째 회사 무대 스태프', applications: [], required_docs: [] })
  // 회사2에서 확정된 근무자 OUT (회사1과는 관계없음) · 아무 데도 지원 안 한 탈퇴 회원
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: OUT, name: '회사2근무자', phone: '01090901111', attendance: [], ratings: [] })
  await rest('users', 'POST', { ...w, id: GONE, name: '탈퇴한회원', phone: '01090902222', active: false, attendance: [], ratings: [] })
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000f1', job_id: J2, user_id: OUT, status: 'approved', created_at: '2026-10-20T00:00:00Z' })
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000f2', job_id: J2, user_id: A3, status: 'applied', created_at: '2026-10-20T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, start) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    await p.goto(`${D}${start}`)
    return p
  }
  const a = await pg(A, '/admin'), a2 = await pg(A2, '/admin'), wk = await pg(W, '/me')

  // ── 1. 비밀번호 초기화: 계정 가로채기 막기 ──
  let r = await call(a2, 'admin', 'resetPin', [W, null])
  ok('다른 회사 관리자: 우리 회사와 관계없는 근무자 초기화 막힘', said(r, '이 회사에 확정됐거나 근무한 근무자만'), r.text.slice(0, 120))
  r = await call(a2, 'admin', 'resetPin', [A, null])
  ok('회사 관리자: 최고 관리자 계정 초기화 막힘', said(r, '이 회사에 확정됐거나 근무한 근무자만'))
  r = await call(a2, 'admin', 'resetPin', [A3, null])
  ok('회사 관리자: 같은 회사 관리자 계정 초기화 막힘', said(r, '이 회사에 확정됐거나 근무한 근무자만'))
  const before = (await rest(`users?id=eq.${OUT}`))[0].pin_hash
  r = await call(a2, 'admin', 'resetPin', [OUT, null])
  ok('회사 관리자: 우리 회사에서 확정된 근무자는 초기화됨 (확인용)', /"ok":"\d{6}"/.test(r.text) && (await rest(`users?id=eq.${OUT}`))[0].pin_hash !== before, r.text.slice(0, 120))
  r = await call(a, 'admin', 'resetPin', [A, null])
  ok('최고 관리자: 자기 비밀번호는 여기서 초기화 못 함', said(r, '내 비밀번호는 내 정보에서'))
  await rest(`companies?id=eq.${C2}`, 'PATCH', { verified: false })
  r = await call(a2, 'admin', 'resetPin', [OUT, null])
  ok('확인 전 회사: 비밀번호 초기화 막힘', said(r, '회사 확인을 마치면 비밀번호를 초기화'))
  await rest(`companies?id=eq.${C2}`, 'PATCH', { verified: true })

  // ── 2. 근무자 정보 고치기: 로그인 번호·관리자 계정 ──
  r = await call(a2, 'admin', 'updateWorker', [OUT, null], { name: '회사2근무자', phone: '01090903333' })
  ok('회사 관리자: 근무자 휴대폰 번호(로그인 번호) 못 바꿈', said(r, '휴대폰 번호(로그인 번호)는 본인이') && (await rest(`users?id=eq.${OUT}`))[0].phone === '01090901111')
  r = await call(a2, 'admin', 'updateWorker', [A3, null], { name: '바꾼이름', phone: '01022224444', role: 'admin' })
  ok('회사 관리자: 다른 관리자 계정 이름 못 바꿈', said(r, '관리자 계정의 이름·번호는 최고 관리자만') && (await rest(`users?id=eq.${A3}`))[0].name === '일반관리')
  r = await call(a2, 'admin', 'updateWorker', [OUT, null], { name: '회사2근무자님', phone: '01090901111' })
  ok('회사 관리자: 근무자 이름은 고칠 수 있음 (확인용)', (await rest(`users?id=eq.${OUT}`))[0].name === '회사2근무자님', r.text.match(/"error":"[^"]*"/)?.[0])

  // ── 3. 주민번호 보기: 이 회사에서 일한 근무자만 ──
  r = await call(a, 'admin', 'revealRrn', [AP, null])
  ok('지원만 한 사람의 주민번호는 못 봄', said(r, '이 회사에서 근무한 기록이 있는 근무자만'))
  r = await call(a2, 'admin', 'revealRrn', [W, null])
  ok('다른 회사 관리자: 관계없는 근무자 주민번호 못 봄', said(r, '이 회사에서 근무한 기록이 있는 근무자만'))
  r = await call(a, 'admin', 'revealRrn', [W, null])
  ok('일한 근무자는 확인 단계 통과 (확인용: 등록된 번호 없음)', said(r, '등록된 주민등록번호가 없습니다'), r.text.slice(0, 120))

  // ── 4. 근무 기록 추가: 확정된 사람만 (아무 회원으로 기록 → 신고자료로 개인정보 빼기 막음) ──
  r = await call(a, 'admin', 'addAttendance', [J], { user_id: AP, work_date: today, in: '09:00' })
  ok('확정 안 된 지원자로 근무 기록 추가 막힘', said(r, '이 공고에 확정된 근무자만 기록을 추가'), r.redirect)
  r = await call(a, 'admin', 'addAttendance', [J], { user_id: OUT, work_date: today, in: '09:00' })
  ok('다른 회사 근무자로 근무 기록 추가 막힘', said(r, '이 공고에 확정된 근무자만 기록을 추가'))
  ok('막힌 기록은 저장 안 됨', (await rest('attendance')).every((x) => x.user_id !== AP && x.user_id !== OUT))
  r = await call(a, 'admin', 'addAttendance', [J], { user_id: W, work_date: '2026-10-20', in: '09:00', out: '18:00' })
  ok('확정된 근무자는 기록 추가됨 (확인용)', said(r, '근무 기록을 추가했습니다'), r.redirect)

  // ── 5. 평가: 이 공고에 지원했거나 일한 사람만 ──
  await call(a, 'admin', 'rateQuick', [OUT, J], { score: '1' })
  await call(a, 'admin', 'rateQuick', [AP, J], { score: '5' })
  const ratings = await rest('worker_ratings')
  ok('관계없는 사람은 평가 못 함', !ratings.some((x) => x.user_id === OUT))
  ok('지원자는 평가됨 (확인용)', ratings.some((x) => x.user_id === AP && x.score === 5))

  // ── 6. 관리자 계정으로 지원 막힘 ──
  r = await call(a, 'worker', 'applyJob', [J], { agree: 'on' })
  ok('관리자 계정은 지원 못 함', said(r, '관리자 계정으로는 지원할 수 없어요'), r.redirect)
  ok('관리자 지원 기록 없음', (await rest('applications')).every((x) => x.user_id !== A))
  await a.goto(`${D}/jobs/${J}`)
  ok('관리자가 공고를 보면 지원 칸 대신 안내', (await see(a, '관리자 계정으로는 지원할 수 없어요')) && (await a.locator('#message').count()) === 0)

  // ── 7. 앱 알림 문구 흉내 메시지 막음 ──
  r = await call(wk, 'chat', 'sendInquiry', [C1, J, null], { body: '📍 출근 확인 요청\n현장 도착했어요' })
  ok('출근 확인 요청 흉내 메시지 막힘', said(r, '이 문구로 시작하는 메시지는 보낼 수 없어요'))
  r = await call(wk, 'chat', 'sendInquiry', [C1, J, null], { body: '✏️ 기록 정정 요청 09:00~18:00' })
  ok('기록 정정 요청 흉내 메시지 막힘', said(r, '이 문구로 시작하는 메시지는 보낼 수 없어요'))
  r = await call(wk, 'chat', 'sendInquiry', [C1, J, null], { body: '내일 주차 가능한가요?' })
  ok('보통 문의는 보내짐 (확인용)', said(r, '보냈어요') && (await rest('messages')).some((m) => m.body === '내일 주차 가능한가요?'))

  // ── 8. 휴대폰 알림 주소: 브라우저 푸시 서비스만 (다른 서버로 요청 보내기 막음) ──
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }
  for (const ep of ['http://169.254.169.254/latest/meta-data', 'https://evil.example/push', 'https://fcm.googleapis.com:8443/x', 'https://fcm.googleapis.com.evil.example/x']) {
    r = await call(wk, 'push', 'savePushSubscription', [{ endpoint: ep, keys }])
    ok(`알림 주소 막힘: ${ep}`, said(r, '알림을 켜지 못했어요'))
  }
  r = await call(wk, 'push', 'savePushSubscription', [{ endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys }])
  ok('진짜 푸시 서비스 주소는 등록됨 (확인용)', r.text.includes('"ok":true'), r.text.slice(0, 120))
  ok('막힌 주소는 저장 안 됨', (await rest('push_subscriptions')).every((s) => s.endpoint.startsWith('https://fcm.googleapis.com/fcm/')))

  // ── 9. 로그인 뒤 이동 주소: 탭·줄바꿈을 섞어 다른 사이트로 보내기 막음 ──
  await rest(`users?id=eq.${W}`, 'PATCH', { pin_hash: hash('738291'), failed_logins: 0, locked_until: null })
  const anon = await pg(null, '/login')
  for (const next of ['/\t/evil.example', '/\n/evil.example', '//evil.example', '/\\evil.example']) {
    r = await call(anon, 'auth', 'login', [null], { phone: '01033334444', pin: '738291', next })
    ok(`이동 주소 막힘: ${JSON.stringify(next)}`, r.redirect.startsWith('/me') && !r.redirect.includes('evil'), r.redirect)
  }
  r = await call(anon, 'auth', 'login', [null], { phone: '01033334444', pin: '738291', next: `/jobs/${J}` })
  ok('우리 앱 주소는 그대로 이동 (확인용)', r.redirect.startsWith(`/jobs/${J}`), r.redirect)

  // ── 10. 명세서: 본인 것이라도 관계없는 공고 주소면 안 열림 ──
  await wk.goto(`${D}/print/payslip/${J2}/${W}`)
  ok('근무자: 관계없는 공고 명세서 안 열림', await see(wk, '찾는 화면이 없어요'))

  // ── 11. 공고 화면 담당자 번호: 로그인한 사람만 ──
  const anonJob = await pg(null, `/jobs/${J}`)
  await anonJob.waitForLoadState('networkidle')
  ok('로그인 안 하면 담당자 번호 안 보임', (await anonJob.locator('a[href^="tel:01055556666"]').count()) === 0)
  await wk.goto(`${D}/jobs/${J}`)
  ok('로그인하면 담당자 번호 보임 (확인용)', await wk.locator('a[href^="tel:01055556666"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false))

  // ── 12. 엑셀로 열 때 수식이 실행되지 않게 ──
  await rest(`users?id=eq.${W}`, 'PATCH', { name: '=HYPERLINK("http://evil.example","눌러")' })
  const csv = await a.evaluate(async () => (await fetch('/admin/export/workers', { cache: 'no-store' })).text())
  ok('명단 파일: 수식으로 시작하는 이름은 글자로', csv.includes(`'=HYPERLINK`) && !/(^|[\n,])"?=HYPERLINK/.test(csv), csv.split('\n').find((l) => l.includes('HYPERLINK'))?.slice(0, 80))
  await rest(`users?id=eq.${W}`, 'PATCH', { name: '근무자' })

  // ── 13. 탈퇴(정지)한 관계없는 회원은 명단에 안 보임 ──
  await a.goto(`${D}/admin/workers`)
  await a.waitForLoadState('networkidle')
  ok('탈퇴한 회원은 근무자 명단에 없음', (await a.locator('.sm\\:hidden .card', { hasText: '탈퇴한회원' }).count()) === 0)
  ok('명단은 보임 (확인용)', (await a.locator('.sm\\:hidden .card', { hasText: '김지원' }).count()) === 1)

  // ── 14. 로그아웃 (알림 끄고 나감) ──
  await wk.goto(`${D}/me`)
  await wk.getByRole('button', { name: '로그아웃' }).first().click()
  await wk.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10000 }).catch(() => {})
  ok('로그아웃하면 첫 화면', new URL(wk.url()).pathname === '/', wk.url())
  ok('로그인 쿠키 지워짐', !(await wk.context().cookies()).some((c) => c.name === 'alba_session'))
  await wk.goto(`${D}/me`)
  await wk.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {})
  ok('로그아웃 뒤 내 근무는 로그인 필요', new URL(wk.url()).pathname === '/login', wk.url())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
