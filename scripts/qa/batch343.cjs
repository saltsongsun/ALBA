// 묶음 343 (정기 개선 2026-11-22 00:35 KST)
// · 글쓰기 '같이 가요': 내 확정 근무(아직 끝나지 않음 · 가까운 날 순 3개)가 칩으로 나오고, 누르면 제목이 'M/D(요일) 행사 같이 가요'로 채워짐 (✓ 톡)
//   끝난 근무 · 지원만 한 근무 · 취소된 공고 · 다른 사람 근무는 없음 / 다른 말머리 · 글 고치기에는 없음
// · 커뮤니티 관리 기능 스위치: 설명은 한 줄로 짧게 · 긴 설명은 '자세히'를 눌러야 보임 (공통 접기 화살표 하나 · 펼침 0.25초)
// node scripts/qa/batch343.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const P = 'bbbbbbbb-0000-4000-8000-0000003430b1', O = 'bbbbbbbb-0000-4000-8000-0000003430b2'
const J1 = 'cccccccc-0000-4000-8000-0000003430a1', J2 = 'cccccccc-0000-4000-8000-0000003430a2', J3 = 'cccccccc-0000-4000-8000-0000003430a3'
const JE = 'cccccccc-0000-4000-8000-0000003430a4', JW = 'cccccccc-0000-4000-8000-0000003430a5', JC = 'cccccccc-0000-4000-8000-0000003430a6', JO = 'cccccccc-0000-4000-8000-0000003430a7'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const WD = ['일', '월', '화', '수', '목', '금', '토']
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [k] = await rest(`users?id=eq.${K}`)
  const { attendance: _ka, ratings: _kr, ...kb } = k
  for (const [id, name, phone, nickname] of [[P, '사사삼', '01034303431', '같이갈래'], [O, '사사사', '01034303432', '남의근무']]) {
    await rest('users', 'POST', { ...kb, id, name, phone, nickname, photo_at: null, careers: [], created_at: '2026-11-01T00:00:00Z' })
  }
  // P: 확정 근무 넷(6일 뒤 · 2일 뒤 · 4일 뒤(여러 날 중 고른 날) · 10일 뒤) + 끝난 확정 · 지원만 · 취소된 공고 / O: 1일 뒤 확정 근무
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const rows = [
    [J1, '킨텍스 모터쇼 안내', '킨텍스 모터쇼', kday(6), kday(6), 'open', P, 'approved', null],
    [J2, '벡스코 게임쇼 진행', '벡스코 게임쇼', kday(2), kday(2), 'open', P, 'approved', null],
    [J3, '코엑스 푸드위크 (사흘)', '코엑스 푸드위크', kday(-1), kday(5), 'open', P, 'approved', [kday(-1), kday(4)]],
    ['cccccccc-0000-4000-8000-0000003430a8', '열흘 뒤 안내', '열흘 뒤 행사', kday(10), kday(10), 'open', P, 'approved', null],
    [JE, '어제 끝난 안내', '어제 행사', kday(-1), kday(-1), 'open', P, 'approved', null],
    [JW, '지원만 한 안내', '지원만 행사', kday(1), kday(1), 'open', P, 'applied', null],
    [JC, '취소된 안내', '취소 행사', kday(1), kday(1), 'cancelled', P, 'approved', null],
    [JO, '남의 근무 안내', '남의 행사', kday(1), kday(1), 'open', O, 'approved', null],
  ]
  for (const [id, title, ev, s, e, st, uid, status, dates] of rows) {
    await rest('jobs', 'POST', { ...jb, id, title, event_name: ev, status: st, start_date: s, end_date: e, start_time: '09:00:00', end_time: '18:00:00', applications: [], attendance: [], created_at: new Date().toISOString() })
    const [j] = await rest(`jobs?id=eq.${id}`)
    const { applications: _ja, attendance: _jt, ...jl } = j
    await rest('applications', 'POST', { id: crypto.randomUUID(), job_id: id, user_id: uid, status, available_dates: dates, position: null, message: null, created_at: new Date(Date.now() - 864e5).toISOString(), job: jl, user: { id: uid, name: uid === P ? '사사삼' : '사사사', phone: '01034303431' } })
  }

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 같이 가요 글쓰기: 내 확정 근무 칩 (가까운 날 순 3개)
  const p = await mk(P)
  await go(p, '/community/new?c=together')
  const chips = p.locator('[data-together-chip]')
  const keys = await chips.evaluateAll((els) => els.map((e) => e.getAttribute('data-together-chip')))
  const labels = (await chips.allInnerTexts()).map(one)
  ok("'내 근무에서 고르기' 칩: 내 확정 근무만 · 가까운 날 순 3개 (2일 뒤 · 여러 날 중 고른 4일 뒤 · 6일 뒤)", keys.join() === [J2, J3, J1].join(), JSON.stringify(labels))
  ok('칩 글: 날짜 + 행사 이름', labels[0] === `${fmt(kday(2))} 벡스코 게임쇼` && labels[1] === `${fmt(kday(4))} 코엑스 푸드위크` && labels[2] === `${fmt(kday(6))} 킨텍스 모터쇼`, JSON.stringify(labels))
  ok('끝난 근무 · 지원만 · 취소된 공고 · 남의 근무 · 4번째(열흘 뒤)는 없음', !keys.some((x) => [JE, JW, JC, JO, 'cccccccc-0000-4000-8000-0000003430a8'].includes(x)))
  ok('360px 옆으로 밀림 없음 (글쓰기)', await noSide(p))
  ok('처음엔 아무것도 안 눌림 · 제목 비어 있음', (await p.locator('[data-together-chip][aria-pressed=true]').count()) === 0 && (await p.locator('#post-title').inputValue()) === '')

  // 누르면 제목이 채워지고 ✓ 톡
  await chips.nth(1).click()
  await p.waitForTimeout(150)
  const want = `${fmt(kday(4))} 코엑스 푸드위크 같이 가요`
  ok("누르면 제목 'M/D(요일) 행사 같이 가요' · 눌린 칩 표시", (await p.locator('#post-title').inputValue()) === want && (await chips.nth(1).getAttribute('aria-pressed')) === 'true' && (await chips.nth(0).getAttribute('aria-pressed')) === 'false', await p.locator('#post-title').inputValue())
  const tick = await chips.nth(1).locator('span[aria-hidden]').evaluate((e) => ({ t: e.textContent, a: getComputedStyle(e).animationName, d: parseFloat(getComputedStyle(e).animationDuration) }))
  ok('✓ 톡 (pop · 0.25초)', tick.t === '✓' && tick.a === 'pop' && Math.abs(tick.d - 0.25) < 0.01, JSON.stringify(tick))
  const dur = await chips.nth(1).evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration))
  ok('칩 눌림 효과 0.15초', Math.abs(dur - 0.15) < 0.01, String(dur))
  if (SHOTS) {
    await p.locator('[data-together-work]').scrollIntoViewIfNeeded()
    await p.waitForTimeout(350)
    await p.screenshot({ path: `${SHOTS}/together-work.png` })
  }
  // 다른 칩으로 바꾸면 제목도 바뀜
  await chips.nth(0).click()
  await p.waitForTimeout(150)
  ok('다른 칩을 누르면 제목이 바뀜', (await p.locator('#post-title').inputValue()) === `${fmt(kday(2))} 벡스코 게임쇼 같이 가요` && (await p.locator('[data-together-chip][aria-pressed=true]').count()) === 1)

  // ── 2. 다른 말머리로 바꾸면 사라지고, 다시 같이 가요면 나옴
  await p.locator('label:has(input[name=category][value=tip])').click()
  await p.waitForTimeout(200)
  ok("다른 말머리(꿀팁): '내 근무에서 고르기' 없음", (await p.locator('[data-together-work]').count()) === 0)
  await p.locator('label:has(input[name=category][value=together])').click()
  await p.waitForTimeout(200)
  ok('다시 같이 가요: 칩이 다시 나옴', (await p.locator('[data-together-chip]').count()) === 3)

  // ── 3. 공고 화면 '같이 갈 사람 찾기'로 와도 칩이 함께 보임 (제목은 미리 채워진 그대로)
  //    (위에서 칩을 눌러 저장된 임시 글이 없는 새 브라우저)
  const p2 = await mk(P)
  await go(p2, `/community/new?c=together&t=${encodeURIComponent('미리 채운 제목')}`)
  ok('미리 채운 제목은 그대로 · 칩도 보임', (await p2.locator('#post-title').inputValue()) === '미리 채운 제목' && (await p2.locator('[data-together-chip]').count()) === 3, await p2.locator('#post-title').inputValue())
  // 칩을 누른 뒤 다시 와도 임시 저장된 제목이 이어짐 (직접 쓴 글과 같음)
  await go(p, '/community/new?c=together')
  ok('칩으로 채운 제목도 임시 저장 (다시 오면 이어짐)', (await p.locator('#post-title').inputValue()) === `${fmt(kday(2))} 벡스코 게임쇼 같이 가요`, await p.locator('#post-title').inputValue())

  // ── 4. 다른 사람(O): 자기 근무만
  const o = await mk(O)
  await go(o, '/community/new?c=together')
  const okeys = await o.locator('[data-together-chip]').evaluateAll((els) => els.map((e) => e.getAttribute('data-together-chip')))
  ok('다른 근무자: 자기 근무 하나만 (내 근무는 안 보임)', okeys.join() === JO, JSON.stringify(okeys))

  // ── 5. 관리자(확정 근무 없음): 칩 칸 없음
  const a = await mk(A)
  await go(a, '/community/new?c=together')
  ok('확정 근무 없는 사람: 칩 칸 없음 (안전 안내만)', (await a.locator('[data-together-work]').count()) === 0 && (await a.locator('[data-together-note]').count()) === 1)

  // ── 6. 커뮤니티 관리: 설명 한 줄 + '자세히' 접힘
  await go(a, '/admin/community')
  const sw = a.locator('[data-feature=coworkers]')
  const short = sw.locator('[data-feature-short]')
  const more = sw.locator('[data-feature-more]')
  const shortOne = await short.evaluate((e) => e.getClientRects().length === 1 && e.getBoundingClientRect().height < 22)
  ok("설명 한 줄: '고른 동료에게만 내 지원 공고 보여 주기'", one(await short.innerText()) === '고른 동료에게만 내 지원 공고 보여 주기' && shortOne)
  ok("긴 설명은 접혀 있음 ('자세히')", (await more.evaluate((e) => e.open)) === false && !(await more.locator('p').isVisible()))
  ok('두 기능 모두 한 줄 설명', (await a.locator('[data-feature-short]').count()) === 2 && one(await a.locator('[data-feature=job_reviews] [data-feature-short]').innerText()) === '공고에 회사 별점·최근 후기 보여 주기')
  ok('360px 옆으로 밀림 없음 (커뮤니티 관리)', await noSide(a))
  if (SHOTS) await a.locator('[data-feature-switches]').screenshot({ path: `${SHOTS}/admin-feature-short.png` })
  // 화살표는 하나만 (앱 공통 접기 화살표 · 따로 붙인 › 없음)
  const arrow = () => more.evaluate((e) => getComputedStyle(e.querySelector('summary'), '::before').transform)
  const closedArrow = await arrow()
  ok("'자세히' 화살표 하나 (글자에 ›가 따로 붙지 않음)", one(await more.locator('summary').innerText()) === '자세히' && (await more.locator('summary span').count()) === 0)
  await more.locator('summary').click()
  await a.waitForTimeout(350)
  const opened = await more.evaluate((e) => ({ open: e.open, anim: getComputedStyle(e.querySelector('p')).animationName, d: parseFloat(getComputedStyle(e.querySelector('p')).animationDuration) }))
  const openArrow = await arrow()
  ok("'자세히' 누르면 펼침 · 화살표 돌아감 · 0.25초 내려옴", opened.open && openArrow !== closedArrow && opened.anim === 'slide-down' && Math.abs(opened.d - 0.25) < 0.01, JSON.stringify({ ...opened, closedArrow, openArrow }))
  ok('펼친 설명: 예전 설명 그대로', one(await more.locator('p').innerText()).startsWith('켜면 근무자가 함께 일한 사람 중 고른 사람에게만'))
  ok('켜기 버튼은 그대로', (await sw.getByRole('button', { name: '켜기' }).count()) === 1)
  if (SHOTS) await a.locator('[data-feature-switches]').screenshot({ path: `${SHOTS}/admin-feature-more.png` })

  // ── 7. 움직임 줄이기
  const r = await mk(A, { reducedMotion: 'reduce' })
  await go(r, '/admin/community')
  await r.locator('[data-feature=coworkers] [data-feature-more] summary').click()
  const rd = await r.locator('[data-feature=coworkers] [data-feature-more] p').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration))
  ok('움직임 줄이기: 펼침 바로 (거의 0초)', rd < 0.01, String(rd))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
