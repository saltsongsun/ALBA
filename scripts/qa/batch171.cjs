// 묶음 171 (정기 개선 2026-11-10 08:35 KST)
// · 대시보드 '확정 대기 지원자' 아래 한 줄: '보통 3시간 내 답변 · 가장 오래 기다린 지원 n일째'
//   (답변 시간은 근무자 공고 화면에 보이는 것과 같은 값 · 기록 3건 미만이면 앞쪽 없음 · 한 시간 넘게 기다린 지원자가 있을 때만 뒤쪽)
// · 넓은 표(정산·신고자료·서류): 옆으로 더 있으면 오른쪽 끝이 살짝 흐려짐 · 끝까지 밀면 사라짐 (이름 칸 고정은 그대로)
// node scripts/qa/batch171.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
let seq = 0
const decided = (mins) => {
  const created = Date.now() - 5 * 864e5
  seq++
  return rest('applications', 'POST', {
    job_id: J, user_id: `eeeeeeee-0000-4000-8000-${String(seq).padStart(12, '0')}`, status: 'rejected', available_dates: null, position: null,
    contract_received_at: null, message: null, admin_memo: null, held_at: null,
    created_at: new Date(created).toISOString(), decided_at: new Date(created + mins * 60e3).toISOString(),
  })
}

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wide = () => a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 대시보드: 가장 오래 기다린 지원 (가짜 DB의 김지원 지원 2026-10-02)
  const [app] = await rest('applications?id=eq.11111111-0000-4000-8000-000000000012')
  const days = Math.floor((Date.now() - Date.parse(app.created_at)) / 864e5)
  const line = a.locator('[data-dash-wait]')
  await a.goto(`${D}/admin`)
  await line.waitFor({ timeout: 15000 }).catch(() => {})
  const t1 = ((await line.innerText().catch(() => '')) ?? '').trim()
  ok(`답한 기록이 없으면 '가장 오래 기다린 지원 ${days}일째'만`, t1 === `가장 오래 기다린 지원 ${days}일째`, t1)
  await decided(120)
  await decided(180)
  await decided(300)
  await a.goto(`${D}/admin`)
  await line.waitFor({ timeout: 15000 }).catch(() => {})
  const t2 = ((await line.innerText().catch(() => '')) ?? '').trim()
  ok(`'보통 3시간 내 답변 · 가장 오래 기다린 지원 ${days}일째'`, t2 === `보통 3시간 내 답변 · 가장 오래 기다린 지원 ${days}일째`, t2)
  ok('한 줄 · 360px 옆으로 안 밀림', (await line.evaluate((el) => el.getBoundingClientRect().height < 20 && el.scrollWidth <= el.clientWidth + 1)) && (await wide()))
  if (SHOTS) await a.locator('#pending').screenshot({ path: `${SHOTS}/dash-wait.png` }).catch(() => {})

  // ── 2. 정산 탭 표: 오른쪽 끝 흐림 → 끝까지 밀면 사라짐
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  const table = a.locator('[data-pay-table]')
  await table.waitFor({ timeout: 15000 }).catch(() => {})
  const fade = () => table.evaluate((el) => getComputedStyle(el).getPropertyValue('--fade-r').trim())
  const info = await table.evaluate((el) => ({ wide: el.scrollWidth > el.clientWidth + 20, mask: getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage }))
  ok('360px에서 표가 옆으로 넘침 · 흐림 마스크', info.wide && /linear-gradient/.test(info.mask), JSON.stringify(info))
  ok("처음엔 오른쪽 끝이 흐림 (32px)", (await fade()) === '32px', await fade())
  if (SHOTS) await table.locator('xpath=..').screenshot({ path: `${SHOTS}/pay-fade.png` }).catch(() => {})
  await table.evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await a.waitForTimeout(300)
  ok('끝까지 밀면 흐림 사라짐 (0px)', (await fade()) === '0px', await fade())
  ok('이름 칸은 그대로 왼쪽에 고정', await table.evaluate((el) => Math.abs(el.querySelector('tbody td').getBoundingClientRect().left - el.getBoundingClientRect().left) <= 2))
  ok('표를 감싼 카드 모서리는 그대로 둥글게 (넘친 부분이 밖으로 안 나옴)', await table.evaluate((el) => getComputedStyle(el.parentElement).overflow === 'hidden' && parseFloat(getComputedStyle(el.parentElement).borderTopLeftRadius) > 0))
  ok('360px: 화면은 옆으로 안 밀림 (정산 탭)', await wide())

  // ── 3. 신고자료 표도 같은 흐림
  await a.goto(`${D}/admin/reports`)
  const rt = a.locator('[data-report-table]')
  await rt.waitFor({ timeout: 15000 }).catch(() => {})
  ok('신고자료 표도 넘치면 오른쪽 끝 흐림', await rt.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).getPropertyValue('--fade-r').trim() === '32px').catch(() => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
