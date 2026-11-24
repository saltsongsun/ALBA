// 묶음 274 (정기 개선 2026-11-16 15:36 KST) — 큰 행사에서 지원자를 한 번에 확정해도 끝까지
// · 지원자 탭에서 520명을 고르면 막대에 '한 번에 500명까지 · 20명을 빼 주세요' (주황) + 확정·미선발·보류 버튼 잠금
// · 450명으로 줄이고 '선택 450명 확정' → 450명 모두 확정 · 450명 모두 서명할 서류가 생김
//   (예전: 200명에서 말없이 잘리고, 서류를 한 사람씩 차례로 만들어 수백 명이면 서버 시간이 넘을 수 있었음)
//   조회 1번이 50ms인 느린 DB에서도 서버 처리가 15초 안에 끝남 (예전 방식이면 450명 × 3번 차례로 = 1분 가까이 · 서버 시간 한도를 넘음)
// · 처리하는 동안 막대 위에 차오르는 줄 + '450명 처리하는 중이에요'
// node scripts/qa/batch274.cjs <default 앱> <default 가짜> <shots>
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
const hex = (n) => n.toString(16).padStart(12, '0')
const N = 520
const KEEP = 450

;(async () => {
  const now = Date.now()
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const uid = (i) => `bbbbbbbb-0000-4000-8000-${hex(0x274000 + i)}`
  const aid = (i) => `11111111-0000-4000-8000-${hex(0x274000 + i)}`
  await rest('users', 'POST', Array.from({ length: N }, (_, i) => ({ ...w1, id: uid(i), name: `대기${String(i).padStart(3, '0')}`, phone: `0102740${String(i).padStart(4, '0')}`, created_at: new Date(now - 864e5).toISOString() })))
  await rest('applications', 'POST', Array.from({ length: N }, (_, i) => ({ ...wa, id: aid(i), user_id: uid(i), status: 'applied', held_at: null, decided_at: null, available_dates: null, created_at: new Date(now - i * 1000).toISOString() })))
  await fetch(`${MD}/__limits?rows=1000&url=16384`)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const pick = (ids, on) => p.evaluate(({ ids, on }) => {
    // 같은 사람 칸이 휴대폰 카드·PC 표에 두 번 있어서, 사람마다 한 칸만 (손으로 누를 때처럼)
    const want = new Set(ids)
    const seen = new Set()
    for (const el of document.querySelectorAll('input[type="checkbox"][form="bulk-approve"][name="app"]')) {
      if (!want.has(el.value)) continue
      if (on && seen.has(el.value)) continue
      seen.add(el.value)
      el.checked = on
    }
    document.dispatchEvent(new Event('change'))
  }, { ids, on })
  try {
    await p.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
    await p.locator(`input[form="bulk-approve"][value="${aid(N - 1)}"]`).first().waitFor({ state: 'attached', timeout: 30000 }).catch(() => {})

    // ── 1. 520명 → 500명까지 안내 · 버튼 잠금
    await pick(Array.from({ length: N }, (_, i) => aid(i)), true)
    const bar = p.locator('[data-bulk-bar]')
    await bar.waitFor({ timeout: 10000 }).catch(() => {})
    const warn = one(await bar.locator('[data-bulk-too-many]').textContent().catch(() => ''))
    ok("520명 고름: '한 번에 500명까지 · 20명을 빼 주세요'", warn === '한 번에 500명까지 · 20명을 빼 주세요', warn)
    const locked = await bar.locator('button[type="submit"]').evaluateAll((els) => els.length >= 3 && els.every((e) => e.disabled))
    ok('확정·미선발·보류 버튼이 모두 잠김', locked)
    ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
    if (SHOTS) await bar.screenshot({ path: `${SHOTS}/bulk-too-many.png` }).catch(() => {})

    // ── 2. 450명으로 줄이고 확정 (조회 1번 50ms)
    await pick(Array.from({ length: N - KEEP }, (_, i) => aid(KEEP + i)), false)
    ok("450명으로 줄이면 안내가 사라지고 '선택 450명 확정'", (await bar.locator('[data-bulk-too-many]').count()) === 0 && one(await bar.locator('button', { hasText: '확정' }).last().textContent()) === '선택 450명 확정')
    const go = bar.locator('button', { hasText: '선택 450명 확정' })
    await go.click()
    await fetch(`${MD}/__latency?ms=50`)
    // 서버가 처리를 끝내고 답한 때 (화면을 다시 그리는 시간은 빼고 — 고른 수가 많으면 브라우저가 카드를 다시 그리는 데 따로 걸림)
    let answered = 0
    const t0 = Date.now()
    const onResp = (r) => { if (!answered && r.request().method() === 'POST' && r.request().headers()['next-action']) answered = Date.now() }
    p.on('response', onResp)
    await Promise.all([p.waitForURL(/m=/, { timeout: 120000 }).catch(() => {}), bar.locator('button.btn-primary').click()])
    p.off('response', onResp)
    const sec = ((answered || Date.now()) - t0) / 1000
    await fetch(`${MD}/__latency?ms=5`)
    const m = decodeURIComponent(new URL(p.url()).searchParams.get('m') ?? '')
    ok("'450명을 확정했어요. 근무자에게 알렸어요.' · 느린 DB에서도 서버 처리 15초 안에", /^450명을 확정했어요\. 근무자에게 알렸어요\.( 이번 450명 약 [\d,]+원 · 확정 \d+명 전체 약 [\d,]+원)?$/.test(m) && sec < 15, `${m} · ${sec.toFixed(1)}초`)
    await fetch(`${MD}/__limits`)
    const apps = await rest(`applications?job_id=eq.${J}`)
    const mine = apps.filter((a) => a.id.startsWith('11111111-0000-4000-8000-0000002740') || a.id.startsWith('11111111-0000-4000-8000-0000002741') || a.id.startsWith('11111111-0000-4000-8000-0000002742'))
    const approved = mine.filter((a) => a.status === 'approved').length
    const waiting = mine.filter((a) => a.status === 'applied').length
    ok('450명 모두 확정 · 고르지 않은 70명은 그대로 대기', approved === KEEP && waiting === N - KEEP, `확정 ${approved} · 대기 ${waiting}`)
    const docs = await rest(`signed_docs?job_id=eq.${J}&status=eq.pending`)
    const docUsers = new Set(docs.filter((d) => d.user_id.startsWith('bbbbbbbb-0000-4000-8000-00000027')).map((d) => d.user_id))
    ok('450명 모두 서명할 서류가 생김', docUsers.size === KEEP, `서류 받은 사람 ${docUsers.size}`)

    // ── 4. 처리 중 표시: 다시 큰 묶음을 느리게 처리하며 확인 (남은 70명 미선발)
    await p.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
    await p.locator(`input[form="bulk-approve"][value="${aid(N - 1)}"]`).first().waitFor({ state: 'attached', timeout: 30000 }).catch(() => {})
    await pick(Array.from({ length: N - KEEP }, (_, i) => aid(KEEP + i)), true)
    const rej = p.locator('[data-bulk-bar] button', { hasText: '미선발 70명' })
    await rej.click()
    await fetch(`${MD}/__latency?ms=400`)
    await p.locator('[data-bulk-bar] button', { hasText: '미선발 알림 보낼까요?' }).click()
    const pend = p.locator('[data-bulk-pending]')
    const shown = await pend.waitFor({ timeout: 5000 }).then(() => true, () => false)
    const ptxt = shown ? one(await pend.textContent().catch(() => '')) : ''
    if (SHOTS && shown) await p.locator('[data-bulk-bar]').screenshot({ path: `${SHOTS}/bulk-pending.png` }).catch(() => {})
    ok("처리하는 동안 차오르는 줄 + '70명 처리하는 중이에요 · 잠시만요'", shown && ptxt === '70명 처리하는 중이에요 · 잠시만요' && (await pend.locator('.bulk-progress').count()) === 1, ptxt)
    await p.waitForURL(/m=/, { timeout: 60000 }).catch(() => {})
    await fetch(`${MD}/__latency?ms=5`)
    ok("끝나면 '70명을 미선발로 정하고 70명에게 알렸어요.'", decodeURIComponent(new URL(p.url()).searchParams.get('m') ?? '') === '70명을 미선발로 정하고 70명에게 알렸어요.', decodeURIComponent(new URL(p.url()).searchParams.get('m') ?? ''))
  } finally {
    await fetch(`${MD}/__limits`).catch(() => {})
    await fetch(`${MD}/__latency?ms=5`).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch(async (e) => { await fetch(`${MD}/__limits`).catch(() => {}); await fetch(`${MD}/__latency?ms=5`).catch(() => {}); console.error(e); process.exit(2) })
