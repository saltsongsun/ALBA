// 묶음 50: 관리자 근무자 화면 — 계좌가 없으면 그 자리에서 '계좌 등록 요청'(앱 문의함 + 알림) · 보낸 뒤엔 'n/n 요청함' + '다시 요청'
//          · 우리 회사에 지원하지 않은 회원은 계좌 칸·요청 버튼 없음 · 연락 버튼(전화·문자·앱 메시지)은 한 줄
//          · 근무 이력은 휴대폰에서 옆으로 밀지 않는 목록 (오늘 근무 중이면 '근무 중', 끝나면 실지급·명세서)
//          · 근무자: 첫 근무가 아직 진행 중이면 명세서·확인서·후기 쓰기는 끝난 뒤에 (지난 근무·내 근무) · 360px
// node scripts/qa/batch50.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', JOB = 'cccccccc-0000-4000-8000-000000000003'
const NEW = 'bbbbbbbb-0000-4000-8000-0000000000d1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: W는 계좌 없음 · 아무 데도 지원하지 않은 새 회원
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, bank_name: null })
  const [w] = await rest(`users?id=eq.${W}`)
  if (!(await rest(`users?id=eq.${NEW}`)).length) await rest('users', 'POST', { ...w, id: NEW, name: '처음회원', phone: '01012127676', attendance: [], ratings: [] })
  const [att0] = await rest(`attendance?user_id=eq.${W}&job_id=eq.${JOB}`)
  ok('준비: W는 오늘 근무 중 (퇴근 전)', !!att0?.clock_in && !att0?.clock_out, JSON.stringify({ in: att0?.clock_in, out: att0?.clock_out }))

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 관리자: 계좌 등록 요청 ──
  const a = await pg(A)
  await a.goto(`${D}/admin/workers/${W}`)
  const ask = a.locator('[data-account-ask]')
  await ask.waitFor({ timeout: 10000 }).catch(() => {})
  ok("계좌 미등록 옆에 '계좌 등록 요청'", (await ask.innerText()).includes('미등록') && (await ask.locator('button', { hasText: '계좌 등록 요청' }).count()) === 1 && (await a.locator('[data-account-asked]').count()) === 0, await ask.innerText().catch(() => ''))
  const before = (await rest(`messages?thread_user_id=eq.${W}`)).length
  const btn = ask.locator('button')
  await btn.click()
  ok('한 번 누르면 확인 문구 (바로 보내지 않음)', (await btn.innerText()).includes('한 번 더') && (await rest(`messages?thread_user_id=eq.${W}`)).length === before)
  await btn.click()
  await a.getByText('계좌 등록 요청을 보냈어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("'계좌 등록 요청을 보냈어요' 안내", (await a.getByText('계좌 등록 요청을 보냈어요').count()) > 0)
  const msgs = (await rest(`messages?thread_user_id=eq.${W}`)).filter((m) => (m.body ?? '').startsWith('💳 계좌 등록 요청'))
  const last = msgs.sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''))[0]
  ok('근무자 문의함에 요청이 들어감 (우리 회사 · 관리자가 보냄)', msgs.length >= 1 && last?.from_admin === true && !!last?.company_id && last?.sender_id === A, JSON.stringify(last ?? {}).slice(0, 160))
  ok("문구: '내 정보'에서 계좌 등록", (last?.body ?? '').includes("'내 정보'에서 은행·계좌번호·예금주"))
  await a.goto(`${D}/admin/workers/${W}`)
  await ask.waitFor({ timeout: 10000 }).catch(() => {})
  ok("보낸 뒤: '요청함' + '다시 요청'", (await a.locator('[data-account-asked]').innerText().catch(() => '')).includes('요청함') && (await ask.locator('button', { hasText: '다시 요청' }).count()) === 1)

  // ── 2. 연락 버튼 한 줄 · 근무 이력 목록 ──
  // 전화·문자는 누르면 열람을 기록하고 거는 버튼 (번호를 화면 코드에 싣지 않음) · 앱 메시지는 링크
  const tops = await a.locator('[data-worker-contact] [data-contact-group] > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('전화·문자·앱 메시지가 한 줄', tops.length === 3 && new Set(tops).size === 1, JSON.stringify(tops))
  const hist = a.locator('[data-work-history]')
  ok("근무 이력: 표 대신 목록 · 오늘 근무 중이면 '근무 중'(0원·명세서 없음)", (await hist.count()) === 1 && (await a.locator('[data-work-history] ~ table, table').count()) === 0 && (await hist.locator('[data-live]').count()) === 1 && (await hist.locator('a[href*="/print/payslip/"]').count()) === 0)
  ok('근무 이력: 옆으로 넘치지 않음', await hist.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
  ok('360px: 옆으로 안 밀림 (근무자 화면)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 우리 회사에 지원하지 않은 회원: 계좌 칸·요청 버튼 없음 ──
  await a.goto(`${D}/admin/workers/${NEW}`)
  await a.locator('[data-worker-contact]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('지원 안 한 회원: 계좌 요청 버튼 없음', (await a.locator('[data-worker-contact]').count()) === 1 && (await a.locator('[data-account-ask]').count()) === 0)

  // ── 4. 근무자: 근무 중이면 명세서·확인서·후기는 끝난 뒤에 ──
  const p = await pg(W)
  await p.goto(`${D}/me/history`)
  const card = p.locator(`[data-history-job="${JOB}"]`)
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  ok('지난 근무(근무 중): 명세서·확인서·후기 쓰기 없음', (await card.locator('[data-live-shift]').count()) === 1 && (await card.locator('a[href*="/print/"]').count()) === 0 && (await card.locator('[data-review-link]').count()) === 0)
  await p.goto(`${D}/me`)
  await p.waitForLoadState('networkidle').catch(() => {})
  ok('내 근무(근무 중): 명세서·확인서 없음', (await p.locator(`a[href^="/print/payslip/${JOB}/"]`).count()) === 0 && (await p.locator(`a[href^="/print/cert/${JOB}/"]`).count()) === 0)
  ok('360px: 옆으로 안 밀림 (내 근무)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 퇴근하면 다시 보임
  await rest(`attendance?id=eq.${att0.id}`, 'PATCH', { clock_out: new Date().toISOString() })
  await p.goto(`${D}/me/history`)
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  ok('퇴근 뒤: 명세서·확인서가 다시 보임', (await card.locator('a[href*="/print/payslip/"]').count()) === 1 && (await card.locator('a[href*="/print/cert/"]').count()) === 1)
  await a.goto(`${D}/admin/workers/${W}`)
  await hist.waitFor({ timeout: 10000 }).catch(() => {})
  ok('퇴근 뒤 관리자 근무 이력: 실지급·명세서', (await hist.locator('[data-net]').count()) === 1 && (await hist.locator('a[href*="/print/payslip/"]').count()) === 1 && (await hist.locator('[data-live]').count()) === 0)
  await rest(`attendance?id=eq.${att0.id}`, 'PATCH', { clock_out: null })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
