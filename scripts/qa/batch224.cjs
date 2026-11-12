// 묶음 224 (정기 개선 2026-11-13 00:36 KST)
// · 대시보드 '확정 대기 지원자' 카드: 마지막 날 근무까지 끝난 행사면 '미선발'이 파란 버튼 · '확정'은 회색 (자리는 그대로)
//   — 지원자 탭(묶음 223)과 같게: 밤에 끝난 행사를 확정하는 실수 막고 결과 알리기를 먼저
// · 공고 목록·공고 화면 배지: 근무까지 끝났는데 아직 '모집중'이면 '근무 끝' (모집 문구 칸을 숨긴 것과 같은 기준 · 묶음 221)
// node scripts/qa/batch224.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  const setEnd = async (end) => {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: end, status: 'open' })
    // 대시보드 지원자 카드는 지원서에 붙은 공고 사본을 읽음 (가짜 DB는 사본을 따로 고쳐야 함)
    for (const a of (await rest(`applications?job_id=eq.${J}`)) ?? []) if (a.job) await rest(`applications?id=eq.${a.id}`, 'PATCH', { job: { ...a.job, start_date: today, end_date: today, start_time: '00:00:00', end_time: end, status: 'open' } })
  }
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const decide = a.locator('[data-dash-decide]').first()
  const cls = async (name) => (await decide.getByRole('button', { name }).getAttribute('class').catch(() => '')) ?? ''
  const jobBadge = async () => one(await a.locator('main .badge').first().innerText().catch(() => ''))

  // ── 1. 근무가 남은 공고: 전과 같음
  await setEnd('23:59:00')
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await decide.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무가 남은 공고: '확정' 파란 · '미선발' 회색", (await cls('확정')).includes('btn-primary') && (await cls('미선발')).includes('btn-gray'))
  await a.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' })
  ok("공고 목록 배지 '모집중'", (await a.locator('[data-job-status]').allInnerTexts()).map(one).includes('모집중'))
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  ok("공고 화면 배지 '모집중'", (await jobBadge()) === '모집중', await jobBadge())

  // ── 2. 오늘 근무가 끝난 공고 (0시~0시 1분)
  await setEnd('00:01:00')
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await decide.waitFor({ timeout: 15000 }).catch(() => {})
  ok("끝난 행사: '미선발' 파란 · '확정' 회색 (자리는 그대로: 확정·보류·미선발)", (await cls('미선발')).includes('btn-primary') && (await cls('확정')).includes('btn-gray') && (await decide.getByRole('button').allInnerTexts()).map(one).join('|') === '확정|보류|미선발')
  ok("'확정'은 여전히 한 번 더 확인 ('끝난 행사 · 확정?')", await (async () => { await decide.getByRole('button', { name: '확정' }).click(); await a.waitForTimeout(250); return (await decide.getByRole('button', { name: '끝난 행사 · 확정?' }).count()) === 1 })())
  ok('360px 옆으로 안 밀림 (대시보드)', await noSide(a))
  if (SHOTS) {
    await a.reload({ waitUntil: 'networkidle' })
    await decide.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(300)
    const card = decide.locator('xpath=..')
    const bx = await card.boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/dash-ended.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(bx.height + 16, 420) } }).catch(() => {})
  }
  await a.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' })
  const badges = (await a.locator('[data-job-status]').allInnerTexts()).map(one)
  ok("공고 목록 배지 '근무 끝' (모집중 아님)", badges.includes('근무 끝') && !badges.includes('모집중'), badges.join(','))
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  ok("공고 화면 배지 '근무 끝'", (await jobBadge()) === '근무 끝', await jobBadge())
  ok('360px 옆으로 안 밀림 (공고 화면)', await noSide(a))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
