// 묶음 275 (사용자 요청 2026-11-16 "문의가 너무 많으니까 우리가 자동으로 보낸거는 띄우지 말고 직접친거를 위로 보내줘")
// · 관리자 문의 목록은 사람이 직접 쓴 마지막 글(근무자 글 · 담당자가 직접 쓴 답장) 순서 · 미리보기도 그 글
//   자동 안내(확정·미선발·정산일·공지 등)가 나중에 와도 위로 올라오지 않음
// · 자동 안내만 있는 대화는 맨 아래 '알림만 보낸 대화 n'으로 접혀 있음 (펼치면 이름 · 안내 첫 줄 · 외 n개)
// · 그 근무자가 답하면 위 목록 맨 위로
// · 확정 알림을 1100명에게 보내도(운영 DB 1000줄 한도) 3일 전 근무자 문의가 목록에서 사라지지 않음
// node scripts/qa/batch275.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const hex = (n) => n.toString(16).padStart(12, '0')
const U = (i) => `bbbbbbbb-0000-4000-8000-${hex(0x275000 + i)}`
const user = (i, name) => ({ id: U(i), name, phone: `0102750${String(i).padStart(4, '0')}`, photo_at: null, member_type: 'worker' })
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()
let mid = 2750000
const msg = (i, name, fromAdmin, body, min, read = true) => ({ id: mid++, company_id: C1, thread_user_id: U(i), sender_id: fromAdmin ? A : U(i), from_admin: fromAdmin, job_id: null, body, read_at: read ? ago(0) : null, created_at: ago(min), user: user(i, name) })

;(async () => {
  // A: 3일 전 근무자 문의 · B: 자동 안내만 (방금 확정 + 정산일) · C: 하루 전 근무자 문의 + 방금 확정 안내 · E: 담당자가 직접 쓴 글만 (2일 전)
  await rest('messages', 'POST', [
    msg(1, '오래된문의', false, '주차 가능한가요?', 3 * 1440),
    msg(2, '알림만받음', true, '✅ 근무가 확정됐어요\n경상남도 생활체육대축전\n11/16(월) 09:00~18:00', 2),
    msg(2, '알림만받음', true, '💰 정산 예정일 안내\n11/20(목)에 들어가요', 1),
    msg(3, '어제문의', false, '복장은 검은색이면 되나요?', 1440),
    msg(3, '어제문의', true, '✅ 근무가 확정됐어요\n경상남도 생활체육대축전', 3),
    msg(5, '직접연락', true, '내일 7시까지 정문으로 와 주세요', 2 * 1440),
  ])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const order = () => p.locator('[data-inbox-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-inbox-row')))
  try {
    // ── 1. 직접 쓴 글 순서 · 자동 안내만 있는 대화는 접힘
    await p.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
    await p.locator('[data-chat-search]').waitFor({ timeout: 15000 }).catch(() => {})
    let ids = await order()
    ok('어제 근무자 문의(C)가 3일 전 문의(A)보다 위 · 담당자가 직접 쓴 대화(E)도 목록에 (A보다 위)', ids.indexOf(U(3)) > -1 && ids.indexOf(U(3)) < ids.indexOf(U(5)) && ids.indexOf(U(5)) < ids.indexOf(U(1)), JSON.stringify(ids.map((x) => x.slice(-6))))
    ok('자동 안내만 있는 대화(B)는 목록에 없음', !ids.includes(U(2)))
    const c = one(await p.locator(`[data-inbox-row="${U(3)}"] [data-chat-snippet]`).textContent().catch(() => ''))
    ok("C 미리보기: 나중에 온 확정 안내가 아니라 근무자 글 '복장은 검은색이면 되나요?'", c === '복장은 검은색이면 되나요?', c)
    const fold = p.locator('[data-inbox-auto]')
    const sum = one(await fold.locator('summary').textContent().catch(() => ''))
    ok("맨 아래 '알림만 보낸 대화 1' (접혀 있음)", sum === '알림만 보낸 대화 1' && !(await fold.evaluate((d) => d.open).catch(() => true)), sum)
    await fold.locator('summary').click()
    const brow = one(await fold.locator(`[data-inbox-auto-row="${U(2)}"]`).textContent().catch(() => ''))
    ok("펼치면 '알림만받음 · 시각 · 💰 정산 예정일 안내 외 1개'", /^알림만받음 ?[0-9/:()월화수목금토일]+ ?💰 정산 예정일 안내 외 1개$/.test(brow), brow)
    ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
    if (SHOTS) {
      await fold.scrollIntoViewIfNeeded().catch(() => {})
      await p.screenshot({ path: `${SHOTS}/inbox-auto-fold.png` }).catch(() => {})
    }

    // ── 2. B가 답하면 위 목록 맨 위로
    await rest('messages', 'POST', [msg(2, '알림만받음', false, '정산일 확인했어요. 감사합니다', 0, false)])
    await p.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
    ids = await order()
    ok('B가 답하면 목록 맨 위 · 알림 접힘에서 빠짐', ids[0] === U(2) && (await p.locator('[data-inbox-auto]').count()) === 0, ids[0]?.slice(-6))

    // ── 3. 확정 알림 1100명 (운영 DB 1000줄 한도) → 3일 전 문의(A)가 그대로 보임
    const many = Array.from({ length: 1100 }, (_, i) => msg(100 + i, `대량${i}`, true, '✅ 근무가 확정됐어요\n큰 행사', 0.5))
    await rest('messages', 'POST', many)
    await fetch(`${MD}/__limits?rows=1000&url=16384`)
    await p.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
    ids = await order()
    await fetch(`${MD}/__limits`)
    const sum2 = one(await p.locator('[data-inbox-auto] summary').textContent().catch(() => ''))
    ok('확정 알림 1100개 뒤에도 3일 전 근무자 문의(A)가 목록에 그대로', ids.includes(U(1)) && ids.includes(U(3)), `목록 ${ids.length}개`)
    const bulk = new Set(many.map((m) => m.thread_user_id))
    ok("확정 알림만 받은 사람들은 '알림만 보낸 대화'로 (목록을 덮지 않음)", ids.every((x) => !bulk.has(x)) && /^알림만 보낸 대화 \d+$/.test(sum2), `${sum2} · 목록 속 알림만 받은 사람 ${ids.filter((x) => bulk.has(x)).length}`)
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/inbox-top.png` }).catch(() => {})
  } finally {
    await fetch(`${MD}/__limits`).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch(async (e) => { await fetch(`${MD}/__limits`).catch(() => {}); console.error(e); process.exit(2) })
