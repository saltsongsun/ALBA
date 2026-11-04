// 같은 근무 단체방 + 이모티콘 + 대화 내려받기
// · 확정자와 담당자만 (지원만 한 사람·다른 회사 관리자는 못 들어감) · 근무자끼리는 이름만 (번호 없음)
// · 글·이모티콘 보내기 · 안 읽은 수 · 공지 고정(관리자)·내리기 · 행사 끝나고 7일 뒤엔 읽기만
// · 1:1 문의에도 이모티콘 (병아리 그림, 예전 이모티콘은 글자로) · 모든 대화 내려받기 (권한 확인) · 공고 화면에서 단체방으로 · 360px
// node scripts/qa/chat-room.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000b2', A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const J_TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
// 화면 안에서 서버 함수를 직접 부름 (조작된 요청 흉내)
const call = (p, file, name, args, form) =>
  p.evaluate(
    async ({ id, args, form }) => {
      const body = new FormData()
      for (const [k, v] of Object.entries(form)) body.append(`_1_${k}`, v)
      body.append('0', JSON.stringify([...args, '$K1']))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.text()
    },
    { id: idOf(file, name), args, form },
  )
const download = (p, url) =>
  p.evaluate(async (u) => {
    const r = await fetch(u, { cache: 'no-store' })
    return { status: r.status, disp: r.headers.get('content-disposition') || '', text: await r.text() }
  }, url)

