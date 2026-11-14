// 묶음 249 (정기 개선 2026-11-14 15:35 KST)
// · 서류 탭: 서명 안 한 사람에게 연락하는 버튼을 한 칸으로 — '서명 안 한 n명'은 한 번만 쓰고 버튼은 짧게 (앱 알림 · 문자 · 번호 복사)
//   (예전: '서명 안 한 1명에게 문자' · '서명 안 한 1명 앱 알림'이 PDF·필요 서류 바꾸기와 섞여 360px에서 세 줄)
// · 마지막 '서명 요청' 앱 알림 때를 옆에 ('앱 알림 5분 전 보냄') · 30분 안에 또 누르면 '5분 전에 보냈어요 · 또 보낼까요?' (같은 알림이 겹쳐 가지 않게)
// node scripts/qa/batch249.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000249d2'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const nudge = (id, job, ago) => ({ id, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: job, body: `✍️ 서류 서명 요청\n안내 스태프 근무 전에 서류에 서명해 주세요.`, read_at: null, created_at: new Date(Date.now() - ago).toISOString() })

;(async () => {
  // 2시간 전에 이 공고로 한 번 보냄 · 다른 공고(J2)로는 5분 전에 보냄 (이 공고 표시에는 안 섞임)
  await rest('messages', 'POST', nudge(924901, J, 2 * 3600e3))
  await rest('messages', 'POST', nudge(924902, J2, 5 * 60e3))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const tools = a.locator('[data-unsigned-tools]')
  const last = a.locator('[data-last-nudge]')
  const send = tools.getByRole('button', { name: /앱 알림|보낼까요/ })

  // ── 1. 한 칸으로: '서명 안 한 1명' + 앱 알림 · 문자 · 번호 1개 복사
  await a.goto(`${D}/admin/jobs/${J}?tab=docs`, { waitUntil: 'networkidle' })
  await tools.waitFor({ timeout: 15000 }).catch(() => {})
  const btns = (await tools.locator('a, button').allInnerTexts()).map(one)
  ok("한 칸: '서명 안 한 1명' · [앱 알림] [문자] [번호 1개 복사]", one(await tools.locator('b').first().innerText()) === '서명 안 한 1명' && JSON.stringify(btns) === JSON.stringify(['앱 알림', '문자', '번호 1개 복사']), JSON.stringify(btns))
  ok("'서명 안 한 1명'을 버튼마다 되풀이하지 않음", (await a.getByText(/서명 안 한 \d+명(에게 문자| 앱 알림)/).count()) === 0)
  ok("위 줄은 '서명 완료 n / m건' · PDF · 필요 서류 바꾸기만", (await a.locator('[data-job-docs-pdf]').count()) === 1 && (await a.getByRole('link', { name: '필요 서류 바꾸기' }).count()) === 1)
  const rows = await tools.evaluate((el) => [...el.children].map((c) => Math.round(c.getBoundingClientRect().height)))
  ok('칸 안 두 줄이 각각 한 줄 (360px)', rows.length === 2 && rows[0] < 26 && rows[1] < 44, JSON.stringify(rows))
  ok("2시간 전 알림: '앱 알림 오늘 HH:MM 보냄' (회색) · 다른 공고 알림은 안 섞임", (await last.getAttribute('data-last-nudge')) === 'old' && /^앱 알림 (오늘 \d{1,2}:\d\d|\d{1,2}\/\d{1,2}\([일월화수목금토]\) \d{1,2}:\d\d) 보냄$/.test(one(await last.innerText())), one(await last.innerText().catch(() => '')))
  // 오래전에 보냈으면 확인 문구는 그대로
  await send.click()
  ok("오래전이면 확인 문구 그대로 '1명에게 보낼까요?'", (await tools.getByRole('button', { name: '1명에게 보낼까요?' }).count()) === 1)
  ok('360px 옆으로 안 밀림', await noSide(a))

  // ── 2. 보내면 '방금' · 다시 누르면 한 번 더 확인
  await tools.getByRole('button', { name: '1명에게 보낼까요?' }).click()
  await a.waitForURL((u) => new URL(u).searchParams.has('m'), { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle')
  ok("보냄: '1명에게 앱 알림을 보냈어요.'", (await a.locator('main').innerText()).includes('1명에게 앱 알림을 보냈어요.'))
  const sent = (await rest(`messages?thread_user_id=eq.${W}`)).filter((m) => m.job_id === J && m.body.startsWith('✍️ 서류 서명 요청'))
  ok('근무자 문의함에 서명 요청 (같은 머리말)', sent.length === 2, String(sent.length))
  await last.waitFor({ timeout: 8000 }).catch(() => {})
  ok("방금 보냄: '앱 알림 방금 보냄' (노란 글씨)", (await last.getAttribute('data-last-nudge')) === 'recent' && /^앱 알림 (방금|1분 전) 보냄$/.test(one(await last.innerText())), one(await last.innerText().catch(() => '')))
  if (SHOTS) {
    await tools.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    const bx = await tools.boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/docs-unsigned-tools.png`, clip: { x: 0, y: Math.max(0, bx.y - 70), width: 360, height: Math.min(260, bx.height + 150) } }).catch(() => {})
  }
  await send.click()
  const again = tools.getByRole('button', { name: /보냈어요 · 또 보낼까요\?/ })
  ok("금방 또 누르면 '방금 보냈어요 · 또 보낼까요?'", /^(방금|1분 전에) 보냈어요 · 또 보낼까요\?$/.test(one(await again.innerText().catch(() => ''))), one(await again.innerText().catch(() => '')))
  if (SHOTS) {
    await a.waitForTimeout(250)
    const bx = await tools.boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/docs-unsigned-again.png`, clip: { x: 0, y: Math.max(0, bx.y - 70), width: 360, height: Math.min(260, bx.height + 150) } }).catch(() => {})
  }
  ok('360px 옆으로 안 밀림 (다시 확인 중)', await noSide(a))

  // ── 3. 모두 서명하면 칸이 없어짐
  await rest(`signed_docs?job_id=eq.${J}&status=eq.pending`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await a.goto(`${D}/admin/jobs/${J}?tab=docs`, { waitUntil: 'networkidle' })
  await a.locator('[data-job-docs-pdf]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('모두 서명하면 연락 칸 없음', (await tools.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
