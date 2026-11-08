// 커뮤니티 1단계: 근무자 게시판(글·댓글·좋아요·신고) + 별명 + 회사·행사 후기
// · 가입 회원만 · 아래 탭 '커뮤니티' · 글쓴이는 별명(실명 안 보임) · 휴대폰 번호 가림 · 좋아요 · 댓글
// · 신고 같은 사람 한 번만, 3번이면 자동으로 가려짐 → 최고 관리자가 다시 보이기 · 관리자는 읽기만
// · 별명 바꾸기(운영자 사칭·중복 금지) · 후기: 실제로 일한 공고만, 별점 → 공고·회사 화면에 평균 · 360px
// node scripts/qa/community.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011' // 김지원 (이 공고에서 일한 적 없음)
const CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, timeout = 6000) => p.getByText(t).first().waitFor({ timeout }).then(() => true, () => false)
const noScroll = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 가입 회원만 ──
  const guest = await pg(null)
  await guest.goto(`${D}/community`)
  // 불러오는 중 화면이 먼저 보인 뒤 로그인 화면으로 넘어감
  await guest.waitForURL((u) => new URL(u).pathname === '/login', { timeout: 8000 }).catch(() => {})
  ok('비회원: 로그인 화면으로', new URL(guest.url()).pathname === '/login')

  // ── 2. 근무자: 아래 탭 '커뮤니티' → 빈 화면 → 글쓰기 ──
  const w = await pg(W)
  await w.goto(`${D}/`)
  const tab = w.locator('nav[data-bottom-nav] a[href="/community"]')
  ok('아래 탭 5개, 커뮤니티 있음', (await w.locator('nav[data-bottom-nav] a').count()) === 5 && (await tab.count()) === 1)
  await tab.click()
  await w.waitForURL((u) => new URL(u).pathname === '/community', { timeout: 8000 }).catch(() => {})
  ok('커뮤니티 탭 켜짐', (await tab.getAttribute('aria-current')) === 'page')
  ok('빈 화면 안내', await see(w, '첫 글을 남겨 주세요'))
  ok('360px: 옆으로 안 밀림 (목록)', await noScroll(w))
  await w.locator('[data-write]').click()
  await w.waitForURL(/\/community\/new/, { timeout: 8000 }).catch(() => {})
  ok('글쓰기: 별명 자동 안내', await see(w, '별명이 자동으로 정해져요'))
  await w.locator('[data-post-form] label', { hasText: '꿀팁' }).click()
  await w.fill('#post-title', '행사장 주차 꿀팁')
  await w.fill('#post-body', '광장 뒤편 공영주차장이 하루 5천원이에요.\n궁금하면 010-1234-5678로 연락 주세요')
  await w.getByRole('button', { name: '올리기' }).click()
  await w.waitForURL(/\/community\/[0-9a-f-]{36}(\?|$)/, { timeout: 10000 }).catch(() => {})
  const postUrl = w.url().split('?')[0]
  const postId = postUrl.split('/').pop()
  ok('올리면 글 화면으로', /^[0-9a-f-]{36}$/.test(postId), postUrl)
  ok('말머리 꿀팁', (await w.locator('[data-post-detail]').innerText().catch(() => '')).includes('꿀팁'))
  const detail = await w.locator('[data-post-detail]').innerText()
  ok('휴대폰 번호 가운데 가림', detail.includes('010-****-5678') && !detail.includes('1234-5678'))
  const nick = (await rest(`users?id=eq.${W}&select=nickname`))[0]?.nickname
  ok('별명 자동으로 정해짐 (병아리+숫자), 글에 별명', /^병아리\d+$/.test(nick || '') && detail.includes(nick), String(nick))
  ok('360px: 옆으로 안 밀림 (글)', await noScroll(w))

  // 좋아요: 바로 하트 + 숫자, 새로 고침해도 그대로
  const like = w.locator('[data-like]')
  await like.click()
  await w.waitForFunction(() => document.querySelector('[data-like]')?.getAttribute('aria-pressed') === 'true' && /1/.test(document.querySelector('[data-like]').textContent), null, { timeout: 5000 }).catch(() => {})
  await w.waitForTimeout(800)
  ok('좋아요 누르면 1', (await like.getAttribute('aria-pressed')) === 'true' && /좋아요\s*1/.test(await like.innerText()))
  await w.reload()
  ok('새로 고침해도 좋아요 1', (await w.locator('[data-like]').getAttribute('aria-pressed')) === 'true' && /좋아요\s*1/.test(await w.locator('[data-like]').innerText()))
  ok('내 글에는 신고 버튼 없음 · 지우기 있음', (await w.locator('[data-report=post]').count()) === 0 && (await see(w, '🗑️ 지우기', 1500)))

  // ── 3. 다른 근무자: 목록 → 댓글 → 신고 ──
  const ap = await pg(AP)
  await ap.goto(`${D}/community`)
  const card = ap.locator('[data-post]').first()
  ok('목록에 글 (별명·좋아요·댓글 수)', (await card.innerText()).includes('행사장 주차 꿀팁') && (await card.innerText()).includes(nick) && /♥ 1/.test(await card.innerText()))
  await ap.goto(`${D}/community?c=question`)
  ok('질문 말머리에는 없음', !(await see(ap, '행사장 주차 꿀팁', 1200)))
  await ap.goto(postUrl)
  await ap.locator('[data-comment-form] textarea').fill('좋은 정보 감사해요!')
  await ap.getByRole('button', { name: '댓글 달기' }).click()
  ok('댓글 달림', await see(ap, '좋은 정보 감사해요!'))
  ok('댓글 수 1', /댓글\s*1/.test(await ap.locator('[data-comments] h2').innerText()))
  const apNick = (await rest(`users?id=eq.${AP}&select=nickname`))[0]?.nickname
  ok('실명(김지원) 대신 별명', !(await ap.locator('body').innerText()).includes('김지원') && (await ap.locator('[data-comment]').innerText()).includes(apNick || '??'), String(apNick))
  const reportPost = async (p) => {
    await p.locator('[data-report=post] summary').click()
    await p.locator('[data-report=post]').getByRole('button', { name: '신고하기' }).click()
    await p.locator('[data-report=post]').getByText(/신고했어요|이미 신고했어요/).waitFor({ timeout: 6000 }).catch(() => {})
    return p.locator('[data-report=post]').innerText()
  }
  ok('신고 1번', (await reportPost(ap)).includes('신고했어요'))
  await ap.reload()
  ok('같은 사람이 또 신고: 이미 신고', (await reportPost(ap)).includes('이미 신고했어요'))
  ok('신고 1건만 기록', (await rest(`community_reports?target_id=eq.${postId}`)).length === 1)

  // ── 4. 관리자: 글·댓글·좋아요도 씀 (글쓴이는 '회사명 관리자'로 보임 — batch73) ──
  const ad = await pg(A)
  await ad.goto(`${D}/community`)
  ok('관리자: 글쓰기 버튼 있음 · 읽기 전용 안내 없음', (await ad.locator('[data-write]').count()) >= 1 && (await ad.locator('[data-readonly]').count()) === 0)
  await ad.goto(postUrl)
  ok('관리자: 댓글 칸 있음 · 좋아요 누를 수 있음', (await ad.locator('[data-comment-form]').count()) === 1 && !(await ad.locator('[data-like]').isDisabled()))
  await ad.goto(`${D}/community/new`)
  ok('관리자: 글쓰기 화면에 글 칸', (await ad.locator('[data-post-form]').count()) === 1)

  // ── 5. 신고 3번이면 자동으로 가림 → 최고 관리자가 다시 보이기 ──
  await rest('community_reports', 'POST', { target_type: 'post', target_id: postId, reporter_id: '44444444-0000-4000-8000-000000000044', reason: '광고·도배', resolved_at: null })
  await ad.goto(postUrl)
  ok('세 번째 신고', (await reportPost(ad)).includes('신고했어요'))
  ok('신고 3번: 자동으로 가려짐', !!(await rest(`community_posts?id=eq.${postId}`))[0]?.hidden_at)
  await ap.goto(postUrl)
  ok('가려진 글: 다른 회원은 못 봄', !(await see(ap, '행사장 주차 꿀팁', 1500)))
  await ap.goto(`${D}/community`)
  ok('가려진 글: 목록에서 빠짐', (await ap.locator('[data-post]').count()) === 0)
  await w.goto(postUrl)
  ok('글쓴이에게는 가려졌다는 안내', await see(w, '다른 회원에게는 보이지 않아요'))
  await ad.goto(`${D}/admin/community`)
  const item = ad.locator('[data-mod-item=post]').first()
  ok('관리 화면: 가려짐 · 신고 3', (await item.innerText()).includes('가려짐') && (await item.innerText()).includes('신고 3'))
  // 두 번 눌러 확인하는 버튼 (첫 누름에 글자가 바뀌므로 자리로 찾음)
  ok('관리 화면: 다시 보이기 버튼', await item.getByRole('button', { name: '다시 보이기' }).waitFor({ timeout: 6000 }).then(() => true, () => false))
  const show = item.locator('form button[type=submit]').first()
  await show.click()
  await show.click()
  await ad.waitForTimeout(1500)
  ok('다시 보이기 → 신고 처리됨', !(await rest(`community_posts?id=eq.${postId}`))[0]?.hidden_at && (await rest(`community_reports?target_id=eq.${postId}`)).every((r) => r.resolved_at))
  await ap.goto(postUrl)
  ok('다시 보임', await see(ap, '행사장 주차 꿀팁'))

  // ── 6. 별명 바꾸기 ──
  await w.goto(`${D}/me/profile#nickname`)
  const nf = w.locator('[data-nickname-form]')
  await nf.locator('input[name=nickname]').fill('운영자짱')
  await nf.getByRole('button', { name: /^(바꾸기|정하기)$/ }).click()
  ok('운영자처럼 보이는 별명 막힘', await see(w, '운영자로 오해할 수 있는'))
  await nf.locator('input[name=nickname]').fill('주차왕')
  await nf.getByRole('button', { name: /^(바꾸기|정하기)$/ }).click()
  ok('별명 바뀜', await see(w, "'주차왕'(으)로 바꿨어요"))
  await ap.goto(`${D}/me/profile#nickname`)
  await ap.locator('[data-nickname-form] input[name=nickname]').fill('주차왕')
  await ap.locator('[data-nickname-form]').getByRole('button', { name: /^(바꾸기|정하기)$/ }).click()
  ok('남이 쓰는 별명 막힘', await see(ap, '이미 누가 쓰는 별명'))
  await ap.goto(postUrl)
  ok('글에 새 별명', (await ap.locator('[data-post-detail]').innerText()).includes('주차왕'))

  // ── 7. 후기: 일한 공고만 → 별점 평균이 공고·회사 화면에 ──
  // (근무 중인 첫 근무엔 후기 쓰기가 없음 — 끝난 근무로 만들고 시작)
  for (const r of await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)) if (!r.clock_out) await rest(`attendance?id=eq.${r.id}`, 'PATCH', { clock_out: new Date().toISOString() })
  await w.goto(`${D}/me/history`)
  const rl = w.locator('[data-review-link]').first()
  ok('지난 근무: 후기 쓰기 버튼', (await rl.innerText()).includes('후기 쓰기'))
  await rl.click()
  await w.waitForURL(/\/me\/review\//, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-review-form] [role=radio]').nth(3).click()
  await w.fill('#review-body', '담당자분이 친절했고 쉬는 시간도 잘 지켜졌어요.')
  await w.getByRole('button', { name: '후기 남기기' }).click()
  ok('후기 남김', await see(w, '후기를 남겼어요'))
  const rv = await rest(`company_reviews?job_id=eq.${J}`)
  ok('후기 저장 (별 4, 회사·공고)', rv.length === 1 && rv[0].rating === 4 && rv[0].company_id === CO && rv[0].author_id === W)
  await w.goto(`${D}/me/history`)
  ok('다시 보면 내 후기', (await w.locator('[data-review-link]').first().innerText()).includes('내 후기'))
  await w.goto(`${D}/me/review/${J}`)
  ok('고치기 화면: 별·내용 그대로', (await see(w, '내 후기 고치기')) && (await w.locator('#review-body').inputValue()).includes('친절') && (await w.locator('[data-review-form] [role=radio][aria-checked=true]').getAttribute('aria-label')) === '4점')
  await ap.goto(`${D}/me/review/${J}`)
  ok('일한 적 없는 공고: 후기 못 씀', (await ap.locator('[data-review-blocked]').count()) === 1 && (await ap.locator('[data-review-form]').count()) === 0)
  await ap.goto(`${D}/jobs/${J}`)
  const badge = ap.locator('[data-company-rating-badge]')
  ok('공고 화면: ★ 4.0 · 근무자 후기 1개', (await badge.count()) === 1 && /4\.0/.test(await badge.innerText()) && /후기 1개/.test(await badge.innerText()), await badge.innerText().catch(() => ''))
  ok('360px: 공고 화면 옆으로 안 밀림', await noScroll(ap))
  await guest.goto(`${D}/jobs/${J}`)
  ok('비회원 공고 화면: 별점 없음', (await guest.locator('[data-company-rating-badge]').count()) === 0)
  await badge.click()
  await ap.waitForURL(/\/community\/company\//, { timeout: 8000 }).catch(() => {})
  ok('회사 후기 화면: 평균 4.0 + 후기 (별명)', (await ap.locator('[data-avg]').innerText()).trim() === '4.0' && (await ap.locator('[data-review-list]').innerText()).includes('주차왕') && (await see(ap, '쉬는 시간도 잘')))
  ok('360px: 회사 후기 옆으로 안 밀림', await noScroll(ap))
  await ap.goto(`${D}/community?c=review`)
  ok("커뮤니티 '회사 후기' 탭", (await ap.locator('[data-review-list]').innerText()).includes('주식회사 테스트'))
  await ap.goto(`${D}/?co=${CO}`)
  ok('회사 공고 모음에도 별점', /4\.0/.test(await ap.locator('[data-company-rating-badge]').innerText().catch(() => '')))

  // ── 8. 내 글 지우기 ──
  await w.goto(postUrl)
  const del = w.locator('[data-post-detail] form button[type=submit]').first()
  await del.click()
  await del.click()
  await w.waitForURL((u) => new URL(u).pathname === '/community', { timeout: 8000 }).catch(() => {})
  ok('글 지움 → 목록으로', new URL(w.url()).pathname === '/community' && (await rest(`community_posts?id=eq.${postId}`)).length === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
