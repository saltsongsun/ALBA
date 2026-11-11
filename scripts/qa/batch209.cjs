// 묶음 209 (정기 개선 2026-11-12 05:35 KST)
// · 로그인 '비밀번호를 잊었다면': 공고·회사 링크로 왔으면 그 회사 담당자 번호를 먼저 (그 회사 관리자가 초기화해 줄 수 있음)
//   + 해피워크 고객센터 · 같은 번호면 한 번만 · 비밀번호가 틀렸을 때 나오는 도움말도 같은 순서
// · 아래 전화번호: 작은 밑줄 글자 대신 누르기 쉬운 전화 버튼 (높이 40px · 번호도 보임 · 긴 회사 이름은 줄임)
// node scripts/qa/batch209.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000209', C3 = '99999999-0000-4000-8000-00000000020a'
const J2 = 'cccccccc-0000-4000-8000-0000000002c9'
const LONG = '주식회사 아주아주 이름이 긴 행사 기획 운영 대행사'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새벽행사', contact_name: '김담당', contact_phone: '01077778888', seal_image: null, created_at: new Date().toISOString() })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: LONG, contact_name: '이담당', contact_phone: '0212345678', seal_image: null, created_at: new Date().toISOString() })
  await rest('jobs', 'POST', { ...j1, id: J2, company_id: C2, company: { company_name: '새벽행사' }, title: '새벽 주차 안내', applications: [], required_docs: [] })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const calls = () => p.locator('[data-login-call]').evaluateAll((l) => l.map((a) => ({ t: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), h: a.getBoundingClientRect().height, r: a.getBoundingClientRect().right, l: a.getBoundingClientRect().left })))
  const open = async (next) => {
    await p.goto(`${D}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`, { waitUntil: 'networkidle' })
    await p.locator('[data-login-help]').waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 그냥 로그인: 고객센터 버튼 하나
  await open('')
  let c = await calls()
  ok("안내 '비밀번호를 잊었다면 담당자에게 초기화를 요청하세요.'", one(await p.locator('[data-login-help] p').innerText()) === '비밀번호를 잊었다면 담당자에게 초기화를 요청하세요.')
  ok("전화 버튼 하나: '해피워크 고객센터 010-1234-5678'", c.length === 1 && c[0].t === '해피워크 고객센터 010-1234-5678' && c[0].href === 'tel:01012345678', JSON.stringify(c))
  ok('누르기 쉬운 크기 (높이 40px 이상) · 화면 안 · 옆으로 안 밀림', c.every((x) => x.h >= 40 && x.l >= 8 && x.r <= 352) && (await noSide(p)), JSON.stringify(c.map((x) => x.h)))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/login-help.png`, clip: { x: 0, y: 380, width: 360, height: 260 } }).catch(() => {})

  // ── 2. 다른 회사 공고에서 온 로그인: 그 회사 담당자 먼저 + 고객센터
  await open(`/jobs/${J2}`)
  c = await calls()
  ok("공고에서 왔으면 '새벽행사 담당자 010-7777-8888' 먼저 · 그다음 고객센터", c.length === 2 && c[0].t === '새벽행사 담당자 010-7777-8888' && c[0].href === 'tel:01077778888' && c[1].t.startsWith('해피워크 고객센터'), JSON.stringify(c.map((x) => x.t)))
  ok('두 버튼 모두 40px 이상 · 화면 안 · 옆으로 안 밀림', c.every((x) => x.h >= 40 && x.l >= 8 && x.r <= 352) && (await noSide(p)))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/login-help-company.png`, clip: { x: 0, y: 380, width: 360, height: 320 } }).catch(() => {})

  // 비밀번호가 틀렸을 때 도움말도 같은 순서
  await p.locator('input[name=phone]').fill('01033334444')
  await p.locator('input[name=pin]').fill('135792')
  await p.getByRole('button', { name: '로그인' }).click()
  const forgot = p.locator('[data-login-forgot]')
  await forgot.waitFor({ timeout: 10000 }).catch(() => {})
  const tels = await forgot.locator('a[href^="tel:"]').evaluateAll((l) => l.map((a) => a.getAttribute('href')))
  ok('틀렸을 때 도움말: 그 회사 담당자 → 고객센터 순서로 전화하기', JSON.stringify(tels) === JSON.stringify(['tel:01077778888', 'tel:01012345678']) && one(await forgot.innerText()).includes('새벽행사 담당자 010-7777-8888 전화하기'), JSON.stringify(tels))
  ok('도움말 줄도 화면 안 · 옆으로 안 밀림', (await forgot.locator('a').evaluateAll((l) => l.every((a) => a.getBoundingClientRect().right <= innerWidth - 8))) && (await noSide(p)))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/login-forgot-company.png`, clip: { x: 0, y: 200, width: 360, height: 420 } }).catch(() => {})

  // ── 3. 회사 링크(/?co=)에서 온 로그인도 같게 · 긴 회사 이름은 줄임
  await open(`/?co=${C3}`)
  c = await calls()
  ok("회사 링크에서 왔으면 그 회사 담당자 먼저 (02 번호도 '02-1234-5678')", c.length === 2 && c[0].t.endsWith('담당자 02-1234-5678') && c[0].href === 'tel:0212345678', JSON.stringify(c.map((x) => x.t)))
  const cut = await p.locator('[data-login-call]').first().evaluate((a) => { const n = a.querySelector('span'); return getComputedStyle(n).textOverflow === 'ellipsis' && n.scrollWidth > n.clientWidth && a.getBoundingClientRect().right <= innerWidth - 8 })
  ok('긴 회사 이름은 버튼 안에서 줄임 (번호는 그대로 보임) · 한 줄', cut && c[0].h < 44)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/login-help-long.png`, clip: { x: 0, y: 380, width: 360, height: 320 } }).catch(() => {})

  // ── 4. 운영 회사(고객센터와 같은 번호) 공고에서 왔으면 한 번만
  await open(`/jobs/${J}`)
  c = await calls()
  ok("같은 번호면 버튼 하나 ('주식회사 테스트 담당자')", c.length === 1 && c[0].t === '주식회사 테스트 담당자 010-1234-5678', JSON.stringify(c.map((x) => x.t)))

  // 정리
  await rest(`jobs?id=eq.${J2}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
