// 묶음 74: 근무자 상세 개인정보 가리기 + 화면 이동 기록(자체 분석)·인사이트
// · 휴대폰·주소·계좌·비상연락처는 가려 두고 '전체 보기'(기록됨)를 눌러야 보임 · 화면 코드에 전체 번호가 실리지 않음 · 열람 기록 남김
// · 화면을 옮기면 '봄'(바로 전 화면과 함께)·'머문 시간'이 쌓임 · 이름·연락처·회원 id는 남지 않음 · 회원 유형·성별·나이대는 서버가 붙임
// · 인사이트(최고 관리자만): 그룹 요약 · 화면별 비교 · 이동 흐름 · 지원→확정→서명→출근
// node scripts/qa/batch74.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000c4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 최고 관리자가 아닌 같은 회사 관리자 A2 · 근무자 W에 주소·비상연락처·성별·생년월일
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '일반관리자', phone: '01077770000', is_super: false })
  await rest('company_members', 'POST', { company_id: CO, user_id: A2, role: 'admin' })
  await rest(`users?id=eq.${W}`, 'PATCH', { address: '경상남도 진주시 가좌길 40번길 15 205호', emergency_phone: '01088889999', gender: 'F', birth_date: '2004-04-09' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, desktop = false) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 개인정보 가리기 ──
  const ad = await pg(A2)
  const res = await ad.goto(`${D}/admin/workers/${W}`)
  await ad.locator('[data-reveal="phone"]').first().waitFor({ timeout: 10000 }).catch(() => {})
  const html = await res.text()
  ok('화면 코드에 전체 휴대폰·주소·비상연락처가 없음', !html.includes('3333-4444') && !html.includes('01033334444') && !html.includes('가좌길') && !html.includes('8888-9999') && !html.includes('01088889999'))
  ok('가린 값: 010-****-4444 · 경상남도 진주시 ···', (await ad.locator('[data-reveal="phone"] [data-reveal-value]').innerText()).includes('010-****-4444') && (await ad.locator('[data-reveal="address"] [data-reveal-value]').innerText()).includes('경상남도 진주시 ···'))
  await ad.locator('[data-reveal="phone"] [data-reveal-btn]').click()
  await ad.locator('[data-reveal="phone"] [data-reveal-value]', { hasText: '010-3333-4444' }).waitFor({ timeout: 8000 }).catch(() => {})
  ok("휴대폰 '전체 보기' → 010-3333-4444", (await ad.locator('[data-reveal="phone"] [data-reveal-value]').innerText()).includes('010-3333-4444'))
  await ad.locator('[data-reveal="address"] [data-reveal-btn]').click()
  await ad.locator('[data-reveal="address"] [data-reveal-value]', { hasText: '가좌길' }).waitFor({ timeout: 8000 }).catch(() => {})
  ok("주소 '전체 보기' → 전체 주소", (await ad.locator('[data-reveal="address"] [data-reveal-value]').innerText()).includes('가좌길 40번길'))
  const logs = (await rest('audit_logs')).filter((l) => l.actor_id === A2 && l.target_user_id === W)
  ok('열람 기록: phone.view · address.view', logs.some((l) => l.action === 'phone.view') && logs.some((l) => l.action === 'address.view'), logs.map((l) => l.action).join(','))
  ok('정보 수정 칸에도 전체 번호 없음 (가린 번호만)', !(await ad.locator('input[name=phone]').count()))
  ok('360px: 옆으로 안 밀림 (근무자 상세)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 화면 이동 기록 ──
  await rest('usage_events', 'GET')
  const wk = await pg(W)
  await wk.goto(`${D}/`)
  await wk.waitForTimeout(700)
  await wk.goto(`${D}/jobs/${J}`)
  await wk.waitForTimeout(700)
  await wk.locator('a[href="/me"]').first().click().catch(() => {})
  await wk.waitForURL(/\/me$/, { timeout: 8000 }).catch(() => {})
  await wk.waitForTimeout(900)
  const ev = await rest('usage_events')
  const mine = ev.filter((e) => e.role === 'worker')
  const viewOf = (p) => mine.find((e) => e.kind === 'view' && e.path === p)
  ok("근무자 '봄' 기록: / · /jobs/[id] · /me", !!viewOf('/') && !!viewOf('/jobs/[id]') && !!viewOf('/me'), mine.map((e) => `${e.kind}:${e.path}`).join(' '))
  ok('바로 전 화면(흐름): /me ← /jobs/[id]', viewOf('/me')?.prev === '/jobs/[id]', String(viewOf('/me')?.prev))
  ok('성별·나이대는 서버가 붙임 (여자·20대)', viewOf('/me')?.gender === 'F' && viewOf('/me')?.age_band === '20대', JSON.stringify(viewOf('/me')))
  ok("떠날 때 '머문 시간' 기록", mine.some((e) => e.kind === 'leave' && e.ms >= 300))
  const raw = JSON.stringify(ev)
  ok('기록에 이름·연락처·회원 id 없음', !raw.includes(W) && !raw.includes('근무자') && !raw.includes('01033334444'))
  const forged = await fetch(`${D}/api/t`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ s: 'abcdefgh1234', k: 'view', p: '/evil' }) })
  ok('다른 사이트에서 보낸 기록은 버림', forged.status === 204 && !(await rest('usage_events')).some((e) => e.path === '/evil'))

  // ── 3. 인사이트 ──
  const su = await pg(A, true)
  await su.goto(`${D}/admin/insights`)
  await su.locator('[data-insight-segs]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('인사이트: 그룹 요약에 근로자', (await su.locator('[data-insight-segs]').innerText()).includes('근로자'))
  ok('인사이트: 화면별 비교에 공고 보기', (await su.locator('[data-insight-screens]').innerText()).includes('공고 보기'))
  ok('인사이트: 이동 흐름 · 지원→확정→서명→출근', (await su.locator('[data-insight-flows] li').count()) >= 1 && (await su.locator('[data-insight-funnel]').count()) === 1)
  await su.getByRole('link', { name: '남자 · 여자' }).click()
  await su.waitForURL(/dim=gender/, { timeout: 8000 }).catch(() => {})
  ok("'남자 · 여자'로 바꾸면 여자 그룹", (await su.locator('[data-insight-segs]').innerText()).includes('여자'))
  const notSuper = await ad.goto(`${D}/admin/insights`)
  ok('최고 관리자가 아니면 인사이트 못 봄', notSuper.status() === 404)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
