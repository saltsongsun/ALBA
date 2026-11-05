// 묶음 76: 근무자 접속 여부(최고 관리자만) + 행동 기록(누른 버튼·답답함·오류·내려 본 깊이) + 공고 화면 단순화
// · 앱을 보는 동안 'ping' → 회원의 마지막 접속 시각만 고침 (기록은 안 남김) · 다른 기록이 와도 함께 고침
// · 근무자 명단·상세: 최고 관리자만 '접속 중'/'N시간 전 접속' · '접속 중' 거르기 · 일반 관리자는 안 보임
// · 인사이트: 많이 누른 버튼 · 답답함 신호 · 자주 뜬 오류 · 얼마나 내려 봤나 · 개선 후보
// · 공고: 휴게·공제·지급일은 돈 칸 안 '자세히'로 접힘 · 모이는 곳은 장소 아래 · 담당자 이름·번호 한 줄
// node scripts/qa/batch76.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000d6', W2 = 'bbbbbbbb-0000-4000-8000-0000000000d7'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const beacon = (uid, body) => fetch(`${D}/api/t`, { method: 'POST', headers: { 'content-type': 'application/json', origin: D, cookie: uid ? `alba_session=${cookie(uid)}` : '' }, body: JSON.stringify(body) })

;(async () => {
  // 준비: 일반 관리자 A2 · 두 시간 전에 접속한 근무자 W2 · 공고에 모이는 곳·담당자
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '일반관리자', phone: '01077770011', is_super: false })
  await rest('company_members', 'POST', { company_id: CO, user_id: A2, role: 'admin' })
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: W2, name: '두시간전', phone: '01077770022', last_seen_at: new Date(Date.now() - 2 * 3600e3 - 60e3).toISOString(), created_at: '2026-01-01T00:00:00Z' })
  await rest(`users?id=eq.${W}`, 'PATCH', { last_seen_at: null, gender: 'M', birth_date: '1999-03-03' })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { meeting_point: '정문 매표소 앞', manager_name: '조소현', manager_phone: '01055556666' })

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

  // ── 1. 공고 화면 단순화 (근무자 360px) ──
  const wk = await pg(W)
  await wk.goto(`${D}/jobs/${J}`)
  const more = wk.locator('[data-pay-more]')
  await more.waitFor({ timeout: 10000 }).catch(() => {})
  const dts = await wk.locator('.card dl.divide-y > div > dt').allInnerTexts()
  ok('본문 줄에서 휴게·공제·지급일·집결이 빠짐', !dts.some((t) => ['휴게', '공제', '지급일', '집결', '수당'].includes(t.trim())), dts.join(','))
  ok("돈 칸 '휴게 · 수당 · 공제 · 지급일 자세히' (처음엔 접힘)", /휴게.*공제.*지급일 자세히/.test(await more.locator('summary').innerText()) && (await more.getAttribute('open')) === null)
  await more.locator('summary').click()
  // 펼침은 짧은 애니메이션으로 열림 → 내용이 보일 때까지 기다림
  await more.locator('dl').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  await wk.waitForTimeout(400)
  const moreText = await more.innerText()
  ok('펼치면 공제 · 고용보험 · 지급일', moreText.includes('고용보험 0.9%') && moreText.includes('익월 10일'), moreText.replace(/\s+/g, ' ').slice(0, 120))
  ok('모이는 곳은 장소 아래', (await wk.locator('[data-meeting-point]').innerText()).includes('정문 매표소 앞'))
  const mc = wk.locator('[data-manager-contact]')
  ok('담당자 이름·번호 한 줄', (await mc.innerText()).includes('조소현') && (await mc.innerText()).includes('010-5555-6666'))
  const tops = await mc.locator('a').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('전화·문자 버튼이 같은 줄', tops.length === 2 && tops[0] === tops[1], JSON.stringify(tops))
  ok('360px: 옆으로 안 밀림 (공고)', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 행동 기록 ──
  // 끝까지 내려 본 뒤 다른 화면으로 → 떠난 화면의 깊이
  await wk.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight))
  await wk.waitForTimeout(500)
  // 주요 버튼 누름 (숫자는 #으로) · 같은 곳 연달아 3번 = 답답함 · 앱 오류
  await wk.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<button id="t-btn" data-track="테스트 버튼 1234" style="position:fixed;top:80px;left:10px;z-index:999">t</button><div id="t-spot" data-spot style="position:fixed;top:140px;left:10px;width:80px;height:40px;z-index:999;background:#eee"></div>')
  })
  await wk.locator('#t-btn').click()
  await wk.locator('#t-spot').click({ clickCount: 1 })
  await wk.locator('#t-spot').click({ clickCount: 1, delay: 0 })
  await wk.locator('#t-spot').click({ clickCount: 1, delay: 0 })
  await wk.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'boom 42 테스트' })))
  await wk.waitForTimeout(400)
  await wk.locator('a[href="/me"]:visible').first().click().catch(() => {})
  await wk.waitForURL(/\/me$/, { timeout: 8000 }).catch(() => {})
  await wk.waitForTimeout(900)
  const ev = await rest('usage_events')
  const click = ev.find((e) => e.kind === 'click' && e.label === '테스트 버튼 ####')
  ok("주요 버튼 누름 기록 (숫자는 #) · 화면 모양", !!click && click.path === '/jobs/[id]' && click.role === 'worker', JSON.stringify(ev.filter((e) => e.kind === 'click').map((e) => e.label)))
  const rage = ev.find((e) => e.kind === 'rage')
  ok('같은 곳 연달아 3번 → 답답함 신호 (어디인지만)', !!rage && /div\[data-spot\]/.test(rage.label), JSON.stringify(rage))
  ok("앱 오류 기록 ('앱 오류: boom ## 테스트')", ev.some((e) => e.kind === 'error' && e.label === '앱 오류: boom ## 테스트'))
  const leave = ev.find((e) => e.kind === 'leave' && e.path === '/jobs/[id]' && typeof e.depth === 'number')
  ok('떠난 화면의 내려 본 깊이 (끝까지 = 90% 넘게)', !!leave && leave.depth >= 90, JSON.stringify(leave))
  const [wAfter] = await rest(`users?id=eq.${W}`)
  ok('기록이 오면 마지막 접속 시각도 고침', !!wAfter.last_seen_at && Date.now() - Date.parse(wAfter.last_seen_at) < 120e3, String(wAfter.last_seen_at))

  // 서버가 한 번 더 다듬음 · 'ping'은 기록 없이 접속 시각만 · 로그인 안 하면 아무것도 안 고침
  const n0 = (await rest('usage_events')).length
  await beacon(W2, { s: 'pingtest0001', k: 'ping', p: '/me' })
  const [w2] = await rest(`users?id=eq.${W2}`)
  ok("'ping' → 마지막 접속 시각만 (기록 안 남김)", Date.now() - Date.parse(w2.last_seen_at) < 60e3 && (await rest('usage_events')).length === n0)
  await rest(`users?id=eq.${W2}`, 'PATCH', { last_seen_at: new Date(Date.now() - 2 * 3600e3 - 60e3).toISOString() })
  await beacon(null, { s: 'labeltest001', k: 'click', p: '/jobs/abc', l: '홍길동님 010-1234-5678 <script>' })
  const lab = (await rest('usage_events')).find((e) => e.session === 'labeltest001')
  ok('버튼 이름: 숫자는 #, 기호 빠짐, 비회원', !!lab && lab.label === '홍길동님 ###-####-#### script' && lab.role === 'guest', JSON.stringify(lab))
  await beacon(null, { s: 'labeltest002', k: 'click', p: '/jobs/abc', l: '' })
  ok('이름 없는 누름은 버림', !(await rest('usage_events')).some((e) => e.session === 'labeltest002'))

  // ── 3. 인사이트 (최고 관리자) ──
  const su = await pg(A, true)
  await su.goto(`${D}/admin/insights`)
  await su.locator('[data-insight-clicks]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("인사이트: 많이 누른 버튼에 '테스트 버튼 ####'", (await su.locator('[data-insight-clicks]').innerText()).includes('테스트 버튼 ####'))
  ok('인사이트: 답답함 신호 · 자주 뜬 오류', (await su.locator('[data-insight-rage] li').count()) >= 1 && (await su.locator('[data-insight-errors]').innerText()).includes('boom'))
  ok('인사이트: 얼마나 내려 봤나 칸', (await su.locator('[data-insight-depth]').count()) === 1)
  ok('인사이트: 개선 후보 (답답함·오류)', (await su.locator('[data-insight-hints] li').count()) >= 2, await su.locator('[data-insight-hints]').innerText().catch(() => ''))
  ok('1280px: 옆으로 안 밀림 (인사이트)', await su.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 접속 여부 (최고 관리자만) ──
  const sm = await pg(A)
  await sm.goto(`${D}/admin/workers`)
  await sm.locator('[data-filter-row]').waitFor({ timeout: 10000 }).catch(() => {})
  const cardOf = (name) => sm.locator('.card', { has: sm.getByRole('link', { name, exact: true }) }).first()
  ok("근무자 명단: 방금 접속한 근무자 '접속 중'", (await cardOf('근무자').locator('[data-presence="online"]').count()) === 1)
  ok("두 시간 전 접속 → '2시간 전 접속'", (await cardOf('두시간전').locator('[data-presence="away"]').innerText().catch(() => '')).includes('2시간 전 접속'))
  await sm.getByRole('link', { name: '접속 중', exact: true }).click()
  await sm.waitForURL(/f=online/, { timeout: 8000 }).catch(() => {})
  await sm.locator('h1').first().waitFor()
  ok("'접속 중'만 거르기", (await cardOf('근무자').count()) === 1 && (await cardOf('두시간전').count()) === 0)
  ok('360px: 옆으로 안 밀림 (명단)', await sm.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await sm.goto(`${D}/admin/workers/${W}`)
  await sm.locator('[data-worker-seen]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("근무자 상세: '접속 중' · 마지막 접속 시각", (await sm.locator('[data-presence="online"]').count()) === 1 && (await sm.locator('[data-worker-seen]').innerText()).length > 4)

  const ad = await pg(A2)
  await ad.goto(`${D}/admin/workers?f=online`)
  await ad.locator('[data-filter-row]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("일반 관리자: 접속 표시·'접속 중' 거르기 없음", (await ad.locator('[data-presence]').count()) === 0 && (await ad.getByRole('link', { name: '접속 중', exact: true }).count()) === 0)
  ok("일반 관리자: ?f=online은 무시 (모두 보임)", (await ad.locator('.card', { has: ad.getByRole('link', { name: '두시간전', exact: true }) }).count()) >= 1)
  await ad.goto(`${D}/admin/workers/${W}`)
  await ad.locator('h1, [data-worker-side]').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('일반 관리자: 상세에도 마지막 접속 없음', (await ad.locator('[data-worker-seen]').count()) === 0 && (await ad.locator('[data-presence]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
