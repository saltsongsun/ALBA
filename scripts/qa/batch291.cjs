// 묶음 291 (정기 개선 2026-11-17 18:35 KST)
// · 관리자 공고 화면 맨 위 '근무자에게 인원 보이기' 스위치 (기본 꺼짐 — 고치기 화면의 같은 칸과 같은 값)
//   누르면 바로 바뀌고 '✓ 저장' · 근무자 화면에 남은 자리가 보였다 숨었다 · 다른 표시 설정은 그대로
//   근무가 끝난 공고엔 없음 · 다른 회사 관리자는 못 바꿈 (company_id)
// · 근무자 '종료 시각 지남' 안내: 한 덩어리 세 줄 문장 → 굵게 'HH:MM 종료 · n분 지났어요' + 작은 두 줄 (줄마다 한 줄)
// node scripts/qa/batch291.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000002a2'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args) =>
  p.evaluate(
    async ({ id, args }) => {
      const body = new FormData()
      body.append('0', JSON.stringify(args))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.text()
    },
    { id: idOf(file, name), args },
  )
const hidden = async () => ((await rest(`jobs?id=eq.${J}`))?.[0]?.hidden_fields ?? [])

;(async () => {
  // 내일 하루짜리 · 인원 숨김(기본) · 세금 줄도 숨김 (다른 표시 설정이 그대로인지 보려고)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(1), end_date: kday(1), start_time: '09:00:00', end_time: '18:00:00', headcount: 10, status: 'open', hidden_fields: ['tax'] })
  // 다른 회사 관리자 A2
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01029102910', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, extra = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...extra })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const g = await mk(null)
  const workerCard = async () => {
    await g.goto(`${D}/`, { waitUntil: 'networkidle' })
    const c = g.locator(`a[href="/jobs/${J}"]`).first()
    await c.waitFor({ timeout: 15000 }).catch(() => {})
    return { t: one(await c.innerText().catch(() => '')), bar: await c.locator('[role=img][aria-label*="명 중"]').count() }
  }

  // ── 1. 관리자 공고 화면: 스위치 (꺼짐)
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  const sw = a.locator('[data-headcount-switch] [role=switch]')
  await sw.waitFor({ timeout: 15000 }).catch(() => {})
  ok("맨 위 카드에 '근무자에게 인원 보이기' 스위치 · 꺼짐", (await sw.count()) === 1 && (await sw.getAttribute('aria-checked')) === 'false' && one(await sw.innerText()) === '근무자에게 인원 보이기')
  ok('스위치: 한 줄 · 누르기 쉬움(36px 이상)', await sw.evaluate((el) => { const r = el.getBoundingClientRect(); const t = el.querySelector('span:last-child'); return r.height >= 36 && t.getClientRects().length === 1 }))
  ok('360px 옆으로 안 밀림 (공고 화면)', await noSide(a))
  ok('손잡이는 200ms로 미끄러짐', (await sw.locator('span[aria-hidden] > span').evaluate((el) => getComputedStyle(el).transitionDuration)) === '0.2s')
  const c0 = await workerCard()
  ok('근무자 카드: 기본은 남은 자리·칸 막대 없음', !/자리 남음|마감 임박/.test(c0.t) && c0.bar === 0, c0.t.slice(0, 100))

  // ── 2. 켜기: 바로 켜짐 → '✓ 저장' · 근무자에게 보임 · 다른 설정 그대로
  await sw.click()
  const flipped = await sw.getAttribute('aria-checked')
  const note = a.locator('[data-headcount-note]')
  await note.waitFor({ timeout: 10000 }).catch(() => {})
  ok("누르면 바로 켜짐 · '✓ 저장'", flipped === 'true' && one(await note.innerText().catch(() => '')) === '✓ 저장')
  if (SHOTS) await a.locator('.card').first().screenshot({ path: `${SHOTS}/switch-on.png` }).catch(() => {})
  const h1 = await hidden()
  ok("저장: '켰음' 표시 · 세금 줄 숨김은 그대로", h1.includes('headcount_shown') && h1.includes('tax'), JSON.stringify(h1))
  const c1c = await workerCard()
  ok('근무자 카드: 남은 자리 · 칸 막대 보임', /\d+자리 남음|마감 임박 · \d+자리/.test(c1c.t) && c1c.bar === 1, c1c.t.slice(0, 100))
  await a.goto(`${D}/admin/jobs/${J}/edit`, { waitUntil: 'networkidle' })
  if (!(await a.locator('input[name=headcount]').isVisible().catch(() => false))) await a.locator('summary', { hasText: '일정 · 인원' }).first().click()
  ok("공고 고치기의 '근무자에게 인원 보이기'도 켜짐 (같은 값)", await a.locator('[data-headcount-show] input').isChecked().catch(() => false))

  // ── 3. 다시 열어도 켜진 채 → 끄기
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  await sw.waitFor({ timeout: 15000 }).catch(() => {})
  ok('다시 열어도 켜진 채', (await sw.getAttribute('aria-checked')) === 'true')
  await sw.click()
  await note.waitFor({ timeout: 10000 }).catch(() => {})
  await a.waitForTimeout(300)
  const h2 = await hidden()
  const c2 = await workerCard()
  ok('끄면 다시 숨김 (세금 줄 숨김은 그대로)', (await sw.getAttribute('aria-checked')) === 'false' && !h2.includes('headcount_shown') && h2.includes('tax') && !/자리 남음|마감 임박/.test(c2.t) && c2.bar === 0, JSON.stringify(h2))
  if (SHOTS) await a.locator('.card').first().screenshot({ path: `${SHOTS}/switch-off.png` }).catch(() => {})

  // ── 4. 다른 회사 관리자는 못 바꿈
  const o = await mk(A2)
  await o.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const res = await call(o, 'admin', 'setHeadcountShown', [J, true])
  const h3 = await hidden()
  ok('다른 회사 관리자가 바꾸려 하면 그대로 (공고를 찾을 수 없어요)', !h3.includes('headcount_shown') && res.includes('공고를 찾을 수 없어요'), res.slice(-80))

  // ── 5. 근무가 끝난 공고엔 스위치 없음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(-2), end_date: kday(-2) })
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  await a.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('근무가 끝난 공고: 스위치 없음', (await a.locator('[data-headcount-switch]').count()) === 0)

  // ── 6. 근무자 '종료 시각 지남' 안내 (오늘 · 종료 70분 전에 지남 · 근무 중)
  const nowK = new Date(Date.now() + 9 * 3600e3)
  const mins = nowK.getUTCHours() * 60 + nowK.getUTCMinutes()
  if (mins < 30) console.log('SKIP  자정 직후라 종료 시각 지남 안내는 건너뜀')
  else {
    const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
    const endM = Math.max(10, mins - 70)
    const startM = Math.max(0, endM - 240)
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(0), end_date: kday(0), start_time: hm(startM), end_time: hm(endM) })
    await rest(`attendance?id=eq.${ATT}`, 'PATCH', { work_date: kday(0), clock_in: new Date(Date.now() - (mins - startM) * 60e3).toISOString(), clock_out: null })
    const w = await mk(W)
    await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
    const over = w.locator('[data-end-over]').first()
    await over.waitFor({ timeout: 15000 }).catch(() => {})
    const lines = await over.locator('span.block, b.block').evaluateAll((els) => els.map((e) => ({ t: e.textContent.trim(), n: e.getClientRects().length })))
    const endText = hm(endM).slice(0, 5)
    ok(`굵게 '${endText} 종료 · n분 지났어요'`, new RegExp(`^${endText} 종료 · (\\d+시간 )?\\d+분 지났어요$`).test(lines[0]?.t ?? ''), JSON.stringify(lines[0]))
    ok("아래 작게 '끝났으면 근무 종료를 눌러 주세요' · '넘은 시간은 확인 뒤 급여에 들어가요'", lines[1]?.t === '끝났으면 근무 종료를 눌러 주세요' && lines[2]?.t === '넘은 시간은 확인 뒤 급여에 들어가요')
    ok('세 줄 모두 한 줄로 (360px에서 꺾이지 않음)', lines.length === 3 && lines.every((l) => l.n === 1), JSON.stringify(lines.map((l) => l.n)))
    ok("예전 긴 문장('계약 종료 시각(..)이 지났어요. 일이 끝났으면…') 없음", !(await w.locator('main').innerText()).includes('일이 끝났으면 근무 종료를 눌러 주세요. 이후 시간은'))
    ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
    if (SHOTS) {
      await over.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await w.waitForTimeout(300)
      const box = await over.boundingBox()
      if (box) await w.screenshot({ path: `${SHOTS}/end-over.png`, clip: { x: 0, y: Math.max(0, box.y - 200), width: 360, height: Math.min(560, box.height + 330) } }).catch(() => {})
    }
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
