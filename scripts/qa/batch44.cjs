// 묶음 44: 공고 정산 탭 맨 위 한눈에 — 실수령 합계 · 지급 완료 n/m명 · 남은 지급(원) + 지급 진행 막대 (숫자는 올라가며 나타남)
//          · 모두 보내면 '남은 지급 없음'(초록) · 관리자 공고 목록 빈 화면: 탭·검색마다 다음 할 일(새 공고 등록·지난 공고 복사·검색 지우기) · 360px
// node scripts/qa/batch44.cjs <default 앱> <default 가짜>
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
// 오늘(한국 시간) 10:00~14:00 근무 — 공고 시간 안이라 언제 돌려도 금액이 나옴
const inShift = () => { const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return { clock_in: `${d}T01:00:00.000Z`, clock_out: `${d}T05:00:00.000Z` } }

;(async () => {
  await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { ...inShift(), paid: false })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const pay = async () => {
    await p.goto(`${D}/admin/jobs/${J}?tab=pay`)
    await p.locator('[data-pay-summary]').waitFor({ timeout: 10000 }).catch(() => {})
    await p.waitForLoadState('networkidle').catch(() => {})
    await p.waitForTimeout(800)
  }

  // ── 1. 정산 탭 한눈에 ──
  await pay()
  const sum = p.locator('[data-pay-summary]')
  const t1 = (await sum.innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok('정산 맨 위 한눈에: 실수령 합계 · 지급 완료 · 남은 지급', t1.includes('실수령 합계') && t1.includes('지급 완료') && t1.includes('남은 지급'), t1)
  ok("지급 전: '0/1명'", (await p.locator('[data-paid-count]').innerText()).replace(/\s+/g, '') === '0/1명')
  const left = Number(await p.locator('[data-left] [data-value]').getAttribute('data-value').catch(() => '0'))
  const net = Number(await sum.locator('[data-value]').first().getAttribute('data-value').catch(() => '0'))
  ok('남은 지급 = 실수령 합계 (아직 아무에게도 안 보냄) · 0원보다 큼', left > 0 && left === net, `${left} / ${net}`)
  ok('지급 진행 막대 0%', (await sum.locator('[role=progressbar]').getAttribute('aria-valuenow')) === '0')
  ok('360px: 옆으로 안 밀림 (정산)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 보내면
  await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { paid: true })
  await pay()
  const t2 = (await sum.innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("모두 보내면 '1/1명' · '남은 지급 없음' · 막대 100%", (await p.locator('[data-paid-count]').innerText()).replace(/\s+/g, '') === '1/1명' && t2.includes('없음') && (await sum.locator('[role=progressbar]').getAttribute('aria-valuenow')) === '100', t2)

  // ── 2. 공고 목록 빈 화면 ──
  const empty = (k) => p.locator(`[data-jobs-empty=${k}]`)
  await p.goto(`${D}/admin/jobs?q=${encodeURIComponent('없는공고이름')}`)
  await empty('search').waitFor({ timeout: 10000 }).catch(() => {})
  ok("검색 결과 없음: '‘없는공고이름’에 맞는 공고가 없어요' + 검색 지우기", (await empty('search').innerText().catch(() => '')).includes('‘없는공고이름’에 맞는 공고가 없어요') && (await empty('search').getByRole('link', { name: '검색 지우기' }).count()) === 1)
  await p.goto(`${D}/admin/jobs?tab=draft`)
  await empty('draft').waitFor({ timeout: 10000 }).catch(() => {})
  ok("임시저장 없음: '임시저장한 공고가 없어요'", (await empty('draft').innerText().catch(() => '')).includes('임시저장한 공고가 없어요'))
  // 진행 중 공고가 없는 회사 (공고를 끝난 것으로 — 가짜 DB는 날짜 비교 거르기를 안 해서 상태로)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'done' })
  await p.goto(`${D}/admin/jobs`)
  await empty('active').waitFor({ timeout: 10000 }).catch(() => {})
  const ea = empty('active')
  ok("진행 중 없음: '진행 중인 공고가 없어요' + 새 공고 등록 · 지난 공고 복사하기", (await ea.innerText().catch(() => '')).includes('진행 중인 공고가 없어요') && (await ea.locator('a[href="/admin/jobs/new"]').count()) === 1 && (await ea.locator('a[href="/admin/jobs?tab=past"]').count()) === 1)
  ok('360px: 옆으로 안 밀림 (공고 목록)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
