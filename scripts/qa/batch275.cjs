// 묶음 275 (2026-11-16 KST) — 큰 행사(지원자 수백 명) 지원자 탭이 굼뜨지 않게
// · 520명 중 450명을 한 번에 확정한 뒤 화면을 다시 그리는 시간: 예전 데스크톱에서도 수 초~수십 초 → 1초 안쪽
//   까닭: Chrome은 스크립트가 다룬 <form>이 많으면 그 뒤 화면을 고칠 때마다(칸 하나 만들 때마다) 폼 수만큼 느려짐.
//   지원자 한 사람에 폼이 6개(확정·보류·미선발 × 휴대폰 카드·PC 표)라 520명이면 3천 개 → 다시 그리는 칸 수 × 폼 수만큼 걸렸음
//   → 카드·표의 확정·보류·미선발·대기로·배치 칸은 폼 없이 (생김새·두 번 누르기·처리 중 표시·끊긴 동안 막기는 그대로)
// · 접어 둔 칸(대기가 있을 때 '확정 n명' 등)은 펼칠 때 그림 · 확정·보류·미선발 칸이 50명을 넘으면 나머지는 '더 보기 (n명)'
//   (대기 칸은 모두 그림 — '모두 고르기'와 아래 막대는 그대로)
// · PC 표도 확정·미선발이 50명을 넘으면 '확정 더 보기 (n명)' 한 줄 (대기 줄은 모두)
// node scripts/qa/batch275.cjs <default 앱> <default 가짜> <shots>
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
const MORE_AFTER = 50
const uid = (i) => `bbbbbbbb-0000-4000-8000-${hex(0x275000 + i)}`
const aid = (i) => `11111111-0000-4000-8000-${hex(0x275000 + i)}`
const mine = (a) => a.id.startsWith('11111111-0000-4000-8000-0000002750') || a.id.startsWith('11111111-0000-4000-8000-0000002751') || a.id.startsWith('11111111-0000-4000-8000-0000002752')
const appOf = async (id) => (await rest(`applications?id=eq.${id}`))[0]

// 다시 그리는 시간 재기: 서버 처리 결과가 도착한 뒤(응답 끝) → 새 화면이 붙고 그려질 때까지
const TIMING = () => {
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k]
    history[k] = function (...args) {
      const r = orig.apply(this, args)
      const u = String(args[2] ?? '')
      if (window.__watch && !window.__urlAt && u.includes('m=')) {
        window.__urlAt = performance.now()
        window.__mUrl = u
        requestAnimationFrame(() => setTimeout(() => (window.__paintAt = performance.now()), 0))
      }
      return r
    }
  }
}
const redrawAfter = async (p, click) => {
  const t0 = await p.evaluate(() => { window.__watch = true; window.__urlAt = 0; window.__paintAt = 0; return performance.now() })
  await click()
  await p.waitForFunction(() => window.__paintAt, null, { timeout: 120000, polling: 100 })
  return p.evaluate((t0) => {
    // 서버 처리(지금 화면 주소로 보내는 POST)의 응답이 끝난 때
    const r = performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'fetch' && e.startTime >= t0 && e.name.includes('tab=apps') && !e.name.includes('_rsc='))[0]
    const end = r?.responseEnd ?? t0
    const m = new URL(window.__mUrl, location.href).searchParams.get('m') ?? ''
    return { redraw: Math.round(window.__paintAt - end), total: Math.round(window.__paintAt - t0), m, nodes: document.getElementsByTagName('*').length, forms: document.forms.length }
  }, t0)
}

