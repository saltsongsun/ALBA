// 묶음 107 (정기 개선 2026-11-07 01:35): 한 계정으로 두 역할 이어서
// · 관리자 대시보드 맨 위 '오늘 내 근무' (다른 회사에서 오늘 확정된 근무) → 누르면 근무자 화면 '내 근무'로 바로 · 근무 중이면 '근무 종료하기' · 끝내면 사라짐
// · 맡은 회사 공고·운영자 계정에는 안 보임 · /api/view의 next는 근무자 화면 안(내 근무·공고·서류)으로만 (다른 사이트·관리자 화면 X)
// · 운영 센터 숫자 올라가기 · 방문 막대 자라기 (움직임 줄이기 설정이면 바로)
// node scripts/qa/batch107.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000000c7'
const B = 'aaaaaaaa-0000-4000-8000-0000000000b8' // 회사2 대표 관리자 · 회사1 오늘 공고에 근무자로 확정
const JT = 'cccccccc-0000-4000-8000-0000000000e7' // 회사1 오늘 공고
const JO = 'cccccccc-0000-4000-8000-0000000000e8' // 회사2(B가 맡은 회사) 오늘 공고 — B가 확정돼 있어도 안 보여야 함
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '셋째기획', seal_image: null, verified: true, created_at: new Date().toISOString() })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: B, name: '셋째대표', phone: '01047470808', is_super: false, attendance: [], ratings: [] })
  await rest('company_members', 'POST', { company_id: C2, user_id: B, role: 'owner' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const jt = { ...j1, id: JT, title: '오늘 저녁 불꽃축제 안내', start_date: today, end_date: today, start_time: '18:30:00', end_time: '22:00:00', applications: [], required_docs: [] }
  const jo = { ...j1, id: JO, company_id: C2, company: { company_name: '셋째기획' }, title: '셋째기획 자체 행사', start_date: today, end_date: today, start_time: '08:00:00', end_time: '12:00:00', applications: [], required_docs: [] }
  await rest('jobs', 'POST', jt)
  await rest('jobs', 'POST', jo)
  const lite = (j) => { const x = { ...j }; delete x.applications; return x }
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000e7', company_id: C, job_id: JT, user_id: B, status: 'approved', available_dates: null, created_at: new Date().toISOString(), job: lite(jt) })
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000e8', company_id: C2, job_id: JO, user_id: B, status: 'approved', available_dates: null, created_at: new Date().toISOString(), job: lite(jo) })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, scheme = 'light') => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', colorScheme: scheme })
    await ctx.addInitScript((sc) => {
      try {
        if (sc === 'dark') localStorage.setItem('theme', 'dark')
        localStorage.setItem('push-nudge-later', String(Date.now()))
        localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5))
        sessionStorage.setItem('photo-prompt-later', '1')
      } catch {}
    }, scheme)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const pathOf = (p) => new URL(p.url()).pathname

  // ── 1. 대시보드 '오늘 내 근무' ──
  const bp = await pg(B)
  await bp.goto(`${D}/admin`)
  const card = bp.locator('[data-my-shift]')
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  const t = await card.innerText().catch(() => '')
  ok("'오늘 내 근무 · 18:30 시작' + 공고 이름 + 회사 이름 + '출근하기'", t.includes('오늘 내 근무 · 18:30 시작') && t.includes('주식회사 테스트') && t.includes('오늘 저녁 불꽃축제 안내') && t.includes('출근하기'), t.replace(/\n/g, ' | '))
  ok('글자가 잘리지 않음 (회사·공고 이름 다 보임)', await card.locator('span span, b').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1)))
  ok('맡은 회사 공고(셋째기획)는 안 보임', !t.includes('셋째기획 자체 행사'))
  ok('360px: 옆으로 안 밀림 · 카드 한 줄 높이', (await wide(bp)) && (await card.evaluate((el) => el.getBoundingClientRect().height < 90)))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/my-shift.png` })
  await Promise.all([bp.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 10000 }).catch(() => {}), card.click()])
  ok('누르면 근무자 화면 내 근무(/me)로', pathOf(bp) === '/me', bp.url())
  ok('근무자 화면 표시도 남음', (await bp.context().cookies(D)).some((c) => c.name === 'hw-view' && c.value === 'worker'))

  // 근무 중이면 '근무 종료하기'
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000000000e7', company_id: C, job_id: JT, user_id: B, work_date: today, clock_in: new Date().toISOString(), clock_out: null })
  await bp.goto(`${D}/admin`)
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  ok("근무 중이면 '내 근무 중 · 22:00까지' + '근무 종료'", (await card.innerText().catch(() => '')).includes('내 근무 중 · 22:00까지') && (await card.innerText()).includes('근무 종료'), (await card.innerText().catch(() => '')).replace(/\n/g, ' | '))
  ok('근무 중에도 글자가 잘리지 않음', await card.locator('span span, b').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1)))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/my-shift-working.png` })
  await rest(`attendance?id=eq.eeeeeeee-0000-4000-8000-0000000000e7`, 'PATCH', { clock_out: new Date().toISOString() })
  await bp.goto(`${D}/admin`)
  await bp.locator('h1').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('근무를 끝내면 카드가 사라짐', (await bp.locator('[data-my-shift]').count()) === 0)

  // 운영자 계정은 안 보임
  const ap = await pg(A)
  await ap.goto(`${D}/admin`)
  await ap.locator('h1').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('운영자 계정 대시보드에는 없음', (await ap.locator('[data-my-shift]').count()) === 0)

  // ── 2. /api/view next는 근무자 화면 안으로만 ──
  const loc = async (q) => (await fetch(`${D}/api/view?${q}`, { redirect: 'manual' })).headers.get('location')
  ok("next=/me/history → '/me/history'", (await loc('to=worker&next=/me/history')) === '/me/history')
  ok("next=//evil.example → '/'", (await loc('to=worker&next=' + encodeURIComponent('//evil.example'))) === '/')
  ok("next=https://evil.example → '/'", (await loc('to=worker&next=' + encodeURIComponent('https://evil.example'))) === '/')
  ok("next=/admin (근무자 화면 밖) → '/'", (await loc('to=worker&next=/admin')) === '/')
  ok("to=admin은 언제나 '/admin'", (await loc('to=admin&next=/me')) === '/admin')

  // ── 3. 운영 센터 숫자 올라가기 · 막대 자라기 ──
  await ap.goto(`${D}/admin/ops`)
  await ap.locator('[data-ops]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('숫자 칸은 올라가는 숫자 (실제 값은 data-value)', (await ap.locator('[data-ops-tile] [data-value]').count()) === 4)
  ok('방문 막대: 아래에서 자라는 효과 · 차례로', (await ap.locator('[data-ops-visits] li span.animate-grow-up').count()) === 7 && (await ap.locator('[data-ops-visits] li span.animate-grow-up').nth(6).evaluate((el) => el.style.animationDelay)) === '360ms')
  await ap.waitForTimeout(1200)
  const tilesOk = await ap.locator('[data-ops-tile] [data-value]').evaluateAll((els) => els.every((e) => e.textContent.replace(/,/g, '') === e.dataset.value))
  ok('다 올라가면 실제 숫자와 같음', tilesOk)
  const rm = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: 'reduce' })
  await rm.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const rp = await rm.newPage()
  await rp.goto(`${D}/admin/ops`)
  await rp.locator('[data-ops]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('움직임 줄이기: 처음부터 실제 숫자', await rp.locator('[data-ops-tile] [data-value]').evaluateAll((els) => els.every((e) => e.textContent.replace(/,/g, '') === e.dataset.value)))
  ok('360px: 운영 센터 옆으로 안 밀림', await wide(ap))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
