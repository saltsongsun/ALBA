// 묶음 294 (사용자 요청 2026-11-17 "지원한 후에 결과가 조금 늦으면 '지원해 주셔서 감사합니다 · 일정과 업무를 정리하느라
//   조금 시간이 필요해요'를 좀 더 정중하게 배려하는 태도로 자동으로 답변하게 해 줘")
// · 근무자가 '지원했는데 확정 여부가 궁금해요.'를 보내면: 아직 결과 전이면 그 자리에서 '🙏 지원 결과 안내' 자동 답장 (같은 공고엔 하루 한 번)
//   이미 확정된 사람에게는 안 보냄 · 담당자 문의함에서는 자동 안내로 쳐서 근무자 문의는 '답장 전'으로 그대로 (확정을 놓치지 않게)
// · 묻지 않아도: 지원하고 하루가 지나도록 결과가 없으면 저녁 안내(크론) 때 한 번 (공고마다 한 번 · 근무가 끝난 공고는 빼고)
// · 문장은 늘 같은 한 문장이 아니라 감사·까닭·약속 줄마다 여러 가지에서 무작위로 (사용자 요청 "다양한 존중하는 태도의 문장을 많이 만들어서 랜덤으로")
// node scripts/qa/batch294.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', C1 = '99999999-0000-4000-8000-000000000099'
const J2 = 'cccccccc-0000-4000-8000-000000029401', J3 = 'cccccccc-0000-4000-8000-000000029402'
const U3 = 'bbbbbbbb-0000-4000-8000-000000029401', U4 = 'bbbbbbbb-0000-4000-8000-000000029402', U5 = 'bbbbbbbb-0000-4000-8000-000000029403'
const HEAD = '🙏 지원 결과 안내'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
// 세 줄 모양: 1 감사(공고 이름 포함) · 2 기다리는 까닭 · 3 사과·약속 (문장은 보낼 때마다 무작위)
const shape = (body, title) => {
  const [head, open, mid, close, extra] = (body ?? '').split('\n')
  return head === '🙏 지원 결과 안내' && !extra && open.includes(title) && /감사|고마/.test(open) && /일정|업무|역할|살피/.test(mid) && /알려 드릴게요|안내해 드릴게요|연락드릴게요/.test(close)
}
const notes = async (uid) => (await rest(`messages?thread_user_id=eq.${uid}`)).filter((m) => m.from_admin && (m.body ?? '').startsWith(HEAD))

