// 묶음 316 (정기 개선 2026-11-19 18:35 KST)
// · 서류 PDF 파일 이름 맨 앞에 회사 이름 (하나 · 여러 건 모두) — CSV·대화 파일과 같게, 여러 회사를 맡은 관리자가 받은 서류끼리 섞이지 않게
//   다른 회사 관리자는 그대로 못 받음
// · 공고 '확정자에게 공지' 접힌 줄: 360px에서 끝이 잘리던 안내 → '확정 n명에게 앱·문자로 한 번에' (한 줄에 다 보임)
// node scripts/qa/batch316.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Date.now() + 600e3 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(`roster|${p}`).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000316', A2 = 'aaaaaaaa-0000-4000-8000-0000000316a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const get = async (path, uid) => {
  const r = await fetch(`${D}${path}`, { headers: { cookie: `alba_session=${cookie(uid)}` }, redirect: 'manual' })
  return { status: r.status, type: r.headers.get('content-type') || '', name: decodeURIComponent((r.headers.get('content-disposition') || '').replace(/^.*filename\*=UTF-8''/, '')) }
}

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const coName = c1.company_name
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼일육컴퍼니', seal_image: null, verified: true, join_code: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  const { attendance: _a, ratings: _r, ...ab } = a1
  await rest('users', 'POST', { ...ab, id: A2, name: '삼일육관리자', phone: '01031603160', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-15T00:00:00Z' })

  // ── 1. 서류 PDF 파일 이름
  const p1 = await get(`/admin/docs/pdf?id=${DOC_SIGNED}`, A)
  ok(`서류 하나: '${coName}_서약서_근무자_날짜.pdf'`, p1.status === 200 && p1.type === 'application/pdf' && new RegExp(`^${coName}_서약서_근무자_\\d{4}-\\d{2}-\\d{2}\\.pdf$`).test(p1.name), `${p1.status} ${p1.name}`)
  const p2 = await get(`/admin/docs/pdf?job=${J}`, A)
  ok(`여러 건: '${coName}_서류_…_n건_날짜.pdf'`, p2.status === 200 && new RegExp(`^${coName}_서류_.+_\\d+건_\\d{4}-\\d{2}-\\d{2}\\.pdf$`).test(p2.name), `${p2.status} ${p2.name}`)
  const p3 = await get(`/admin/docs/pdf?id=${DOC_SIGNED}`, A2)
  ok('다른 회사 관리자는 그대로 못 받음 (404 · 파일 없음)', p3.status === 404 && !p3.type.includes('pdf'), `${p3.status}`)

  // ── 2. 확정자에게 공지: 접힌 줄이 한 줄에 다 보임
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  const fold = a.locator('details', { hasText: '확정자에게 공지' }).first()
  await fold.waitFor({ timeout: 15000 }).catch(() => {})
  const line = fold.locator('summary span.truncate').first()
  const t = one(await line.textContent().catch(() => ''))
  ok("접힌 줄: '확정 n명에게 앱·문자로 한 번에'", /^확정 \d+명에게 앱·문자로 한 번에$/.test(t), t)
  ok('360px에서 잘리지 않고 다 보임 (… 없음)', await line.evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false))
  ok('360px 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await fold.screenshot({ path: `${SHOTS}/announce-one-line.png` }).catch(() => {})
  await fold.locator('summary').click()
  ok('펼치면 공지 쓰기 그대로', (await fold.locator('textarea').count()) >= 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
