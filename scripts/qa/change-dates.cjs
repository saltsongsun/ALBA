// 여러 날 행사: 근무 가능한 날 바꾸기 (지원 중: 자유롭게 / 확정: 빼기만 + 담당자 알림)
// node scripts/qa/change-dates.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const [d0, d1, d2] = [day(0), day(1), day(2)]
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})` }
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d0, end_date: d2 })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p
  }
  const chip = (p, d) => p.locator(`input[name=dates][value="${d}"]`)
  const toggle = (p, d) => p.locator('label', { has: chip(p, d) }).click()
  const save = (p) => p.getByRole('button', { name: '바꾼 날로 저장' }).click()

  // ── 지원 중 (오늘만 가능 → 내일·모레로) ──
  const a = await pg(AP)
  await a.goto(`${D}/jobs/${J}`)
  await a.getByText('📅 근무 가능한 날 바꾸기').click()
  ok('지원 중: 지금 고른 날 체크', (await chip(a, d0).isChecked()) && !(await chip(a, d1).isChecked()))
  await toggle(a, d0); await toggle(a, d1); await toggle(a, d2)
  await save(a)
  ok('바꿨다는 안내', await see(a, '근무 가능한 날을 바꿨어요'))
  let app = (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]
  ok('저장: 내일·모레', JSON.stringify(app.available_dates) === JSON.stringify([d1, d2]), JSON.stringify(app.available_dates))
  ok('화면: 가능한 날 표시', await see(a, `가능한 날: ${fmt(d1)}, ${fmt(d2)}`))
  await a.getByText('📅 근무 가능한 날 바꾸기').click()
  await toggle(a, d1); await toggle(a, d2)
  await save(a)
  ok('하나도 안 고르면 막힘', await see(a, '근무 가능한 날을 하나 이상 골라 주세요'))

  // ── 확정 (전체 날짜) → 내일만 빼기 ──
  const w = await pg(WK)
  await w.goto(`${D}/jobs/${J}`)
  await w.getByText('📅 이날은 못 가요 · 근무일 빼기').click()
  ok('확정: 모든 날 체크', (await chip(w, d0).isChecked()) && (await chip(w, d1).isChecked()) && (await chip(w, d2).isChecked()))
  await toggle(w, d1)
  await w.locator('input[name=reason][maxlength="100"]').fill('둘째 날 학교 일정')
  await save(w)
  ok('뺐다는 안내', await see(w, `${fmt(d1)} 근무를 뺐어요. 담당자에게 알렸어요.`))
  app = (await rest(`applications?job_id=eq.${J}&user_id=eq.${WK}`))[0]
  ok('저장: 오늘·모레만', JSON.stringify(app.available_dates) === JSON.stringify([d0, d2]), JSON.stringify(app.available_dates))
  ok('확정은 그대로', app.status === 'approved')
  const msgs = await rest(`messages?thread_user_id=eq.${WK}`)
  const m = msgs.find((x) => x.body.startsWith('⚠️ 근무일 취소'))
  ok('담당자 문의함에 알림 (날짜·사유)', !!m && m.body.includes(fmt(d1)) && m.body.includes('사유: 둘째 날 학교 일정') && m.from_admin === false, m?.body.replace(/\n/g, ' / '))
  // 뺀 날은 다시 더할 수 없음 (잠김)
  await w.getByText('📅 이날은 못 가요 · 근무일 빼기').click()
  ok('뺀 날은 잠김', await chip(w, d1).isDisabled())
  // 오늘은 이미 출근 기록이 있어 뺄 수 없음
  await toggle(w, d0)
  await save(w)
  ok('출근한 날은 못 뺌', await see(w, '이미 출근 기록이 있는 날은 뺄 수 없어요'))
  // 남은 날을 모두 빼면 취소로 안내
  await w.getByText('📅 이날은 못 가요 · 근무일 빼기').click()
  await toggle(w, d0); await toggle(w, d2)
  await save(w)
  ok('모두 빼면 취소로 안내', await see(w, '근무를 못 하게 됐어요’로 취소해 주세요'))

  // 하루짜리 공고에는 안 보임
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: d0 })
  await w.goto(`${D}/jobs/${J}`)
  ok('하루짜리 공고: 날짜 바꾸기 없음', !(await see(w, '근무일 빼기', 1500)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