;(async () => {
  // 내일 근무 J (김지원 AP는 결과 전 · 근무자 W는 확정)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(1), end_date: kday(1), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const ask = async (p) => {
    await p.goto(`${D}/me/chat?job=${J}&ask=confirm`, { waitUntil: 'networkidle' })
    const chip = p.locator('[data-quick-replies] button').first()
    await chip.waitFor({ timeout: 15000 }).catch(() => {})
    await chip.click()
    await p.locator('textarea[name=body]').press('Enter')
    await p.waitForTimeout(1500)
    await p.waitForLoadState('networkidle').catch(() => {})
  }

  // ── 1. 결과 전인 근무자가 '확정 여부가 궁금해요' → 바로 정중한 자동 답장
  const ap = await mk(AP)
  await ask(ap)
  const n1 = await notes(AP)
  ok("결과 전: '🙏 지원 결과 안내' 자동 답장 한 번 (이 공고 · 우리 회사 문의함)", n1.length === 1 && n1[0].job_id === J && n1[0].company_id === C1 && !n1[0].sender_id, JSON.stringify(n1.map((m) => m.body.slice(0, 20))))
  const body = n1[0]?.body ?? ''
  ok('말투: 감사(공고 이름) · 기다리는 까닭(일정·업무) · 약속(알려 드림) 세 줄', shape(body, '경상남도 생활체육대축전 행사장 안내 스태프'), body.replace(/\n/g, ' | '))
  await ap.goto(`${D}/me/chat?job=${J}`, { waitUntil: 'networkidle' })
  const bubble = ap.locator('main ol li', { hasText: body.split('\n')[1] ?? '없음' }).last()
  await bubble.waitFor({ timeout: 15000 }).catch(() => {})
  ok('근무자 대화에 회사 쪽 말풍선으로 보임', (await bubble.count()) === 1)
  ok('360px 옆으로 안 밀림 (근무자 문의)', await noSide(ap))
  if (SHOTS) { await bubble.scrollIntoViewIfNeeded().catch(() => {}); await ap.screenshot({ path: `${SHOTS}/worker-auto-reply.png` }).catch(() => {}) }

  // ── 2. 같은 날 또 물어도 한 번만
  await ask(ap)
  ok('같은 공고에 하루 안에 또 물어도 자동 답장은 한 번만', (await notes(AP)).length === 1)

  // ── 3. 이미 확정된 근무자가 물으면: 자동 답장 없음
  const w = await mk(W)
  await ask(w)
  ok('이미 확정된 근무자에게는 안 보냄', (await notes(W)).length === 0)

  // ── 4. 담당자: 근무자 문의는 '답장 전'으로 그대로 · 자동 안내는 작게 · 확정하기 버튼 그대로
  const a = await mk(A)
  await a.goto(`${D}/admin/chat/${AP}`, { waitUntil: 'networkidle' })
  await a.locator('main ol').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("담당자 대화: '확정하기' 처리 버튼 그대로", (await a.locator('[data-confirm-ask]').count()) >= 1)
  // (가짜 DB는 앱이 넣은 메시지에 보낸 사람 정보를 붙이지 않아서 직접 붙임 — 실제 DB는 자동)
  await rest(`messages?thread_user_id=eq.${AP}`, 'PATCH', { user: { id: AP, name: '김지원', phone: '01077778888', photo_at: null } })
  // 자동 안내가 대화의 맨 마지막 글이어도 답장으로 치지 않는지 (마지막 근무자 문의 기준으로 '답장 전')
  await rest(`messages?thread_user_id=eq.${AP}&from_admin=eq.true`, 'PATCH', { created_at: new Date().toISOString() })
  await a.goto(`${D}/admin/chat?noreply=1`, { waitUntil: 'networkidle' })
  ok("담당자 문의함 '답장 전'에 그대로 (자동 안내는 답장으로 치지 않음)", (await a.locator(`a[href="/admin/chat/${AP}"]`).count()) >= 1)

  // ── 5. 저녁 안내(크론): 지원하고 하루가 지나도록 결과 전 → 한 번 · 막 지원 · 끝난 공고 · 이미 받은 사람은 빼고
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J2, title: '불꽃축제 주차 안내', start_date: kday(2), end_date: kday(2), status: 'open', applications: [], attendance: [], created_at: ago(48) })
  await rest('jobs', 'POST', { ...jb, id: J3, title: '지난 축제 안내', start_date: kday(-3), end_date: kday(-3), status: 'open', applications: [], attendance: [], created_at: ago(120) })
  const [u] = await rest(`users?id=eq.${W}`)
  for (const [id, name, phone] of [[U3, '하루대기', '01029400001'], [U4, '막지원', '01029400002'], [U5, '지난대기', '01029400003']]) await rest('users', 'POST', { ...u, id, name, phone, attendance: [], ratings: [] })
  const app = (id, uid, job, created) => rest('applications', 'POST', { id, job_id: job, user_id: uid, company_id: C1, status: 'applied', available_dates: null, position: null, held_at: null, decided_at: null, message: null, created_at: created })
  await app('11111111-0000-4000-8000-000000029401', U3, J2, ago(25))
  // 같은 공고를 하루 넘게 기다리는 사람 여럿 (사람마다 다른 문장인지)
  const MANY = Array.from({ length: 6 }, (_, i) => `bbbbbbbb-0000-4000-8000-0000000294${String(10 + i)}`)
  for (const [i, id] of MANY.entries()) {
    await rest('users', 'POST', { ...u, id, name: `대기${i}`, phone: `0102941${String(1000 + i)}`, attendance: [], ratings: [] })
    await app(`11111111-0000-4000-8000-0000000294${String(10 + i)}`, id, J2, ago(30))
  }
  await app('11111111-0000-4000-8000-000000029402', U4, J2, ago(2))
  await app('11111111-0000-4000-8000-000000029403', U5, J3, ago(100))
  const cron = () => fetch(`${D}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } }).then((r) => r.json()).catch((e) => ({ error: String(e) }))
  const r1 = await cron()
  const u3 = await notes(U3)
  ok('지원 하루 지남 · 결과 전 → 저녁 안내 때 한 번 (그 공고 · 세 줄 모양)', u3.length === 1 && u3[0].job_id === J2 && shape(u3[0].body, '불꽃축제 주차 안내'), JSON.stringify(r1) + ' ' + (u3[0]?.body ?? '').replace(/\n/g, ' | '))
  const many = (await Promise.all(MANY.map(notes))).map((l) => l[0]?.body ?? '')
  ok('여러 사람에게: 모두 세 줄 모양 · 문장이 사람마다 달라짐 (무작위)', many.every((b) => shape(b, '불꽃축제 주차 안내')) && new Set([...many, u3[0]?.body]).size >= 3, String(new Set(many).size))
  if (SHOTS) fs.writeFileSync(`${SHOTS}/samples.txt`, [u3[0]?.body, ...many].join('\n\n'))
  ok('막 지원한 사람(2시간) · 근무가 끝난 공고는 안 보냄', (await notes(U4)).length === 0 && (await notes(U5)).length === 0)
  await cron()
  ok('저녁 안내를 또 돌려도 같은 사람·공고엔 한 번만', (await notes(U3)).length === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
