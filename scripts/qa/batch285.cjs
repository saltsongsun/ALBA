// 묶음 285 (정기 개선 2026-11-17 10:35 KST) — 서명 없이 근무가 시작된 경우 (담당자가 출석 체크로 시작해 줌 등)
// · 근무자 공고 화면: 진행 단계 '출근'은 ✓ · '서명'은 지금 할 일로 남김 (전엔 서명에서 멈춰 출근도 안 한 것처럼 보였음)
//   아래 바 문구도 지금 상태 그대로: '지금 근무 중이에요 · 서명이 아직 남았어요' (전엔 '근무 전에 서명해 주세요')
// · 관리자 출퇴근 탭: 앱 서명 공고에서 서명하지 않은 사람 줄에 '✍️ 서명 안 함' → 서류 탭 '서명 안 한 사람'으로
//   서명하면 사라짐
// node scripts/qa/batch285.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

;(async () => {
  // 근무자 W: 확정 · 오늘 근무 중(기본 자료) · 이 공고 서류 서명 전
  const docs = await rest(`signed_docs?user_id=eq.${W}&job_id=eq.${J}`)
  const pending = (docs ?? []).filter((d) => d.status === 'pending')
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  ok('준비: 서명 전 서류가 있고 오늘 근무 중', pending.length >= 1 && !!att?.clock_in && !att?.clock_out, `${pending.length}건`)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무자 공고 화면: 단계와 아래 바
  const w = await mk(W)
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  const dots = await w.locator('[data-apply-steps] [data-step-dot]').evaluateAll((els) => els.map((e) => e.getAttribute('data-step-dot')))
  ok("진행 단계: 지원 ✓ · 확정 ✓ · 서명(지금) · 출근 ✓", dots.join(',') === 'done,done,now,done', dots.join(','))
  const note = one(await w.locator('[data-sticky-note]').textContent().catch(() => ''))
  ok("아래 바: '지금 근무 중이에요 · 서명이 아직 남았어요'", note === '지금 근무 중이에요 · 서명이 아직 남았어요', note)
  ok('360px 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) {
    await w.locator('[data-apply-steps]').scrollIntoViewIfNeeded().catch(() => {})
    await w.waitForTimeout(500)
    await w.locator('[data-apply-steps]').locator('xpath=..').screenshot({ path: `${SHOTS}/job-steps-working.png` }).catch(() => {})
  }

  // ── 2. 관리자 출퇴근 탭: 서명 안 한 사람 줄에 '✍️ 서명 안 함'
  const a = await mk(A)
  await a.goto(`${D}/admin/jobs/${J}?tab=att`, { waitUntil: 'networkidle' })
  const badge = a.locator('[data-att-unsigned]').first()
  // 정기 개선 2026-11-22 20:35: ✍️ → 선 아이콘(연필) — 글자는 '서명 안 함' + svg 하나
  ok("출퇴근 탭: 근무자 줄에 '서명 안 함'(연필 아이콘) → 서류 탭 서명 안 한 사람", one(await badge.textContent().catch(() => '')) === '서명 안 함' && (await badge.locator('svg').count()) === 1 && (await badge.getAttribute('href').catch(() => '')) === `/admin/jobs/${J}?tab=docs#unsigned`)
  ok('360px 옆으로 안 밀림 (출퇴근 탭)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) {
    await badge.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(300)
    await a.screenshot({ path: `${SHOTS}/att-unsigned.png` }).catch(() => {})
  }
  await Promise.all([a.waitForURL(/tab=docs/, { timeout: 15000 }).catch(() => {}), badge.click()])
  ok('누르면 서류 탭 · 서명 안 한 사람 칸', new URL(a.url()).searchParams.get('tab') === 'docs' && (await a.locator('#unsigned').count()) === 1)

  // ── 3. 서명하면 사라짐 · 근무자 단계도 모두 ✓
  for (const d of pending) await rest(`signed_docs?id=eq.${d.id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await a.goto(`${D}/admin/jobs/${J}?tab=att`, { waitUntil: 'networkidle' })
  ok("서명하면 '서명 안 함' 없음", (await a.locator('[data-att-unsigned]').count()) === 0)
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  const dots2 = await w.locator('[data-apply-steps] [data-step-dot]').evaluateAll((els) => els.map((e) => e.getAttribute('data-step-dot')))
  ok('서명 뒤 근무자 단계 모두 ✓ · 아래 서명 바 없음', dots2.join(',') === 'done,done,done,done' && (await w.locator('[data-sticky-note]').count()) === 0, dots2.join(','))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