;(async () => {
  // 두 번째 확정자 W2 · 다른 회사 관리자 A2
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: W2, name: '이동료', phone: '01056565656', attendance: [], ratings: [] })
  // (가짜 DB는 지원에 사람 정보를 붙이지 않아서 직접 붙임 — 실제 DB는 자동)
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000e2', job_id: J, user_id: W2, status: 'approved', created_at: new Date().toISOString(), user: { id: W2, name: '이동료', phone: '01056565656', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '이동료', photo_at: null } })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const room = `/me/chat/room/${J}`
  const notFound = (p) => see(p, '찾는 화면이 없어요')

  // ── 1. 들어갈 수 있는 사람 ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/chat`)
  ok('확정자: 문의 대화 목록에 단체방', (await wk.locator(`[data-chat-list] a[data-chat-row=room][href="${room}"]`).count()) === 1)
  await wk.goto(`${D}${room}`)
  ok('확정자: 단체방 열림', await see(wk, `👥 ${J_TITLE}`))
  const members = (await wk.locator('details', { hasText: '참여' }).textContent()) ?? ''
  ok('참여자: 담당자·근무자 이름', members.includes('관리자 · 담당자') && members.includes('이동료') && members.includes('근무자'), members.replace(/\n/g, ' '))
  ok('근무자끼리 번호는 안 보임', !/01[0-9][-\s]?\d{3,4}[-\s]?\d{4}/.test(await wk.locator('main').innerText()))
  ok('360px: 옆으로 안 밀림', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const ap = await pg(AP)
  await ap.goto(`${D}/me/chat`)
  ok('지원만 한 사람: 단체방 목록 없음', (await ap.locator(`a[href="${room}"]`).count()) === 0)
  await ap.goto(`${D}${room}`)
  ok('지원만 한 사람: 단체방 안 열림', await notFound(ap))
  const other = await pg(A2)
  await other.goto(`${D}/admin/chat/room/${J}`)
  ok('다른 회사 관리자: 단체방 안 열림', await notFound(other))

  // ── 2. 보내기: 글 + 이모티콘 ──
  await wk.goto(`${D}${room}`)
  await wk.locator('textarea[name=body]').fill('안녕하세요 오늘 잘 부탁드려요')
  await wk.getByRole('button', { name: '보내기' }).click()
  ok('글 보내기', await see(wk, '안녕하세요 오늘 잘 부탁드려요'))
  await wk.getByRole('button', { name: '이모티콘', exact: true }).click()
  const pick = wk.locator('[role=dialog][aria-label=이모티콘] img')
  const nPick = await pick.count()
  ok('이모티콘 고르기 창 (10개 이상)', nPick >= 10 && (await wk.locator('[role=dialog][aria-label=이모티콘] button').count()) === nPick, String(nPick))
  await pick.first().evaluate((i) => i.complete || new Promise((r) => (i.onload = i.onerror = r))).catch(() => {})
  ok('고르기 창: 첫 그림이 실제로 뜸', await pick.first().evaluate((i) => i.naturalWidth > 0))
  // (아래쪽 그림은 스크롤해야 불러오므로, 파일이 모두 있는지 주소로 확인)
  const srcs = await pick.evaluateAll((l) => l.map((i) => i.getAttribute('src')))
  const got = await Promise.all(srcs.map((s) => wk.request.get(`${D}${s}`).then((r) => r.status() === 200 && r.headers()['content-type'] === 'image/webp', () => false)))
  ok('고르기 창: 그림 파일 모두 있음', got.every(Boolean), srcs.filter((s, i) => !got[i]).join(' '))
  ok('입력칸 옆 이모티콘 버튼 그림', await wk.locator('button[aria-label="이모티콘"] img').evaluate((i) => i.complete && i.naturalWidth > 0))
  await wk.getByRole('button', { name: '확인했어요' }).click()
  await wk.locator('main ol img[alt="이모티콘: 확인했어요"]').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('이모티콘 보내면 그림으로', (await wk.locator('main ol img[alt="이모티콘: 확인했어요"]').count()) === 1)
  const rows = (await rest('job_chat')).filter((m) => m.job_id === J)
  ok('저장: 회사·보낸 사람·이모티콘 표시', rows.length === 2 && rows.every((m) => m.company_id === C1 && m.sender_id === W && m.from_admin === false) && rows.some((m) => m.body === '::s:ok::'))
  let r = await call(wk, 'room', 'sendRoom', [J, null], { body: '::s:hack::' })
  ok('없는 이모티콘은 거절', r.includes('보낼 수 없는 이모티콘이에요'))
  r = await call(wk, 'room', 'sendRoom', [J, null], { body: '::s:late::' })
  ok('예전 이모티콘은 새로 못 보냄', r.includes('보낼 수 없는 이모티콘이에요'))
  r = await call(ap, 'room', 'sendRoom', [J, null], { body: '몰래 들어왔어요' })
  ok('지원만 한 사람이 요청을 만들어도 거절', r.includes('이 단체방에 들어갈 수 없어요') && !(await rest('job_chat')).some((m) => m.body === '몰래 들어왔어요'))

  // ── 3. 안 읽은 수 ──
  const w2 = await pg(W2)
  await w2.goto(`${D}/me/chat`)
  const chip = w2.locator(`a[href="${room}"]`)
  ok('동료: 단체방에 안 읽은 2', (await chip.locator('[data-unread]').innerText().catch(() => '')) === '2', await chip.innerText())
  ok('동료: 아래 탭 문의에 숫자', await w2.locator('nav[data-bottom-nav] a[href="/me/chat"]').innerText().then((t) => /\d/.test(t)).catch(() => false))
  await w2.goto(`${D}${room}`)
  ok('동료: 보낸 사람 이름과 내용', (await see(w2, '안녕하세요 오늘 잘 부탁드려요')) && (await w2.locator('main ol').innerText()).includes('근무자'))
  await w2.goto(`${D}/me/chat`)
  ok('읽고 나면 숫자 사라짐', (await w2.locator(`a[href="${room}"] [data-unread]`).count()) === 0)

  // ── 4. 관리자: 목록·공지 고정 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/chat`)
  ok('관리자: 문의에 단체방 목록', (await see(ad, '👥 단체방')) && (await ad.locator(`a[href="/admin/chat/room/${J}"]`).count()) === 1)
  await ad.goto(`${D}/admin/jobs/${J}`)
  ok('관리자: 공고 화면에 단체방 버튼', await ad.locator(`a[href="/admin/chat/room/${J}"]`).first().waitFor({ state: 'attached', timeout: 10000 }).then(() => true, () => false), ad.url() + ' ' + (await ad.locator('main').innerText().catch(() => '')).slice(0, 300).replace(/\n/g, ' | '))
  await ad.goto(`${D}/admin/chat/room/${J}`)
  await ad.locator('textarea[name=body]').fill('집합 장소: 정문 앞 8시 50분')
  await ad.locator('input[name=pin]').check()
  await ad.getByRole('button', { name: '보내기' }).click()
  ok('공지로 고정 → 맨 위 공지', await ad.locator('[data-room-pinned]', { hasText: '집합 장소: 정문 앞 8시 50분' }).waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('보낸 뒤 고정 체크는 풀림', !(await ad.locator('input[name=pin]').isChecked()))
  const pinRow = (await rest('job_chat')).find((m) => m.body === '집합 장소: 정문 앞 8시 50분')
  ok('저장: 담당자 글 · 고정', pinRow?.from_admin === true && !!pinRow?.pinned_at)
  await wk.goto(`${D}${room}`)
  ok('근무자: 공지 보임 · 담당자 표시', (await wk.locator('[data-room-pinned]').count()) === 1 && (await see(wk, '담당자')))
  ok('근무자: 공지 내리기 버튼 없음', (await wk.getByRole('button', { name: '공지 내리기' }).count()) === 0)
  r = await call(wk, 'room', 'sendRoom', [J, null], { body: '나도 고정', pin: 'on' })
  ok('근무자가 고정을 요청해도 일반 글', !(await rest('job_chat')).find((m) => m.body === '나도 고정')?.pinned_at)
  const unpin = ad.getByRole('button', { name: /공지 내리기|공지 내릴까요/ })
  await unpin.click()
  await ad.waitForTimeout(150)
  await unpin.click()
  await ad.locator('[data-room-pinned]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  ok('관리자: 공지 내리기', (await ad.locator('[data-room-pinned]').count()) === 0)

  // ── 5. 1:1 문의에도 이모티콘 ──
  // (가짜 DB는 정렬을 안 해서, 미리 들어 있던 예시 문의를 지워 방금 보낸 것이 '마지막'이 되게)
  await fetch(`${MD}/rest/v1/messages?thread_user_id=eq.${W}`, { method: 'DELETE' })
  await wk.goto(`${D}/me/chat?co=${C1}`)
  await wk.getByRole('button', { name: '이모티콘', exact: true }).click()
  await wk.getByRole('button', { name: '감사합니다' }).click()
  await wk.locator('main ol img[alt="이모티콘: 감사합니다"]').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('1:1 문의: 이모티콘 보내기', (await wk.locator('main ol img[alt="이모티콘: 감사합니다"]').count()) >= 1)
  // (가짜 DB는 새 메시지에 보낸 사람을 붙이지 않아서 직접 붙임)
  const dm = (await rest('messages')).find((m) => m.body === '::s:thanks::')
  if (dm) await rest(`messages?id=eq.${dm.id}`, 'PATCH', { user: { id: W, name: '근무자', phone: '01033334444', photo_at: null } })
  await ad.goto(`${D}/admin/chat`)
  ok('관리자 목록 미리보기: [이모티콘] 글자', await see(ad, '[이모티콘] 감사합니다'), JSON.stringify(dm && { id: dm.id, c: dm.created_at }) + ' ' + (await ad.locator('main').innerText().catch(() => '')).slice(0, 400).replace(/\n/g, ' | '))
  await ad.goto(`${D}/admin/chat/${W}`)
  ok('관리자 대화: 그림으로', (await ad.locator('main ol img[alt="이모티콘: 감사합니다"]').count()) >= 1)

  // ── 6. 내려받기 ──
  let d = await download(wk, `/me/chat/room/${J}/export`)
  ok('근무자: 단체방 저장', d.status === 200 && d.disp.includes('attachment') && d.text.includes('안녕하세요 오늘 잘 부탁드려요') && d.text.includes('[이모티콘] 확인했어요') && d.text.includes('(담당자)'), `${d.status} ${d.disp}`)
  d = await download(wk, `/me/chat/export?co=${C1}`)
  ok('근무자: 1:1 문의 저장', d.status === 200 && d.text.includes('[이모티콘] 감사합니다'))
  d = await download(ap, `/me/chat/room/${J}/export`)
  ok('지원만 한 사람: 단체방 저장 막힘', d.status === 403)
  d = await download(ad, `/admin/chat/room/${J}/export`)
  ok('관리자: 단체방 저장', d.status === 200 && d.text.includes('집합 장소: 정문 앞 8시 50분'))
  d = await download(ad, `/admin/chat/${W}/export`)
  ok('관리자: 1:1 문의 저장', d.status === 200 && d.text.includes('[이모티콘] 감사합니다'))
  d = await download(ad, '/admin/chat/export')
  ok('관리자: 모든 대화 한 파일', d.status === 200 && d.text.includes('단체방 · ') && d.text.includes('1:1 문의 · ') && d.disp.includes(encodeURIComponent('모든대화')))
  d = await download(other, `/admin/chat/room/${J}/export`)
  ok('다른 회사 관리자: 저장 막힘', d.status === 403)
  ok('다운로드 버튼들', (await ad.goto(`${D}/admin/chat`), (await ad.locator('a[href="/admin/chat/export"][download]').count()) === 1))

  // ── 7. 공고 화면 · 닫힌 방 ──
  await wk.goto(`${D}/jobs/${J}`)
  ok('근무자 공고 화면: 단체방 버튼', (await wk.locator(`a[href="${room}"]`).count()) === 1)
  const old = new Date(Date.now() + 9 * 3600e3 - 10 * 86400e3).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: old, end_date: old })
  // 예전에 보낸 이모티콘(지금 목록에 없음)은 글자 말풍선으로
  await rest('job_chat', 'POST', { id: 'dddddddd-0000-4000-8000-0000000000e1', job_id: J, company_id: C1, sender_id: W, from_admin: false, body: '::s:late::', pinned_at: null, created_at: new Date().toISOString() })
  await wk.goto(`${D}${room}`)
  ok('예전 이모티콘: 글자로 보임', (await wk.locator('main ol [role=img][aria-label="이모티콘: 조금 늦어요"]').count()) === 1 && (await see(wk, '🐥 조금 늦어요')))
  ok('끝나고 7일 지나면 읽기만', (await see(wk, '행사가 끝나 대화가 닫혔어요')) && (await wk.locator('textarea[name=body]').count()) === 0)
  r = await call(wk, 'room', 'sendRoom', [J, null], { body: '늦은 글' })
  ok('닫힌 방에 요청해도 거절', r.includes('7일이 지나'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
