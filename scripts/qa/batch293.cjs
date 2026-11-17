// 묶음 293 (정기 개선 2026-11-17 22:36 KST)
// · 회사 간 자료 분리 점검: 오늘 새로 생긴 문의 말풍선 처리 버튼(출근 처리 · 확정하기 · 지급 완료 표시 · '조심히 오세요' 답장)과
//   공고 인원 보이기 스위치를 다른 회사 관리자가 직접 불러도 우리 회사 자료는 그대로
// · '조심히 오세요' 답장 버튼: 보낸 뒤 '답장을 보냈어요.' 한 줄 (전엔 못 보내도 아무 말 없었음)
// · 문의 대화 화면의 처리 안내(출근 처리·확정·답장 등)는 머리글 바로 아래에 떠서 보임 (화면이 맨 아래로 내려가 있어 위쪽 안내가 안 보였음)
// · 가입·회사 시작 비밀번호 칸: 로그인처럼 점 6개 (친 자리만큼) · '비밀번호 확인' 칸에 '한 번 더'
// node scripts/qa/batch293.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000002a3'
const APP_WAIT = '11111111-0000-4000-8000-000000000012'
const VP = '77777777-0000-4000-8000-000000029301', PAY = 'dddddddd-0000-4000-8000-000000029301'
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
      return `${r.status} ${r.headers.get('x-action-redirect') ?? ''} ${await r.text()}`
    },
    { id: idOf(file, name), args },
  )

