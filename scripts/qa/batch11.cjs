// 묶음 11: 글쓰기 임시 저장(나갔다 와도 쓰던 글 그대로, 지우고 새로 쓰기, 올리면 지움) · 별명 바로바로 규칙 안내
// node scripts/qa/batch11.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const open = async () => {
    await p.goto(`${D}/community/new`)
    await p.waitForLoadState('networkidle').catch(() => {})
  }

  // ── 1. 글쓰기 임시 저장 ──
  await open()
  ok('처음엔 불러온 글 없음', (await p.locator('[data-draft-restored]').count()) === 0)
  await p.locator('[data-post-form] label', { hasText: '질문' }).click()
  await p.locator('#post-title').pressSequentially('행사장 식당 어디예요')
  await p.locator('#post-body').pressSequentially('점심 어디서 먹나요?')
  await open()
  ok('다시 들어오면 ✍️ 쓰던 글을 불러왔어요', await p.locator('[data-draft-restored]').waitFor({ timeout: 4000 }).then(() => true, () => false))
  ok('제목·내용·말머리 그대로', (await p.locator('#post-title').inputValue()) === '행사장 식당 어디예요' && (await p.locator('#post-body').inputValue()) === '점심 어디서 먹나요?' && (await p.locator('input[name=category][value=question]').isChecked()))
  ok('글자 수도 맞음', (await p.locator('[data-post-form]').innerText()).includes('11/3000'))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await p.getByRole('button', { name: '지우고 새로 쓰기' }).click()
  ok('지우고 새로 쓰기: 칸이 비고 안내 사라짐', (await p.locator('#post-title').inputValue()) === '' && (await p.locator('#post-body').inputValue()) === '' && (await p.locator('[data-draft-restored]').count()) === 0)
  await open()
  ok('지운 뒤 다시 와도 없음', (await p.locator('[data-draft-restored]').count()) === 0)
  await p.locator('#post-title').pressSequentially('셔틀 시간 알려 주세요')
  await p.locator('#post-body').pressSequentially('정문 셔틀 몇 분마다 와요?')
  await p.getByRole('button', { name: '올리기' }).click()
  await p.waitForURL(/\/community\/[0-9a-f-]{36}/, { timeout: 10000 }).catch(() => {})
  await open()
  ok('올린 뒤에는 임시 저장 지워짐', (await p.locator('[data-draft-restored]').count()) === 0 && (await p.locator('#post-title').inputValue()) === '')

  // ── 2. 별명 바로바로 안내 ──
  await p.goto(`${D}/me/profile#nickname`)
  await p.waitForLoadState('networkidle').catch(() => {})
  const input = p.locator('[data-nickname-form] input[name=nickname]')
  const hint = () => p.locator('[data-nick-hint]').innerText().catch(() => '')
  await input.fill('a')
  ok('1자: 2자 이상', (await hint()).includes('2자 이상'))
  await input.fill('주차 왕')
  ok('띄어쓰기: 한글·영문·숫자만', (await hint()).includes('한글·영문·숫자만'))
  await input.fill('운영자짱')
  ok('운영자 사칭: 안 돼요', (await hint()).includes('운영자로 오해'))
  await input.fill('주차왕')
  ok('맞으면 ✓ 쓸 수 있는 모양', (await hint()).includes('✓'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
