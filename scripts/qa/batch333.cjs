// 묶음 333 (정기 개선 2026-11-21 05:35 KST · 여러 회사: 아직 이어지지 않은 회원과의 '앱 메시지')
// · 근무자 화면: 우리 회사에 지원도 문의도 안 한 회원에게는 '앱 메시지' 버튼 없음 (누르면 '찾는 화면이 없어요'로 가던 것) · 전화·문자는 그대로
//   안내 글: '…주민번호·계좌·주소를 보고 앱 메시지도 보낼 수 있어요' · 회원이 우리 회사에 문의하면 바로 '앱 메시지'가 생김
// · 대화 화면을 직접 열면: 확인된 회사는 '아직 우리 회사와 대화가 없는 회원이에요' + 근무자 화면 / 공고 링크 알리기 (이름·다른 회사 대화 없음)
//   확인 전 회사는 예전처럼 '찾는 화면이 없어요' · 이어진 근무자는 예전 그대로 (전화·문자·앱 메시지 한 줄) · 360px
// node scripts/qa/batch333.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const sign = (p, pre = '') => `${p}.${createHmac('sha256', SECRET).update(pre + p).digest('base64url')}`
const cookie = (u) => sign(Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'))
const roster = (u) => sign(Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'roster:')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011'
const C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-0000003330c2', A2 = 'aaaaaaaa-0000-4000-8000-0000003330a2'
const C3 = '99999999-0000-4000-8000-0000003330c3', A3 = 'aaaaaaaa-0000-4000-8000-0000003330a3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 확인된 새 회사(C2) · 확인 전 회사(C3) — 각자 대표 한 명 · 김지원(K)은 두 회사 모두에 지원·문의 안 함
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a1] = await rest(`users?id=eq.${A}`)
  for (const [cid, aid, name, verified, phone] of [[C2, A2, '새봄행사', true, '01033303331'], [C3, A3, '확인전회사', false, '01033303332']]) {
    await rest('companies', 'POST', { ...c1, id: cid, company_name: name, verified, created_at: new Date().toISOString() })
    await rest('users', 'POST', { ...a1, id: aid, name: `${name}대표`, phone, is_super: false })
    await rest('company_members', 'POST', { company_id: cid, user_id: aid, role: 'owner', created_at: new Date().toISOString() })
  }

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 확인된 새 회사 → 이어지지 않은 회원(K): 앱 메시지 버튼 없음 · 전화·문자는 있음
  const a2 = await mk(A2)
  await go(a2, `/admin/workers/${K}`)
  const contact = a2.locator('[data-worker-contact] [data-contact-group]')
  await contact.waitFor({ timeout: 10000 }).catch(() => {})
  ok("이어지지 않은 회원: '앱 메시지' 없음 · 전화·문자 두 개", (await a2.locator('[data-worker-chat]').count()) === 0 && (await contact.locator('> *').count()) === 2 && (await a2.locator('a[href^="/admin/chat/"]').count()) === 0)
  const note = one(await a2.locator('main').innerText())
  ok("안내 글: '…보고 앱 메시지도 보낼 수 있어요'", note.includes('아직 우리 회사에 지원한 적 없는 회원이에요') && note.includes('주민번호·계좌·주소를 보고 앱 메시지도 보낼 수 있어요'))
  ok('360px 옆으로 밀림 없음 (근무자 화면)', await noSide(a2))
  if (SHOTS) await a2.screenshot({ path: `${SHOTS}/worker-unrelated.png` })

  // ── 2. 대화 화면을 직접 열면: 안내 + 갈 곳 (이름·대화 없음)
  await go(a2, `/admin/chat/${K}`)
  const un = a2.locator('[data-chat-unrelated]')
  ok("대화 화면: '아직 우리 회사와 대화가 없는 회원이에요'", (await un.count()) === 1 && one(await un.innerText()).includes('아직 우리 회사와 대화가 없는 회원이에요'))
  ok("갈 곳: '근무자 화면' → 그 회원 · '공고 링크 알리기' → QR·링크", (await a2.locator('[data-chat-unrelated-worker]').getAttribute('href')) === `/admin/workers/${K}` && (await a2.locator('[data-chat-unrelated-poster]').getAttribute('href')) === '/admin/jobs/poster')
  ok('이름·글쓰기 칸·다른 회사 대화 없음', !one(await a2.locator('main').innerText()).includes('김지원') && (await a2.locator('main textarea').count()) === 0)
  ok('360px 옆으로 밀림 없음 (안내)', await noSide(a2))
  if (SHOTS) await a2.screenshot({ path: `${SHOTS}/chat-unrelated.png` })
  await a2.locator('[data-chat-unrelated-worker]').click()
  await a2.waitForURL((u) => u.pathname === `/admin/workers/${K}`, { timeout: 10000 }).catch(() => {})
  ok("'근무자 화면' 누르면 그 회원 화면", new URL(a2.url()).pathname === `/admin/workers/${K}`)

  // ── 3. 회원이 이 회사에 문의하면: 앱 메시지가 생기고 대화가 열림 (지원 전이라 안내 글은 그대로)
  await rest('messages', 'POST', { thread_user_id: K, sender_id: K, from_admin: false, job_id: null, company_id: C2, body: '새봄행사 다음 공고 언제 올라와요?', read_at: null, created_at: new Date().toISOString(), job: null, sender: { name: '김지원' }, user: { id: K, name: '김지원', phone: '01077778888' } })
  await go(a2, `/admin/workers/${K}`)
  ok("문의가 오면 '앱 메시지' 생김 (전화·문자·앱 메시지)", (await a2.locator('[data-worker-chat]').count()) === 1 && (await a2.locator('[data-worker-contact] [data-contact-group] > *').count()) === 3)
  const note2 = one(await a2.locator('main').innerText())
  ok('지원 전이라 안내 글은 예전 그대로 (앱 메시지 문구는 빠짐)', note2.includes('아직 우리 회사에 지원한 적 없는 회원이에요. 공고에 확정하거나 이 사람이 지원하면 주민번호·계좌·주소를 볼 수 있어요.') && !note2.includes('앱 메시지도 보낼'))
  await a2.locator('[data-worker-chat]').click()
  await a2.waitForURL((u) => u.pathname === `/admin/chat/${K}`, { timeout: 10000 }).catch(() => {})
  await a2.waitForLoadState('networkidle')
  await a2.getByText('새봄행사 다음 공고 언제 올라와요?').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('앱 메시지 → 그 문의 대화가 열림', (await a2.getByText('새봄행사 다음 공고 언제 올라와요?').count()) >= 1 && (await a2.locator('[data-chat-unrelated]').count()) === 0)

  // ── 4. 확인 전 회사: 예전처럼 없는 화면 (회원이 있는지도 알리지 않음)
  const a3 = await mk(A3)
  await go(a3, `/admin/chat/${K}`)
  ok("확인 전 회사: '찾는 화면이 없어요' (안내 없음)", (await a3.getByText('찾는 화면이 없어요').count()) >= 1 && (await a3.locator('[data-chat-unrelated]').count()) === 0)

  // ── 5. 이어진 근무자(테스트 회사 W): 예전 그대로 전화·문자·앱 메시지 한 줄
  const a = await mk(A)
  await go(a, `/admin/workers/${W}`)
  const tops = await a.locator('[data-worker-contact] [data-contact-group] > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('이어진 근무자: 전화·문자·앱 메시지 한 줄 (그대로)', tops.length === 3 && new Set(tops).size === 1 && (await a.locator('[data-worker-chat]').getAttribute('href')) === `/admin/chat/${W}`, JSON.stringify(tops))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
