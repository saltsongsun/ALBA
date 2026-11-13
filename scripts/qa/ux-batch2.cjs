// 묶음 2: 공고 목록에서 '⚠️ 내 일정과 겹쳐요' (확정·지원한 근무와 같은 날 같은 시간대) + 지원 접수·근무 확정 축하 효과 · 360px
// node scripts/qa/ux-batch2.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000000e2', J3 = 'cccccccc-0000-4000-8000-0000000000e3', J4 = 'cccccccc-0000-4000-8000-0000000000e4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const plus = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

;(async () => {
  // 근무자는 내일 09~18시 공고(J)에 확정. 같은 날 10~15시(겹침) · 같은 날 19~22시(안 겹침) · 다음 날(안 겹침)
  // (오늘로 두면 저녁에 돌릴 때 근무가 끝난 공고라 목록 맨 아래 '끝난 공고' 칸으로 내려가서 내일로)
  const tmr = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const day = j1.start_date
  const mk = (id, title, start, st, et) => ({ ...j1, id, title, start_date: start, end_date: start, start_time: st, end_time: et, applications: [], required_docs: [] })
  await rest('jobs', 'POST', mk(J2, '같은 날 낮 주차 안내', day, '10:00:00', '15:00:00'))
  await rest('jobs', 'POST', mk(J3, '같은 날 저녁 정리', day, '19:00:00', '22:00:00'))
  await rest('jobs', 'POST', mk(J4, '내일 매표소', plus(day, 1), '10:00:00', '15:00:00'))

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const card = (p, t) => p.locator('#jobs ~ .stagger a.card-link', { hasText: t })

  // ── 1. 겹치는 공고 표시 ──
  const p = await pg(W)
  await p.goto(`${D}/`)
  await card(p, '같은 날 낮 주차 안내').waitFor({ timeout: 10000 }).catch(() => {})
  ok('같은 날 같은 시간대: ⚠️ 내 일정과 겹쳐요', (await card(p, '같은 날 낮 주차 안내').locator('[data-clash]').count()) === 1)
  ok('같은 날 다른 시간대: 표시 없음', (await card(p, '같은 날 저녁 정리').locator('[data-clash]').count()) === 0)
  ok('다른 날: 표시 없음', (await card(p, '내일 매표소').locator('[data-clash]').count()) === 0)
  ok('내가 확정된 공고 자체: 표시 없음', (await card(p, '행사장 안내 스태프').locator('[data-clash]').count()) === 0)
  const box = await card(p, '같은 날 낮 주차 안내').locator('[data-clash]').boundingBox()
  ok('360px: 표시 한 줄', !!box && box.height < 26, JSON.stringify(box))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 확정을 취소하면(지원 취소) 더 이상 겹치지 않음
  await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { status: 'cancelled' })
  await p.goto(`${D}/`)
  await card(p, '같은 날 낮 주차 안내').waitFor({ timeout: 10000 }).catch(() => {})
  ok('내 근무가 취소되면 표시 사라짐', (await p.locator('[data-clash]').count()) === 0)
  await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { status: 'approved' })
  const anon = await pg(null)
  await anon.goto(`${D}/`)
  await card(anon, '같은 날 낮 주차 안내').waitFor({ timeout: 10000 }).catch(() => {})
  ok('로그인 안 한 사람: 표시 없음', (await anon.locator('[data-clash]').count()) === 0)

  // ── 2. 지원 접수·근무 확정 축하 ──
  await p.goto(`${D}/jobs/${J2}?m=${encodeURIComponent('지원이 접수됐어요. 확정되면 내 근무에 표시됩니다.')}`)
  ok('지원 접수: 축하 효과', await p.locator('[data-celebrate]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  // 실제로 화면 가운데에 보이는지 (화면 전환 애니메이션 안에 갇혀 엉뚱한 곳에 그려지지 않게)
  const mark = await p.locator('[data-celebrate] > span').boundingBox()
  ok('축하 체크가 화면 가운데에 보임', !!mark && Math.abs(mark.x + mark.width / 2 - 180) < 12 && Math.abs(mark.y + mark.height / 2 - 370) < 40, JSON.stringify(mark))
  ok('지원 접수: 안내 문구도 그대로', await p.getByText('지원이 접수됐어요').first().isVisible().catch(() => false))
  await p.waitForTimeout(1600)
  ok('잠깐 뒤 축하 효과 사라짐 (화면 누르기 안 막음)', (await p.locator('[data-celebrate]').count()) === 0)
  await p.goto(`${D}/jobs/${J2}?m=${encodeURIComponent('근무가 확정됐어요! 내 근무에서 서류에 서명해 주세요.')}`)
  ok('바로 확정: 축하 효과', await p.locator('[data-celebrate]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  await p.goto(`${D}/jobs/${J2}?m=${encodeURIComponent('모집이 마감된 공고입니다.')}`)
  await p.getByText('모집이 마감된 공고입니다.').first().waitFor({ timeout: 5000 }).catch(() => {})
  ok('다른 안내: 축하 효과 없음', (await p.locator('[data-celebrate]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
