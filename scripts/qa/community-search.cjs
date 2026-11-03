// 커뮤니티 더하기: 글 검색(제목·내용, 말머리 안에서도) · '✍️ 내 글' · 같은 말머리 다른 글 · 글 올리면 축하 · 불러오는 중 모양
// node scripts/qa/community-search.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, timeout = 6000) => p.getByText(t).first().waitFor({ timeout }).then(() => true, () => false)
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()

;(async () => {
  await rest(`users?id=eq.${W}`, 'PATCH', { nickname: '주차왕' })
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  await rest('community_posts', 'POST', [
    { author_id: W, category: 'tip', title: '행사장 주차 꿀팁', body: '광장 뒤 공영 주차장이 하루 5천원이에요', hidden_at: null, created_at: ago(30) },
    { author_id: AP, category: 'question', title: '복장 질문이요', body: '검은 바지에 운동화면 될까요?', hidden_at: null, created_at: ago(20) },
    { author_id: W, category: 'free', title: '오늘 수고 많으셨어요', body: '비 와서 힘들었는데 다들 고생했어요', hidden_at: null, created_at: ago(10) },
  ])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const titles = () => p.locator('[data-post]').allInnerTexts()

  // ── 1. 검색 ──
  await p.goto(`${D}/community`)
  ok('검색 칸 있음', (await p.locator('[data-community-search] input[name=q]').count()) === 1)
  await p.locator('[data-community-search] input[name=q]').fill('주차')
  await p.locator('[data-community-search] input[name=q]').press('Enter')
  await p.waitForURL(/q=/, { timeout: 8000 }).catch(() => {})
  let t = await titles()
  ok("'주차' 검색: 1개 + 개수 안내", t.length === 1 && t[0].includes('행사장 주차 꿀팁') && /주차.*글\s*1개/.test(await p.locator('[data-search-count]').innerText()), t.join(' / '))
  ok('검색어가 칸에 그대로', (await p.locator('[data-community-search] input[name=q]').inputValue()) === '주차')
  await p.goto(`${D}/community?q=${encodeURIComponent('운동화')}`)
  t = await titles()
  ok('내용으로도 찾음 (운동화 → 복장 질문)', t.length === 1 && t[0].includes('복장 질문'))
  await p.goto(`${D}/community?q=${encodeURIComponent('주 차')}`)
  ok('띄어쓰기 달라도 찾음', (await titles()).length === 1)
  await p.goto(`${D}/community?c=question&q=${encodeURIComponent('주차')}`)
  ok('말머리 안에서 검색 (질문에는 주차 글 없음)', (await see(p, "'주차' 글이 없어요")) && (await p.locator('[data-community-search] input[name=c]').inputValue()) === 'question')
  await p.goto(`${D}/community?q=${encodeURIComponent('없는말임')}`)
  ok('없으면 안내 + 검색 지우기', (await see(p, "'없는말임' 글이 없어요")) && (await see(p, '검색 지우기')))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 내 글 ──
  await p.goto(`${D}/community`)
  await p.locator('[data-community-tabs] a', { hasText: '내 글' }).click()
  await p.waitForURL(/c=mine/, { timeout: 8000 }).catch(() => {})
  t = await titles()
  ok('✍️ 내 글: 내가 쓴 2개만', t.length === 2 && t.every((x) => x.includes('주차왕')) && !t.some((x) => x.includes('복장')), t.length + '')
  ok('내 글 칩 켜짐', (await p.locator('[data-community-tabs] a[aria-current=page]').innerText()).includes('내 글'))

  // ── 3. 글 올리면 축하 + 같은 말머리 다른 글 ──
  await p.goto(`${D}/community/new?c=tip`)
  await p.fill('#post-title', '식사 꿀팁 알려드려요')
  await p.fill('#post-body', '행사장 2층 구내식당이 직원 할인돼요')
  await p.getByRole('button', { name: '올리기' }).click()
  await p.waitForURL(/\/community\/[0-9a-f-]{36}/, { timeout: 10000 }).catch(() => {})
  ok('올리면 축하 안내', (await see(p, '글을 올렸어요')) && (await p.locator('[data-celebrate]').count()) === 1)
  const rel = p.locator('[data-related]')
  ok('아래에 다른 꿀팁 글', (await rel.count()) === 1 && (await rel.innerText()).includes('행사장 주차 꿀팁') && !(await rel.innerText()).includes('식사 꿀팁'), await rel.innerText().catch(() => ''))
  await p.waitForTimeout(6500)
  ok('축하 안내는 잠깐 뒤 사라짐', !(await p.getByText('글을 올렸어요').isVisible().catch(() => false)))

  // ── 4. 불러오는 동안 글 카드 모양 ──
  await p.goto(`${D}/me`)
  await p.waitForLoadState('networkidle').catch(() => {})
  await fetch(`${MD}/__latency?ms=900`)
  await p.locator('nav[data-bottom-nav] a[href="/community"]').click()
  ok('불러오는 중: 커뮤니티 모양', await p.locator('[data-skeleton=community]').waitFor({ timeout: 4000 }).then(() => true, () => false))
  await fetch(`${MD}/__latency?ms=5`)
  await p.locator('[data-post-list]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('다 불러오면 글 목록', (await p.locator('[data-post]').count()) >= 3)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