;(async () => {
  // 오늘 근무 중인 공고 J (시작은 지남) · 다른 회사 C2와 그 관리자 A2 · 우리 회사 업체 대금 1건
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(0), end_date: kday(0), start_time: '00:00:00', end_time: '23:59:00', status: 'open', hidden_fields: [] })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '남의회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01029302930', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  await rest('vendors', 'POST', { id: VP, company_id: C1, user_id: null, name: '빛나조명', phone: '01029300001', category: '조명', active: true, created_at: new Date().toISOString() })
  await rest('vendor_payments', 'POST', { id: PAY, company_id: C1, vendor_id: VP, job_id: null, quote_id: null, title: '개막식 조명', amount: 900000, vat_included: true, due_date: kday(-3), paid_at: null, invoice_at: null, memo: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 다른 회사 관리자가 직접 불러도 우리 회사 자료는 그대로
  const o = await mk(A2)
  await o.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const attBefore = (await rest(`attendance?job_id=eq.${J}`)).length
  await call(o, 'admin', 'recordMissedClockIn', [J, W, kday(0)])
  ok('출근 처리: 남의 회사 공고에는 출근 기록이 생기지 않음', (await rest(`attendance?job_id=eq.${J}`)).length === attBefore)
  await call(o, 'admin', 'decideApplication', [APP_WAIT, 'approved', 'chat'])
  const [app] = await rest(`applications?id=eq.${APP_WAIT}`)
  ok('확정하기: 남의 회사 지원은 확정되지 않음', app?.status === 'applied', app?.status)
  await call(o, 'vendor', 'markVendorPaid', [PAY, true])
  const [pay] = await rest(`vendor_payments?id=eq.${PAY}`)
  ok('지급 완료 표시: 남의 회사 대금은 그대로 (지급 전)', !pay?.paid_at)
  const r = await call(o, 'chat', 'sendReply', [W, '네, 조심히 오세요.'])
  const fromA2 = (await rest('messages')).filter((m) => m.sender_id === A2)
  ok("답장: 우리 회사에 문의·지원한 적 없는 근무자에겐 못 보냄 (이유 한 줄)", fromA2.length === 0 && (() => { try { return decodeURIComponent(r.split(" ")[1] ?? "") } catch { return "" } })().includes('이 회사에 문의하거나 지원한 근무자가 아닙니다'), r.slice(0, 160))
  await call(o, 'admin', 'setHeadcountShown', [J, true])
  const [j] = await rest(`jobs?id=eq.${J}`)
  ok('인원 보이기 스위치: 남의 회사 공고는 그대로', !(j.hidden_fields ?? []).includes('headcount_shown'))

  // ── 2. 우리 회사: '조심히 오세요' 답장 → '답장을 보냈어요.'
  await rest('messages', 'POST', { id: 2930001, thread_user_id: W, sender_id: W, from_admin: false, company_id: C1, job_id: J, body: '🕒 지각 알림\n경상남도 생활체육대축전 행사장 안내 스태프 · 약 10분 늦어요', read_at: null, created_at: new Date(Date.now() - 30e3).toISOString(), job: { id: J, title: '경상남도 생활체육대축전 행사장 안내 스태프' }, sender: { name: '근무자' }, user: { id: W, name: '근무자', phone: '01033334444' } })
  const a = await mk(A)
  await a.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  const ack = a.locator('main ol [data-late-ack] button').first()
  await ack.waitFor({ timeout: 15000 }).catch(() => {})
  await ack.click().catch(() => {})
  await a.waitForURL((u) => u.searchParams.get('m') !== null, { timeout: 15000 }).catch(() => {})
  const flash = a.locator('[data-flash-floating] [role=status]', { hasText: '답장을 보냈어요.' })
  await flash.waitFor({ timeout: 8000 }).catch(() => {})
  ok("누르면 '답장을 보냈어요.' 한 줄 · 답장이 대화에", (await flash.count()) === 1 && (await rest('messages')).some((m) => m.sender_id === A && m.company_id === C1 && m.body === '네, 조심히 오세요.'), a.url())
  // 대화 화면은 맨 아래로 내려가 있음 → 안내는 머리글 바로 아래에 떠서 지금 보이는 화면 안에
  const fb = await flash.boundingBox().catch(() => null)
  const scrolled = await a.evaluate(() => scrollY > 100)
  ok('대화가 아래로 내려가 있어도 안내가 화면 위쪽에 보임 (머리글에 가리지 않음)', !!fb && scrolled && fb.y >= 56 && fb.y + fb.height < 220, JSON.stringify({ fb, scrolled }))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/reply-sent.png` }).catch(() => {})
  ok('360px 옆으로 안 밀림 (문의 대화)', await noSide(a))

  // ── 3. 가입·회사 시작 비밀번호 칸: 점 6개 · '한 번 더'
  for (const [name, url] of [['가입', '/signup?type=worker'], ['회사 시작', '/start']]) {
    const g = await mk(null)
    await g.goto(`${D}${url}`, { waitUntil: 'networkidle' })
    const dots = g.locator('[data-pin-dots]').first()
    ok(`${name}: 비밀번호 라벨 옆 점 6개 (빈칸)`, (await dots.locator('span').count()) === 6 && (await dots.getAttribute('data-pin-dots')) === '0')
    await g.locator('#pin').pressSequentially('2938')
    ok(`${name}: 4자리 치면 점 4개`, (await dots.getAttribute('data-pin-dots')) === '4' && (await dots.locator('span.bg-brand-600').count()) === 4)
    ok(`${name}: 점은 라벨과 한 줄 · 칸 안에 들어감`, await dots.evaluate((el) => { const l = document.querySelector('label[for=pin]').getBoundingClientRect(); const d = el.getBoundingClientRect(); const box = document.querySelector('#pin').getBoundingClientRect(); return Math.abs(d.top - l.top) < 8 && d.right <= box.right + 1 && l.right <= d.left }))
    await g.locator('#pin').pressSequentially('71')
    ok(`${name}: 6자리면 점이 모두 초록`, (await dots.locator('span.bg-emerald-500').count()) === 6)
    ok(`${name}: '비밀번호 확인' 칸에 '한 번 더'`, (await g.locator('#pin2').getAttribute('placeholder')) === '한 번 더')
    ok(`${name}: 360px 옆으로 안 밀림`, await noSide(g))
    if (SHOTS) await g.locator('#pin').evaluate((el) => el.closest('.grid').parentElement.scrollIntoView({ block: 'center' })).then(() => g.locator('#pin').evaluate((el) => el.closest('.grid').parentElement)).then(() => g.locator('#pin').locator('xpath=ancestor::div[contains(@class,"space-y-1.5")][1]').screenshot({ path: `${SHOTS}/pin-${name === '가입' ? 'signup' : 'start'}.png` })).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
