// 묶음 376 (정기 개선 2026-11-24 15:35 KST)
// · 회사 설정 '운영 기본값' 위 '내 다른 회사 값으로 [회사]' (여러 회사를 맡은 관리자): 누르면 문의 담당자·연락처·기본 시급 칸을 그 회사 값으로 채움
//   · 저장은 '설정 저장'으로 (저장 바가 뜸 · 누르기 전엔 바뀌지 않음) · 5인 이상·상호·사업자번호·주소·직인은 안 가져옴
//   · 내가 대표·관리자로 있는 회사 중 값이 다른 곳만 (같은 값인 회사 · 속하지 않은 회사 · 최고 관리자 권한으로만 보이는 회사는 안 나옴)
//   · 한 회사만 맡은 관리자에겐 없음
// · 채운 칸은 초록 테두리 0.3초 한 번 + '✓ ○○ 값으로 채웠어요 · 저장해야 바뀌어요' 톡 (움직임 줄이기면 테두리 없이 글만)
// node scripts/qa/batch376.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000376', C3 = '99999999-0000-4000-8000-000000003763', C4 = '99999999-0000-4000-8000-000000003764'
const M = 'aaaaaaaa-0000-4000-8000-000000037601', N1 = 'aaaaaaaa-0000-4000-8000-000000037602'
const CO2 = '새로연회사376', CO3 = '같은값회사376', CO4 = '남의회사376'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  // C2: 값이 다른 내 회사 · C3: 지금 회사와 값이 같은 내 회사 · C4: 속하지 않은 회사
  await rest('companies', 'POST', { ...c1, id: C2, company_name: CO2, join_code: 'FL376', seal_image: null, contact_name: '김담당376', contact_phone: '01037600009', default_hourly_wage: 11000, workplace_5plus: !c1.workplace_5plus, business_no: '1112233376', company_address: '부산 376', created_at: nowIso })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: CO3, join_code: 'SM376', seal_image: null, created_at: nowIso })
  await rest('companies', 'POST', { ...c1, id: C4, company_name: CO4, join_code: 'OT376', seal_image: null, contact_name: '남의담당376', contact_phone: '01037600004', default_hourly_wage: 12000, created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '여러회사관리자376', phone: '01037600001', is_super: false })
  await rest('users', 'POST', { ...a, id: N1, name: '한회사관리자376', phone: '01037600002', is_super: false })
  for (const [company_id, user_id, role] of [[C1, M, 'admin'], [C2, M, 'owner'], [C3, M, 'admin'], [C1, N1, 'admin']]) await rest('company_members', 'POST', { company_id, user_id, role, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p) => {
    await p.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
    await p.locator('main h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const val = (p, n) => p.locator(`#settings-form input[name=${n}]`).inputValue()

  // ── 1. 한 회사만 맡은 관리자: 줄 없음
  const n = await pg(N1)
  await open(n)
  ok('한 회사 관리자: 다른 회사 값 줄 없음', (await n.locator('[data-fill-from]').count()) === 0)

  // ── 2. 여러 회사 관리자: 값이 다른 내 회사(C2)만
  const m = await pg(M)
  await open(m)
  const row = m.locator('[data-fill-from]')
  const chips = await row.locator('[data-fill-company]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-fill-company'), e.textContent.trim()]))
  ok(`'내 다른 회사 값으로 [${CO2}]' — 값이 같은 회사·속하지 않은 회사는 없음`, JSON.stringify(chips) === JSON.stringify([[C2, CO2]]) && one(await row.innerText()).startsWith('내 다른 회사 값으로'), JSON.stringify(chips))
  ok("'운영 기본값' 제목 바로 아래 · 한 줄 · 360px 옆으로 안 밀림", (await row.evaluate((el) => el.previousElementSibling?.textContent === '운영 기본값' && el.getBoundingClientRect().height < 44)) && (await noSide(m)))
  const before = { name: await val(m, 'contact_name'), phone: await val(m, 'contact_phone'), wage: await val(m, 'default_hourly_wage'), five: await m.locator('#settings-form input[name=workplace_5plus]').isChecked(), biz: await val(m, 'business_no'), addr: await val(m, 'company_address') }
  ok('누르기 전엔 저장 바 없음', (await m.locator('[data-unsaved]').count()) === 0)

  // ── 3. 누르면 세 칸만 채움 · 테두리 한 번 · ✓ 줄 · 저장 바
  await row.locator(`[data-fill-company="${C2}"]`).click()
  await m.waitForTimeout(60)
  const ring = await m.locator('#settings-form input[name=contact_name]').evaluate((el) => el.getAnimations().map((x) => x.effect?.getTiming().duration))
  ok('채운 칸에 초록 테두리 0.3초 한 번', JSON.stringify(ring) === '[300]', JSON.stringify(ring))
  ok("문의 담당자 '김담당376' · 연락처 '010-3760-0009' · 기본 시급 '11000'", (await val(m, 'contact_name')) === '김담당376' && (await val(m, 'contact_phone')) === '010-3760-0009' && (await val(m, 'default_hourly_wage')) === '11000')
  ok('5인 이상 · 사업자번호 · 주소는 그대로 (회사마다 다른 것)', (await m.locator('#settings-form input[name=workplace_5plus]').isChecked()) === before.five && (await val(m, 'business_no')) === before.biz && (await val(m, 'company_address')) === before.addr)
  const done = m.locator('[data-fill-done]')
  ok(`'✓ ${CO2} 값으로 채웠어요 · 저장해야 바뀌어요' (톡)`, one(await done.innerText().catch(() => '')) === `✓ ${CO2} 값으로 채웠어요 · 저장해야 바뀌어요` && (await done.evaluate((el) => getComputedStyle(el).animationName)) === 'pop', one(await done.innerText().catch(() => '')))
  await m.waitForTimeout(300)
  ok("저장 바 '저장하지 않은 변경이 있어요'가 뜸", (await m.locator('[data-unsaved]').count()) === 1 && one(await m.locator('[data-unsaved]').innerText()).includes('저장하지 않은 변경이 있어요'))
  ok('미리 보기(근무자에게 이렇게 보여요)도 새 담당자로', one(await m.locator('[data-preview-contact]').innerText().catch(() => '')).includes('김담당376'), one(await m.locator('[data-preview-contact]').innerText().catch(() => '')))
  const [c1mid] = await rest(`companies?id=eq.${C1}`)
  ok('저장 전엔 회사 값 그대로', c1mid.contact_name === c1.contact_name && c1mid.default_hourly_wage === c1.default_hourly_wage)
  if (SHOTS) {
    const sec = m.locator('section', { has: row })
    await sec.screenshot({ path: `${SHOTS}/settings-fill.png` }).catch(() => {})
  }

  // ── 4. 저장 → 지금 회사(C1)만 바뀜 · C2는 그대로
  await m.locator('[data-unsaved] button[form=settings-form]').click()
  await m.locator('[data-saved-toast]').waitFor({ timeout: 15000 }).catch(() => {})
  await m.waitForTimeout(500)
  const [c1after] = await rest(`companies?id=eq.${C1}`)
  const [c2after] = await rest(`companies?id=eq.${C2}`)
  ok('저장하면 지금 회사 값이 바뀜 (담당자 · 연락처 · 시급)', c1after.contact_name === '김담당376' && c1after.contact_phone === '01037600009' && c1after.default_hourly_wage === 11000, JSON.stringify([c1after.contact_name, c1after.contact_phone, c1after.default_hourly_wage]))
  ok('지금 회사의 5인 이상 · 사업자번호 · 주소는 그대로 · 가져온 회사(C2)도 그대로', c1after.workplace_5plus === c1.workplace_5plus && c1after.business_no === c1.business_no && c1after.company_address === c1.company_address && c2after.contact_name === '김담당376' && c2after.business_no === '1112233376' && c2after.workplace_5plus === !c1.workplace_5plus)
  await open(m)
  // C2와 같아졌으니 C2는 빠지고, 예전 값과 같던 C3은 이제 달라져서 나옴
  const after = await m.locator('[data-fill-company]').evaluateAll((els) => els.map((e) => e.getAttribute('data-fill-company')))
  ok('값이 같아진 회사(C2)는 더 안 나옴 · 이제 달라진 C3은 나옴', JSON.stringify(after) === JSON.stringify([C3]), JSON.stringify(after))

  // ── 5. 최고 관리자: 속하지 않은 회사는 안 나옴
  const s = await pg(A)
  await open(s)
  const sc = await s.locator('[data-fill-company]').evaluateAll((els) => els.map((e) => e.getAttribute('data-fill-company')))
  ok('최고 관리자 권한으로만 보이는 회사 값은 안 나옴', !sc.includes(C2) && !sc.includes(C3) && !sc.includes(C4), JSON.stringify(sc))

  // ── 6. 움직임 줄이기: 테두리 없이 글만
  await rest(`companies?id=eq.${C1}`, 'PATCH', { contact_name: c1.contact_name, contact_phone: c1.contact_phone, default_hourly_wage: c1.default_hourly_wage })
  const r = await pg(M, { reducedMotion: 'reduce' })
  await open(r)
  await r.locator(`[data-fill-company="${C2}"]`).click()
  await r.waitForTimeout(60)
  const rr = await r.locator('#settings-form input[name=contact_name]').evaluate((el) => el.getAnimations().length)
  ok("'움직임 줄이기'면 테두리 없음 · 값과 ✓ 줄은 그대로", rr === 0 && (await r.locator('#settings-form input[name=contact_name]').inputValue()) === '김담당376' && (await r.locator('[data-fill-done]').count()) === 1, String(rr))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
