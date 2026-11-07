// 묶음 119 (사용자 요청 2026-11-07 "문의 채팅에 버튼을 보내주는 기능 · 예: 근무시작 버튼을 못 찾는 사람에게")
// · 담당자 문의 답장: '버튼 보내기' → 바로 가기 버튼 고르기 (근무 시작·종료 · 서류 서명 · 계좌 · 사진 · 알림 · 근무 내역 · 알바 보기)
//   누르면 바로 보냄 · 입력칸이 비어 있으면 기본 안내 한 줄 + 버튼 / 쓴 글이 있으면 그 글 + 버튼
// · 근무자 화면: 말풍선 아래 누르는 버튼 → '근무 시작하러 가기'는 내 근무의 근무 버튼으로 가서 버튼 둘레가 번쩍임
// · 담당자 화면: 어떻게 보이는지만 (누를 수 없음) · 목록 미리보기·알림은 '[버튼] 근무 시작하러 가기'
// · 막기: 근무자는 버튼을 보낼 수 없음 · 목록에 없는 버튼은 거절
// node scripts/qa/batch119.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const msgs = async () => (await rest(`messages?thread_user_id=eq.${W}`)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id))
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)) } return null }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const before = (await msgs()).length

  // ── 1. 담당자: 버튼 고르기 → 바로 보냄 (입력칸 비어 있음 → 기본 안내 한 줄) ──
  const a = await pg(A)
  await a.goto(`${D}/admin/chat/${W}`)
  const toggle = a.locator('[data-button-toggle]')
  await toggle.waitFor({ timeout: 15000 }).catch(() => {})
  await toggle.click()
  const picker = a.locator('[data-button-picker]')
  const opts = await picker.locator('[data-button-option]').evaluateAll((els) => els.map((e) => e.innerText.trim()))
  ok("'버튼 보내기' → 고르는 칸 (근무 시작·종료 · 서명 · 계좌 · 사진 · 알림 · 내역 · 알바)", opts.length === 8 && opts[0] === '근무 시작하러 가기' && opts.includes('서류 서명하러 가기') && opts.includes('급여 계좌 등록하기'), opts.join(','))
  ok('고르는 칸 글자 한 줄씩 · 360px 안', (await picker.locator('[data-button-option] span').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1))) && (await wide(a)))
  if (SHOTS) await picker.screenshot({ path: `${SHOTS}/picker.png` }).catch(() => {})
  await picker.locator('[data-button-option=clock-in]').click()
  const m1 = await until(async () => (await msgs()).slice(before).find((m) => m.from_admin && m.body.includes('::b:clock-in::')))
  ok("보낸 글: 기본 안내 한 줄 + 버튼 줄", !!m1 && m1.body === '아래 버튼을 누르면 근무 시작 버튼이 있는 곳으로 바로 가요.\n::b:clock-in::', JSON.stringify(m1?.body))
  await a.locator('[data-chat-button=clock-in]').first().waitFor({ timeout: 8000 }).catch(() => {})
  const adminBtn = a.locator('[data-chat-button=clock-in]').first()
  ok("담당자 화면: 말풍선 아래 '근무 시작하러 가기 · 버튼' (누를 수 없음 · 글자 그대로 안 보임)", (await adminBtn.innerText()).includes('근무 시작하러 가기') && (await adminBtn.evaluate((el) => el.tagName)) === 'SPAN' && !(await a.locator('main').innerText()).includes('::b:'))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/admin-thread.png` })

  // ── 2. 쓴 글이 있으면 그 글 + 버튼 · 보낸 뒤 입력칸 비움 ──
  await a.locator('textarea[name=body]').fill('서명이 하나 남았어요. 눌러서 해 주세요')
  await toggle.click()
  await picker.locator('[data-button-option=sign]').click()
  const m2 = await until(async () => (await msgs()).slice(before).find((m) => m.from_admin && m.body.includes('::b:sign::')))
  ok("쓴 글이 있으면 '그 글 + 버튼'", !!m2 && m2.body === '서명이 하나 남았어요. 눌러서 해 주세요\n::b:sign::', JSON.stringify(m2?.body))
  await a.waitForTimeout(500)
  ok('보낸 뒤 입력칸 비움', (await a.locator('textarea[name=body]').inputValue()) === '')

  // ── 3. 목록에 없는 버튼은 거절 ──
  const n3 = (await msgs()).length
  await a.locator('textarea[name=body]').fill('이상한 버튼\n::b:evil::')
  await a.locator('button[type=submit][aria-label="보내기"]').click()
  await a.waitForTimeout(1500)
  ok("목록에 없는 버튼: '보낼 수 없는 버튼이에요' · 저장 안 됨", (await a.locator('main').innerText()).includes('보낼 수 없는 버튼이에요') && (await msgs()).length === n3)

  // ── 4. 담당자 문의 목록 미리보기 ──
  await a.goto(`${D}/admin/chat`)
  await a.locator('main').waitFor()
  ok("담당자 문의 목록: '[버튼] 서류 서명하러 가기' (글자 그대로 안 보임)", (await a.locator('main').innerText()).includes('[버튼] 서류 서명하러 가기') && !(await a.locator('main').innerText()).includes('::b:'))

  // ── 5. 근무자: 누르는 버튼 → 근무 버튼으로 가서 번쩍임 ──
  const w = await pg(W)
  await w.goto(`${D}/me/chat?co=${C}`)
  const wb = w.locator('a[data-chat-button=clock-in]').first()
  await wb.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무자 화면: 누르는 버튼 '근무 시작하러 가기' → /me#clock", (await wb.getAttribute('href')) === '/me#clock' && (await wb.innerText()).includes('근무 시작하러 가기') && !(await w.locator('main').innerText()).includes('::b:'))
  ok("서명 버튼 → /me#sign-docs", (await w.locator('a[data-chat-button=sign]').first().getAttribute('href')) === '/me#sign-docs')
  ok('버튼 한 줄 · 360px 옆으로 안 밀림', (await wb.evaluate((el) => el.getBoundingClientRect().height < 56)) && (await wide(w)))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/worker-chat.png` })
  await wb.click()
  await w.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 10000 }).catch(() => {})
  const flashed = await until(() => w.locator('[data-flash]').count().then((n) => n === 1), 6000)
  ok('내 근무로 와서 근무 버튼 둘레가 번쩍임', new URL(w.url()).hash === '#clock' && !!flashed, w.url())
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/worker-flash.png` })

  // ── 6. 근무자는 버튼을 보낼 수 없음 ──
  await w.goto(`${D}/me/chat?co=${C}`)
  await w.locator('textarea[name=body]').waitFor({ timeout: 15000 }).catch(() => {})
  const n6 = (await msgs()).length
  await w.locator('textarea[name=body]').fill('::b:clock-in::')
  await w.locator('button[type=submit][aria-label="보내기"]').click()
  await w.waitForTimeout(1500)
  ok("근무자가 버튼 모양 글을 보내면 '보낼 수 없는 내용이에요' · 저장 안 됨", (await w.locator('main').innerText()).includes('보낼 수 없는 내용이에요') && (await msgs()).length === n6)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
