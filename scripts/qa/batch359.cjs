// 묶음 359 (정기 개선 2026-11-23 08:35 KST · 회사 간 자료 분리 점검: 문의 '종료 기록' 바로 가기 + 어색한 두 줄 정리)
// · 관리자 문의 대화의 '종료 기록이 빠진 날이 있어요' 글: 그 글에 붙은 공고가 지금 회사 공고일 때만 출퇴근을 읽고 'M/D 종료 넣기 →'
//   - 다른 회사 공고 번호가 붙은 글(섞여 들어온 경우)이면 바로 가기도 '✓ 다 들어갔어요'도 없음 (그 회사 출퇴근을 읽지 않음)
//   - 같은 대화에 지금 회사 공고 글이 오면 바로 가기가 다시 나옴 (막힌 게 아니라 회사를 가려서 보여 줌)
// · 근무자 명단 잠금 안내 두 문장을 한 줄씩 ('묻지 / 않아요'처럼 말 중간에서 끊기지 않게)
// · 회사 설정 '관리자 초대·승인은 대표 관리자(…)가 할 수 있어요' 고르게 두 줄 (끝말만 떨어지지 않게)
// node scripts/qa/batch359.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000003590c2'
const N = 'aaaaaaaa-0000-4000-8000-0000003590a1' // 최고 관리자 아닌 C1 관리자
const J2 = 'cccccccc-0000-4000-8000-000000035902' // 다른 회사(C2) 공고
const J1 = 'cccccccc-0000-4000-8000-000000035901' // 지금 회사(C1) 지난 공고
const ASK = '근무 종료 기록이 빠진 날이 있어요. 확인 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const md = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [au] = await rest(`users?id=eq.${A}`)
  const [wu] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...au, id: N, name: '일반관리359', phone: '01035900001', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: '2026-10-01T00:00:00Z' })
  await rest('companies', 'POST', { id: C2, company_name: '남의회사359', ceo_name: '대표', active: true, verified: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J2, company_id: C2, title: '남의회사 행사', status: 'closed', start_date: kday(-2), end_date: kday(-2), applications: [], attendance: [], created_at: new Date().toISOString() })
  await rest('jobs', 'POST', { ...jb, id: J1, company_id: C1, title: '우리회사 지난 행사', status: 'closed', start_date: kday(-3), end_date: kday(-3), applications: [], attendance: [], created_at: new Date().toISOString() })
  const jobOf = async (id) => (await rest(`jobs?id=eq.${id}`))[0]
  const att = async (id, job, day) =>
    rest('attendance', 'POST', { id, job_id: job, job: await jobOf(job), user_id: W, work_date: day, clock_in: `${day}T09:00:00+09:00`, clock_out: null, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, paid: false, paid_at: null, created_at: new Date().toISOString() })
  // 두 공고 모두 종료 기록 없는 지난 날
  await att('eeeeeeee-0000-4000-8000-000000035902', J2, kday(-2))
  await att('eeeeeeee-0000-4000-8000-000000035901', J1, kday(-3))
  const user = { id: W, name: wu.name, phone: wu.phone, photo_at: null, member_type: wu.member_type ?? 'worker' }
  const msg = (id, job, title, day, ago) =>
    rest('messages', 'POST', { id, thread_user_id: W, sender_id: W, from_admin: false, company_id: C1, job_id: job, body: `${ASK} (${md(day)})`, read_at: null, created_at: new Date(Date.now() - ago * 60e3).toISOString(), user, job: { id: job, title }, sender: { name: wu.name } })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 다른 회사 공고 번호가 붙은 '종료 기록' 글: 바로 가기 없음
  // 실제 DB는 공고가 붙은 글을 그 공고의 회사 문의함에 넣음 (가짜 DB도 같음) → 지금 회사 대화에는 안 보임
  await msg(3590001, J2, '남의회사 행사', kday(-2), 30)
  const [m1] = await rest('messages?id=eq.3590001')
  ok('(기본) 다른 회사 공고 글은 그 회사 문의함으로 감', m1?.company_id === C2, m1?.company_id)
  // 그래도 섞여 들어온 경우(지금 회사 문의함 + 다른 회사 공고 번호)를 만들어 확인
  await rest('messages?id=eq.3590001', 'PATCH', { company_id: C1 })
  const n = await mk(N)
  await go(n, `/admin/chat/${W}`)
  await n.locator('main').getByText(ASK.slice(0, 14)).first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('(준비) 대화에 종료 기록 글이 보임', (await n.locator('main').getByText(ASK.slice(0, 14)).count()) >= 1)
  ok('다른 회사 공고 글: 종료 넣기 바로 가기 없음', (await n.locator('[data-noend-resolve-link]').count()) === 0)
  ok("다른 회사 공고 글: '✓ 다 들어갔어요'도 없음 (그 회사 출퇴근을 읽지 않음)", (await n.locator('[data-noend-resolved]').count()) === 0)
  ok('다른 회사 공고 출퇴근으로 가는 링크 없음', (await n.locator(`a[href*="${J2}"][href*="tab=att"]`).count()) === 0)
  ok('360px 옆으로 안 밀림 (대화)', await noSide(n))

  // ── 2. 같은 대화에 지금 회사 공고 글이 오면: 바로 가기 (회사를 가려서 보여 줌)
  await msg(3590002, J1, '우리회사 지난 행사', kday(-3), 5)
  await go(n, `/admin/chat/${W}`)
  const rl = n.locator('[data-noend-resolve-link]')
  await rl.waitFor({ timeout: 15000 }).catch(() => {})
  ok(`지금 회사 공고 글: '${md(kday(-3))} 종료 넣기 →' → 우리 공고 출퇴근`, one(await rl.textContent().catch(() => '')) === `${md(kday(-3))} 종료 넣기 →` && (await rl.getAttribute('href').catch(() => '')) === `/admin/jobs/${J1}?tab=att&date=${kday(-3)}&fix=${W}#att-${W}`, `${one(await rl.textContent().catch(() => ''))} ${await rl.getAttribute('href').catch(() => '')}`)
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/chat-noend-own.png` })

  // ── 3. 명단 잠금 안내: 두 문장 한 줄씩
  await go(n, '/admin/workers')
  const note = n.locator('[data-roster-note]')
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  const lines = await note.locator('span').evaluateAll((els) => els.map((e) => [e.textContent.trim(), Math.round(e.getBoundingClientRect().height)]))
  const lh = await note.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 16)
  ok("명단 잠금 안내 두 줄: '…다시 묻지 않아요.' / '누가 언제 열었는지 기록돼요.'", lines.length === 2 && lines[0][0] === '한 번 열면 10분 동안 다시 묻지 않아요.' && lines[1][0] === '누가 언제 열었는지 기록돼요.', JSON.stringify(lines))
  ok('각 문장이 한 줄 (말 중간에서 안 끊김)', lines.every(([, h]) => h <= lh + 2), `${JSON.stringify(lines)} lh=${lh}`)
  ok('360px 옆으로 안 밀림 (명단 잠금)', await noSide(n))
  if (SHOTS) await n.locator('main').screenshot({ path: `${SHOTS}/roster-lock.png` }).catch(() => {})

  // ── 4. 회사 설정 '관리자 초대·승인은 대표 관리자(…)가 할 수 있어요': 고르게 두 줄
  await go(n, '/admin/settings')
  const on = n.locator('[data-team-owner-note]')
  await on.waitFor({ timeout: 15000 }).catch(() => {})
  ok("일반 관리자 안내 '관리자 초대·승인은 대표 관리자(관리자)가 할 수 있어요.'", one(await on.innerText().catch(() => '')) === '관리자 초대·승인은 대표 관리자(관리자)가 할 수 있어요.', one(await on.innerText().catch(() => '')))
  // 마지막 줄 길이: 끝말 한두 마디('수 있어요.')만 떨어지지 않게 (줄 너비 비교)
  const widths = await on.evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    const rows = new Map()
    for (const rc of r.getClientRects()) { const k = Math.round(rc.top); rows.set(k, (rows.get(k) ?? 0) + rc.width) }
    return [...rows.values()].map(Math.round)
  })
  ok('두 줄이면 마지막 줄이 첫 줄의 절반 이상', widths.length === 1 || widths.at(-1) >= widths[0] * 0.5, JSON.stringify(widths))
  if (SHOTS) await n.locator('#admins').screenshot({ path: `${SHOTS}/settings-owner-note.png` }).catch(() => {})

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
