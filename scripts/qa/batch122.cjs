// 묶음 122 (정기 개선 2026-11-07 13:35 · 문의 채팅 근무 버튼을 알림에도)
// · 출퇴근 탭 '미출근 n명 · 근무 시작 버튼' / '근무 중 n명 · 근무 종료 버튼' (예전 '앱 알림' · '종료 알림')
//   보내면 근무자 문의 채팅에 안내 + 진짜 근무 버튼 (채팅 안에서 바로 근무 시작·종료) · 휴대폰 알림을 누르면 내 근무의 근무 버튼으로
// · 서명 요청 → '서류 서명하러 가기' · 계좌 요청 → '급여 계좌 등록하기' 버튼도 함께
// · 근무 종료를 깜빡한 사람에게 가는 자동 알림(다른 사람이 종료했을 때·다음 날)에도 '근무 종료' 버튼
// node scripts/qa/batch122.cjs <default 앱> <default 가짜> <fresh 앱> <fresh 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, F, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (base, p, method = 'GET', body) => fetch(`${base}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)) } return null }
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (base, uid, extra = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...extra })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const nudge = async (p, name) => {
    const chip = p.getByRole('button', { name })
    await chip.waitFor({ timeout: 15000 }).catch(() => {})
    await chip.click()
    await p.getByRole('button', { name: /에게 근무 (시작|종료) 버튼을 보낼까요\?/ }).click()
    await p.waitForTimeout(1500)
  }

  // ── 1. 근무 중인 사람에게 '근무 종료 버튼' (가짜 데이터: 근무자가 오늘 출근해 있음) ──
  const a = await pg(D, A)
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  await a.getByRole('button', { name: /근무 종료 버튼/ }).first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("출퇴근 탭 칩: '근무 중 1명 · 근무 종료 버튼'", (await a.getByRole('button', { name: '근무 중 1명 · 근무 종료 버튼' }).count()) === 1)
  await nudge(a, '근무 중 1명 · 근무 종료 버튼')
  const m1 = await until(async () => (await rest(MD, `messages?thread_user_id=eq.${W}`)).find((m) => m.from_admin && m.body.startsWith('🏁 근무 종료 확인')))
  ok("보낸 글: '🏁 근무 종료 확인' 안내 + 근무 종료 버튼 줄", !!m1 && m1.body.endsWith('\n::b:clock-out::'), JSON.stringify(m1?.body))
  const w = await pg(D, W, { geolocation: { latitude: 37.5, longitude: 127.0 }, permissions: ['geolocation'] })
  await w.goto(`${D}/me/chat?co=${C}`)
  const box = w.locator('[data-chat-clock]')
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무자 채팅: 안내 아래 진짜 '근무 종료' 버튼", (await box.locator('button[data-track]').first().innerText().catch(() => '')).includes('근무 종료'))
  ok('안내 글은 그대로 보이고 버튼 글자(::b:)는 안 보임', (await w.locator('main').innerText()).includes('근무 종료 확인') && !(await w.locator('main').innerText()).includes('::b:'))
  if (SHOTS) await box.locator('xpath=ancestor::li[1]').screenshot({ path: `${SHOTS}/clockout-nudge.png` }).catch(() => {})

  // ── 2. 미출근에게 '근무 시작 버튼' (fresh: 서명 끝 · 출근 전 · 언제 돌려도 시작 시각이 지나 있게) ──
  await rest(MF, `jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  const af = await pg(F, A)
  await af.goto(`${F}/admin/jobs/${J}?tab=att&date=${today}`)
  await af.getByRole('button', { name: /근무 시작 버튼/ }).first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("출퇴근 탭 칩: '미출근 1명 · 근무 시작 버튼'", (await af.getByRole('button', { name: '미출근 1명 · 근무 시작 버튼' }).count()) === 1)
  await nudge(af, '미출근 1명 · 근무 시작 버튼')
  const m2 = await until(async () => (await rest(MF, `messages?thread_user_id=eq.${W}`)).find((m) => m.from_admin && m.body.startsWith('⏰ 출근 확인')))
  ok("보낸 글: '⏰ 출근 확인' 안내 + 근무 시작 버튼 줄", !!m2 && m2.body.endsWith('\n::b:clock-in::'), JSON.stringify(m2?.body))
  const wf = await pg(F, W, { geolocation: { latitude: 37.5, longitude: 127.0 }, permissions: ['geolocation'] })
  await wf.goto(`${F}/me/chat?co=${C}`)
  const bf = wf.locator('[data-chat-clock]')
  await bf.waitFor({ timeout: 15000 }).catch(() => {})
  const startBtn = bf.locator('button[data-track]').first()
  ok("근무자 채팅: 진짜 '근무 시작' 버튼", (await startBtn.innerText().catch(() => '')).includes('근무 시작'))
  await startBtn.click()
  const att = await until(async () => (await rest(MF, `attendance?user_id=eq.${W}&job_id=eq.${J}`)).find((x) => x.work_date === today && x.clock_in))
  ok('채팅에서 누르면 근무 시작 기록', !!att)
  ok('360px: 옆으로 안 밀림 (근무자 채팅)', await wf.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await wf.screenshot({ path: `${SHOTS}/clockin-nudge.png` })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
