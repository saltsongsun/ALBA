// 묶음 73: 서류 공고별 접기 · 관리자도 커뮤니티 글쓰기 · 근무자 상세 화면 정리
// · '서류' 메뉴: 공고가 여럿이면 공고 묶음은 처음엔 접혀 있음(공고 이름·건수·서명/대기·PDF만) → 누르면 펼침 · 공고 하나·검색 중이면 펼침
// · 관리자도 커뮤니티에 글을 씀 · 글쓴이는 별명 대신 '회사명 관리자' (근무자인 척 못 함) · 외주 업체는 읽기만
// · 근무자 상세: 넓은 화면은 왼쪽 기본 정보 / 오른쪽 '공고에 바로 확정'·정보 수정·평가·이력 · 성실도 칩 · 경력 칸 · 360px 옆으로 안 밀림
// node scripts/qa/batch73.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000000b3', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 두 번째 공고 J2에도 서류 1건 (공고 묶음 2개) · W에게 경력
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: J2, title: '두번째 행사 서류용', applications: [] })
  const [doc] = await rest(`signed_docs?id=eq.${DOC}`)
  await rest('signed_docs', 'POST', { ...doc, id: 'dddddddd-0000-4000-8000-0000000000b3', job_id: J2, title: '서약서', created_at: '2026-10-03T00:00:00Z' })
  await rest(`users?id=eq.${W}`, 'PATCH', { careers: [{ event: '진주재즈페스티벌', period: '2024.11', role: '인원 안내' }, { event: '대학 축제', period: '2024.10', role: '행사 보조' }] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, desktop = false) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 서류: 공고별 접기 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/docs`)
  await ad.locator('[data-docs-job]').first().waitFor({ timeout: 10000 }).catch(() => {})
  const groups = ad.locator('details[data-docs-job]')
  ok('공고 묶음 2개 · 처음엔 접혀 있음', (await groups.count()) === 2 && (await groups.evaluateAll((ds) => ds.every((d) => !d.open))))
  const sumText = (await groups.first().locator('summary').innerText()).replace(/\s+/g, ' ')
  ok('접힌 줄: 공고 이름 · 건수 · 서명/대기', /\d+건/.test(sumText) && /(서명|대기) \d/.test(sumText), sumText)
  await groups.first().locator('summary').click()
  // (펼침은 짧은 애니메이션 → 서류 줄이 보일 때까지 기다림)
  await groups.first().locator('[data-doc-row]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  ok('누르면 펼쳐져 서류가 보임', (await groups.first().evaluate((d) => d.open)) && (await groups.first().locator('[data-doc-row]').first().isVisible()))
  await ad.goto(`${D}/admin/docs?job=${J}`)
  ok('공고를 고르면 처음부터 펼침', await ad.locator('details[data-docs-job]').first().evaluate((d) => d.open))
  ok('360px: 옆으로 안 밀림 (서류)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 관리자 커뮤니티 글쓰기 (일반 관리자 A2 · 최고 관리자는 '해피워크 운영자'로 보임) ──
  const A2 = 'aaaaaaaa-0000-4000-8000-0000000000d7'
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '담당관리자', phone: '01077771111', is_super: false, created_at: '2026-10-01T00:00:00Z' })
  await rest('company_members', 'POST', { company_id: '99999999-0000-4000-8000-000000000099', user_id: A2, role: 'admin', created_at: '2026-10-01T00:00:00Z' })
  const ad2 = await pg(A2)
  await ad2.goto(`${D}/community/new`)
  ok('관리자: 글쓰기 칸이 보임 (읽기 전용 안내 없음)', (await ad2.locator('textarea[name=body]').count()) === 1 && (await ad2.getByText('읽기만 할 수 있어요').count()) === 0)
  await ad2.locator('input[name=category]').first().check({ force: true })
  await ad2.locator('input[name=title]').fill('이번 주말 행사 안내드려요')
  await ad2.locator('textarea[name=body]').fill('토요일 행사는 비가 와도 진행해요. 우비를 챙겨 주세요.')
  await ad2.getByRole('button', { name: '올리기' }).click()
  await ad2.waitForURL(/\/community\/[0-9a-f-]{36}/, { timeout: 10000 }).catch(() => {})
  const post = (await rest('community_posts')).find((p) => p.title === '이번 주말 행사 안내드려요')
  ok('관리자 글이 올라감', !!post && post.author_id === A2, ad.url())
  const wk = await pg(W)
  await wk.goto(`${D}/community/${post?.id}`)
  // (글 내용은 스트리밍으로 조금 늦게 드러날 수 있어 제목이 보일 때까지 기다림)
  await wk.getByText('이번 주말 행사 안내드려요').first().waitFor({ timeout: 8000 }).catch(() => {})
  const page = (await wk.locator('main').innerText()).replace(/\s+/g, ' ')
  ok("글쓴이(근무자가 볼 때): '주식회사 테스트 관리자' (별명 아님)", page.includes('주식회사 테스트 관리자'), page.slice(0, 200))
  await wk.goto(`${D}/community`)
  await wk.locator('main a[href^="/community/"]').first().waitFor({ timeout: 8000 }).catch(() => {})
  const listText = (await wk.locator('main').innerText()).replace(/\s+/g, ' ')
  ok("근무자 목록에서도 '주식회사 테스트 관리자'", listText.includes('주식회사 테스트 관리자'), listText.slice(0, 300))

  // ── 3. 근무자 상세 화면 ──
  const wide = await pg(A, true)
  await wide.goto(`${D}/admin/workers/${W}`)
  await wide.locator('[data-worker-side]').waitFor({ timeout: 10000 }).catch(() => {})
  const side = await wide.locator('[data-worker-side]').boundingBox()
  const main = await wide.locator('main section.card').first().boundingBox()
  ok('넓은 화면: 오른쪽 열(바로 확정·정보 수정·평가·이력)이 기본 정보 옆에', !!side && !!main && side.x > main.x + main.width - 4 && Math.abs(side.y - main.y) < 4)
  ok("성실도 칩 · '경력 2' 칸", (await wide.locator('[data-worker-rel] span').count()) >= 3 && (await wide.locator('[data-worker-careers]').innerText()).includes('경력 2'))
  ok("'공고에 바로 확정'은 오른쪽 열 안", (await wide.locator('[data-worker-side] [data-worker-assign]').count()) <= 1)
  await ad.goto(`${D}/admin/workers/${W}`)
  await ad.locator('[data-worker-side]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('360px: 옆으로 안 밀림 (근무자 상세)', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
