// 묶음 276 (정기 개선 2026-11-16 17:36 KST · 문의함 정리 이어서)
// · 관리자 홈 '읽고 아직 답하지 않은 문의': 근무자 질문 뒤에 우리가 자동으로 보낸 안내(확정 등)만 왔으면 아직 '답장 전'으로 셈
//   (예전: 마지막 글이 담당자 쪽이면 답한 것으로 쳐서 할 일에서 사라졌음 — 문의 목록 '답장 전'과 같은 기준)
// · 관리자 대화 화면: 자동 안내는 한 줄(제목 · 시각)로 작게 · 누르면 전체 내용 · 직접 쓴 말풍선은 그대로
// · 근무자 화면은 그대로 (안내 전체가 말풍선으로)
// node scripts/qa/batch276.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()

;(async () => {
  // 근무자 W의 대화: 기존 글은 모두 예전으로 · 방금 근무자 질문(읽음) → 그 뒤 자동 확정 안내
  const [w] = await rest(`users?id=eq.${W}`)
  const user = { id: W, name: w.name, phone: w.phone, photo_at: null, member_type: 'worker' }
  for (const m of await rest(`messages?thread_user_id=eq.${W}`)) await rest(`messages?id=eq.${m.id}`, 'PATCH', { created_at: ago(30 * 1440), read_at: ago(30 * 1440) })
  await rest('messages', 'POST', [
    { id: 2760001, company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, job_id: null, body: '내일 주차 되나요?', read_at: ago(5), created_at: ago(10), user },
    { id: 2760002, company_id: C1, thread_user_id: W, sender_id: A, from_admin: true, job_id: null, body: '✅ 근무가 확정됐어요\n경상남도 생활체육대축전\n11/16(월) 09:00~18:00 · 창원', read_at: null, created_at: ago(2), user },
  ])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 관리자 홈: 답장 전 할 일
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const todo = p.locator('[data-todo="noreply"]')
  await todo.waitFor({ timeout: 15000 }).catch(() => {})
  const tt = one(await todo.textContent().catch(() => ''))
  ok("홈 '읽고 아직 답하지 않은 문의 1건' (뒤에 온 자동 확정 안내는 답장으로 안 침)", tt.includes('읽고 아직 답하지 않은 문의') && tt.includes('1건'), tt)

  // ── 2. 관리자 대화: 자동 안내는 한 줄 · 누르면 전체
  await p.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  const note = p.locator('[data-auto-notice]').last()
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  const head = one(await note.locator('summary').textContent().catch(() => ''))
  ok("자동 안내는 한 줄: '✅ 근무가 확정됐어요' · 시각 · 안 읽음 1", /^✅ 근무가 확정됐어요 ?1? ?\d{1,2}:\d{2}$/.test(head) && !(await note.evaluate((d) => d.open)), head)
  ok('접혀 있을 때 안내 본문은 안 보임', !(await note.locator('[data-auto-notice-body]').isVisible().catch(() => false)))
  const h = await note.locator('summary').evaluate((el) => Math.round(el.getBoundingClientRect().height))
  ok('한 줄 높이 (40px 이하)', h <= 40, `${h}px`)
  ok('접는 칸 기본 화살표(›)는 없음 (알약 안 ⌄ 하나만)', (await note.locator('summary').evaluate((el) => getComputedStyle(el, '::before').display)) === 'none')
  ok("근무자가 직접 쓴 '내일 주차 되나요?'는 그대로 말풍선", (await p.locator('ol li p', { hasText: '내일 주차 되나요?' }).count()) === 1)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/thread-auto-collapsed.png` }).catch(() => {})
  await note.locator('summary').click()
  await p.waitForTimeout(300)
  const body = one(await note.locator('[data-auto-notice-body]').textContent().catch(() => ''))
  ok('누르면 전체 내용 (공고 · 날짜)', (await note.locator('[data-auto-notice-body]').isVisible()) && body.includes('경상남도 생활체육대축전') && body.includes('11/16(월) 09:00~18:00'), body)
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/thread-auto-open.png` }).catch(() => {})

  // ── 3. 근무자 화면은 그대로 (안내 전체가 말풍선)
  const wctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await wctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await wctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const wp = await wctx.newPage()
  wp.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await wp.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  await wp.locator('ol li').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('근무자 화면: 확정 안내가 말풍선 그대로 (접히지 않음)', (await wp.locator('[data-auto-notice]').count()) === 0 && (await wp.locator('ol li p', { hasText: '경상남도 생활체육대축전' }).count()) >= 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
