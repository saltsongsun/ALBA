// 묶음 63: 단체방에서 사람 부르기 (@이름)
// · 입력칸에 '@'를 치거나 @ 버튼 → '누구를 부를까요?' 줄 (방 사람, 나는 빼고 · 담당자 표시) · 글자로 거름 · 누르면 '@이름 '
// · 고르는 중 Enter는 첫 사람 넣기 (보내지 않음) · Esc로 닫기
// · 보낸 글의 '@이름'은 굵게·색 · 불린 사람 화면에서는 그 말풍선이 눈에 띔 · 메일 주소 속 @는 아님
// node scripts/qa/batch63.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000f2', W3 = 'bbbbbbbb-0000-4000-8000-0000000000f3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

;(async () => {
  const [w] = await rest(`users?id=eq.${W}`)
  for (const [id, name] of [[W2, '이동료'], [W3, '이도윤']]) {
    await rest('users', 'POST', { ...w, id, name, attendance: [], ratings: [] })
    await rest('applications', 'POST', { id: `11111111-0000-4000-8000-0000000${id.slice(-5)}`, job_id: J, user_id: id, status: 'approved', available_dates: null, created_at: new Date().toISOString(), user: { id, name, phone: '01012345678', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: name, photo_at: null } })
  }

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const list = (p) => p.locator('[data-mention-list]')
  const chips = (p) => list(p).locator('button').allInnerTexts().then((l) => l.map((s) => s.replace(/\s+/g, ' ').trim()))

  // ── 1. 근무자: '@'를 치면 고르는 줄 ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/chat/room/${J}`)
  const box = wk.locator('textarea[name=body]')
  await box.waitFor({ timeout: 10000 })
  await box.click()
  await box.pressSequentially('@')
  await list(wk).waitFor({ timeout: 3000 }).catch(() => {})
  const all = await chips(wk)
  ok("'@' → 방 사람 (나는 빼고, 담당자 표시)", all.includes('@이동료') && all.includes('@이도윤') && all.some((c) => c.startsWith('@관리자') && c.includes('담당자')) && !all.includes('@근무자'), all.join(','))
  await box.pressSequentially('이동')
  ok("'@이동' → 이동료만", (await chips(wk)).join(',') === '@이동료')
  await box.press('Escape')
  ok('Esc로 닫힘', (await list(wk).count()) === 0)
  await box.fill('')
  await box.pressSequentially('@이')
  ok("'@이' → 이동료·이도윤", (await chips(wk)).length === 2)
  await list(wk).locator('button', { hasText: '이도윤' }).click()
  ok("누르면 '@이도윤 ' + 줄 닫힘", (await box.inputValue()) === '@이도윤 ' && (await list(wk).count()) === 0)
  await box.pressSequentially('내일 같이 가요 @이동')
  await box.press('Enter')
  ok('고르는 중 Enter는 첫 사람 넣기 (보내지 않음)', (await box.inputValue()) === '@이도윤 내일 같이 가요 @이동료 ' && !(await rest('job_chat')).some((m) => m.job_id === J && m.body.includes('내일 같이 가요')), await box.inputValue())
  await box.pressSequentially('도요 (메일 a@이동료.com)')
  await box.press('Enter')
  await see(wk, '내일 같이 가요')
  const sent = (await rest('job_chat')).find((m) => m.job_id === J && m.body.includes('내일 같이 가요'))
  ok('Enter로 보냄 (글 그대로)', !!sent && sent.body.trim() === '@이도윤 내일 같이 가요 @이동료 도요 (메일 a@이동료.com)', sent?.body)
  const marks = await wk.locator('main ol [data-mention]').allInnerTexts()
  ok("보낸 글: '@이도윤'·'@이동료' 강조 (메일 주소 속 @는 아님)", marks.join(',') === '@이도윤,@이동료', marks.join(','))

  // ── 2. @ 버튼으로도 ──
  await wk.locator('[data-mention-toggle]').click()
  ok("@ 버튼 → 입력칸에 '@' + 고르는 줄", (await box.inputValue()) === '@' && (await list(wk).count()) === 1)
  await box.fill('')
  ok('360px: 옆으로 안 밀림', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 불린 사람 화면: 말풍선이 눈에 띔 · 안 불린 사람은 그대로 ──
  const w3 = await pg(W3)
  await w3.goto(`${D}/me/chat/room/${J}`)
  await w3.locator('main ol').waitFor({ timeout: 10000 }).catch(() => {})
  ok('불린 사람(이도윤): 그 말풍선 표시', (await w3.locator('main ol [data-mentions-me]', { hasText: '내일 같이 가요' }).count()) === 1)
  const ad = await pg(A)
  await ad.goto(`${D}/admin/chat/room/${J}`)
  await ad.locator('main ol').waitFor({ timeout: 10000 }).catch(() => {})
  ok('안 불린 담당자: 표시 없음 · 이름은 강조', (await ad.locator('main ol [data-mentions-me]').count()) === 0 && (await ad.locator('main ol [data-mention]').count()) === 2)
  // 담당자도 @로 근무자를 부를 수 있음
  const abox = ad.locator('textarea[name=body]')
  await abox.click()
  await abox.pressSequentially('@')
  await list(ad).waitFor({ timeout: 3000 }).catch(() => {})
  const ac = await chips(ad)
  ok('담당자: 근무자 모두 부를 수 있음 (나는 빼고)', ['@근무자', '@이동료', '@이도윤'].every((n) => ac.includes(n)) && !ac.some((c) => c.startsWith('@관리자')), ac.join(','))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
