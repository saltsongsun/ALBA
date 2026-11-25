// 묶음 390 (정기 개선 2026-11-25 15:35 KST) — 회사 간 자료 분리 점검: 공고 쓰기 '서식 가져오기·불러오기'
// 화면의 '또는 내 다른 회사 것' 칩 요청을 가로채 서식 id를 바꿔 보냄 (위조 요청):
// · 속하지 않은 회사 서식 → 거절 · 지금 회사 자기 서식 → 거절 · 이상한 id → 거절 · 최고 관리자 권한으로만 보이는 회사 서식 → 거절
// · 어느 경우에도 지금 회사·남의 회사 서식 수 그대로 (기록도 없음) · 위조 안 한 요청은 그대로 가져옴 (대조군)
// · 속하지 않은 회사를 회사 쿠키에 넣고 '기본 서식 불러오기' → 내 회사로만 들어감 (남의 회사는 그대로)
// node scripts/qa/batch390.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099'
const C5 = '99999999-0000-4000-8000-000000003905', C6 = '99999999-0000-4000-8000-000000003906', C7 = '99999999-0000-4000-8000-000000003907', C8 = '99999999-0000-4000-8000-000000003908', C9 = '99999999-0000-4000-8000-000000003909'
const M = 'aaaaaaaa-0000-4000-8000-000000039001', S = 'aaaaaaaa-0000-4000-8000-000000039002', N = 'aaaaaaaa-0000-4000-8000-000000039003'
const T5 = 'ffffffff-0000-4000-8000-000000039005', T6 = 'ffffffff-0000-4000-8000-000000039006', T7 = 'ffffffff-0000-4000-8000-000000039007', T8 = 'ffffffff-0000-4000-8000-000000039008'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const tplsOf = async (c) => ((await rest(`doc_templates?company_id=eq.${c}`)) ?? [])
const copyLogs = async () => ((await rest('audit_logs?action=eq.template.copy')) ?? []).length

