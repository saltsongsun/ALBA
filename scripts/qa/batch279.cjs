// 묶음 279 (정기 개선 2026-11-16 22:37 KST)
// · 관리자 문의 대화: 근무자의 정정 요청을 버튼으로 처리한 뒤에는 그 요청용 빠른 답장('확인해 보고 다시 알려 드릴게요.')을 권하지 않음
//   (처리 전에는 그대로 보임 · 처리한 줄 모르고 '확인해 볼게요'를 또 보내는 실수 막기)
// · 공고를 한 번도 안 올린 새 회사 홈: 맨 위 '+ 새 공고 등록'은 숨김 ('시작하기 · 첫 공고 올리기'와 공고 칸 버튼으로 하나만) · 공고가 있는 회사는 그대로
// node scripts/qa/batch279.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()
const kst = (d) => new Date(new Date(d).getTime() + 9 * 3600e3)
const hm = (d) => kst(d).toISOString().slice(11, 16)
const today = kst(Date.now()).toISOString().slice(0, 10)
const md = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(`${s}T00:00:00Z`).getUTCDay()]})` }
const REPLY = '확인해 보고 다시 알려 드릴게요.'

;(async () => {
  // 근무자 W: 오늘 근무 기록(끝남) + 방금 정정 요청 (기존 글은 예전 것으로)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  const inAt = ago(120), outAt = ago(10), want = ago(30)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_in: inAt, clock_out: outAt, adj_in: null, adj_out: null, paid: false, note: null })
  for (const m of await rest(`messages?thread_user_id=eq.${W}`)) await rest(`messages?id=eq.${m.id}`, 'PATCH', { created_at: ago(30 * 1440), read_at: ago(30 * 1440) })
  await rest('messages', 'POST', [{
    id: 2790001, company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, job_id: J, read_at: null, created_at: ago(5), job: { id: J, title: job.title }, sender: { name: '근무자' },
    body: `✏️ 기록 정정 요청\n${job.title} · ${md(today)} 근무\n기록 ${hm(inAt)}~${hm(outAt)} → 실제 종료 ${hm(want)}\n사유: 정리하고 나왔어요`,
  }])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const reply = () => p.getByRole('button', { name: REPLY }).count()

  // ── 1. 처리 전: 요청용 빠른 답장이 보임 → 처리 뒤: 안 보임
  await p.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  await p.locator('[data-chat-quick="fix"]').waitFor({ timeout: 15000 }).catch(() => {})
  ok(`처리 전: 빠른 답장 '${REPLY}' 보임`, (await reply()) >= 1)
  await Promise.all([p.waitForURL(/m=/, { timeout: 30000 }).catch(() => {}), p.locator('[data-chat-quick="fix"]').getByRole('button', { name: '요청대로 고치기' }).click()])
  const flash = decodeURIComponent(new URL(p.url()).searchParams.get('m') ?? '')
  ok('버튼으로 고쳤음', flash.includes('고쳤어요'), flash)
  await p.locator('[data-auto-notice]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok(`처리 뒤: '${REPLY}'는 권하지 않음 (기본 답장은 그대로)`, (await reply()) === 0 && (await p.getByRole('button', { name: '확인했습니다.' }).count()) >= 1)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/after-fix-replies.png` }).catch(() => {})

  // ── 2. 공고가 있는 회사 홈: 맨 위 '+ 새 공고 등록' 그대로
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok("공고가 있는 회사 홈: 맨 위 '+ 새 공고 등록' 있음", (await p.locator('[data-dash-new-job]').count()) === 1)

  // ── 3. 새로 시작한 회사 (공고 0): 맨 위 버튼 없음 · 공고 칸 버튼 하나 + '첫 공고 올리기'
  const nctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await nctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const n = await nctx.newPage()
  n.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await n.goto(`${D}/start`, { waitUntil: 'networkidle' })
  await n.fill('#company_name', '이백칠십구행사')
  await n.fill('#business_no', '1058712345')
  await n.fill('#ceo_name', '김대표')
  await n.fill('#name', '박담당')
  await n.fill('#phone', '01027902790')
  await n.fill('#pin', '482917')
  await n.fill('#pin2', '482917')
  await n.check('input[name="agree_privacy"]')
  await n.click('button[type="submit"]:has-text("회사로 시작하기")')
  await n.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {})
  await n.locator('[data-start-steps]').waitFor({ timeout: 15000 }).catch(() => {})
  const links = await n.locator('main a[href="/admin/jobs/new"]').count()
  ok("새 회사 홈: 맨 위 '+ 새 공고 등록' 없음", (await n.locator('[data-dash-new-job]').count()) === 0)
  ok("공고 칸 '+ 새 공고 등록'과 '첫 공고 올리기'는 그대로 (같은 곳으로 가는 버튼 2개)", (await n.locator('[data-dash-jobs-empty] a[href="/admin/jobs/new"]').count()) === 1 && (await n.locator('[data-start-steps] a[href="/admin/jobs/new"]').count()) === 1 && links === 2, `새 공고 링크 ${links}개`)
  ok('360px 옆으로 안 밀림', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/newco-dash.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