;(async () => {
  const now = Date.now()
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('users', 'POST', Array.from({ length: N }, (_, i) => ({ ...w1, id: uid(i), name: `큰행사${String(i).padStart(3, '0')}`, phone: `0102750${String(i).padStart(4, '0')}`, created_at: new Date(now - 864e5).toISOString() })))
  await rest('applications', 'POST', Array.from({ length: N }, (_, i) => ({ ...wa, id: aid(i), user_id: uid(i), status: 'applied', held_at: null, decided_at: null, position: null, available_dates: null, created_at: new Date(now - i * 1000).toISOString() })))

  const b = await chromium.launch()
  const errs = []
  const page = async (opts) => {
    const ctx = await b.newContext({ ...opts, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addInitScript(TIMING)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p) => {
    await p.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
    await p.locator('[data-decide]').first().waitFor({ state: 'attached', timeout: 30000 }).catch(() => {})
  }
  // 같은 사람 칸이 휴대폰 카드·PC 표에 두 번 있어서 사람마다 한 칸만 (손으로 누를 때처럼)
  const pick = (p, ids) => p.evaluate((ids) => {
    const want = new Set(ids), seen = new Set()
    for (const el of document.querySelectorAll('input[type="checkbox"][form="bulk-approve"][name="app"]')) {
      if (!want.has(el.value) || seen.has(el.value)) continue
      seen.add(el.value)
      el.checked = true
    }
    document.dispatchEvent(new Event('change'))
  }, ids)

  // ── 1. 휴대폰: 520명 → 폼이 사람마다 생기지 않음 · 450명 한 번에 확정 → 빨리 다시 그림
  const m = await page({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } })
  await open(m)
  const forms0 = await m.evaluate(() => document.forms.length)
  ok('지원자 520명이어도 화면의 폼은 몇 개뿐 (사람마다 폼을 만들지 않음 · 예전 3천 개)', forms0 < 30, `폼 ${forms0}개`)
  ok('대기 520명 카드는 모두 그림 (여러 명 고르기 그대로)', (await m.locator('[data-app-list] [data-app-group="대기"] .card').count()) === N + 1)
  await pick(m, Array.from({ length: KEEP }, (_, i) => aid(i)))
  const bar = m.locator('[data-bulk-bar]')
  await bar.locator('button', { hasText: `선택 ${KEEP}명 확정` }).click()
  const r1 = await redrawAfter(m, () => bar.locator('button.btn-primary').click())
  ok(`'${KEEP}명을 확정했어요' 뒤 다시 그리기 2초 안 (예전 데스크톱 CPU에서 6초~수십 초)`, r1.m === `${KEEP}명을 확정했어요. 근무자에게 알렸어요.` && r1.redraw < 2000, `${r1.m} · 응답 뒤 ${r1.redraw}ms · 누른 뒤 ${r1.total}ms`)
  ok('다시 그린 화면은 보이는 만큼만 (칸 1만 2천 개 아래 · 예전 3만 5천 개)', r1.nodes < 12000 && r1.forms < 30, `칸 ${r1.nodes}개 · 폼 ${r1.forms}개`)
  const all = (await rest(`applications?job_id=eq.${J}`)).filter(mine)
  ok(`${KEEP}명 확정 · 나머지 ${N - KEEP}명 대기`, all.filter((a) => a.status === 'approved').length === KEEP && all.filter((a) => a.status === 'applied').length === N - KEEP)

  // ── 2. 접힌 '확정' 칸: 펼치기 전엔 카드를 만들지 않음 → 펼치면 50명 + '더 보기 (n명)' → 누르면 모두
  const approvedN = (await rest(`applications?job_id=eq.${J}&status=eq.approved`)).length
  const grp = m.locator('[data-app-list] [data-app-group="확정"]')
  ok(`'확정 ${approvedN}명' 접힘 · 펼치기 전엔 카드 없음`, one(await grp.locator('summary').innerText().catch(() => '')) === `확정 ${approvedN}명` && (await grp.locator('.card').count()) === 0)
  await grp.locator('summary').click()
  const more = grp.locator('[data-show-more]')
  ok(`펼치면 ${MORE_AFTER}명 + '더 보기 (${approvedN - MORE_AFTER}명)'`, (await grp.locator('.card').count()) === MORE_AFTER && one(await more.innerText().catch(() => '')) === `더 보기 (${approvedN - MORE_AFTER}명)`, `${await grp.locator('.card').count()}장 · ${one(await more.innerText().catch(() => ''))}`)
  ok('360px 옆으로 안 밀림', await m.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await more.screenshot({ path: `${SHOTS}/show-more-cards.png` }).catch(() => {})
  await more.click()
  ok(`'더 보기' → ${approvedN}명 모두 · 버튼은 사라짐`, (await grp.locator('.card').count()) === approvedN && (await more.count()) === 0)

  // ── 3. 대기 칸은 그대로: '모두 고르기' → 남은 대기 모두
  const waitN = N - KEEP + 1
  ok(`대기 ${waitN}명 카드 모두`, (await m.locator('[data-app-list] [data-app-group="대기"] .card').count()) === waitN)
  await m.locator('[data-app-list] [data-pick-all] input').check()
  ok(`'모두 고르기' → '${waitN}명 골랐어요'`, one(await m.locator('[data-bulk-n]').innerText().catch(() => '')) === String(waitN))
  await m.locator('[data-bulk-bar]').getByRole('button', { name: '선택 해제' }).click()

  // ── 4. 한 사람씩: 확정(인원 다 참 → 두 번) · 미선발(두 번) · 보류 — 폼 없이도 그대로
  const card = (i) => m.locator(`#app-${aid(i)}`)
  const btn = (i, t) => card(i).locator('[data-decide] button', { hasText: t })
  await btn(KEEP, '확정').click()
  ok("확정 첫 누름: '… · 확정?' (아직 대기)", /확정\?$/.test(one(await btn(KEEP, '확정').innerText())) && (await appOf(aid(KEEP))).status === 'applied', one(await btn(KEEP, '확정').innerText()))
  await btn(KEEP, '확정').click()
  await m.waitForFunction((id) => !document.querySelector(`[data-app-list] [data-app-group="대기"] #app-${id}`), aid(KEEP), { timeout: 15000 }).catch(() => {})
  ok('두 번째 누름 → 확정 · 대기 칸에서 빠짐', (await appOf(aid(KEEP))).status === 'approved' && (await m.locator(`[data-app-list] [data-app-group="대기"] #app-${aid(KEEP)}`).count()) === 0)
  await btn(KEEP + 1, '미선발').click()
  ok("미선발 첫 누름: '미선발 알림 보낼까요?' (아직 대기)", one(await btn(KEEP + 1, '미선발').innerText()) === '미선발 알림 보낼까요?' && (await appOf(aid(KEEP + 1))).status === 'applied')
  await btn(KEEP + 1, '미선발').click()
  await m.waitForFunction((id) => !document.querySelector(`[data-app-list] [data-app-group="대기"] #app-${id}`), aid(KEEP + 1), { timeout: 15000 }).catch(() => {})
  ok('두 번째 누름 → 미선발', (await appOf(aid(KEEP + 1))).status === 'rejected')
  const r2 = await redrawAfter(m, () => btn(KEEP + 2, '보류').click())
  ok("보류 → '큰행사452님 보류 · 근무자에게는 알리지 않았어요' · 보류 칸으로", r2.m === '큰행사452님 보류 · 근무자에게는 알리지 않았어요' && !!(await appOf(aid(KEEP + 2))).held_at, `${r2.m} · 응답 뒤 ${r2.redraw}ms`)

  // ── 5. 배치 칸 (확정자): 고치고 칸을 벗어나면 저장
  await grp.locator('summary').click()
  const firstId = ((await grp.locator('.card').first().getAttribute('id').catch(() => '')) ?? '').slice(4)
  const pos = grp.locator(`#app-${firstId} input[aria-label="현장 배치"]`)
  await pos.fill('A구역')
  await pos.blur()
  await grp.locator(`#app-${firstId} [data-position] .text-emerald-600`).waitFor({ timeout: 10000 }).catch(() => {})
  ok("배치 'A구역' 저장 (✓)", !!firstId && (await appOf(firstId))?.position === 'A구역')

  // ── 6. 끊긴 동안: 폼처럼 막고 같은 안내 · 처리하지 않음
  await m.context().setOffline(true)
  await m.locator('[data-offline="off"]').waitFor({ timeout: 8000 }).catch(() => {})
  await btn(KEEP + 3, '미선발').click()
  await btn(KEEP + 3, '미선발').click()
  await m.waitForTimeout(800)
  const hint = one(await m.locator('[data-offline-text]').innerText().catch(() => ''))
  ok("끊긴 동안 미선발 → '연결되면 다시 눌러 주세요 · 내용은 그대로예요' · 처리 안 됨 · 오류 화면 없음", hint === '연결되면 다시 눌러 주세요 · 내용은 그대로예요' && (await appOf(aid(KEEP + 3))).status === 'applied' && (await m.getByText('잠시 문제가 생겼어요').count()) === 0, hint)
  await m.context().setOffline(false)
  await m.locator('[data-offline="back"]').waitFor({ timeout: 10000 }).catch(() => {})

  // ── 7. PC 표: 확정이 50명을 넘으면 '확정 더 보기 (n명)' 한 줄 · 대기 줄은 모두 · 고른 사람 한 번에 미선발도 빨리
  const pc = await page({ viewport: { width: 1280, height: 900 } })
  await open(pc)
  const apps = (await rest(`applications?job_id=eq.${J}`))
  const nApproved = apps.filter((a) => a.status === 'approved').length
  const nWaiting = apps.filter((a) => a.status === 'applied').length
  const moreRow = pc.locator('table [data-show-more]', { hasText: '확정 더 보기' })
  ok(`표: 확정 ${MORE_AFTER}줄 + '확정 더 보기 (${nApproved - MORE_AFTER}명)' + 대기·보류 ${nWaiting}줄`, one(await moreRow.innerText().catch(() => '')) === `확정 더 보기 (${nApproved - MORE_AFTER}명)` && (await pc.locator('table tbody tr:has([data-decide] button:text-is("대기로"))').count()) >= MORE_AFTER && (await pc.locator('table tbody tr:has([data-decide] button:text-is("보류"))').count()) === nWaiting - 1)
  if (SHOTS) await pc.locator('table tbody tr', { has: moreRow }).screenshot({ path: `${SHOTS}/show-more-table.png` }).catch(() => {})
  await pc.locator('th [data-pick-all] input').check()
  const left = nWaiting - 1 // 보류 1명은 고르는 칸 없음
  const pbar = pc.locator('[data-bulk-bar]')
  ok(`PC '모두 고르기' → '${left}명 골랐어요'`, one(await pc.locator('[data-bulk-n]').innerText().catch(() => '')) === String(left))
  await pbar.getByRole('button', { name: `미선발 ${left}명` }).click()
  const r3 = await redrawAfter(pc, () => pbar.getByRole('button', { name: '미선발 알림 보낼까요?' }).click())
  ok(`PC: 미선발 ${left}명 → 다시 그리기 2초 안 · 보이는 만큼만`, new RegExp(`^${left}명을 미선발로 정하고 \\d+명에게 알렸어요\\.$`).test(r3.m) && r3.redraw < 2000 && r3.nodes < 12000, `${r3.m} · 응답 뒤 ${r3.redraw}ms · 칸 ${r3.nodes}개`)
  // '확정 더 보기'를 누르면 나머지 확정 줄도 모두 (누르기 전에는 만들지 않음)
  await moreRow.click()
  ok(`'확정 더 보기' → 확정 ${nApproved}줄 모두`, (await moreRow.count()) === 0 && (await pc.locator('table tbody tr:has([data-decide] button:text-is("대기로"))').count()) >= nApproved)
  const nRejected = (await rest(`applications?job_id=eq.${J}`)).filter((a) => a.status === 'rejected' || a.status === 'cancelled').length
  ok(`미선발이 ${MORE_AFTER}명을 넘어 '미선발·취소 더 보기 (${nRejected - MORE_AFTER}명)'`, one(await pc.locator('table [data-show-more]', { hasText: '미선발·취소' }).innerText().catch(() => '')) === `미선발·취소 더 보기 (${nRejected - MORE_AFTER}명)`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
