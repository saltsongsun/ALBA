// 묶음 95: 관리자 공고 화면 정리 (사용자 요청 "여기 너무 지저분하다 디자인 정리해줘" — 19:30 행사 당일 낮 화면)
// · 시작 전에는 '미출근'·'대신 확정'·'행사 일찍 끝내기' 없음 → '오늘 HH:MM 시작 · 아직 출근 전이에요'
// · 수정은 맨 위 오른쪽 · 단체방·시간 변경·긴급 QR·더보기는 같은 크기 칸 한 줄 · 더보기 안에 복사·모집·행사 취소·삭제
// · 전날 안내 확인: 제목·'안 읽음 n명' 한 줄 + 전화 버튼 줄 · 360px 옆으로 안 밀림 (밝은·어두운 화면)
// · 시작 시각이 지나면 '미출근'·'대신 확정'이 다시 보임
// node scripts/qa/batch95.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', C = '99999999-0000-4000-8000-000000000099'
const X = 'bbbbbbbb-0000-4000-8000-0000000000eb'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kstNow = new Date(Date.now() + 9 * 3600e3)
const today = kstNow.toISOString().slice(0, 10)
const hour = kstNow.getUTCHours()
const pad = (n) => String(n).padStart(2, '0')

;(async () => {
  // 준비: 오늘 늦게 시작하는 행사 (지금보다 한 시간 뒤 정각 ~ 23:59) · 아직 아무도 출근 안 함 · 확정 2명(한 명은 전날 안내 안 읽음) · 대기 1명
  const late = hour < 22
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: late ? `${pad(hour + 1)}:00:00` : '00:00:00', end_time: '23:59:00', status: 'closed' })
  await fetch(`${MD}/rest/v1/attendance?job_id=eq.${J}`, { method: 'DELETE' })
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const xu = { ...w1, id: X, name: '안읽은이', phone: '01077770902', created_at: new Date().toISOString() }
  await rest('users', 'POST', xu)
  await rest('applications', 'POST', { ...wApp, id: undefined, user_id: X, user: xu, position: null })
  const remind = (uid, read) => rest('messages', 'POST', { thread_user_id: uid, sender_id: null, from_admin: true, company_id: C, job_id: J, body: `⏰ 내일 근무 안내\n내일 19:30 · 광장`, read_at: read ? new Date().toISOString() : null, created_at: new Date().toISOString() })
  await remind(W, true)
  await remind(X, false)

  const b = await chromium.launch()
  const errs = []
  const pg = async (scheme) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', colorScheme: scheme })
    await ctx.addInitScript((sc) => { try { if (sc === 'dark') localStorage.setItem('theme', 'dark'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, scheme)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await pg('light')
  const open = async (p) => { await p.goto(`${D}/admin/jobs/${J}`); await p.locator('[data-job-actions]').first().waitFor({ timeout: 10000 }).catch(() => {}) }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  await open(a)
  const acts = a.locator('[data-job-actions]')

  // ── 1. 시작 전 ──
  if (late) {
    const t = await acts.innerText()
    ok(`시작 전: '오늘 ${pad(hour + 1)}:00 시작 · 아직 출근 전이에요'`, (await a.locator('[data-before-start]').innerText().catch(() => '')).includes(`오늘 ${pad(hour + 1)}:00 시작 · 아직 출근 전이에요`))
    ok("시작 전: '미출근'·'대신 확정'·'행사 일찍 끝내기' 없음", !t.includes('미출근') && (await a.locator('[data-substitute]').count()) === 0 && (await acts.getByRole('button', { name: '행사 일찍 끝내기' }).count()) === 0, t.replace(/\n/g, ' | '))
    ok("큰 '출석 체크'는 그대로", (await acts.locator('a', { hasText: '출석 체크' }).count()) === 1)
  } else ok('(밤 10시 이후라 시작 전 확인은 건너뜀)', true)

  // ── 2. 맨 위 수정 · 도구 줄 ──
  ok("'수정'은 맨 위 상태 줄 오른쪽", (await a.locator('[data-job-edit]').getAttribute('href')) === `/admin/jobs/${J}/edit`)
  const tiles = a.locator('[data-job-tools] > *')
  const boxes = await tiles.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), txt: e.innerText.trim() } }))
  ok('도구 줄: 단체방 · 시간 변경 · 긴급 QR · 더보기', boxes.map((x) => x.txt).join(',') === '단체방,시간 변경,긴급 QR,더보기', boxes.map((x) => x.txt).join(','))
  ok('도구 칸: 한 줄 · 같은 크기 · 글자 한 줄', boxes.length > 0 && boxes.every((x) => x.t === boxes[0].t && x.h === boxes[0].h && Math.abs(x.w - boxes[0].w) <= 1) && boxes[0].h < 70, JSON.stringify(boxes))
  ok('더보기는 처음엔 닫힘 (복사·삭제 안 보임)', !(await a.getByRole('button', { name: '복사해서 새 공고' }).isVisible()) && !(await a.getByText(/행사가 취소됐나요/).isVisible()))
  await a.locator('[data-more-toggle]').click()
  await a.getByRole('button', { name: '복사해서 새 공고' }).waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  ok('더보기: 복사 · 모집 열기 · 행사 취소 · 삭제', (await a.getByRole('button', { name: '복사해서 새 공고' }).isVisible()) && (await a.getByRole('button', { name: '모집 열기' }).isVisible()) && (await a.getByText(/행사가 취소됐나요/).isVisible()) && (await a.locator('[data-more-panel]').getByRole('button', { name: '삭제' }).isVisible()))
  ok("더보기 버튼 'aria-expanded=true'", (await a.locator('[data-more-toggle]').getAttribute('aria-expanded')) === 'true')

  // ── 3. 전날 안내 확인 ──
  const rr = a.locator('[data-remind-read]')
  const head = rr.locator('p').first()
  ok("전날 안내: '전날 안내 확인 1/2명' + '안 읽음 1명' 한 줄", /전날 안내 확인 1\/2명/.test(await head.innerText()) && (await head.innerText()).includes('안 읽음 1명') && (await head.evaluate((el) => el.getBoundingClientRect().height < 30)))
  ok('안 읽은 사람 전화 버튼 (다음 줄)', (await rr.locator('[data-unread-person]').getAttribute('href')) === 'tel:01077770902' && (await rr.locator('[data-unread-person]').innerText()).includes('안읽은이'))
  ok('360px: 옆으로 안 밀림 (밝은 화면)', await wide(a))

  // ── 4. 어두운 화면 ──
  const dk = await pg('dark')
  await open(dk)
  ok('360px: 옆으로 안 밀림 (어두운 화면)', (await dk.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await wide(dk)))

  // ── 5. 시작 시각이 지나면 '미출근' 다시 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00' })
  await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`, 'PATCH', { status: 'applied', held_at: null })
  await open(a)
  const t2 = await acts.innerText()
  ok("시작 뒤: '미출근 2' + '대신 확정'", t2.includes('미출근 2') && (await a.locator('[data-substitute]').count()) === 1, t2.replace(/\n/g, ' | '))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
