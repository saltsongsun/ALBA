// 묶음 36: 관리자 정산 탭 — 오늘 아직 근무 중인 사람은 '오늘 근무 중 n명은 퇴근하면 금액에 들어가요'(초록, 고칠 일 아님)
//          지난날 퇴근 기록이 없는 근무만 노란 안내 + '출퇴근에서 고치기 →' (그 날짜·그 사람 줄로 가서 반짝) · 해요체 · 360px
// node scripts/qa/batch36.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('install-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const payTab = async () => {
    await p.goto(`${D}/admin/jobs/${J}?tab=pay`)
    await p.locator('main table, main .card').first().waitFor({ timeout: 10000 }).catch(() => {})
    await p.waitForLoadState('networkidle').catch(() => {})
  }

  // ── 1. 오늘 출근만 하고 퇴근 전 (가짜 데이터 기본) ──
  await payTab()
  const live = p.locator('[data-live-note]')
  ok("오늘 근무 중: '오늘 근무 중 1명은 퇴근하면 금액에 들어가요' (초록)", (await live.innerText().catch(() => '')).includes('오늘 근무 중 1명은 퇴근하면 금액에 들어가요'))
  ok("오늘 근무 중만 있으면 '퇴근 기록이 없는 근무' 경고·고치기 링크 없음", !(await p.locator('main').innerText()).includes('퇴근 기록이 없는 근무') && (await p.locator('[data-fix-link]').count()) === 0)
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 어제 퇴근을 안 누른 근무가 있으면: 노란 안내 + 고치기 → 그 날짜·그 사람 줄 ──
  const y = Date.now() - 86400e3
  const yd = kst(y)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: yd })
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  await rest('attendance', 'POST', { ...att, id: '22222222-0000-4000-8000-0000000000f6', work_date: yd, clock_in: new Date(y - 3600e3).toISOString(), clock_out: null })
  await payTab()
  const warn = await p.locator('[data-pay-warn]').innerText().catch(() => '')
  ok("지난날 퇴근 기록 없음: '퇴근 기록이 없는 근무 1건은 금액에서 빠져 있어요' (해요체)", warn.includes('퇴근 기록이 없는 근무 1건은 금액에서 빠져 있어요') && !warn.includes('있습니다'), warn)
  ok('오늘 근무 중 안내는 따로 그대로', (await live.count()) === 1)
  const link = p.locator('[data-fix-link]')
  const href = (await link.getAttribute('href').catch(() => '')) || ''
  ok("'출퇴근에서 고치기 →' → 그 날짜·그 사람", href.includes('tab=att') && href.includes(`date=${yd}`) && href.includes(`fix=${W}`) && href.endsWith(`#att-${W}`), href)
  await link.click()
  await p.waitForURL((u) => u.searchParams.get('tab') === 'att', { timeout: 10000 }).catch(() => {})
  const row = p.locator(`#att-${W}`)
  await row.waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(700)
  ok('출퇴근 탭: 그 사람 줄이 화면 안 + 노란 테두리로 반짝', (await row.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight }).catch(() => false)) && ((await row.getAttribute('class')) || '').includes('ring-amber-300'))
  ok('출퇴근 탭 날짜도 그날', new URL(p.url()).searchParams.get('date') === yd, p.url())
  const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("지난 날짜의 퇴근 없는 기록은 '근무 중'이 아니라 '퇴근 기록 없음'", rowText.includes('퇴근 기록 없음') && !rowText.includes('근무 중'), rowText.slice(0, 120))
  ok('360px: 옆으로 안 밀림 (출퇴근)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
