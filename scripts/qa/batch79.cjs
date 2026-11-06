// 묶음 79: 인사이트로 찾은 개선 — 가입 비밀번호를 누르기 전에 바로 확인 · 오류 기록에서 'Script error.' 빼기 · 답답함 신호 위치를 자세히
// · 가입: 생년월일(주민번호 앞자리)·연속 숫자로 된 비밀번호는 입력하자마자 노란 안내 · 확인이 다르면 안내 · 맞으면 '✓ 쓸 수 있는 비밀번호예요'
// · 다른 곳 스크립트의 'Script error.'·다른 사이트 파일 오류는 기록 안 함 (앱 오류는 그대로)
// · 같은 곳 연달아 누름: 'div' 대신 'li[data-…] › span'처럼 어디인지 (글자는 안 보냄)
// node scripts/qa/batch79.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const [D, MD] = process.argv.slice(2)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  // ── 1. 가입 비밀번호 바로 확인 ──
  let posts = 0
  p.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts++ })
  await p.goto(`${D}/signup?type=worker`)
  const hint = p.locator('[data-pin-hint]')
  await hint.waitFor({ timeout: 10000 }).catch(() => {})
  ok("처음엔 규칙 안내 ('생년월일·휴대폰 번호·123456 같은 번호는 안 돼요')", (await hint.getAttribute('data-pin-hint')) === 'rule' && (await hint.innerText()).includes('생년월일'))
  ok('규칙 안내는 한 줄 (360px)', (await hint.evaluate((el) => Math.round(el.getBoundingClientRect().height))) < 22)
  await p.locator('input[name=rrn1]').fill('990303')
  await p.locator('input[name=rrn2]').fill('1234567')
  await p.locator('input[name=pin]').pressSequentially('990303')
  await p.waitForTimeout(200)
  ok("생년월일 비밀번호 → 바로 '생년월일로 된 비밀번호는 쓸 수 없어요.'", (await hint.getAttribute('data-pin-hint')) === 'weak' && (await hint.innerText()).includes('생년월일로 된'), await hint.innerText())
  ok('비밀번호 칸: 노란 테두리 · aria-invalid', (await p.locator('input[name=pin]').getAttribute('aria-invalid')) === 'true')
  ok('서버로 보내지 않음 (입력만으로 확인)', posts === 0)
  await p.locator('input[name=pin]').fill('')
  await p.locator('input[name=pin]').pressSequentially('345678')
  await p.waitForTimeout(200)
  ok("연속 숫자 → '연속된 숫자(123456 등)는 쓸 수 없어요.'", (await hint.innerText()).includes('연속된 숫자'))
  await p.locator('input[name=pin]').fill('')
  await p.locator('input[name=pin]').pressSequentially('583920')
  await p.locator('input[name=pin2]').pressSequentially('583921')
  await p.waitForTimeout(200)
  ok('확인이 다르면 바로 안내', (await hint.innerText()).includes('비밀번호 확인이 달라요'))
  await p.locator('input[name=pin2]').fill('')
  await p.locator('input[name=pin2]').pressSequentially('583920')
  await p.waitForTimeout(200)
  ok("맞으면 '✓ 쓸 수 있는 비밀번호예요 · 확인도 같아요'", (await hint.getAttribute('data-pin-hint')) === 'ok' && (await hint.innerText()).includes('확인도 같아요'), await hint.innerText())
  ok('360px: 옆으로 안 밀림 (가입)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 주민번호를 나중에 넣어도 다시 확인
  await p.locator('input[name=pin]').fill('')
  await p.locator('input[name=pin2]').fill('')
  await p.locator('input[name=rrn1]').fill('')
  await p.locator('input[name=pin]').pressSequentially('040509')
  await p.locator('input[name=rrn1]').pressSequentially('040509')
  await p.locator('input[name=rrn2]').fill('')
  await p.locator('input[name=rrn2]').pressSequentially('3')
  await p.waitForTimeout(200)
  ok('주민번호를 나중에 넣어도 생년월일 비밀번호를 알려 줌', (await hint.innerText()).includes('생년월일로 된'), await hint.innerText())

  // ── 2. 오류 기록: 내용 없는 'Script error.'·다른 사이트 파일 오류는 뺌 ──
  await p.goto(`${D}/`)
  await p.waitForLoadState('networkidle').catch(() => {})
  await p.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom from ext', filename: 'chrome-extension://abc/x.js' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom other site', filename: 'https://evil.example/x.js' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'real app boom', filename: location.origin + '/_next/static/chunks/a.js' }))
  })
  // ── 3. 답답함 신호 위치 ──
  await p.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<ul style="position:fixed;top:120px;left:10px;z-index:999;background:#eee"><li data-msg-id="m1"><div><span style="display:inline-block;width:80px;height:40px">rage-spot-x</span></div></li></ul>')
  })
  for (let i = 0; i < 3; i++) await p.getByText('rage-spot-x').click()
  await p.waitForTimeout(800)
  const ev = await rest('usage_events')
  const errLabels = ev.filter((e) => e.kind === 'error').map((e) => e.label)
  ok("'Script error.'·다른 곳 파일 오류는 기록 안 함", !errLabels.some((l) => /Script error|boom from ext|boom other site/.test(l)), JSON.stringify(errLabels))
  ok('앱 파일 오류는 그대로 기록', errLabels.includes('앱 오류: real app boom'), JSON.stringify(errLabels))
  const rage = ev.find((e) => e.kind === 'rage')
  ok("답답함 위치: 'li[data-msg-id] › span' (div만 남지 않음)", rage?.label === 'li[data-msg-id] › span', JSON.stringify(rage?.label))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
