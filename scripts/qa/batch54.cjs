// 묶음 54: 관리자는 근무자(알바) 명단과 따로 — '근무자 명단 | 관리자 명부' · 근무자 명단엔 관리자가 없음
//          · 관리자 명부: 우리 회사 관리자만 (대표 관리자 먼저 · (나) · 연락 버튼) · 다른 회사 관리자는 어디에도 없음
//          · 초대·빼기는 회사 설정으로 · 명단 잠금은 그대로 · 360px
// node scripts/qa/batch54.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', CO = '99999999-0000-4000-8000-000000000099'
const ADM2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', ADM3 = 'aaaaaaaa-0000-4000-8000-0000000000a3', CO3 = '99999999-0000-4000-8000-0000000000c3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 우리 회사 관리자 한 명 더(ADM2) · 다른 회사 관리자(ADM3)
  const [a0] = await rest(`users?id=eq.${A}`)
  const [co] = await rest(`companies?id=eq.${CO}`)
  // (최고 관리자 계정을 복사하므로 is_super는 끔 — 일반 회사 관리자)
  await rest('users', 'POST', { ...a0, id: ADM2, name: '부관리자', phone: '01022223333', is_super: false, created_at: new Date().toISOString() })
  await rest('users', 'POST', { ...a0, id: ADM3, name: '남의회사관리자', phone: '01044445555', is_super: false, created_at: new Date().toISOString() })
  await rest('companies', 'POST', { ...co, id: CO3, company_name: '다른회사', created_at: '2026-10-15T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: CO, user_id: ADM2, role: 'admin', created_at: '2026-10-20T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: CO3, user_id: ADM3, role: 'owner', created_at: '2026-10-21T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, unlocked = true) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(unlocked ? [{ name: 'alba_roster', value: roster(uid), url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await pg(A)

  // ── 1. 근무자 명단: 관리자가 없음 ──
  await a.goto(`${D}/admin/workers`)
  const tabs = a.locator('[data-roster-tabs]')
  await tabs.waitFor({ timeout: 10000 }).catch(() => {})
  const body = await a.locator('main').innerText()
  ok("위에 '근무자 명단 | 관리자 명부 2'", (await tabs.innerText()).includes('근무자 명단') && (await tabs.innerText()).includes('관리자 명부 2'), await tabs.innerText().catch(() => ''))
  ok('근무자 명단에 관리자 없음 (우리 회사·다른 회사 모두)', !body.includes('부관리자') && !body.includes('남의회사관리자') && (await a.locator(`a[href="/admin/workers/${A}"]`).count()) === 0 && (await a.locator('.badge', { hasText: /^관리자$/ }).count()) === 0)
  ok('근무자는 그대로 보임', body.includes('근무자') && (await a.locator(`a[href="/admin/workers/${W}"]`).count()) >= 1)
  const h1 = await a.locator('h1').innerText()
  const cards = await a.locator('.stagger > .card').count()
  ok('제목 숫자 = 카드 수', h1 === `근무자 ${cards}명`, `${h1} / ${cards}`)

  // ── 2. 관리자 명부 ──
  await tabs.getByRole('link', { name: /관리자 명부/ }).click()
  await a.waitForURL((u) => new URL(u).searchParams.get('view') === 'admins', { timeout: 10000 }).catch(() => {})
  const list = a.locator('[data-admin-roster]')
  await list.waitFor({ timeout: 10000 }).catch(() => {})
  const rows = await list.locator('[data-admin-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-admin-row')))
  ok("관리자 명부: '관리자 2명' · 우리 회사 관리자만 (대표 먼저)", (await a.locator('h1').innerText()) === '관리자 2명' && JSON.stringify(rows) === JSON.stringify([A, ADM2]), JSON.stringify(rows))
  const me = list.locator(`[data-admin-row="${A}"]`)
  ok("나: '(나)' + '대표 관리자' · 내 번호엔 연락 버튼 없음", (await me.innerText()).includes('(나)') && (await me.innerText()).includes('대표 관리자') && (await me.locator('a[href^="tel:"]').count()) === 0)
  const other = list.locator(`[data-admin-row="${ADM2}"]`)
  ok("다른 관리자: '관리자' + 번호 + 전화·문자", (await other.innerText()).includes('부관리자') && (await other.innerText()).includes('010-2222-3333') && (await other.locator('a[href^="tel:01022223333"]').count()) === 1)
  ok('다른 회사 관리자는 없음', !(await list.innerText()).includes('남의회사관리자'))
  ok('초대·빼기는 회사 설정으로', (await a.locator('a[href="/admin/settings#admins"]').count()) === 1)
  ok('관리자 명부 탭이 켜짐', (await tabs.locator('a[aria-current=page]').innerText()).includes('관리자 명부'))
  ok('360px: 옆으로 안 밀림 (관리자 명부)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 명단 잠금은 그대로 ──
  const locked = await pg(A, false)
  await locked.goto(`${D}/admin/workers?view=admins`)
  await locked.waitForLoadState('networkidle').catch(() => {})
  ok('잠금 상태: 관리자 명부도 비밀번호를 다시 넣어야 열림', (await locked.locator('[data-admin-roster]').count()) === 0 && !(await locked.locator('main').innerText()).includes('010-2222-3333'))

  // ── 4. 다른 회사 관리자로 보면 그 회사 관리자만 ──
  const c3 = await pg(ADM3)
  await c3.goto(`${D}/admin/workers?view=admins`)
  await c3.locator('[data-admin-roster]').waitFor({ timeout: 10000 }).catch(() => {})
  const t3 = await c3.locator('[data-admin-roster]').innerText().catch(() => '')
  ok('다른 회사: 자기 회사 관리자만 (우리 회사 관리자 안 보임)', t3.includes('남의회사관리자') && !t3.includes('부관리자') && !t3.includes('010-1111-2222'), t3.replace(/\s+/g, ' ').slice(0, 80))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
