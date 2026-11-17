// 묶음 296 (정기 개선 2026-11-18 03:35 KST)
// · 근무자 확정 대기 칸(내 근무 · 공고 화면): 결과가 늦어 회사에서 '🙏 지원 결과 안내'를 받았으면 '🙏 기다림 안내를 받았어요 · 보기 →' 한 줄
//   (안 읽었으면 '새' · 누르면 그 회사 문의함 · 곧 시작이라 '확정 전이에요 · 담당자에게 문의' 줄이 있으면 그 줄만)
// · 공고 화면 지원자 탭: 대시보드처럼 '🙏 기다림 안내' 표시 (누르면 그 대화 · 넓은 화면 표에도)
// · 근무자 문의 화면: 회사가 보낸 안내(확정·공지·지원 결과 안내 등)는 첫 줄이 굵은 제목 — 긴 안내도 무슨 안내인지 한눈에
// node scripts/qa/batch296.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', APP = '11111111-0000-4000-8000-000000000012', C1 = '99999999-0000-4000-8000-000000000099'
const HEAD = '🙏 지원 결과 안내'
const NOTE = `${HEAD}\n경상남도 생활체육대축전 행사장 안내 스태프에 지원해 주셔서 진심으로 감사드려요.\n행사 일정과 업무 배치를 정리하는 데 시간이 조금 더 걸리고 있어요.\n기다리시게 해서 죄송해요. 정리되는 대로 바로 알려 드릴게요.`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사흘 뒤 근무 J · 김지원(AP)은 결과 전 (곧 시작이 아니게)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(3), end_date: kday(3), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { available_dates: [kday(3)] })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, viewport = { width: 360, height: 740 }) => {
    const ctx = await b.newContext({ ...(viewport.width < 600 ? devices['Galaxy S9+'] : {}), viewport, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(AP)
  const line = (p = w) => p.locator('[data-wait-note]')
  const open = async (path, p = w) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 안내를 받기 전: 줄 없음
  await open('/me')
  ok('확정 대기 칸이 보임', (await w.locator(`[data-waiting-app="${J}"]`).count()) === 1)
  ok('안내를 받기 전엔 줄 없음', (await line().count()) === 0)

  // ── 2. 회사에서 '🙏 지원 결과 안내'를 보내면: 한 줄 + '새'
  await rest('messages', 'POST', { id: 2960001, thread_user_id: AP, sender_id: null, from_admin: true, company_id: C1, job_id: J, body: NOTE, read_at: null, created_at: new Date(Date.now() - 60e3).toISOString() })
  await open('/me')
  const l = line().first()
  await l.waitFor({ timeout: 15000 }).catch(() => {})
  ok("내 근무: '🙏 기다림 안내를 받았어요 · 새 · 보기 →'", one(await l.innerText().catch(() => '')) === '🙏 기다림 안내를 받았어요 새 보기 →' && (await l.getAttribute('data-wait-note')) === 'new', one(await l.innerText().catch(() => '')))
  ok('누르면 그 회사 문의함', (await l.getAttribute('href')) === `/me/chat?co=${C1}`)
  ok('그 공고 칸 안에 · 한 줄', await l.evaluate((el, j) => !!el.closest(`[data-waiting-app="${j}"]`) && el.getBoundingClientRect().height < 48, J))
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
  if (SHOTS) await w.locator(`[data-waiting-app="${J}"]`).screenshot({ path: `${SHOTS}/me-wait-note.png` }).catch(() => {})

  // ── 3. 누르면 문의함에서 안내를 다시 봄 · 첫 줄은 굵은 제목
  await l.click()
  await w.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {})
  const head = w.locator('main ol li [data-notice-head]', { hasText: HEAD }).last()
  await head.waitFor({ timeout: 15000 }).catch(() => {})
  ok('문의함에서 받은 안내가 보임 · 첫 줄은 굵은 제목', (await head.count()) === 1 && Number(await head.evaluate((el) => getComputedStyle(el).fontWeight)) >= 700)
  ok('제목 다음 줄부터는 보통 글씨로 이어짐 (같은 말풍선)', await head.evaluate((el) => { const p = el.parentElement; const t = p.textContent; return t.startsWith('🙏 지원 결과 안내\n') && t.includes('행사 일정과 업무 배치를') && getComputedStyle(p).fontWeight < 600 }))
  ok('내가 쓴 말풍선은 그대로 (굵은 제목 없음)', (await w.locator('main ol li .bg-brand-600 [data-notice-head]').count()) === 0)
  ok('360px 옆으로 안 밀림 (문의)', await noSide(w))
  if (SHOTS) { await head.scrollIntoViewIfNeeded().catch(() => {}); await w.screenshot({ path: `${SHOTS}/chat-notice-head.png` }).catch(() => {}) }

  // ── 4. 읽은 뒤: '새' 없이 · 공고 화면에도 같은 줄
  await open('/me')
  ok("읽은 뒤엔 '새' 없음", (await line().first().getAttribute('data-wait-note').catch(() => '')) === 'read' && !one(await line().first().innerText().catch(() => '')).includes('새'))
  await open(`/jobs/${J}`)
  const jl = line().first()
  await jl.waitFor({ timeout: 15000 }).catch(() => {})
  ok('공고 화면 지원 칸에도 같은 줄', (await line().count()) === 1 && (await jl.getAttribute('href')) === `/me/chat?co=${C1}`)
  ok('360px 옆으로 안 밀림 (공고)', await noSide(w))
  if (SHOTS) await jl.evaluate((el) => el.parentElement.scrollIntoView({ block: 'center' })).then(() => w.waitForTimeout(300)).then(() => jl.locator('xpath=..').screenshot({ path: `${SHOTS}/job-wait-note.png` })).catch(() => {})

  // ── 5. 이미 시작했는데 확정 전: '담당자에게 문의' 줄만 (같은 걸 두 줄로 쌓지 않음)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(0), end_date: kday(1), start_time: '00:00:00', end_time: '23:59:00' })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { available_dates: [kday(0)] })
  await open('/me')
  ok("시작했는데 확정 전이면 '담당자에게 문의' 줄만", (await w.locator('[data-waiting-soon]').count()) === 1 && (await line().count()) === 0)
  await open(`/jobs/${J}`)
  ok('공고 화면도 같은 규칙', (await w.locator('[data-confirm-soon]').count()) === 1 && (await line().count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(3), end_date: kday(3), start_time: '09:00:00', end_time: '18:00:00' })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { available_dates: [kday(3)] })

  // ── 6. 관리자 공고 화면 지원자 탭: '🙏 기다림 안내'
  const a = await mk(A)
  await open(`/admin/jobs/${J}?tab=apps`, a)
  const bd = a.locator('[data-app-noted]:visible')
  await bd.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("지원자 카드에 '🙏 기다림 안내' (한 번)", (await bd.count()) === 1 && one(await bd.first().textContent()) === '🙏 기다림 안내')
  ok('누르면 그 사람과의 대화', (await bd.first().getAttribute('href')) === `/admin/chat/${AP}`)
  ok('지원 시각 줄 안에 · 카드 밖으로 안 나감', await bd.first().evaluate((el) => { const c = el.closest('.card')?.getBoundingClientRect(); const r = el.getBoundingClientRect(); return !!c && r.right <= c.right + 1 }))
  ok('360px 옆으로 안 밀림 (지원자 탭)', await noSide(a))
  if (SHOTS) await bd.first().evaluate((el) => el.closest('.card').scrollIntoView({ block: 'center' })).then(() => a.waitForTimeout(300)).then(() => a.locator('[data-app-noted]:visible').first().locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/apps-noted.png` })).catch(() => {})
  const wide = await mk(A, { width: 1280, height: 900 })
  await open(`/admin/jobs/${J}?tab=apps`, wide)
  ok('넓은 화면 표에도 표시', (await wide.locator('[data-app-noted]:visible').count()) === 1 && (await wide.locator('[data-app-noted]:visible').first().evaluate((el) => !!el.closest('td'))))
  // 관리자 대화 화면은 그대로 (자동 안내는 한 줄로 작게 접힘)
  await open(`/admin/chat/${AP}`, a)
  ok('관리자 대화에서는 자동 안내가 그대로 한 줄로 접힘', (await a.locator('[data-auto-notice]', { hasText: HEAD }).count()) >= 1 && (await a.locator('[data-notice-head]').count()) === 0)

  // ── 7. 확정되면 지원자 탭 표시는 사라짐
  await rest(`applications?id=eq.${APP}`, 'PATCH', { status: 'approved' })
  await open(`/admin/jobs/${J}?tab=apps`, a)
  ok('확정된 사람에겐 표시 없음', (await a.locator('[data-app-noted]').count()) === 0)
  await open('/me')
  ok('확정되면 근무자 쪽 줄도 없음', (await line().count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
