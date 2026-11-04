// 묶음 35: 근무 내역·급여 — 오늘 아직 근무 중인 날은 '종료 기록 없음 · 0원'이 아니라 '오늘 근무 중 · 끝나면 계산돼요' (내 근무·지난 근무)
//          · 지난날 퇴근 기록이 없으면 그대로 '종료 기록 없음' · 퇴근하면 금액으로 · 근무자 화면 문구는 해요체 · 360px
// node scripts/qa/batch35.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
// 오늘(한국 시간) 10:00~14:00 근무 — 공고 시간(09~18시) 안이라 언제 돌려도 4시간으로 계산됨 (지금-4시간이면 저녁 6시 뒤엔 0분이 됨)
const inShift = () => { const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return { clock_in: `${d}T01:00:00.000Z`, clock_out: `${d}T05:00:00.000Z` } }
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const card = (p) => p.locator(`[data-history-job="${J}"]`).first()
  const text = async (p) => (await card(p).innerText().catch(() => '')).replace(/\s+/g, ' ')
  const open = async (p, path) => {
    await p.goto(`${D}${path}`)
    await card(p).waitFor({ timeout: 10000 }).catch(() => {})
  }

  // ── 1. 오늘 출근만 한 상태 (가짜 데이터 기본) ──
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  ok('준비: 오늘 출근, 아직 퇴근 전', !!att && att.work_date === kst(Date.now()) && !!att.clock_in && !att.clock_out, JSON.stringify(att && { d: att.work_date, i: !!att.clock_in, o: att.clock_out }))
  const w = await pg(W)
  await open(w, '/me')
  let t = await text(w)
  ok("내 근무: '오늘 근무 중' 표시", (await card(w).locator('[data-live-shift]').count()) === 1 && t.includes('오늘 근무 중'), t)
  ok("내 근무: '종료 기록 없음'·'0원'·'0일 · 0분' 대신 '근무 중 · 끝나면 계산돼요'", !t.includes('종료 기록 없음') && !t.includes('0원') && !t.includes('0일 · 0분') && t.includes('끝나면 계산돼요'), t)
  ok('360px: 옆으로 안 밀림 (내 근무)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await open(w, '/me/history')
  t = await text(w)
  ok("지난 근무: '오늘 근무 중 · 끝나면 계산돼요' · 0원 없음", (await card(w).locator('[data-live-shift]').count()) === 1 && t.includes('끝나면 계산돼요') && !t.includes('종료 기록 없음') && !t.includes('0원') && !t.includes('0일 · 0분'), t)
  ok('360px: 옆으로 안 밀림 (지난 근무)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 어제 퇴근을 안 누른 날이 있으면: 그날은 그대로 '종료 기록 없음' ──
  const y = Date.now() - 86400e3
  await rest('attendance', 'POST', { ...att, id: '22222222-0000-4000-8000-0000000000f5', work_date: kst(y), clock_in: new Date(y - 3600e3).toISOString(), clock_out: null })
  await open(w, '/me')
  t = await text(w)
  ok("어제 퇴근 기록이 없으면 '종료 기록 없음 1일' + 오늘은 '오늘 근무 중'", t.includes('오늘 근무 중') && t.includes('종료 기록 없음 1일'), t)

  // ── 3. 오늘 퇴근하면: 금액으로 (근무 중 표시 없음) ──
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', inShift())
  await open(w, '/me')
  t = await text(w)
  ok('퇴근하면 금액(원) · 실수령 예상, 근무 중 표시 없음', (await card(w).locator('[data-live-shift]').count()) === 0 && /\d[\d,]*원/.test(t) && !/^0원/.test(t) && t.includes('실수령 예상') && !t.includes('끝나면 계산돼요'), t)

  // ── 4. 근무자 화면 문구: 해요체 ──
  const guest = await pg(null)
  await guest.goto(`${D}/`)
  const home = await guest.locator('main').innerText().catch(() => '')
  ok("첫 화면: '출퇴근 버튼만 누르면 돼요' (예전 '됩니다' 없음)", !home.includes('누르면 됩니다') && (home.includes('누르면 돼요') || !home.includes('출퇴근 버튼만')), home.slice(0, 120))
  await w.goto(`${D}/me/profile`)
  const prof = await w.locator('main').innerText().catch(() => '')
  ok("내 정보 탈퇴 안내: '바로 지워져요 · 쓸 수 없게 돼요' (예전 '삭제됩니다' 없음)", !prof.includes('즉시 삭제됩니다') && !prof.includes('사용할 수 없게 됩니다'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
