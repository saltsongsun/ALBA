// 묶음 190 (정기 개선 2026-11-11 06:35 KST)
// · 관리자 문의 대화: 근무자가 '지원했는데 확정 여부가 궁금해요.'라고 물어 오면
//   답장 제안('확정했어요…' · '검토 중이에요…' · '이번에는 인원이 다 찼어요…') + '확정을 기다리는 지원이 있어요 · 지원자 보기 →'
//   → 그 공고 지원자 탭의 그 사람 카드로 바로 내려가고 테두리로 표시 (확정·미선발을 거기서)
// · 근무자 내 근무: 맨 위로 올라온 확정 대기의 첫 카드에 진행 단계(지원 ✓ → 확정 → 서명 → 출근)
// node scripts/qa/batch190.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', C1 = '99999999-0000-4000-8000-000000000099'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
const ASK = '지원했는데 확정 여부가 궁금해요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now()
  // 준비: 내일 근무 (시간에 상관없이 같은 화면) · 김지원은 날짜를 고르지 않고 지원해 확정을 기다리는 중
  const tmr = kstDay(now + 864e5)
  const patch = { start_date: tmr, end_date: tmr, start_time: '09:00:00', end_time: '18:00:00', status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
  const [app0] = await rest(`applications?id=eq.${AP_APP}`)
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { available_dates: null, status: 'applied', job: { ...app0.job, ...patch } })
  let mid = 190000
  const say = (body, fromAdmin = false) => rest('messages', 'POST', { id: ++mid, thread_user_id: AP, sender_id: fromAdmin ? A : AP, from_admin: fromAdmin, job_id: J, company_id: C1, body, read_at: null, created_at: new Date(Date.now() + mid - 190000).toISOString(), job: { id: J, title: TITLE }, sender: { name: fromAdmin ? '관리자' : '김지원' }, user: { id: AP, name: '김지원', phone: '01077778888' } })
  await say(ASK)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, admin) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(admin ? [{ name: 'alba_roster', value: roster(uid), url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 관리자 문의 대화: 답장 제안 + 지원자 보기
  const a = await pg(A, true)
  await a.goto(`${D}/admin/chat/${AP}`)
  const short = a.locator('[data-confirm-ask]')
  await short.waitFor({ timeout: 15000 }).catch(() => {})
  const chips = (await a.locator('[data-quick-replies] button').allInnerTexts()).map(one)
  const iOk = chips.indexOf('확정했어요. 내 근무에서 확인해 주세요.')
  ok("답장 제안: '확정했어요…' · '검토 중이에요…' · '이번에는 인원이 다 찼어요…' (평소 답장 앞에)", iOk >= 0 && chips[iOk + 1] === '검토 중이에요. 오늘 안에 알려 드릴게요.' && chips[iOk + 2] === '이번에는 인원이 다 찼어요. 다음에 꼭 함께해요.' && chips.indexOf('확인했습니다.') > iOk + 2, JSON.stringify(chips.slice(0, 6)))
  ok("'확정을 기다리는 지원이 있어요 · 날짜 · 공고 · 지원자 보기 →'", /^확정을 기다리는 지원이 있어요 \d{1,2}\/\d{1,2}\([일월화수목금토]\) · 경상남도 생활체육대축전/.test(one(await short.innerText())) && one(await short.innerText()).endsWith('지원자 보기 →') && (await short.getAttribute('href')) === `/admin/jobs/${J}?tab=apps#app-${AP_APP}`, one(await short.innerText().catch(() => '')))
  ok('한 줄 카드 · 360px 옆으로 안 밀림', (await short.evaluate((el) => el.getBoundingClientRect().height <= 72).catch(() => false)) && (await noSide(a)))
  if (SHOTS) { await a.waitForTimeout(500); await a.screenshot({ path: `${SHOTS}/thread-confirm.png` }).catch(() => {}) }
  await short.click()
  await a.waitForURL((u) => u.pathname === `/admin/jobs/${J}` && u.searchParams.get('tab') === 'apps', { timeout: 15000 }).catch(() => {})
  const cardSel = `[id="app-${AP_APP}"]`
  await a.locator(cardSel).waitFor({ timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(900)
  const st = await a.locator(cardSel).evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), inView: r.top >= 0 && r.top < innerHeight - 120, target: el.hasAttribute('data-hash-focus'), ring: getComputedStyle(el).boxShadow, name: el.textContent.includes('김지원') } }).catch(() => null)
  ok('지원자 탭의 그 사람 카드로 바로 내려감 (화면 안 · 테두리 표시)', !!st && st.inView && st.target && st.name && /0px 0px 0px 2px/.test(st.ring) && new URL(a.url()).hash === `#app-${AP_APP}`, JSON.stringify(st))
  ok("그 카드에서 바로 '확정' 할 수 있음", (await a.locator(cardSel).getByRole('button', { name: '확정', exact: true }).count()) === 1)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/apps-target.png` }).catch(() => {})

  // ── 2. 확정한 뒤에는 '지원자 보기'가 사라짐 (답장 제안은 그대로)
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', decided_at: new Date().toISOString() })
  await a.goto(`${D}/admin/chat/${AP}`)
  await a.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("확정한 뒤: '지원자 보기' 없음 · '확정했어요…' 답장은 그대로", (await short.count()) === 0 && (await a.locator('[data-quick-replies] button', { hasText: '확정했어요. 내 근무에서 확인해 주세요.' }).count()) === 1)
  // 다른 말이 마지막이면 둘 다 없음
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'applied', decided_at: null })
  await say('주차할 수 있나요?')
  await a.goto(`${D}/admin/chat/${AP}`)
  await a.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('마지막 문의가 다른 말이면 둘 다 없음', (await short.count()) === 0 && (await a.locator('[data-quick-replies] button', { hasText: '확정했어요. 내 근무에서 확인해 주세요.' }).count()) === 0)

  // ── 3. 근무자 내 근무: 맨 위 확정 대기 첫 카드에 진행 단계
  const p = await pg(AP)
  await p.goto(`${D}/me`)
  const first = p.locator('[data-waiting=first] [data-waiting-app]').first()
  await first.waitFor({ timeout: 15000 }).catch(() => {})
  const steps = first.locator('[data-apply-steps]')
  const dots = await steps.locator('[data-step-dot]').evaluateAll((els) => els.map((e) => e.dataset.stepDot)).catch(() => [])
  ok('진행 단계: 지원 ✓ → 확정(지금) → 서명 → 출근', (await steps.getAttribute('data-apply-steps').catch(() => '')) === '2' && dots.join(',') === 'done,now,next,next' && one(await steps.innerText()) === '✓ 지원 2 확정 3 서명 4 출근', `${dots.join(',')} · ${one(await steps.innerText().catch(() => ''))}`)
  const box = await first.evaluate((el) => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), w: Math.round(r.width) } })
  ok('첫 화면 안에 다 보임 · 옆으로 안 밀림', box.bottom < 660 && (await noSide(p)), JSON.stringify(box))
  ok('공고로 가는 카드 제목 쪽은 그대로', (await first.locator(':scope > a').first().getAttribute('href')) === `/jobs/${J}`)
  if (SHOTS) { await p.waitForTimeout(600); await p.screenshot({ path: `${SHOTS}/me-steps.png` }).catch(() => {}) }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
