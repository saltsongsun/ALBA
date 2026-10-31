// 서류가 여러 건일 때: 앞 서류에 한 서명을 다음 서류에 그대로 쓰기 (같은 계정·30분 안)
// node scripts/qa/sign-reuse.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002'
const DOC = 'dddddddd-0000-4000-8000-000000000004', DOC2 = 'dddddddd-0000-4000-8000-000000000005'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const REUSE = '앞 서류와 같은 서명 쓰기'
;(async () => {
  // 서명할 서류 2건 (근로계약서 → 서약서)
  await rest(`signed_docs?id=eq.${DOC2}`, 'PATCH', { status: 'pending', signed_at: null, body: null })
  const tpl = (await rest(`signed_docs?id=eq.${DOC}`))[0].template_id
  await rest(`signed_docs?id=eq.${DOC2}`, 'PATCH', { template_id: tpl })
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(WK), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))

  await p.goto(`${D}/docs/${DOC}`)
  await p.waitForLoadState('networkidle')
  ok('첫 서류: 같은 서명 쓰기 없음 (아직 서명 안 함)', !(await see(p, REUSE, 1000)))
  // 손가락으로 서명 (마우스로 그림)
  await p.locator('canvas').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = await p.locator('canvas').boundingBox()
  await p.mouse.move(box.x + 30, box.y + 100)
  await p.mouse.down()
  for (let i = 1; i <= 12; i++) await p.mouse.move(box.x + 30 + i * 18, box.y + 100 + (i % 2 ? -30 : 30))
  await p.mouse.up()
  ok('서명됨 표시', await see(p, '서명됨 ✓'))
  await p.locator('input[name=agree]').check()
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  ok('다음 서류로 넘어감', await see(p, /남은 서류 1건도 이어서 서명해 주세요/, 15000))
  ok('다음 서류 주소', p.url().includes(`/docs/${DOC2}`), p.url())

  // 다음 서류: 같은 서명 그대로
  await p.waitForLoadState('networkidle')
  ok('같은 서명 쓰기 버튼', await see(p, REUSE))
  await p.getByRole('button', { name: `✍️ ${REUSE}` }).click()
  ok('누르면 서명됨', await see(p, '서명됨 ✓'))
  ok('버튼은 사라짐', !(await see(p, REUSE, 800)))
  // 동의 체크는 서류마다 따로
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  ok('동의 체크 없이는 제출 안 됨', p.url().includes(`/docs/${DOC2}`))
  await p.locator('input[name=agree]').check()
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  ok('모두 마침', await see(p, '서류 서명을 모두 마쳤어요', 15000))
  const [d1, d2] = await Promise.all([rest(`signed_docs?id=eq.${DOC}`), rest(`signed_docs?id=eq.${DOC2}`)])
  ok('두 서류 모두 서명됨', d1[0].status === 'signed' && d2[0].status === 'signed', `${d1[0].status},${d2[0].status}`)
  ok('같은 서명 이미지', !!d1[0].signature && d1[0].signature === d2[0].signature)

  // 다른 계정이 남긴 서명은 안 보임 (같은 휴대폰을 함께 쓰는 경우)
  await rest(`signed_docs?id=eq.${DOC}`, 'PATCH', { status: 'pending', signature: null, signed_at: null })
  await p.evaluate(() => { const v = JSON.parse(sessionStorage.getItem('hw-last-signature')); v.u = 'someone-else'; sessionStorage.setItem('hw-last-signature', JSON.stringify(v)) })
  await p.goto(`${D}/docs/${DOC}`)
  await p.waitForLoadState('networkidle')
  ok('다른 계정 서명은 안 보임', !(await see(p, REUSE, 1500)))
  ok('남은 기록도 지움', (await p.evaluate(() => sessionStorage.getItem('hw-last-signature'))) === null)
  // 30분 지난 서명도 안 보임
  await p.evaluate((u) => sessionStorage.setItem('hw-last-signature', JSON.stringify({ u, at: Date.now() - 31 * 60_000, data: 'data:image/png;base64,AAAA' })), WK)
  await p.reload()
  await p.waitForLoadState('networkidle')
  ok('30분 지난 서명은 안 보임', !(await see(p, REUSE, 1500)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