;(async () => {
  const now = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  for (const [id, name, code] of [[C5, '지금회사390', 'NW390'], [C6, '둘째회사390', 'TW390'], [C7, '남의회사390', 'OT390'], [C8, '최고만390', 'SU390'], [C9, '혼자회사390', 'HN390']])
    await rest('companies', 'POST', { ...c1, id, company_name: name, join_code: code, seal_image: null, created_at: now })
  const tb = { is_default: false, active: true, created_at: now, updated_at: now }
  // 지금 회사(C5)에는 계약서가 아닌 서식 하나만 (그래서 '계약서 없음' 줄과 칩이 보임)
  await rest('doc_templates', 'POST', { ...tb, id: T5, company_id: C5, kind: 'notice', title: '안내문390', body: '# 안내' })
  await rest('doc_templates', 'POST', { ...tb, id: T6, company_id: C6, kind: 'contract', title: '둘째 계약서390', body: '# 근로계약서' })
  await rest('doc_templates', 'POST', { ...tb, id: T7, company_id: C7, kind: 'contract', title: '남의 계약서390', body: '# 근로계약서' })
  await rest('doc_templates', 'POST', { ...tb, id: T8, company_id: C8, kind: 'contract', title: '최고만 계약서390', body: '# 근로계약서' })
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자390', phone: '01039000001', is_super: false })
  await rest('users', 'POST', { ...a, id: S, name: '최고관리자390', phone: '01039000002', is_super: true })
  await rest('users', 'POST', { ...a, id: N, name: '혼자관리자390', phone: '01039000003', is_super: false })
  for (const [company_id, user_id, role] of [[C5, M, 'owner'], [C6, M, 'admin'], [C5, S, 'owner'], [C6, S, 'admin'], [C9, N, 'owner']]) await rest('company_members', 'POST', { company_id, user_id, role, created_at: now })
  const before = { c5: (await tplsOf(C5)).length, c6: (await tplsOf(C6)).length, c7: (await tplsOf(C7)).length, c8: (await tplsOf(C8)).length }

  const b = await chromium.launch()
  const errs = []
  const open = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: company, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    await p.goto(`${D}/admin/jobs/new#docs`, { waitUntil: 'networkidle' })
    await p.locator('[data-tpl-missing]').waitFor({ timeout: 15000 }).catch(() => {})
    return p
  }
  // 칩을 누르는 순간의 서버 요청에서 서식 id만 바꿔 보냄 (한 번만)
  const forge = async (p, to) => {
    let hit = false
    await p.route('**/admin/jobs/new**', async (route) => {
      const req = route.request()
      const body = req.postData() ?? ''
      if (!hit && req.method() === 'POST' && body.includes(T6)) {
        hit = true
        await route.continue({ postData: body.split(T6).join(to) })
      } else await route.continue()
    })
    await p.locator(`[data-tpl-copy="${T6}"]`).click()
    await p.waitForTimeout(1500)
    await p.unrouteAll({ behavior: 'ignoreErrors' })
    return hit
  }
  const refused = async (p) => (await p.locator('text=불러오지 못했어요').count()) === 1 && (await p.locator('[data-tpl-copied]').count()) === 0
  const same = async () => {
    const n = { c5: (await tplsOf(C5)).length, c6: (await tplsOf(C6)).length, c7: (await tplsOf(C7)).length, c8: (await tplsOf(C8)).length }
    return [n.c5 === before.c5 && n.c6 === before.c6 && n.c7 === before.c7 && n.c8 === before.c8, JSON.stringify(n)]
  }

  // ── 1. 두 회사 관리자(M): 칩은 둘째회사 것 하나만 (남의 회사·최고만 회사 서식은 안 보임)
  let m = await open(M, C5)
  ok("칩은 내 다른 회사(둘째회사390) 서식만", (await m.locator('[data-tpl-copy]').count()) === 1 && (await m.locator(`[data-tpl-copy="${T6}"]`).count()) === 1)
  for (const [label, to] of [['속하지 않은 회사 서식', T7], ['지금 회사 자기 서식', T5], ['이상한 id', 'not-a-uuid'], ['최고 관리자 권한으로만 보이는 회사 서식', T8]]) {
    m = await open(M, C5)
    const hit = await forge(m, to)
    const [kept, n] = await same()
    ok(`위조 요청(${label}) → 거절 · 어느 회사 서식도 그대로 · 기록 없음`, hit && (await refused(m)) && kept && (await copyLogs()) === 0, n)
  }

  // ── 2. 최고 관리자(S, C5·C6 소속): 소속 아닌 C8 서식으로 바꿔 보내도 거절
  const s = await open(S, C5)
  ok('최고 관리자: 칩은 소속 회사 서식만 (최고만 회사 서식 칩 없음)', (await s.locator(`[data-tpl-copy="${T8}"]`).count()) === 0 && (await s.locator(`[data-tpl-copy="${T6}"]`).count()) === 1)
  const hitS = await forge(s, T8)
  const [keptS, nS] = await same()
  ok('최고 관리자 위조 요청(소속 아닌 회사 서식) → 거절 · 그대로', hitS && (await refused(s)) && keptS && (await copyLogs()) === 0, nS)

  // ── 3. 대조군: 위조하지 않으면 그대로 가져옴 (지금 회사에만 하나 생김)
  m = await open(M, C5)
  await m.locator(`[data-tpl-copy="${T6}"]`).click()
  await m.locator('[data-tpl-copied]').waitFor({ timeout: 15000 }).catch(() => {})
  const c5 = await tplsOf(C5)
  ok('대조군: 위조 없이 누르면 지금 회사(C5)에만 계약서 1개 생김 · 기록 1건', c5.length === before.c5 + 1 && c5.some((t) => t.title === '둘째 계약서390' && t.kind === 'contract') && (await tplsOf(C6)).length === before.c6 && (await tplsOf(C7)).length === before.c7 && (await copyLogs()) === 1, JSON.stringify(c5.map((t) => t.title)))

  // ── 4. 회사 쿠키에 속하지 않은 회사(C7)를 넣고 '기본 서식 불러오기' → 내 회사(C9)로만
  const n = await open(N, C7)
  const restore = n.locator('[data-tpl-restore]')
  const hasRestore = (await restore.count()) === 1
  if (hasRestore) {
    await restore.click()
    await n.locator('[data-tpl-restored]').waitFor({ timeout: 15000 }).catch(() => {})
  }
  const c9 = await tplsOf(C9)
  ok("남의 회사 쿠키로 '불러오기' → 내 회사(혼자회사390)에만 들어감 · 남의 회사는 그대로", hasRestore && c9.length > 0 && c9.every((t) => t.company_id === C9) && (await tplsOf(C7)).length === before.c7, `${c9.length}개`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
