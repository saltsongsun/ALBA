// 묶음 268 (정기 개선 2026-11-16 02:35 KST)
// · 관리자 문의함: 외주 업체·전문가가 보낸 대화는 이름 옆 '외주' · '전문가' (근무자 문의와 한눈에 구분)
//   업체의 '세금계산서를 보냈어요. 개막식 음향 · 1,500,000원' 글은 '계산서' 표 + '개막식 음향 · 1,500,000원'만 (같은 말 반복 없이)
// · 근무자 '이번 주 내 근무': 같은 날 근무가 둘이면 점도 둘 (예: 낮엔 A회사, 밤엔 B회사 · 3개까지)
// node scripts/qa/batch268.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000002680c2'
const P = 'bbbbbbbb-0000-4000-8000-000000026801', E = 'bbbbbbbb-0000-4000-8000-000000026802'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '소리나라', phone: '01026800001', member_type: 'vendor', created_at: nowIso })
  await rest('users', 'POST', { ...w1, id: E, name: '조명장인', phone: '01026800002', member_type: 'expert', created_at: nowIso })
  // (가짜 DB는 글에 붙는 사람 정보를 같이 넣어 줘야 함 — 실제 DB는 이어서 읽음)
  const msg = (id, uid, user, body, min) => ({ id, thread_user_id: uid, sender_id: uid, from_admin: false, company_id: C1, job_id: null, body, read_at: null, created_at: new Date(Date.now() - min * 60e3).toISOString(), user })
  await rest('messages', 'POST', msg(926801, P, { id: P, name: '소리나라', phone: '01026800001', photo_at: null, member_type: 'vendor' }, '세금계산서를 보냈어요. 개막식 음향 · 1,500,000원', 1))
  await rest('messages', 'POST', msg(926802, E, { id: E, name: '조명장인', phone: '01026800002', photo_at: null, member_type: 'expert' }, '견적서 보내 드렸어요.', 2))

  // 근무자: 내일 두 회사 근무 (낮 우리 회사 J · 밤 다른 회사)
  const tmr = kst(1)
  const patch = { start_date: tmr, end_date: tmr, status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
  for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른기획' })
  const jb = { ...base, id: 'cccccccc-0000-4000-8000-0000002680d2', company_id: C2, title: '다른기획 야간 행사', start_time: '19:00', end_time: '23:00', ...patch }
  await rest('jobs', 'POST', jb)
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...wa, id: '11111111-0000-4000-8000-0000002680a2', job_id: jb.id, company_id: C2, status: 'approved', position: null, available_dates: null, job: { ...jb, company: { company_name: '다른기획' } } })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const as = async (u) => { await ctx.clearCookies(); await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }, { name: 'alba_roster', value: roster(u), url: D }]) }
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 관리자 문의함: 외주 · 전문가 · 계산서
  await as(A)
  await p.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  const row = (name) => p.locator('a', { hasText: name }).filter({ has: p.locator('[data-chat-snippet]') }).first()
  await row('소리나라').waitFor({ timeout: 15000 }).catch(() => {})
  ok("업체 줄 이름 옆 '외주'", one(await row('소리나라').locator('[data-inbox-member]').textContent().catch(() => '')) === '외주' && (await row('소리나라').locator('[data-inbox-member]').getAttribute('data-inbox-member')) === 'vendor')
  ok("전문가 줄 '전문가' · 근무자 줄엔 없음", one(await row('조명장인').locator('[data-inbox-member]').textContent().catch(() => '')) === '전문가' && (await row('근무자').locator('[data-inbox-member]').count()) === 0)
  const snip = one(await row('소리나라').locator('[data-chat-snippet]').textContent().catch(() => ''))
  ok("계산서 글: '계산서' 표 + '개막식 음향 · 1,500,000원' (머리말 반복 없이)", (await row('소리나라').locator('[data-inbox-tag]').textContent().catch(() => '')) === '계산서' && snip === '계산서 개막식 음향 · 1,500,000원', snip)
  const h = await row('소리나라').locator('p.font-bold').evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 99)
  ok('이름 줄 한 줄 · 360px 옆으로 안 밀림', h < 28 && (await noSide(p)), `${h}px`)
  if (SHOTS) {
    await row('소리나라').scrollIntoViewIfNeeded().catch(() => {})
    await p.waitForTimeout(300)
    await row('소리나라').screenshot({ path: `${SHOTS}/inbox-vendor-row.png` }).catch(() => {})
  }

  // ── 2. 이번 주 내 근무: 내일 근무 둘 → 점 둘
  await as(W)
  await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const strip = p.locator('ol.grid-cols-7')
  await strip.waitFor({ timeout: 15000 }).catch(() => {})
  const dots = await strip.locator('li').evaluateAll((els) => els.map((li) => li.querySelectorAll('[data-week-dots] > span').length))
  const attr = await strip.locator('li').nth(1).locator('[data-week-dots]').getAttribute('data-week-dots').catch(() => null)
  ok('내일 칸 점 둘 (근무 둘) · 다른 날은 점 하나 자리', dots[1] === 2 && attr === '2' && dots.filter((n, i) => i !== 1).every((n) => n === 1), JSON.stringify(dots))
  ok('360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) {
    await strip.evaluate((el) => el.closest('section').scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(500)
    await strip.locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/week-two-dots.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
