// 묶음 67 (정기 개선): 관리자 문의 목록의 단체방 줄에 마지막 말 미리보기 + 공지 확인 막대를 사람 수만큼 칸으로
// · 단체방 줄: '이름: 마지막 말' + 시각 (내가 쓴 말은 '나:' · 지운 말은 '(삭제된 메시지예요)') · 참여 안 한 방도 미리보기
// · 고정 공지 '👀 확인' 막대: 근무자 수만큼 칸, 본 사람만큼 칸이 참
// · 어색한 줄바꿈: '(이 휴대폰에만)'이 둘로 꺾이지 않게 · 회사 설정 문의 연락처 안내 짧게
// node scripts/qa/batch67.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000e7', A2 = 'aaaaaaaa-0000-4000-8000-0000000000e7'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const ago = (min) => new Date(Date.now() - min * 60e3).toISOString()

;(async () => {
  // 준비: 확정자 W2(이동료) 추가 · 같은 회사 관리자 A2(참여 안 함) · 공고는 내일까지 · 동료의 마지막 말
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: kstDate(new Date(Date.now() + 86400e3)) })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: W2, name: '이동료', attendance: [], ratings: [] })
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000e7', job_id: J, user_id: W2, status: 'approved', available_dates: null, created_at: new Date().toISOString(), user: { id: W2, name: '이동료', phone: '01012345678', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '이동료', photo_at: null } })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '부관리자', phone: '01077778888', is_super: false })
  await rest('company_members', 'POST', { company_id: CO, user_id: A2, role: 'admin' })
  await rest('job_chat', 'POST', { job_id: J, company_id: CO, sender_id: A, from_admin: true, body: '내일 8시 50분까지 정문으로 와 주세요', pinned_at: ago(30), created_at: ago(30) })
  await rest('job_chat', 'POST', { job_id: J, company_id: CO, sender_id: W2, from_admin: false, body: '주차는 어디에 하면 되나요?', pinned_at: null, created_at: ago(2) })
  // 공지를 W는 봤고(고정 뒤에 방을 엶) W2는 아직
  await rest('job_chat_reads', 'POST', { job_id: J, user_id: W, read_at: ago(10) })

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
  const lastOf = async (p) => (await p.locator(`a[href="/admin/chat/room/${J}"] [data-room-last]`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()

  // ── 1. 단체방 줄: 마지막 말 미리보기 + 시각 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/chat`)
  await ad.locator('section[aria-label="단체방"]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("단체방 줄: '이동료: 주차는 어디에 하면 되나요?'", (await lastOf(ad)) === '이동료: 주차는 어디에 하면 되나요?', await lastOf(ad))
  ok('단체방 줄: 마지막 말 시각 (오늘이면 시:분)', /\d{1,2}:\d{2}/.test(await ad.locator(`a[href="/admin/chat/room/${J}"]`).first().innerText()))
  ok('안 읽은 말이 있으면 미리보기가 진하게', (await ad.locator(`a[href="/admin/chat/room/${J}"] [data-room-last]`).first().getAttribute('class')).includes('font-semibold'))
  ok('360px: 옆으로 안 밀림 (문의 목록)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 공지 확인 막대: 근무자 2명 → 2칸 중 1칸 ──
  await ad.goto(`${D}/admin/chat/room/${J}`)
  await ad.locator('[data-pinned-reads]').waitFor({ timeout: 10000 }).catch(() => {})
  const bar = await ad.locator('[data-pinned-reads] summary [role=img]').evaluate((e) => ({ slots: e.dataset.slots, filled: e.dataset.filled, tag: e.tagName })).catch(() => null)
  ok('공지 확인: 근무자 2명 → 2칸 중 1칸 (summary 안은 span)', bar?.slots === '2' && bar?.filled === '1' && bar?.tag === 'SPAN', JSON.stringify(bar))
  ok("공지 확인: '1/2명'", (await ad.locator('[data-pinned-count]').innerText()).replace(/\s+/g, '') === '1/2명')

  // ── 3. 내가 쓴 말은 '나:' · 지운 말은 '(삭제된 메시지예요)' ──
  const box = ad.locator('textarea[name=body]')
  await box.fill('정문 왼쪽 주차장을 쓰시면 돼요')
  await box.press('Enter')
  await ad.getByText('정문 왼쪽 주차장을 쓰시면 돼요').first().waitFor({ timeout: 8000 }).catch(() => {})
  await ad.goto(`${D}/admin/chat`)
  ok("내가 쓴 마지막 말은 '나: …'", (await lastOf(ad)) === '나: 정문 왼쪽 주차장을 쓰시면 돼요', await lastOf(ad))
  const mine = (await rest('job_chat')).find((m) => m.job_id === J && m.body === '정문 왼쪽 주차장을 쓰시면 돼요')
  await rest(`job_chat?id=eq.${mine.id}`, 'PATCH', { body: '::deleted::' })
  await ad.reload()
  ok("지운 말은 '(삭제된 메시지예요)'", (await lastOf(ad)) === '나: (삭제된 메시지예요)', await lastOf(ad))

  // ── 4. 참여 안 한 관리자도 미리보기는 보임 (안 읽은 수는 없음) ──
  const a2 = await pg(A2)
  await a2.goto(`${D}/admin/chat`)
  await a2.locator('[data-rooms-others]').waitFor({ timeout: 10000 }).catch(() => {})
  await a2.locator('[data-rooms-others] summary').click()
  await a2.locator(`[data-rooms-others] a[href="/admin/chat/room/${J}"] [data-room-last]`).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const prev = await lastOf(a2)
  ok('참여 안 한 방: 미리보기 있음 · 안 읽은 수 없음', prev.startsWith('관리자:') && (await a2.locator('[data-rooms-others] .bg-rose-500').count()) === 0, prev)

  // ── 5. 어색한 줄바꿈 ──
  await ad.goto(`${D}/admin/settings`)
  await ad.locator('input[name=contact_phone]').waitFor({ timeout: 10000 }).catch(() => {})
  // 2026-11-12부터 문의 연락처는 로그인 도움말 · 현장 담당 번호 없는 공고의 연락처로도 쓰여 안내를 바꿈 (한 줄 그대로)
  ok("회사 설정: 문의 연락처 안내 '로그인·현장 연락처로 보여요' (한 줄)", (await ad.getByText('로그인·현장 연락처로 보여요').count()) === 1 && (await ad.locator('[data-contact-hint]').evaluate((el) => el.getBoundingClientRect().height < 22)))
  const wk = await pg(W)
  await wk.goto(`${D}/me/profile`)
  const nowrap = wk.locator('span.whitespace-nowrap', { hasText: '(이 휴대폰에만)' })
  await nowrap.first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {})
  const lines = await nowrap.first().evaluate((e) => e.getClientRects().length).catch(() => -1)
  ok("'(이 휴대폰에만)'은 한 줄로 붙어 있음", lines === 1, String(lines))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
