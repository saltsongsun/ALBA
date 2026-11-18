// 묶음 308 (정기 개선 2026-11-19 02:35 KST)
// · 근무 중(근무 종료 전)이면 '내 근무'·공고 화면에서 얼굴 사진 등록 창·알림 켜기 창을 띄우지 않음 (근무 종료 버튼을 가리지 않게)
//   사진 안내 카드는 그대로 · 근무를 마치면 다시 창이 뜸
// · 사진 등록 창: 같은 안내 문장이 두 번 나오던 것 → 위 제목 아래 한 번만
// · 회사로 시작하기: 대표자 이름을 쓰면 담당자 이름 칸 아래 '대표자와 같아요 · 이름' → 누르면 채우고 '✓ 대표자와 같아요' · 휴대폰 칸으로
// node scripts/qa/batch308.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const W8 = 'bbbbbbbb-0000-4000-8000-0000000308b8', AP8 = '11111111-0000-4000-8000-000000030801', AT8 = 'eeeeeeee-0000-4000-8000-000000030801'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 사진이 없는 근무자 W8: 오늘 공고 확정 + 지금 근무 중 (한 시간 전 시작 · 종료 전)
  const [u] = await rest(`users?id=eq.${W}`)
  const { attendance: _ua, ratings: _ur, ...ub } = u
  await rest('users', 'POST', { ...ub, id: W8, name: '사진없는근무자', phone: '01030803080', photo_at: null, created_at: '2026-10-20T00:00:00Z' })
  const [w8] = await rest(`users?id=eq.${W8}`)
  const [app] = await rest(`applications?user_id=eq.${W}&job_id=eq.${J}`)
  await rest('applications', 'POST', { ...app, id: AP8, user_id: W8, user: w8, position: null, message: null, created_at: '2026-10-20T00:00:00Z' })
  const [att] = await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)
  await rest('attendance', 'POST', { ...att, id: AT8, user_id: W8, user: w8, work_date: kday(), clock_in: new Date(Date.now() - 3600e3).toISOString(), clock_out: null, adj_in: null, adj_out: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { photoLater = false } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript((later) => { try { if (later) sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, photoLater)
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const prompt = (p) => p.locator('dialog[aria-labelledby="photo-prompt-title"]')
  const promptOpen = async (p) => { await p.waitForTimeout(1200); return prompt(p).evaluate((d) => d.open).catch(() => false) }

  // ── 1. 근무 중: 내 근무에 사진 등록 창이 안 뜸 · 근무 종료 버튼이 그대로 보임 · 사진 안내 카드는 있음
  const w = await mk(W8)
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok('근무 중에는 내 근무에 사진 등록 창이 안 뜸', !(await promptOpen(w)))
  const endBtn = w.getByRole('button', { name: /근무 종료/ }).first()
  ok("'근무 종료' 버튼이 가려지지 않고 보임", await endBtn.isVisible().catch(() => false))
  ok("'얼굴 사진을 올려 주세요' 안내 카드는 그대로", one(await w.locator('main').textContent()).includes('얼굴 사진을 올려 주세요'))
  ok('360px 옆으로 안 밀림 (내 근무 · 근무 중)', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/me-working-no-popup.png` })

  // 공고 화면도 근무 중이면 창 없음
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  ok('근무 중에는 공고 화면에도 사진 등록 창이 안 뜸', !(await promptOpen(w)))

  // ── 2. 근무를 마치면 다시 창이 뜸 · 안내 문장은 한 번만
  await rest(`attendance?id=eq.${AT8}`, 'PATCH', { clock_out: new Date().toISOString() })
  const w2 = await mk(W8)
  await w2.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok('근무를 마치면 사진 등록 창이 뜸', await promptOpen(w2))
  const dlg = one(await prompt(w2).textContent())
  ok("창 안에 '얼굴이 잘 보이는 사진' 안내는 한 번만 (칸 아래 같은 문장 없음)", (dlg.match(/얼굴이 잘 보이는/g) ?? []).length === 1, dlg.slice(0, 90))
  ok("창에 '사진 올리기'·'나중에 할게요'는 그대로", dlg.includes('사진 올리기') && dlg.includes('나중에 할게요'))
  if (SHOTS) await w2.screenshot({ path: `${SHOTS}/photo-popup-one-hint.png` })
  await w2.getByRole('button', { name: '나중에 할게요' }).click()
  ok("'나중에 할게요'로 닫힘", !(await prompt(w2).evaluate((d) => d.open).catch(() => true)))
  // 프로필의 사진 칸 안내 줄은 그대로 (창 밖에서는 설명이 필요)
  await w2.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  ok('내 정보의 사진 칸 안내 줄은 그대로', one(await w2.locator('main').textContent()).includes('얼굴이 잘 보이는 사진을 올려 주세요'))

  // ── 3. 회사로 시작하기: 대표자와 같아요
  const s = await mk(null)
  await s.goto(`${D}/start`, { waitUntil: 'networkidle' })
  const chip = s.locator('[data-same-ceo="off"]')
  const same = s.locator('[data-same-ceo="on"]')
  ok('대표자 이름을 쓰기 전에는 칩 없음', (await chip.count()) === 0 && (await same.count()) === 0)
  await s.locator('#ceo_name').fill('김대표')
  await chip.waitFor({ timeout: 3000 }).catch(() => {})
  ok("대표자 이름을 쓰면 '대표자와 같아요 · 김대표' 칩", (await chip.textContent().catch(() => '')).replace(/\s+/g, '') === '대표자와같아요·김대표', await chip.textContent().catch(() => ''))
  ok('360px 옆으로 안 밀림 (회사로 시작하기)', await noSide(s))
  await chip.scrollIntoViewIfNeeded()
  if (SHOTS) await s.locator('#name').locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/start-same-ceo-chip.png` }).catch(() => {})
  await chip.click()
  ok("누르면 담당자 이름 = 김대표 · '✓ 대표자와 같아요'", (await s.locator('#name').inputValue()) === '김대표' && one(await same.textContent().catch(() => '')) === '✓ 대표자와 같아요')
  ok('누른 뒤 다음 칸(휴대폰 번호)으로', (await s.evaluate(() => document.activeElement?.id)) === 'phone')
  if (SHOTS) await s.locator('#name').locator('xpath=ancestor::section[1]').screenshot({ path: `${SHOTS}/start-same-ceo-done.png` }).catch(() => {})
  await s.locator('#name').fill('이담당')
  ok('담당자를 다른 이름으로 쓰면 칩·✓ 없음', (await chip.count()) === 0 && (await same.count()) === 0)
  await s.locator('#name').fill('')
  ok('담당자 칸을 비우면 칩이 다시', (await chip.count()) === 1)
  await s.locator('#name').fill('김대표')
  ok('직접 같은 이름을 써도 ✓', (await same.count()) === 1)
  await s.locator('#ceo_name').fill('')
  ok('대표자 이름을 지우면 칩·✓ 없음', (await chip.count()) === 0 && (await same.count()) === 0)

  // 이미 로그인한 관리자(회사 정보만): 담당자 칸이 없으니 칩도 없음
  const a = await mk(A)
  await a.goto(`${D}/start`, { waitUntil: 'networkidle' })
  if ((await a.locator('#ceo_name').count()) > 0) {
    await a.locator('#ceo_name').fill('김대표')
    await a.waitForTimeout(300)
  }
  ok('로그인한 관리자의 회사 추가에는 담당자 칸·칩 없음', (await a.locator('#name').count()) === 0 && (await a.locator('[data-same-ceo]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
