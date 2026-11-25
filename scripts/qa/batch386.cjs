// 묶음 386 (정기 개선 2026-11-25 10:35 KST)
// 공고 쓰기 화면에서 바로 '기본 서식 불러오기' (처음 쓰는 회사는 서식이 없어서 서류 메뉴로 나갔다 오면 쓰던 공고가 날아감)
// · 서식이 하나도 없음: '기본 서식이 아직 없어요' + [불러오기] → 이 회사에 기본 서식 4개 · 화면 그대로(쓰던 제목 그대로)
//   · '✓ 기본 서식 4개를 불러왔어요' 톡 · 새 서식이 차례로 올라옴(0.25초) · 근로계약서(기본)는 미리 체크 · 나머지는 체크 안 함
// · 서식은 있는데 근로계약서가 없음: '근로계약서 서식이 없어요' 같은 줄
// · 다른 회사 서식은 그대로 (지금 회사에만 만들어짐) · 360px 옆으로 안 밀림 · 움직임 줄이기면 바로
// (정기 개선 2026-11-25 12:35: 줄 아래에 '또는 내 다른 회사 것' 줄이 붙을 수 있어 첫 줄만 봄 · 그 줄은 batch387)
// node scripts/qa/batch386.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C3 = '99999999-0000-4000-8000-000000000386', C4 = '99999999-0000-4000-8000-000000003862'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '새회사386', seal_image: null, created_at: now })
  await rest('companies', 'POST', { ...c1, id: C4, company_name: '서약만386', seal_image: null, created_at: now })
  // C4: 서식은 있지만 근로계약서가 없음
  await rest('doc_templates', 'POST', { id: 'ffffffff-0000-4000-8000-000000038601', company_id: C4, title: '내 서약서386', kind: 'pledge', body: '서약합니다', is_default: false, active: true, created_at: now })
  const c1Before = ((await rest(`doc_templates?company_id=eq.${C1}`)) ?? []).length

  const b = await chromium.launch()
  const errs = []
  const pg = async (company, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'hw_company', value: company, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 서식이 하나도 없는 회사: 공고를 쓰다가 바로 불러오기
  const a = await pg(C3)
  await a.goto(`${D}/admin/jobs/new#docs`, { waitUntil: 'networkidle' })
  const title = a.locator('input[name=title]').first()
  await title.fill('쓰던 공고386')
  const row = a.locator('[data-tpl-missing]')
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("서식 없음: '기본 서식이 아직 없어요' + [불러오기] (한 줄 · 글이 잘리지 않음)", one(await row.locator('div').first().innerText().catch(() => '')) === '기본 서식이 아직 없어요 불러오기' && (await row.locator('div').first().evaluate((el) => el.getBoundingClientRect().height < 44).catch(() => false)) && (await row.locator('span').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false)), one(await row.innerText().catch(() => '')))
  ok('예전 문구(등록된 서식이 없습니다…)는 없음', (await a.getByText('등록된 서식이 없습니다').count()) === 0)
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) await row.locator('xpath=..').screenshot({ path: `${SHOTS}/tpl-missing.png` }).catch(() => {})
  const url0 = a.url()
  await a.locator('[data-tpl-restore]').click()
  const done = a.locator('[data-tpl-restored]')
  await done.waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 '✓ 기본 서식 4개를 불러왔어요' 톡 · 화면 그대로 · 쓰던 제목 그대로", one(await done.innerText().catch(() => '')) === '✓ 기본 서식 4개를 불러왔어요' && ((await done.getAttribute('class')) || '').includes('animate-pop') && a.url() === url0 && (await title.inputValue()) === '쓰던 공고386', `${a.url()} · ${await title.inputValue().catch(() => '')}`)
  ok('불러온 뒤 없음 줄은 사라짐', (await row.count()) === 0)
  const fresh = a.locator('[data-tpl-fresh]')
  const anim = await fresh.first().evaluate((el) => ({ n: getComputedStyle(el).animationName, d: getComputedStyle(el).animationDuration })).catch(() => ({}))
  const delays = await fresh.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDelay))
  ok('새 서식 4개가 차례로 올라옴 (rise 0.25초 · 0/60/120/180ms)', (await fresh.count()) === 4 && anim.n === 'rise' && anim.d === '0.25s' && delays.join(',') === '0s,0.06s,0.12s,0.18s', `${JSON.stringify(anim)} ${delays.join(',')}`)
  const checks = await a.locator('input[name=required_docs]').evaluateAll((els) => els.map((el) => [el.closest('label')?.innerText.trim(), el.checked]))
  const contract = checks.find(([t]) => (t || '').includes('근로계약서'))
  ok('근로계약서는 미리 체크 · 나머지 3개는 체크 안 함', !!contract && contract[1] === true && checks.filter(([, c]) => !c).length === 3, JSON.stringify(checks))
  const c3 = (await rest(`doc_templates?company_id=eq.${C3}`)) ?? []
  ok('이 회사(새회사386)에만 4개 · 다른 회사 서식 수는 그대로', c3.length === 4 && c3.every((t) => t.company_id === C3) && ((await rest(`doc_templates?company_id=eq.${C1}`)) ?? []).length === c1Before, `${c3.length} · C1 ${c1Before}`)
  if (SHOTS) {
    await a.waitForTimeout(500)
    await a.locator('[data-tpl-restored]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await a.evaluate(() => window.scrollBy(0, -120))
    await a.waitForTimeout(200)
    await a.screenshot({ path: `${SHOTS}/tpl-restored.png` }).catch(() => {})
  }
  // 한 번 더 누를 일은 없음(줄이 사라짐) · 서버도 이름이 같으면 건너뜀 → 다시 불러도 늘지 않음 (새로 열면 줄 없음)
  await a.goto(`${D}/admin/jobs/new#docs`, { waitUntil: 'networkidle' })
  ok('다시 열면 없음 줄 없음 · 서식 4개', (await a.locator('[data-tpl-missing]').count()) === 0 && (await a.locator('input[name=required_docs]').count()) === 4)

  // ── 2. 서식은 있는데 근로계약서가 없는 회사
  const c = await pg(C4)
  await c.goto(`${D}/admin/jobs/new#docs`, { waitUntil: 'networkidle' })
  const row4 = c.locator('[data-tpl-missing]')
  await row4.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근로계약서만 없음: '근로계약서 서식이 없어요' (한 줄 · 잘리지 않음)", one(await row4.locator('div').first().innerText().catch(() => '')) === '근로계약서 서식이 없어요 불러오기' && (await row4.locator('span').first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false)), one(await row4.innerText().catch(() => '')))
  if (SHOTS) {
    await row4.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await c.waitForTimeout(200)
    await row4.screenshot({ path: `${SHOTS}/tpl-missing-contract.png` }).catch(() => {})
  }
  await c.locator('[data-tpl-restore]').click()
  await c.locator('[data-tpl-restored]').waitFor({ timeout: 15000 }).catch(() => {})
  const mine = c.locator('input[name=required_docs]')
  ok("불러오면 '✓ 기본 서식 4개를 불러왔어요' · 원래 서식(내 서약서386)은 그대로 체크 안 함", one(await c.locator('[data-tpl-restored]').innerText().catch(() => '')) === '✓ 기본 서식 4개를 불러왔어요' && (await mine.count()) === 5 && !(await c.locator('label', { hasText: '내 서약서386' }).locator('input').isChecked()))

  // ── 3. 움직임 줄이기: 올라오는 움직임 없음
  await rest(`doc_templates?company_id=eq.${C3}`, 'DELETE')
  const r = await pg(C3, { reducedMotion: 'reduce' })
  await r.goto(`${D}/admin/jobs/new#docs`, { waitUntil: 'networkidle' })
  await r.locator('[data-tpl-restore]').click().catch(() => {})
  await r.locator('[data-tpl-fresh]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const rd = await r.locator('[data-tpl-fresh]').first().evaluate((el) => getComputedStyle(el).animationDuration).catch(() => '')
  ok('움직임 줄이기: 바로 (0.01ms)', rd === '1e-05s' || rd === '0.01ms', rd)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
