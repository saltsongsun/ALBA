// 묶음 168 (정기 개선 2026-11-10 04:35 KST)
// · 지원하고 기다리는 근무자 (공고 화면): '이 회사는 보통 3시간 안에 답해요'
//   회사마다 최근 90일 확정·미선발까지 걸린 시간의 중간값 · 3건 미만이면 안 보임 · 직접 추가(바로 확정)는 빼고 · 다른 회사 기록은 안 셈
// · 진행 단계(지원 → 확정 → 서명 → 출근): 끝난 단계가 왼쪽부터 차례로 ✓ 톡 · 사이 선이 차오름 (짧게 · '움직임 줄이기'면 바로)
// node scripts/qa/batch168.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const APPLICANT = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
let seq = 0
// 다른 사람의 지원 기록: created_at = days일 전, decided_at = 그로부터 mins분 뒤
const decided = (mins, { days = 5, status = 'approved', job = J, company } = {}) => {
  const created = Date.now() - days * 864e5
  seq++
  return rest('applications', 'POST', {
    job_id: job, user_id: `eeeeeeee-0000-4000-8000-${String(seq).padStart(12, '0')}`, status, available_dates: null, position: null,
    contract_received_at: null, message: null, admin_memo: null, held_at: null,
    created_at: new Date(created).toISOString(), decided_at: new Date(created + mins * 60e3).toISOString(),
    ...(company ? { company_id: company } : {}),
  })
}

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await pg(APPLICANT)
  const line = a.locator('[data-reply-time]')
  const open = async () => { await a.goto(`${D}/jobs/${J}`); await a.locator('[data-apply-steps]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 기록이 없거나 2건뿐이면 안 보임
  await open()
  ok("준비: 지원하고 기다리는 중 ('지원이 접수됐어요')", (await a.getByText('지원이 접수됐어요').count()) > 0)
  ok('답한 기록이 없으면 안 보임', (await line.count()) === 0)
  await decided(120)
  await decided(180, { status: 'rejected' })
  await open()
  ok('2건뿐이면 안 보임 (몇 건으로는 믿기 어려워서)', (await line.count()) === 0)

  // ── 2. 3건 → 중간값 3시간 · 직접 추가(바로 확정)·90일 지난 기록·다른 회사 기록은 안 셈
  await decided(300)
  await decided(0) // 관리자 직접 추가처럼 바로 확정
  await decided(0)
  await decided(6000, { days: 120 }) // 90일 지난 기록
  const [co] = await rest('companies')
  const OTHER = 'ffffffff-0000-4000-8000-000000000099'
  for (let i = 0; i < 4; i++) await decided(10, { job: 'ffffffff-0000-4000-8000-0000000000aa', company: OTHER })
  await open()
  const t = ((await line.innerText().catch(() => '')) ?? '').trim()
  ok("'이 회사는 보통 3시간 안에 답해요' (2·3·5시간의 중간값)", t === '이 회사는 보통 3시간 안에 답해요', t)
  ok('다른 회사 기록(10분 4건)은 섞이지 않음 (섞이면 1시간)', !t.includes('1시간') && !!co)
  ok('한 줄 · 360px 옆으로 안 밀림', (await line.evaluate((el) => el.getBoundingClientRect().height < 26).catch(() => false)) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  if (SHOTS) await line.locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/reply-time.png` }).catch(() => {})

  // ── 3. 확정된 근무자에겐 안 보임 + 진행 단계 움직임
  const w = await pg(W)
  await w.goto(`${D}/jobs/${J}`)
  const steps = w.locator('[data-apply-steps]')
  await steps.waitFor({ timeout: 15000 }).catch(() => {})
  ok('확정된 근무자에겐 답 시간 안내 없음', (await w.locator('[data-reply-time]').count()) === 0)
  const anim = await steps.evaluate((ol) => ({
    dots: [...ol.querySelectorAll('[data-step-dot=done],[data-step-dot=now]')].map((el) => { const s = getComputedStyle(el); return [el.dataset.stepDot, s.animationName, s.animationDelay] }),
    lines: [...ol.querySelectorAll('[data-step-line]')].map((el) => { const s = getComputedStyle(el); return [s.animationName, s.animationDuration, s.animationDelay] }),
  }))
  // 서명 대기 = 3단계: 끝난 동그라미 2개 + 지금 1개 · 차오르는 선 2개
  ok('끝난 단계 ✓ 2개 + 지금 단계 1개가 차례로 톡 (0·90·180ms)', JSON.stringify(anim.dots) === JSON.stringify([['done', 'pop', '0s'], ['done', 'pop', '0.09s'], ['now', 'pop', '0.18s']]), JSON.stringify(anim.dots))
  ok('사이 선 2개가 짧게(0.26초) 차오름 (60·150ms 뒤)', JSON.stringify(anim.lines) === JSON.stringify([['grow', '0.26s', '0.06s'], ['grow', '0.26s', '0.15s']]), JSON.stringify(anim.lines))
  await w.waitForTimeout(700)
  ok('움직임이 끝나면 다 보임 (선이 끝까지 참)', await steps.evaluate((ol) => [...ol.querySelectorAll('[data-step-line]')].every((el) => Math.abs(el.getBoundingClientRect().width - el.parentElement.getBoundingClientRect().width) < 1.5)))
  ok('360px 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await steps.screenshot({ path: `${SHOTS}/steps.png` }).catch(() => {})

  // ── 4. 움직임 줄이기: 바로 (움직이는 시간 0)
  const r = await pg(W, { reducedMotion: 'reduce' })
  await r.goto(`${D}/jobs/${J}`)
  await r.locator('[data-apply-steps]').waitFor({ timeout: 15000 }).catch(() => {})
  const rd = await r.locator('[data-apply-steps]').evaluate((ol) => [...ol.querySelectorAll('[data-step-line],[data-step-dot=done]')].map((el) => parseFloat(getComputedStyle(el).animationDuration)))
  ok("'움직임 줄이기'면 움직이지 않음", rd.length === 4 && rd.every((d) => d < 0.01), JSON.stringify(rd))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
