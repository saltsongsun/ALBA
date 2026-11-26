// 묶음 408 (정기 개선 2026-11-27 03:36 KST)
// 기능 · 정산 탭 '일찍 찍힌 출근 n건 · 급여에 그대로 들어가요' (시작 전 근무를 급여에 넣는 공고 · 시작보다 1시간 넘게 일찍 · 고치지 않은 기록)
//   → '고치기 ›'를 누르면 출퇴근 탭 그 사람 기록 고치기 칸이 열림 → '출근을 09:00로 맞추기' → 저장 → 정산 탭으로 돌아오면 줄이 사라짐
//   · '시작 전 근무는 급여에 안 넣기'를 켠 공고 · 30분만 일찍 찍힌 기록에는 안 보임 · 계산 규칙은 그대로 (알리기만)
// 디자인 · 줄은 0.25초 떠오름 · 맞추기 버튼은 누르면 톡 + 출근 칸 테두리 · 커뮤니티 글쓰기를 여는 동안 쓰기 칸 모양 불러오기 화면
// node scripts/qa/batch408.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const at = (d, hm) => new Date(`${d}T${hm}:00+09:00`).toISOString()
const md = (d) => { const x = new Date(`${d}T00:00:00Z`); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}(${'일월화수목금토'[x.getUTCDay()]})` }

;(async () => {
  const y = kday(-1)
  // 어제~오늘 09:00~18:00 · 시작 전 근무도 급여에 넣는 공고(기본) · 어제 06:00에 출근을 찍고 18:00 퇴근 (3시간 일찍)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y, end_date: kday(0), start_time: '09:00:00', end_time: '18:00:00', early_clamp: false })
  const setAtt = (inHm, extra = {}) => rest(`attendance?id=eq.${ATT}`, 'PATCH', { work_date: y, clock_in: at(y, inHm), clock_out: at(y, '18:00'), adj_in: null, adj_out: null, paid: false, ...extra })
  await setAtt('06:00')

  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await ctxOf(A)
  const pay = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' }); return a.locator('[data-pay-early]') }

  // ── 1. 정산 탭 줄
  let line = await pay()
  ok("정산 탭: '일찍 찍힌 출근 1건 · 고치기 ›'", (await line.getAttribute('data-pay-early').catch(() => null)) === '1' && one(await line.innerText().catch(() => '')).startsWith('일찍 찍힌 출근 1건 고치기 ›'), one(await line.innerText().catch(() => '')))
  ok(`아랫줄: '근무자 · ${md(y)} 시작 09:00보다 3시간 일찍 · 급여에 그대로 들어가요' (잘리지 않음)`, one(await line.locator('[data-pay-early-top]').innerText().catch(() => '')) === `근무자 · ${md(y)} 시작 09:00보다 3시간 일찍 · 급여에 그대로 들어가요` && (await line.locator('b').evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false)), one(await line.locator('[data-pay-early-top]').innerText().catch(() => '')))
  const href = (await line.getAttribute('href').catch(() => '')) ?? ''
  ok('누르면 출퇴근 탭 그날 · 그 사람 고치기 칸 (고친 뒤 정산으로)', href.includes('tab=att') && href.includes(`date=${y}`) && href.includes(`fix=${W}`) && href.includes('from=pay'), href)
  ok('줄은 떠오름 (rise · 0.25초)', await line.evaluate((el) => getComputedStyle(el).animationName === 'rise' && getComputedStyle(el).animationDuration === '0.25s').catch(() => false))
  ok('360px 옆으로 안 밀림 (정산 탭)', await noSide(a))
  ok('한 칸 안에 짧게 (세 줄 안 · 높이 90px 아래)', await line.evaluate((el) => el.getBoundingClientRect().height < 90).catch(() => false))
  if (SHOTS) { await line.scrollIntoViewIfNeeded(); await a.waitForTimeout(400); const bx = await line.boundingBox(); if (bx) await a.screenshot({ path: `${SHOTS}/pay-early.png`, clip: { x: 0, y: Math.max(0, bx.y - 220), width: 360, height: 420 } }).catch(() => {}) }

  // ── 2. 고치기 → 출퇴근 탭 고치기 칸이 열리고 '출근을 09:00로 맞추기'
  await line.click()
  await a.waitForURL((u) => u.searchParams.get('tab') === 'att', { timeout: 15000 }).catch(() => {})
  const form = a.locator('form[data-att-edit="open"]')
  await form.waitFor({ timeout: 15000 }).catch(() => {})
  const fixBtn = form.locator('[data-early-fix]')
  ok("고치기 칸이 열림 + '출근을 09:00로 맞추기 ›'", (await form.isVisible().catch(() => false)) && one(await fixBtn.innerText().catch(() => '')).endsWith('출근을 09:00로 맞추기 ›'), one(await fixBtn.innerText().catch(() => '')))
  await fixBtn.click()
  const val = await form.locator('input[name="adj_in"]').inputValue().catch(() => '')
  ok(`누르면 출근 칸이 ${y}T09:00`, val === `${y}T09:00`, val)
  ok("버튼은 '✓ 출근을 09:00로 바꿨어요 · 아래 저장을 눌러 주세요' (톡 · 0.25초)", (await fixBtn.getAttribute('data-early-fix')) === 'done' && one(await fixBtn.innerText()).startsWith('✓ 출근을 09:00로 바꿨어요') && (await fixBtn.evaluate((el) => getComputedStyle(el).animationName === 'pop' && getComputedStyle(el).animationDuration === '0.25s')))
  const [att0] = await rest(`attendance?id=eq.${ATT}`)
  ok('누르기만 해서는 저장 안 됨 (저장은 원래 버튼)', !att0?.adj_in, String(att0?.adj_in))
  ok('360px 옆으로 안 밀림 (출퇴근 탭)', await noSide(a))
  if (SHOTS) { await fixBtn.scrollIntoViewIfNeeded(); await a.waitForTimeout(300); const bx = await form.boundingBox(); if (bx) await a.screenshot({ path: `${SHOTS}/att-early-fix.png`, clip: { x: 0, y: Math.max(0, bx.y - 40), width: 360, height: Math.min(420, bx.height + 80) } }).catch(() => {}) }
  await form.locator('button[type="submit"]').first().click()
  await a.waitForURL((u) => u.searchParams.get('tab') === 'pay', { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  const [att1] = await rest(`attendance?id=eq.${ATT}`)
  ok('저장하면 출근이 09:00 (보정)', att1?.adj_in && Date.parse(att1.adj_in) === Date.parse(at(y, '09:00')), String(att1?.adj_in))
  ok('정산 탭으로 돌아오면 줄이 사라짐', new URL(a.url()).searchParams.get('tab') === 'pay' && (await a.locator('[data-pay-early]').count()) === 0, a.url())

  // ── 3. 보이지 않는 경우: 30분만 일찍 · '시작 전 근무는 급여에 안 넣기'를 켠 공고
  await setAtt('08:30')
  line = await pay()
  ok('30분만 일찍 찍힌 기록: 줄 없음', (await line.count()) === 0)
  await setAtt('06:00')
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: true })
  line = await pay()
  ok("'시작 전 근무는 급여에 안 넣기'를 켠 공고: 줄 없음", (await line.count()) === 0)
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${y}&fix=${W}`, { waitUntil: 'networkidle' })
  ok('그 공고 고치기 칸에도 맞추기 버튼 없음', (await a.locator('form[data-att-edit="open"]').count()) === 1 && (await a.locator('[data-early-fix]').count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: false })
  await setAtt('06:00', { paid: true })
  line = await pay()
  ok('지급 끝난 기록: 줄 없음', (await line.count()) === 0)
  await setAtt('06:00')

  // ── 4. 커뮤니티 글쓰기를 여는 동안 쓰기 칸 모양 (화면 내용 응답만 늦춤)
  const w = await ctxOf(W)
  await w.goto(`${D}/community`, { waitUntil: 'networkidle' })
  await w.waitForTimeout(800)
  await w.route('**/community/new**', async (route) => {
    const h = route.request().headers()
    if (h['rsc'] === '1' && !h['next-router-prefetch']) await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {})
  })
  await w.locator('[data-write]').first().click()
  const sk = w.locator('[data-skeleton="post-write"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('글쓰기 여는 동안 쓰기 칸 모양 (말머리 5칸 · 글 목록 카드 아님)', shown && (await sk.locator('.grid > div').count()) === 5 && (await w.locator('[data-skeleton="community"]').count()) === 0, `shown=${shown}`)
  if (SHOTS && shown) await w.screenshot({ path: `${SHOTS}/write-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})
  ok('불러오는 화면도 360px 옆으로 안 밀림', await noSide(w))
  await w.locator('#post-title').waitFor({ timeout: 15000 }).catch(() => {})
  await w.unroute('**/community/new**')
  ok('다 열리면 글쓰기 칸 (불러오기 모양은 사라짐)', (await w.locator('#post-title').count()) === 1 && (await sk.count()) === 0)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
