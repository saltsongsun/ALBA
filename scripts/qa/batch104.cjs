// 묶음 104: 일찍 끝났어도 시간 인정받기 (사용자 요청 2026-11-07 "일찍 퇴근해도 정상 지급할 때가 있어서 · 관리자 승인하면 근로조건대로 인정")
// · 근무자: 예정(18:00)보다 일찍 종료하면 '오늘 근무 완료' 아래 '18:00까지 시간 인정받기' → 요청 → '담당자 확인 중'
// · 관리자: 대시보드 확인할 일 '시간 인정 요청' · 출퇴근 탭 '🙏 시간 인정 요청 · 15:00에 끝났지만 근로조건대로 18:00까지' [18:00까지 인정] [실제 시각대로]
// · 인정 → 종료 시각이 18:00으로 보정(정산 그대로) · 근무자에게 '근로조건대로 18:00까지 인정했어요' · 근무자 화면에서 버튼 사라짐
// · 실제 시각대로 → 그대로 · 근무자에게 알림
// · 가독성: 흐린 글씨 색이 진해짐 (#6b7684)
// node scripts/qa/batch104.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const at = (t) => new Date(`${today}T${t}:00+09:00`).toISOString()

;(async () => {
  // 준비: 오늘 09:00~18:00 · 근무자는 09:00 출근 · 15:00 종료(일찍) · 서류는 서명 끝
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '09:00:00', end_time: '18:00:00', status: 'closed' })
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: today, clock_in: at('09:00'), clock_out: at('15:00'), adj_in: null, adj_out: null, paid: false })
  for (const d of await rest(`signed_docs?user_id=eq.${W}`)) await rest(`signed_docs?id=eq.${d.id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await pg(W)
  const a = await pg(A)
  const ask = async () => {
    await w.goto(`${D}/me`)
    const box = w.locator('[data-full-time]')
    await box.waitFor({ timeout: 10000 }).catch(() => {})
    return box
  }

  // ── 1. 근무자 요청 ──
  const box = await ask()
  ok("근무자: '예정(18:00)보다 일찍 끝났어요' + '18:00까지 시간 인정받기'", (await box.innerText().catch(() => '')).includes('예정(18:00)보다 일찍 끝났어요') && (await w.locator('[data-full-time-open]').innerText()).includes('18:00까지 시간 인정받기'))
  ok('360px: 옆으로 안 밀림 (근무자)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await w.locator('[data-full-time-open]').click()
  await w.locator('[data-full-time] input[name=reason]').fill('비가 와서 담당자가 일찍 보냈어요')
  await w.getByRole('button', { name: '담당자에게 요청하기' }).click()
  await w.locator('[data-full-time-sent]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("요청 → '근로조건대로 18:00까지 인정해 달라고 요청했어요'", (await w.locator('[data-full-time-sent]').innerText().catch(() => '')).includes('근로조건대로 18:00까지'))
  const msgs = await rest(`messages?thread_user_id=eq.${W}`)
  ok('담당자 문의함에 시간 인정 요청 기록', msgs.some((m) => !m.from_admin && m.body.includes('일찍 끝났지만 근로조건대로 시간 인정 요청') && m.body.includes('실제 종료 18:00')))
  await w.goto(`${D}/me`)
  await w.locator('main').waitFor()
  ok("다시 열어도 '…요청했어요 · 담당자 확인 중'", (await w.locator('[data-full-time-sent]').innerText().catch(() => '')).includes('담당자 확인 중'))

  // ── 2. 관리자 ──
  await a.goto(`${D}/admin`)
  await a.locator('main').waitFor()
  ok("대시보드 확인할 일: '시간 인정 요청'", (await a.getByText(/시간 인정 요청 ·/).count()) >= 1)
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  const card = a.locator('[data-full-time-ask]')
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  ok("출퇴근 탭: '시간 인정 요청 · 15:00에 끝났지만 근로조건대로 18:00까지' + 사유", (await card.innerText().catch(() => '')).includes('15:00에 끝났지만 근로조건대로 18:00까지') && (await card.innerText()).includes('비가 와서'))
  await card.getByRole('button', { name: '18:00까지 인정' }).click()
  await a.getByText('근로조건대로 18:00까지 인정했어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  const [after] = await rest(`attendance?id=eq.${att.id}`)
  ok('인정 → 종료 시각이 18:00으로 보정 (원래 기록은 15:00 그대로)', after.adj_out && new Date(after.adj_out).toISOString() === at('18:00') && new Date(after.clock_out).toISOString() === at('15:00'), JSON.stringify({ adj: after.adj_out, out: after.clock_out }))
  ok("근무자에게 '근로조건대로 18:00까지 인정했어요'", (await rest(`messages?thread_user_id=eq.${W}`)).some((m) => m.from_admin && m.body.includes('근로조건대로 18:00까지 인정했어요')))
  await w.goto(`${D}/me`)
  await w.locator('main').waitFor()
  await w.waitForTimeout(500)
  ok('근무자 화면: 인정 뒤에는 요청 버튼 없음 · 09:00 ~ 18:00', (await w.locator('[data-full-time], [data-full-time-sent]').count()) === 0 && (await w.locator('main').innerText()).includes('09:00 ~ 18:00'))

  // ── 3. 실제 시각대로 ──
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { adj_out: null })
  await ask()
  await w.locator('[data-full-time-open]').click()
  await w.getByRole('button', { name: '담당자에게 요청하기' }).click()
  await w.locator('[data-full-time-sent]').waitFor({ timeout: 10000 }).catch(() => {})
  await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${today}`)
  const card2 = a.locator('[data-full-time-ask]')
  await card2.waitFor({ timeout: 10000 }).catch(() => {})
  await card2.getByRole('button', { name: '실제 시각대로' }).click()
  await card2.getByRole('button', { name: '한 번 더 누르면 실제대로 둬요' }).click()
  await a.getByText('실제 종료 시각대로 두고 근무자에게 알렸어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  const [kept] = await rest(`attendance?id=eq.${att.id}`)
  ok("실제 시각대로 → 그대로(15:00) · 근무자에게 '실제 종료 시각대로 계산해요'", !kept.adj_out && (await rest(`messages?thread_user_id=eq.${W}`)).some((m) => m.from_admin && m.body.includes('실제 종료 시각대로 계산해요')))

  // ── 4. 가독성: 흐린 글씨 색 ──
  const mute = await a.evaluate(() => { const el = document.createElement('span'); el.className = 'text-mute'; document.body.appendChild(el); const c = getComputedStyle(el).color; el.remove(); return c })
  ok('흐린 글씨가 진해짐 (#6b7684)', mute.replace(/\s/g, '') === 'rgb(107,118,132)', mute)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
