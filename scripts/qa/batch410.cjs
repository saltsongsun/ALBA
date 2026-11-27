// 묶음 410 (정기 개선 2026-11-27 07:35 KST)
// 기능 · 담당자가 출퇴근 시각을 고치면 근무자에게 알림: 그 근무자의 이 회사 문의함에
//   '🕒 근무 시각 고침 / M/D(요) 근무 · 출근 06:00 → 09:00' + 휴대폰 알림 (공고 이름은 말풍선 위 '📌 공고 보기' 줄에 있어 다시 안 씀) (한 명 고치기 · 여러 명 한 번에 고치기 둘 다)
//   · 시각이 그대로면(메모만 고침) 안 감 · '근무자에게 알리기'를 끄면 안 감 · 근무자 문의함에서 보임
// 인터랙션 · 고치기 칸에서 출근·퇴근 칸을 바꾸면 저장 버튼 위에 '근무자에게 알리기 · 출근 06:00 → 09:00'이 톡 떠오름 (0.25초)
//   · 끄면 흐려짐 · 움직임 줄이기면 바로 · 여러 명 고치기는 저장 뒤 버튼이 처음 상태로 ('한 번 더 누르면 0명…'이 남지 않게)
// node scripts/qa/batch410.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
const HEAD = '🕒 근무 시각 고침'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const at = (d, hm) => new Date(`${d}T${hm}:00+09:00`).toISOString()
const md = (d) => { const x = new Date(`${d}T00:00:00Z`); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}(${'일월화수목금토'[x.getUTCDay()]})` }
const fixMsgs = async () => ((await rest(`messages?thread_user_id=eq.${W}`)) ?? []).filter((m) => (m.body ?? '').startsWith(HEAD))

;(async () => {
  const y = kday(-1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y, end_date: kday(0), start_time: '09:00:00', end_time: '18:00:00', early_clamp: false })
  const setAtt = (extra = {}) => rest(`attendance?id=eq.${ATT}`, 'PATCH', { work_date: y, clock_in: at(y, '06:00'), clock_out: at(y, '18:00'), adj_in: null, adj_out: null, paid: false, note: null, ...extra })
  await setAtt()

  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (uid, reduce = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await ctxOf(A)
  // 그 사람 기록 고치기 칸을 연 채로 (정산 탭에서 오는 길과 같은 주소 · 돌아가기 없이)
  const openForm = async (p = a) => {
    await p.goto(`${D}/admin/jobs/${J}?tab=att&date=${y}&fix=${W}#att-${W}`, { waitUntil: 'networkidle' })
    const form = p.locator('form[data-att-edit="open"]')
    await form.waitFor({ timeout: 15000 }).catch(() => {})
    return form
  }
  const save = async (form) => {
    await form.locator('button[type="submit"]').first().click()
    await a.waitForLoadState('networkidle').catch(() => {})
    await a.locator('[role="status"]').first().waitFor({ timeout: 10000 }).catch(() => {})
    return one(await a.locator('[role="status"]').first().innerText().catch(() => ''))
  }

  // ── 1. 출근을 06:00 → 09:00로 맞추고 저장 → 근무자 문의함에 알림
  let form = await openForm()
  const prev = form.locator('[data-tell-preview]')
  ok('처음에는 알리기 줄이 안 보임 (시각 그대로)', (await prev.getAttribute('data-tell-preview').catch(() => null)) === 'off' && !(await prev.isVisible().catch(() => true)))
  await form.locator('[data-early-fix]').click()
  await a.waitForTimeout(150)
  ok("'출근을 09:00로 맞추기' → '근무자에게 알리기 · 출근 06:00 → 09:00'", (await prev.getAttribute('data-tell-preview').catch(() => null)) === 'on' && one(await prev.innerText().catch(() => '')) === '근무자에게 알리기 · 출근 06:00 → 09:00', one(await prev.innerText().catch(() => '')))
  const box = prev.locator('input[name="tell"]')
  ok('알리기는 기본으로 켜짐', await box.isChecked().catch(() => false))
  ok('줄은 톡 떠오름 (pop · 0.25초)', await prev.locator('label').evaluate((el) => getComputedStyle(el).animationName === 'pop' && getComputedStyle(el).animationDuration === '0.25s').catch(() => false))
  ok('저장 버튼 바로 위 (한 줄 · 넘치면 두 줄)', await prev.evaluate((el) => { const s = el.nextElementSibling; return !!s && !!s.querySelector('button[type="submit"]') && el.getBoundingClientRect().height < 50 }).catch(() => false))
  ok('360px 옆으로 안 밀림 (고치기 칸)', await noSide(a))
  if (SHOTS) { await prev.scrollIntoViewIfNeeded(); await a.waitForTimeout(350); const bx = await form.boundingBox(); if (bx) await a.screenshot({ path: `${SHOTS}/att-tell.png`, clip: { x: 0, y: Math.max(0, bx.y + bx.height - 380), width: 360, height: 400 } }).catch(() => {}) }
  const before1 = (await fixMsgs()).length
  const flash1 = await save(form)
  ok("저장 알림에 '근무자에게도 알렸어요'", flash1.includes('근무 기록을 저장했습니다.') && flash1.includes('근무자에게도 알렸어요'), flash1)
  const msgs1 = await fixMsgs()
  const m1 = msgs1[msgs1.length - 1]
  ok('근무자 문의함에 1건', msgs1.length === before1 + 1, `${before1} → ${msgs1.length}`)
  ok(`글: '${HEAD}' / '${md(y)} 근무 · 출근 06:00 → 09:00'`, m1?.body === `${HEAD}\n${md(y)} 근무 · 출근 06:00 → 09:00`, JSON.stringify(m1?.body))
  ok('이 회사 문의함 · 이 공고 · 담당자가 보낸 글', m1?.company_id === C1 && m1?.job_id === J && m1?.from_admin === true, JSON.stringify({ c: m1?.company_id, j: m1?.job_id, f: m1?.from_admin }))
  const [att1] = await rest(`attendance?id=eq.${ATT}`)
  ok('기록은 그대로 저장됨 (출근 09:00 보정)', att1?.adj_in && Date.parse(att1.adj_in) === Date.parse(at(y, '09:00')), String(att1?.adj_in))

  // ── 2. 근무자: 이 회사 문의함에서 보임
  const w = await ctxOf(W)
  await w.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  const wText = one(await w.locator('main').innerText().catch(() => ''))
  ok("근무자 문의함: '🕒 근무 시각 고침 … 근무 · 출근 06:00 → 09:00'", wText.includes(HEAD) && wText.includes(`${md(y)} 근무 · 출근 06:00 → 09:00`), wText.slice(-200))
  ok('360px 옆으로 안 밀림 (근무자 문의함)', await noSide(w))

  // ── 3. 알리기를 끄면 안 감 (줄은 흐려짐)
  await setAtt()
  form = await openForm()
  await form.locator('[data-early-fix]').click()
  await a.waitForTimeout(150)
  await form.locator('[data-tell-preview] input[name="tell"]').uncheck()
  await a.waitForTimeout(250)
  ok('끄면 줄이 흐려짐', await form.locator('[data-tell-preview] label').evaluate((el) => parseFloat(getComputedStyle(el).opacity) < 0.7).catch(() => false))
  const before3 = (await fixMsgs()).length
  const flash3 = await save(form)
  ok('끄고 저장: 알림 안 감 · 저장은 됨', (await fixMsgs()).length === before3 && !flash3.includes('알렸어요') && !!(await rest(`attendance?id=eq.${ATT}`))?.[0]?.adj_in, flash3)

  // ── 4. 메모만 고치면 줄도 알림도 없음
  await setAtt()
  form = await openForm()
  await form.locator('input[name="note"]').fill('메모만 고침')
  await a.waitForTimeout(150)
  ok('메모만 바꾸면 알리기 줄이 안 보임', (await form.locator('[data-tell-preview]').getAttribute('data-tell-preview').catch(() => null)) === 'off')
  const before4 = (await fixMsgs()).length
  await save(form)
  ok('메모만 저장: 알림 안 감', (await fixMsgs()).length === before4)

  // ── 5. 퇴근만 18:00 → 17:30
  await setAtt()
  form = await openForm()
  await form.locator('input[name="adj_out"]').fill(`${y}T17:30`)
  await a.waitForTimeout(150)
  ok("퇴근을 바꾸면 '근무자에게 알리기 · 종료 18:00 → 17:30'", one(await form.locator('[data-tell-preview]').innerText().catch(() => '')) === '근무자에게 알리기 · 종료 18:00 → 17:30', one(await form.locator('[data-tell-preview]').innerText().catch(() => '')))
  await form.locator('input[name="adj_out"]').fill(`${y}T18:00`)
  await a.waitForTimeout(150)
  ok('원래대로 되돌리면 줄이 사라짐', (await form.locator('[data-tell-preview]').getAttribute('data-tell-preview').catch(() => null)) === 'off')
  await form.locator('input[name="adj_out"]').fill(`${y}T17:30`)
  const before5 = (await fixMsgs()).length
  await save(form)
  const msgs5 = await fixMsgs()
  ok("퇴근만 고침: '종료 18:00 → 17:30' 알림", msgs5.length === before5 + 1 && msgs5[msgs5.length - 1].body === `${HEAD}\n${md(y)} 근무 · 종료 18:00 → 17:30`, JSON.stringify(msgs5[msgs5.length - 1]?.body))

  // ── 6. 여러 명 한 번에 고치기: 기본으로 알림 · 끄면 안 감
  const bulk = async (tell) => {
    await setAtt()
    await a.goto(`${D}/admin/jobs/${J}?tab=att&date=${y}`, { waitUntil: 'networkidle' })
    const panel = a.locator('[data-bulk-adjust]')
    await panel.waitFor({ timeout: 15000 }).catch(() => {})
    await panel.locator('summary').click()
    await a.waitForTimeout(300)
    const t = panel.locator('[data-bulk-tell] input[name="tell"]')
    const checked = await t.isChecked().catch(() => null)
    if (!tell) await t.uncheck()
    await panel.locator(`input[name=uid][value="${W}"]`).check()
    await panel.locator('input[name=in_time]').fill('09:00')
    await panel.getByRole('button', { name: '고른 1명 시간 고치기' }).click()
    await panel.getByRole('button', { name: '한 번 더 누르면 1명 시간을 고쳐요' }).click()
    await a.getByText('1명 시간을 고쳤어요').first().waitFor({ timeout: 10000 }).catch(() => {})
    await a.waitForTimeout(200)
    return { checked, text: one(await panel.innerText().catch(() => '')), btn: one(await panel.locator('button[type="submit"]').last().innerText().catch(() => '')), panel }
  }
  const before6 = (await fixMsgs()).length
  const r6 = await bulk(true)
  ok("여러 명 고치기: '바뀐 시각을 근무자에게 알려요' 기본으로 켜짐", r6.checked === true)
  ok("결과에 '바뀐 1명에게 알렸어요'", r6.text.includes('1명 시간을 고쳤어요') && r6.text.includes('바뀐 1명에게 알렸어요'), r6.text.slice(0, 160))
  const msgs6 = await fixMsgs()
  ok('여러 명 고치기: 근무자에게 같은 모양 알림', msgs6.length === before6 + 1 && msgs6[msgs6.length - 1].body === `${HEAD}\n${md(y)} 근무 · 출근 06:00 → 09:00`, JSON.stringify(msgs6[msgs6.length - 1]?.body))
  ok("저장 뒤 버튼은 처음 상태 ('고칠 사람을 골라 주세요' · '한 번 더 누르면 0명…'이 남지 않음)", r6.btn === '고칠 사람을 골라 주세요', r6.btn)
  ok('360px 옆으로 안 밀림 (여러 명 고치기)', await noSide(a))
  if (SHOTS) { const bx = await r6.panel.boundingBox(); if (bx) await a.screenshot({ path: `${SHOTS}/bulk-tell.png`, clip: { x: 0, y: Math.max(0, bx.y + bx.height - 300), width: 360, height: 310 } }).catch(() => {}) }
  const before7 = (await fixMsgs()).length
  const r7 = await bulk(false)
  ok('끄고 고치면 알림 안 감', (await fixMsgs()).length === before7 && !r7.text.includes('알렸어요'), r7.text.slice(0, 120))

  // ── 7. 움직임 줄이기: 줄 애니메이션 사실상 없음
  await setAtt()
  const r = await ctxOf(A, true)
  form = await openForm(r)
  await form.locator('[data-early-fix]').click()
  await r.waitForTimeout(150)
  ok('움직임 줄이기: 알리기 줄 바로 나타남', await form.locator('[data-tell-preview] label').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) < 0.01).catch(() => false))

  await setAtt()
  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
