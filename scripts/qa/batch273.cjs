// 묶음 273 (정기 개선 2026-11-16 13:35 KST) — 데이터가 쌓여도 빠지지 않게
// 운영 DB 한도를 가짜 DB에서 켜고 확인: 한 번에 1000줄까지만(넘으면 말없이 잘림) · 주소 16KB까지만(넘으면 거절)
// · 서류 메뉴: 서류를 받은 근무자가 450명이어도 이름이 모두 보임 ('(탈퇴)'로 빠지지 않음 — 예전엔 450명 id를 한 주소에 넣어 거절됐음)
// · 전체 대화 내려받기: 문의가 1500개여도 처음·마지막 말이 모두 들어감 (예전엔 1000개에서 잘림)
// · 지원자 탭: 지원자가 450명이어도 화면이 뜨고 마지막 지원자 카드까지 보임 (성실도·평점·다른 확정·메모를 100명씩 나눠 물음)
// · 서류 메뉴를 여는 동안 목록 모양 회색 자리 (탭·찾기·거르기·묶음) — 다 그려지면 사라짐
// node scripts/qa/batch273.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const hex = (n, w) => n.toString(16).padStart(w, '0')
const N = 450

;(async () => {
  const now = Date.now()
  const [w1] = await rest(`users?id=eq.${W}`)
  const [doc] = await rest(`signed_docs?id=eq.${DOC}`)
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  // 근무자 450명 · 각자 서류 1장 · 공고 J에 지원 1건 (한꺼번에 넣음)
  const uid = (i) => `bbbbbbbb-0000-4000-8000-${hex(0x273000 + i, 12)}`
  const users = Array.from({ length: N }, (_, i) => ({ ...w1, id: uid(i), name: `대량${String(i).padStart(3, '0')}`, phone: `0102730${String(i).padStart(4, '0')}`, created_at: new Date(now - 864e5).toISOString() }))
  await rest('users', 'POST', users)
  await rest('signed_docs', 'POST', users.map((u, i) => ({ ...doc, id: `dddddddd-0000-4000-8000-${hex(0x273000 + i, 12)}`, user_id: u.id, company_id: C1, status: 'signed', signed_at: new Date(now - i * 1000).toISOString(), created_at: new Date(now - i * 1000).toISOString() })))
  await rest('applications', 'POST', users.map((u, i) => ({ ...wa, id: `11111111-0000-4000-8000-${hex(0x273000 + i, 12)}`, user_id: u.id, status: 'applied', held_at: null, available_dates: null, created_at: new Date(now - i * 1000).toISOString() })))
  // 근무자 W의 문의 1500개 (처음 · 마지막에 표시)
  await rest('messages', 'POST', Array.from({ length: 1500 }, (_, i) => ({ id: 2730000 + i, company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, job_id: null, body: `대량문의-${String(i).padStart(4, '0')}`, read_at: new Date(now).toISOString(), created_at: new Date(now - (1500 - i) * 60_000).toISOString() })))
  // 운영 DB 한도 켜기
  await fetch(`${MD}/__limits?rows=1000&url=16384`)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  try {
    // ── 1. 서류 메뉴: 450명 이름이 모두
    await p.goto(`${D}/admin/docs?job=${J}`, { waitUntil: 'networkidle' })
    const rows = p.locator('[data-doc-row]')
    await rows.first().waitFor({ timeout: 20000 }).catch(() => {})
    const names = await rows.evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ')))
    const bulk = names.filter((t) => /대량\d{3}/.test(t)).length
    const gone = names.filter((t) => t.includes('(탈퇴)')).length
    ok(`서류 메뉴: 대량 근무자 ${N}명 이름이 모두 보임 · '(탈퇴)'로 빠진 줄 없음`, bulk === N && gone === 0, `이름 ${bulk} · 빠짐 ${gone} · 줄 ${names.length}`)
    ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

    // ── 2. 전체 대화 내려받기: 1500개 처음·마지막
    const txt = await p.evaluate(async () => (await fetch('/admin/chat/export')).text())
    const count = (txt.match(/대량문의-\d{4}/g) ?? []).length
    ok('전체 대화 내려받기: 문의 1500개가 모두 (처음 0000 · 마지막 1499)', txt.includes('대량문의-0000') && txt.includes('대량문의-1499') && count === 1500, `들어간 수 ${count}`)

    // ── 3. 지원자 탭: 450명이어도 뜨고 마지막 지원자까지
    const res = await p.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
    const last = p.locator(`#app-11111111-0000-4000-8000-${hex(0x273000 + N - 1, 12)}`)
    await last.first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => {})
    ok(`지원자 탭: 지원자 ${N + 1}명이어도 화면이 뜨고 마지막 지원자 카드까지 있음`, res.status() === 200 && (await last.count()) > 0 && (await p.locator('text=잠시 문제가 생겼어요').count()) === 0, `상태 ${res.status()}`)

    // ── 4. 서류 메뉴 여는 동안 목록 모양 회색 자리
    await fetch(`${MD}/__limits`)
    await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await fetch(`${MD}/__latency?ms=900`)
    const link = p.locator('a[href="/admin/docs"]').first()
    const hasLink = (await link.count()) > 0
    if (hasLink) await link.evaluate((a) => a.click())
    else await p.evaluate(() => { location.href = '/admin/docs' })
    const sk = p.locator('[data-skeleton="admin-docs"]')
    const shown = await sk.waitFor({ timeout: 8000 }).then(() => true, () => false)
    if (SHOTS && shown) await p.screenshot({ path: `${SHOTS}/docs-skeleton.png` }).catch(() => {})
    ok('서류 메뉴를 여는 동안 목록 모양 회색 자리 (탭·찾기·거르기·묶음)', shown && (await sk.locator('.card').count()) >= 3)
    await fetch(`${MD}/__latency?ms=5`)
    await p.locator('[data-docs-search]').waitFor({ timeout: 20000 }).catch(() => {})
    ok('다 그려지면 회색 자리는 사라짐', (await sk.count()) === 0 && (await p.locator('[data-docs-search]').count()) === 1)
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/docs-loaded.png` }).catch(() => {})
  } finally {
    await fetch(`${MD}/__limits`).catch(() => {})
    await fetch(`${MD}/__latency?ms=5`).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch(async (e) => { await fetch(`${MD}/__limits`).catch(() => {}); console.error(e); process.exit(2) })
