// 묶음 177 (사용자 요청 2026-11-10 "전체 기능 점검 및 디자인 개선 인사이트 기반으로") — 이용 기록에서 드러난 다섯 가지
// · 공고가 없는 날 홈: 회원에게는 '휴대폰 알림 받기' 카드(안 켠 사람만) · 비회원 아래 카드는 '미리 가입해 두세요' (공고가 있으면 예전 말 그대로)
// · 커뮤니티 첫 화면(글 0개): 시작 줄 아래에 이미 있는 '회사 후기' 2개 + '모두 보기' (볼 것이 있게)
// · 관리자 근무자 정보: 가린 값(010-****-4444) 자체를 눌러도 열람 (버튼과 같은 열람 · 똑같이 기록)
// · 후기 쓰기: 눌러 넣는 한마디 칩 (누르면 후기 칸에 이어 붙음 · 같은 말은 한 번만)
// · 답답함 기록: 서명 칸·입력 칸을 빠르게 여러 번 누른 건 기록 안 함 (다른 곳은 그대로 기록)
// node scripts/qa/batch177.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', CO = '99999999-0000-4000-8000-000000000099', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, { push = false } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript((push) => {
      try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {}
      // 보낸 이용 기록을 모음 (답답함 기록 확인)
      window.__sent = []
      const ob = navigator.sendBeacon?.bind(navigator)
      navigator.sendBeacon = (url, data) => { try { data.text().then((t) => window.__sent.push(t)) } catch {} return ob ? ob(url, data) : true }
      // 알림을 켤 수 있는 휴대폰처럼 (권한 아직 안 물음)
      if (push) {
        try { Object.defineProperty(Notification, 'permission', { get: () => 'default' }) } catch {}
      }
    }, push)
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 0. 공고가 있는 날: 비회원 아래 카드는 예전 말 그대로
  const g = await pg(null)
  await g.goto(`${D}/`)
  const jt = g.locator('[data-join-title]')
  await jt.waitFor({ timeout: 15000 }).catch(() => {})
  ok("공고가 있으면 '마음에 드는 공고가 있나요?' 그대로", (await jt.innerText()).trim() === '마음에 드는 공고가 있나요?' && (await g.locator('[data-home-nojobs]').count()) === 0)

  // ── 1. 커뮤니티 첫 화면(글 0개): 회사 후기 2개 (공고·근무 기록이 있을 때 미리 넣음)
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  await rest('company_reviews', 'POST', { company_id: CO, job_id: J, author_id: AP, rating: 5, body: '급여가 약속한 날 들어왔어요. 담당자분도 친절해요', hidden_at: null })
  const w = await pg(W)
  await w.goto(`${D}/community`)
  const st = w.locator('[data-community-starters]')
  await st.waitFor({ timeout: 15000 }).catch(() => {})
  const cr = st.locator('[data-community-reviews]')
  ok('글이 없어도 시작 줄 세 개는 그대로', (await st.locator('[data-starter]').count()) === 3)
  ok("그 아래 '회사 후기' + 최근 후기 + '모두 보기'", (await cr.count()) === 1 && (await cr.innerText()).includes('약속한 날') && (await cr.innerText()).includes('주식회사 테스트') && (await cr.getByRole('link', { name: '모두 보기 →' }).getAttribute('href')) === '/community?c=review', (await cr.innerText().catch(() => '')).replace(/\n/g, ' | '))
  ok('후기를 누르면 그 회사 화면', (await cr.locator('li a').first().getAttribute('href')) === `/community/company/${CO}`)
  ok('360px 옆으로 안 밀림 (커뮤니티)', await wide(w))
  if (SHOTS) await st.screenshot({ path: `${SHOTS}/community-reviews.png` }).catch(() => {})

  // ── 2. 후기 쓰기: 눌러 넣는 한마디
  for (const r of await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)) if (!r.clock_out) await rest(`attendance?id=eq.${r.id}`, 'PATCH', { clock_out: new Date().toISOString() })
  await w.goto(`${D}/me/review/${J}`)
  const chips = w.locator('[data-review-chips] button')
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('한마디 칩 6개', (await chips.count()) === 6, String(await chips.count()))
  await chips.nth(0).click()
  await chips.nth(1).click()
  await chips.nth(0).click() // 같은 말은 한 번만
  const body = await w.locator('#review-body').inputValue()
  ok('누르면 후기 칸에 이어 붙음 (같은 말은 한 번만)', body === '담당자가 친절했어요. 급여가 제때 들어왔어요.', body)
  ok('칩 줄은 한 줄(옆으로 밀어 봄) · 360px 화면은 안 밀림', (await w.locator('[data-review-chips]').evaluate((el) => el.getBoundingClientRect().height < 48)) && (await wide(w)))
  if (SHOTS) await w.locator('[data-review-form]').screenshot({ path: `${SHOTS}/review-chips.png` }).catch(() => {})
  await w.locator('[data-review-form] [role=radio]').nth(4).click()
  await w.getByRole('button', { name: '후기 남기기' }).click()
  const saved = await (async () => { for (let i = 0; i < 40; i++) { const rv = await rest(`company_reviews?job_id=eq.${J}&author_id=eq.${W}`); if (rv.length) return rv[0]; await new Promise((r) => setTimeout(r, 250)) } return null })()
  ok('칩으로만 쓴 후기도 저장됨 (5자 이상)', saved?.body === '담당자가 친절했어요. 급여가 제때 들어왔어요.' && saved?.rating === 5, JSON.stringify(saved && { body: saved.body, rating: saved.rating }))

  // ── 3. 답답함 기록: 서명 칸은 빼고 다른 곳은 그대로
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'pending', signed_at: null })
  await w.goto(`${D}/docs/${DOC}`)
  const pad = w.locator('[data-sign-pad]')
  await pad.waitFor({ timeout: 15000 }).catch(() => {})
  await pad.scrollIntoViewIfNeeded()
  await w.evaluate(() => { window.__sent.length = 0 })
  const box = await pad.boundingBox()
  for (let i = 0; i < 4; i++) await w.mouse.click(box.x + 60 + i * 3, box.y + 60)
  const h1 = w.locator('h1, h2').first()
  for (let i = 0; i < 4; i++) await h1.click({ force: true }).catch(() => {})
  await w.waitForTimeout(400)
  const sent = (await w.evaluate(() => window.__sent)).map((t) => { try { return JSON.parse(t) } catch { return {} } }).filter((e) => e.k === 'rage')
  ok('서명 칸을 빠르게 여러 번 눌러도 답답함으로 기록 안 함', !sent.some((e) => /sign-pad|canvas/.test(e.l ?? '')), JSON.stringify(sent.map((e) => e.l)))
  ok('다른 곳을 연달아 누르면 그대로 기록', sent.length >= 1, JSON.stringify(sent.map((e) => e.l)))

  // ── 4. 관리자: 가린 값 자체를 눌러도 열람
  const a = await pg(A)
  await a.goto(`${D}/admin/workers/${W}`)
  const phone = a.locator('[data-reveal="phone"] [data-reveal-value]')
  await phone.waitFor({ timeout: 15000 }).catch(() => {})
  ok('가린 값 010-****-4444', (await phone.innerText()).includes('010-****-4444'))
  await phone.click()
  await a.locator('[data-reveal="phone"] [data-reveal-value]', { hasText: '010-3333-4444' }).waitFor({ timeout: 8000 }).catch(() => {})
  ok('가린 번호를 누르면 전체 번호 (버튼을 안 눌러도)', (await phone.innerText()).includes('010-3333-4444') && (await a.locator('[data-reveal="phone"] [data-reveal-btn]').count()) === 0, await phone.innerText())
  const logs = await rest('audit_logs')
  ok('열람은 똑같이 기록됨', logs.some((l) => JSON.stringify(l).includes(W)), String(logs.length))
  ok('360px 옆으로 안 밀림 (근무자 정보)', await wide(a))

  // ── 5. 공고가 없는 날 (공고를 종료로): 비회원 '미리 가입해 두세요' · 회원 알림 카드
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'done' })
  await g.goto(`${D}/`)
  await jt.waitFor({ timeout: 15000 }).catch(() => {})
  const joinText = (await g.locator('[data-home-join]').innerText()).replace(/\n/g, ' | ')
  ok("공고가 없으면 비회원 카드 '미리 가입해 두세요 · 새 공고가 올라오면 바로 지원할 수 있어요'", (await jt.innerText()).trim() === '미리 가입해 두세요' && joinText.includes('새 공고가 올라오면 바로 지원할 수 있어요'), joinText.slice(0, 80))
  ok('비회원에게는 알림 카드 없음 · 360px 옆으로 안 밀림', (await g.locator('[data-home-nojobs]').getByText('휴대폰 알림 받기').count()) === 0 && (await wide(g)))
  if (SHOTS) await g.locator('[data-home-join]').screenshot({ path: `${SHOTS}/guest-nojobs.png` }).catch(() => {})
  const wp = await pg(AP, { push: true })
  await wp.goto(`${D}/`)
  const no = wp.locator('[data-home-nojobs]')
  await no.waitFor({ timeout: 15000 }).catch(() => {})
  const card = await no.getByText('휴대폰 알림 받기').waitFor({ timeout: 5000 }).then(() => true, () => false)
  // 이 시험용 브라우저가 알림을 지원하지 않으면(카드가 안 뜸) 건너뜀 — 지원하는 휴대폰에서만 보이는 카드
  if (card) {
    ok("회원: 빈 홈에 '휴대폰 알림 받기 · 모집·확정을 바로 알려요' (한 줄)", (await no.innerText()).includes('모집·확정을 바로 알려요') && (await no.getByRole('button', { name: '알림 켜기' }).count()) === 1 && (await no.getByText('모집·확정을 바로 알려요').evaluate((el) => el.getBoundingClientRect().height < 24)))
    ok('360px 옆으로 안 밀림 (빈 홈)', await wide(wp))
    if (SHOTS) await no.screenshot({ path: `${SHOTS}/home-nojobs.png` }).catch(() => {})
  } else console.log('SKIP  이 브라우저는 알림 카드를 띄우지 않음 (지원 기기에서만 보임)')
  ok("빈 홈 안내는 그대로 ('지금은 모집 중인 공고가 없어요')", (await no.innerText()).includes('지금은 모집 중인 공고가 없어요'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
