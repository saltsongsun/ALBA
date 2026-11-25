// 묶음 387 (정기 개선 2026-11-25 12:35 KST)
// 공고 쓰기: 이 회사에 계약서 서식이 없을 때 '또는 내 다른 회사 것 [둘째회사 · 우리 근로계약서]' → 누르면 지금 회사로 가져옴 (화면 그대로)
// · 내가 대표·관리자로 속한 다른 회사 서식만 (속하지 않은 회사 서식은 안 보임) · 한 회사만 맡은 관리자는 이 줄 없음
// · 가져오면 '✓ 둘째회사387에서 가져왔어요' + 글에 원래 회사 이름이 있으면 '고쳐 주세요' · 가져온 계약서는 미리 체크 · 차례로 올라옴
// · 지금 회사에만 생김 · 원래 회사 서식은 그대로 · 기록 template.copy(지금 회사) · 360px 옆으로 안 밀림
// node scripts/qa/batch387.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099'
const C5 = '99999999-0000-4000-8000-000000003875', C6 = '99999999-0000-4000-8000-000000003876', C7 = '99999999-0000-4000-8000-000000003877'
const M = 'aaaaaaaa-0000-4000-8000-000000038701', N = 'aaaaaaaa-0000-4000-8000-000000038702'
const T6 = 'ffffffff-0000-4000-8000-000000038706', T7 = 'ffffffff-0000-4000-8000-000000038707'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C5, company_name: '새회사387', join_code: 'NW387', seal_image: null, created_at: now })
  await rest('companies', 'POST', { ...c1, id: C6, company_name: '둘째회사387', join_code: 'TW387', seal_image: null, created_at: now })
  await rest('companies', 'POST', { ...c1, id: C7, company_name: '남의회사387', join_code: 'OT387', seal_image: null, created_at: now })
  const tb = { is_default: false, active: true, created_at: now, updated_at: now }
  await rest('doc_templates', 'POST', { ...tb, id: T6, company_id: C6, kind: 'contract', title: '우리 근로계약서387', body: '# 근로계약서\n둘째회사387와 근로자는 다음과 같이 계약한다.' })
  await rest('doc_templates', 'POST', { ...tb, id: T7, company_id: C7, kind: 'contract', title: '남의 계약서387', body: '# 근로계약서' })
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자387', phone: '01038700001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자387', phone: '01038700002', is_super: false })
  for (const [company_id, user_id, role] of [[C5, M, 'owner'], [C6, M, 'admin'], [C5, N, 'admin']]) await rest('company_members', 'POST', { company_id, user_id, role, created_at: now })
  const c6Before = ((await rest(`doc_templates?company_id=eq.${C6}`)) ?? []).length

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C5, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 한 회사만 맡은 관리자: '또는 내 다른 회사 것' 줄 없음
  const n = await pg(N)
  await n.goto(`${D}/admin/jobs/new#docs`, { waitUntil: 'networkidle' })
  await n.locator('[data-tpl-missing]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('한 회사만 맡은 관리자: 서식 없음 줄은 있고 다른 회사 줄은 없음', (await n.locator('[data-tpl-missing]').count()) === 1 && (await n.locator('[data-tpl-other]').count()) === 0)

  // ── 2. 두 회사를 맡은 관리자: 내 다른 회사 계약서만 보임 → 가져오기
  const m = await pg(M)
  await m.goto(`${D}/admin/jobs/new#docs`, { waitUntil: 'networkidle' })
  const title = m.locator('input[name=title]').first()
  await title.fill('쓰던 공고387')
  const other = m.locator('[data-tpl-other]')
  await other.waitFor({ timeout: 15000 }).catch(() => {})
  const chips = other.locator('[data-tpl-copy]')
  ok("'또는 내 다른 회사 것 · 둘째회사387 · 우리 근로계약서387' (남의 회사 서식은 없음 · 한 줄)", one(await other.innerText().catch(() => '')) === '또는 내 다른 회사 것 둘째회사387 · 우리 근로계약서387' && (await chips.count()) === 1 && (await chips.first().getAttribute('data-tpl-copy')) === T6 && (await other.evaluate((el) => el.getBoundingClientRect().height < 34).catch(() => false)), one(await other.innerText().catch(() => '')))
  ok('360px 옆으로 안 밀림', await noSide(m))
  if (SHOTS) {
    await m.locator('[data-tpl-missing]').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await m.waitForTimeout(200)
    await m.locator('[data-tpl-missing]').screenshot({ path: `${SHOTS}/tpl-other.png` }).catch(() => {})
  }
  const url0 = m.url()
  await chips.first().click()
  const copied = m.locator('[data-tpl-copied]')
  await copied.waitFor({ timeout: 15000 }).catch(() => {})
  const ct = one(await copied.innerText().catch(() => ''))
  ok("누르면 '✓ 둘째회사387에서 가져왔어요' 톡 + 글에 회사 이름이 있다고 알림 · 화면·쓰던 제목 그대로", ct === "✓ 둘째회사387에서 가져왔어요 글에 '둘째회사387' 이름이 그대로 있어요 · 서류 메뉴에서 고쳐 주세요" && ((await copied.getAttribute('class')) || '').includes('animate-pop') && m.url() === url0 && (await title.inputValue()) === '쓰던 공고387', `${ct} · ${await title.inputValue().catch(() => '')}`)
  ok('가져온 뒤 서식 없음 줄은 사라짐', (await m.locator('[data-tpl-missing]').count()) === 0)
  const box = m.locator('label', { hasText: '우리 근로계약서387' })
  const fresh = m.locator('[data-tpl-fresh]')
  ok('가져온 계약서는 미리 체크 · 올라오며 나타남 (rise 0.25초)', (await box.locator('input').isChecked().catch(() => false)) && (await fresh.count()) === 1 && (await fresh.first().evaluate((el) => getComputedStyle(el).animationName)) === 'rise')
  if (SHOTS) {
    await m.waitForTimeout(400)
    await copied.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await m.waitForTimeout(200)
    await m.screenshot({ path: `${SHOTS}/tpl-copied.png` }).catch(() => {})
  }
  const c5 = (await rest(`doc_templates?company_id=eq.${C5}`)) ?? []
  ok('지금 회사(새회사387)에만 생김 · 둘째회사 서식은 그대로', c5.length === 1 && c5[0].title === '우리 근로계약서387' && c5[0].kind === 'contract' && c5[0].is_default === false && ((await rest(`doc_templates?company_id=eq.${C6}`)) ?? []).length === c6Before, JSON.stringify(c5.map((t) => [t.company_id, t.title])))
  const logs = ((await rest('audit_logs?action=eq.template.copy')) ?? []).filter((l) => (l.detail ?? '').includes('우리 근로계약서387'))
  ok('기록 template.copy · 지금 회사로', logs.length === 1 && logs[0].company_id === C5, JSON.stringify(logs[0] ?? null))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
