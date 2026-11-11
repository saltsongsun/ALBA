// 묶음 205 (정기 개선 2026-11-11 23:36 KST)
// · 새 회사(공고를 아직 안 올림)가 '회사 설정'을 저장하면: 그 자리에서 다음 할 일 카드
//   - 계약서 정보 4가지를 다 채웠으면 '회사 정보를 다 채웠어요 · 다음은 첫 공고 올리기예요'
//   - 덜 채웠으면 '저장했어요 · 남은 n가지는 계약서 보내기 전에 채워 주세요'
//   - '첫 공고 올리기 →' → 공고 등록 화면 · 카드가 화면 안으로 옮겨져 보임 (저장 버튼이 두 군데라)
//   - '저장했습니다'와 같은 말을 두 번 하지 않음
// · 공고를 올린 적 있는 회사는 전처럼 '저장했습니다.'만
// node scripts/qa/batch205.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const FACE = path.join(__dirname, 'face.jpg') // 직인 대신 올릴 작은 그림
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
// 맞는 사업자등록번호 (끝자리 검증 숫자)
const brn = () => { const d = [1, 2, 3, 4, 5, 6, 7, 8, 9]; const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let s = 0; for (let i = 0; i < 9; i++) s += d[i] * w[i]; s += Math.floor((d[8] * 5) / 10); return d.join('') + ((10 - (s % 10)) % 10) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const next = p.locator('[data-settings-next]')
  const save = () => p.getByRole('button', { name: '설정 저장' }).last().click()

  // ── 0. 공고를 올린 적 있는 회사: 전처럼 '저장했습니다.'만
  await p.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await p.locator('input[name=company_address]').fill('경남 진주시 남강로 1')
  await save()
  ok("공고를 올린 회사: 전처럼 '저장했습니다.' (다음 할 일 카드 없음)", (await p.getByText('저장했습니다.').first().waitFor({ timeout: 15000 }).then(() => true, () => false)) && (await next.count()) === 0)

  // ── 1. 새 회사를 만들고 → 회사 설정
  await p.goto(`${D}/start`, { waitUntil: 'networkidle' })
  await p.locator('input[name=company_name]').fill('새봄이벤트')
  await p.getByPlaceholder('숫자 10자리').fill(brn())
  await p.locator('input[name=ceo_name]').fill('김새봄')
  await p.locator('input[name=agree_privacy]').check().catch(() => {})
  await p.getByRole('button', { name: '회사로 시작하기' }).click()
  await p.waitForURL((u) => new URL(u).pathname === '/admin', { timeout: 20000 }).catch(() => {})
  await p.locator('[data-start-steps]').waitFor({ timeout: 15000 }).catch(() => {}) // 화면이 다 그려진 뒤에 읽음
  ok('새 회사로 시작 (시작하기 카드)', new URL(p.url()).pathname === '/admin' && (await p.locator('[data-start-steps]').count()) === 1, p.url())
  // 첫 단계 '회사 정보 채우기 · 지금 하기' → 설정
  await p.locator('[data-start-steps] [data-next-step]').click()
  await p.waitForURL((u) => new URL(u).pathname === '/admin/settings', { timeout: 15000 }).catch(() => {})
  await p.locator('input[name=company_address]').waitFor({ timeout: 15000 })
  ok('저장 전에는 다음 할 일 카드 없음', (await next.count()) === 0)

  // ── 2. 덜 채우고 저장 (주소만 · 직인은 아직)
  await p.locator('input[name=company_address]').fill('경남 진주시 새봄로 12')
  await save()
  await next.waitFor({ timeout: 15000 }).catch(() => {})
  const t2 = one(await next.innerText().catch(() => ''))
  ok("덜 채웠으면 '저장했어요 · 남은 1가지는 계약서 보내기 전에 채워 주세요'", (await next.getAttribute('data-settings-next')) === 'partial' && t2 === '✓ 저장했어요 남은 1가지는 계약서 보내기 전에 채워 주세요 첫 공고 올리기 →', t2)
  ok("같은 말을 두 번 하지 않음 ('저장했습니다.' 없음)", (await p.getByText('저장했습니다.').count()) === 0)
  await p.waitForTimeout(900)
  ok('카드가 화면 안으로 옮겨져 보임 · 톡 나타남', (await next.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 56 && r.bottom <= innerHeight })) && ((await next.getAttribute('class')) ?? '').includes('animate-pop'))
  ok('한 줄씩 (제목 · 안내) · 버튼 40px 이상 · 옆으로 안 밀림', await next.evaluate((el) => { const b = el.querySelector('b').getBoundingClientRect(), s = el.querySelector('b + span').getBoundingClientRect(), a = el.querySelector('a').getBoundingClientRect(); return b.height < 24 && s.height < 20 && a.height >= 40 && document.scrollingElement.scrollWidth <= innerWidth + 1 }))
  ok("'첫 공고 올리기 →' → 공고 등록", (await next.locator('a').getAttribute('href')) === '/admin/jobs/new')
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/settings-next-partial.png` }).catch(() => {})
  const saved = (await rest('companies')).find((c) => c.company_name === '새봄이벤트')
  ok('저장된 값 (주소)', saved?.company_address === '경남 진주시 새봄로 12', saved?.company_address)

  // ── 3. 직인까지 채우고 저장 → '다 채웠어요'
  await p.locator('input[type=file]').first().setInputFiles(FACE)
  await p.getByText('아래 ‘저장’을 눌러야 바뀌어요.').first().waitFor({ timeout: 15000 }).catch(() => {})
  await save()
  await p.locator('[data-settings-next="done"]').waitFor({ timeout: 20000 }).catch(() => {})
  const t3 = one(await next.innerText().catch(() => ''))
  ok("다 채웠으면 '회사 정보를 다 채웠어요 · 다음은 첫 공고 올리기예요'", t3 === '✓ 회사 정보를 다 채웠어요 다음은 첫 공고 올리기예요 첫 공고 올리기 →', t3)
  await p.waitForTimeout(900)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/settings-next-done.png` }).catch(() => {})
  // 누르면 공고 등록 화면 (저장을 마쳤으니 '저장하지 않았어요'로 막지 않음)
  await next.locator('a').click()
  await p.waitForURL((u) => new URL(u).pathname === '/admin/jobs/new', { timeout: 15000 }).catch(() => {})
  ok('누르면 바로 공고 등록 화면', new URL(p.url()).pathname === '/admin/jobs/new', p.url())
  // 홈의 시작하기: 첫 단계 완료 → 다음은 '첫 공고 올리기'
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const steps = p.locator('[data-start-steps]')
  ok("홈 시작하기: 1단계 완료 · 지금 할 일은 '첫 공고 올리기'", (await steps.locator('a[data-done]').count()) === 1 && one(await steps.locator('[data-next-step]').innerText().catch(() => '')).includes('첫 공고 올리기'), one(await steps.locator('[data-next-step]').innerText().catch(() => '')))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
