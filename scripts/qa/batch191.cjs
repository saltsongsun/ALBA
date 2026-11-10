// 묶음 191 (정기 개선 2026-11-11 07:35 KST)
// · 관리자 문의 목록: 읽었지만 아직 답하지 않은 문의에 '답장 전' 표시 + '답장 전 n' 모아 보기
//   (읽고 나면 빨간 숫자가 사라져 답할 문의가 묻히던 것 · 최근 7일 · 지각 알림처럼 알리기만 하는 글은 빼고)
// · 바로 처리할 요청은 종류를 짧게 표시: 출근 확인 · 출근 기록(급한 것, 빨강) · 기록 정정 · 확정 문의 — 머리말 줄은 빼고 내용만
// (가짜 DB는 정렬을 무시해 '가장 먼저 넣은 글'이 마지막 글로 보임 → 대화마다 글 하나로 확인)
// node scripts/qa/batch191.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C1 = '99999999-0000-4000-8000-000000000099'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000191${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now()
  const [w] = await rest(`users?id=eq.${W}`)
  let mid = 191000
  // 대화마다 글 하나: read=읽음 여부 · ago=며칠 전 · admin=관리자가 쓴 글
  const thread = async (n, name, body, { read = true, ago = 0, admin = false } = {}) => {
    const user = { ...w, id: U(n), name, phone: `0101910000${n}`, photo_at: null, attendance: [], ratings: [] }
    await rest('users', 'POST', user)
    const at = new Date(now - ago * 864e5 - n * 60e3).toISOString()
    await rest('messages', 'POST', { id: ++mid, thread_user_id: U(n), sender_id: admin ? A : U(n), from_admin: admin, job_id: null, company_id: C1, body, read_at: read ? at : null, created_at: at, job: null, sender: { name: admin ? '관리자' : name }, user: { id: U(n), name, phone: user.phone, photo_at: null } })
  }
  await thread(1, '일번', '주차할 수 있나요?') // 읽음 · 답 안 함 → 답장 전
  await thread(2, '이번', '식사가 제공되나요?', { read: false }) // 안 읽음 → 빨간 숫자
  await thread(3, '삼번', '🕒 지각 알림\n약 10분 늦어요 (도착 예정 09:10)') // 알리기만 → 표시 없음
  await thread(4, '사번', '복장이 궁금해요', { ago: 8 }) // 8일 전 → 표시 없음
  await thread(5, '오번', '지원했는데 확정 여부가 궁금해요.') // 읽음 · 답 안 함 → 답장 전 + '확정 문의'
  await thread(6, '육번', '📍 출근 확인 요청\n현장인데 위치 확인이 안 돼요 (약 350m)', { read: false }) // 안 읽음 + '출근 확인'(급함)
  await thread(7, '칠번', '확인했습니다.', { admin: true }) // 관리자가 마지막 → 표시 없음
  await thread(8, '팔번', '오늘 출근했는데 근무 시작을 못 눌렀어요. 기록 부탁드려요.', { read: false }) // '출근 기록'(급함)
  await thread(9, '구번', '✏️ 기록 정정 요청\n11/10(화) 종료 18:00 → 18:30 · 사유: 정리하느라 늦게 끝남') // 읽음 → 답장 전 + '기록 정정'

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const row = (n) => a.locator(`[data-inbox-row="${U(n)}"]`)
  const label = (n) => row(n).locator('[data-inbox-noreply]')
  const tag = (n) => row(n).locator('[data-inbox-tag]')
  const snippet = async (n) => one(await row(n).locator('[data-chat-snippet]').innerText().catch(() => ''))
  const chip = a.locator('[data-inbox-noreply-chip]')

  // ── 1. 목록: 답장 전 표시
  await a.goto(`${D}/admin/chat`)
  await row(1).waitFor({ timeout: 15000 }).catch(() => {})
  ok("읽고 답하지 않은 문의: '답장 전'", one(await label(1).innerText().catch(() => '')) === '답장 전' && (await label(5).count()) === 1 && (await label(9).count()) === 1)
  ok('안 읽은 문의는 빨간 숫자만 (답장 전 아님)', (await label(2).count()) === 0 && (await label(6).count()) === 0 && one(await row(2).innerText()).endsWith('1'))
  ok('알리기만 하는 글(지각 알림) · 8일 지난 글 · 내가 답한 대화: 표시 없음', (await label(3).count()) === 0 && (await label(4).count()) === 0 && (await label(7).count()) === 0)
  ok("모아 보기 칸: '답장 전 3'", one(await chip.innerText().catch(() => '')) === '답장 전 3')

  // ── 2. 요청 종류 표시
  ok("'확정 문의' · '기록 정정' (파랑)", one(await tag(5).innerText().catch(() => '')) === '확정 문의' && (await tag(5).getAttribute('data-inbox-tag')) === 'ask' && one(await tag(9).innerText().catch(() => '')) === '기록 정정')
  ok("'출근 확인' · '출근 기록' (급한 것, 빨강)", one(await tag(6).innerText().catch(() => '')) === '출근 확인' && (await tag(6).getAttribute('data-inbox-tag')) === 'urgent' && one(await tag(8).innerText().catch(() => '')) === '출근 기록' && (await tag(8).getAttribute('data-inbox-tag')) === 'urgent')
  ok('머리말 줄은 빼고 내용만 (같은 말 반복 안 함)', (await snippet(6)) === '출근 확인 현장인데 위치 확인이 안 돼요 (약 350m)' && (await snippet(9)).startsWith('기록 정정 11/10(화) 종료 18:00 → 18:30'), `${await snippet(6)} | ${await snippet(9)}`)
  ok('일반 문의·지각 알림에는 종류 표시 없음', (await tag(1).count()) === 0 && (await tag(3).count()) === 0 && (await tag(7).count()) === 0)
  const fit = await row(5).evaluate((el) => { const s = el.querySelector('[data-chat-snippet]'), l = el.querySelector('[data-inbox-noreply]'); return { one: s.getBoundingClientRect().height < 26, right: Math.round(l.getBoundingClientRect().right), w: innerWidth, lh: Math.round(l.getBoundingClientRect().height) } })
  ok('한 줄 · 360px 옆으로 안 밀림', fit.one && fit.right <= fit.w - 16 && fit.lh < 22 && (await noSide(a)), JSON.stringify(fit))
  if (SHOTS) { await a.waitForTimeout(500); await a.screenshot({ path: `${SHOTS}/inbox.png`, fullPage: true }).catch(() => {}) }

  // ── 3. '답장 전'만 모아 보기
  await chip.click()
  await a.waitForURL((u) => u.searchParams.get('noreply') === '1', { timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(400)
  const shown = await a.locator('[data-inbox-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-inbox-row').slice(-2)).sort())
  ok('누르면 답장 전 3건만', JSON.stringify(shown) === JSON.stringify(['01', '05', '09']), JSON.stringify(shown))
  ok('고른 칸은 주황으로 표시', await chip.evaluate((el) => el.className.includes('bg-amber-500')))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/inbox-noreply.png` }).catch(() => {})
  // 전체로 돌아가기
  await a.getByRole('link', { name: /^전체 \d+/ }).click()
  await a.waitForURL((u) => !u.searchParams.get('noreply'), { timeout: 15000 }).catch(() => {})
  await row(2).waitFor({ timeout: 10000 }).catch(() => {})
  ok("'전체'를 누르면 모두 다시 보임", (await a.locator('[data-inbox-row]').count()) >= 9)

  // ── 4. 답장하면 표시가 사라짐 (그 대화의 마지막 글이 내 답장)
  for (const n of [1, 5, 9]) {
    await rest(`messages?thread_user_id=eq.${U(n)}`, 'DELETE')
    await rest('messages', 'POST', { id: ++mid, thread_user_id: U(n), sender_id: A, from_admin: true, job_id: null, company_id: C1, body: '확인했습니다.', read_at: null, created_at: new Date().toISOString(), job: null, sender: { name: '관리자' }, user: { id: U(n), name: 'x', phone: '01000000000', photo_at: null } })
  }
  await a.goto(`${D}/admin/chat`)
  await row(1).waitFor({ timeout: 15000 }).catch(() => {})
  ok('답장한 대화: 표시 없음 · 모아 보기 칸도 사라짐', (await label(1).count()) === 0 && (await label(5).count()) === 0 && (await chip.count()) === 0)
  await a.goto(`${D}/admin/chat?noreply=1`)
  await a.getByText('답장을 기다리는 문의가 없어요').waitFor({ timeout: 15000 }).catch(() => {})
  ok("답장 전이 없을 때 그 주소: '답장을 기다리는 문의가 없어요'", (await a.getByText('답장을 기다리는 문의가 없어요').count()) === 1 && one(await chip.innerText().catch(() => '')) === '답장 전 0')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
