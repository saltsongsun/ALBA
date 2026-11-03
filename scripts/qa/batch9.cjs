// 묶음 9: 내 글 고치기(내 글만, 가려진 글 안 됨, 휴대폰 번호 가림, '수정됨' 표시) · 댓글 칸이 쓰는 만큼 늘어남
// node scripts/qa/batch9.cjs <default 앱> <default 가짜>
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

;(async () => {
  const t0 = new Date(Date.now() - 3600_000).toISOString()
  const [post] = await rest('community_posts', 'POST', { author_id: W, category: 'free', title: '처음 쓴 제목', body: '처음 쓴 내용이에요', hidden_at: null, created_at: t0, updated_at: t0 })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 내 글 고치기 ──
  const w = await pg(W)
  await w.goto(`${D}/community/${post.id}`)
  ok('내 글: ✏️ 고치기 · 아직 수정됨 없음', (await w.locator('[data-edit-link]').count()) === 1 && (await w.locator('[data-edited]').count()) === 0)
  await w.locator('[data-edit-link]').click()
  await w.waitForURL(/\/edit$/, { timeout: 8000 }).catch(() => {})
  await w.locator('[data-edit-form]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('고치기 화면: 원래 제목·내용·말머리 그대로', (await w.locator('#post-title').inputValue()) === '처음 쓴 제목' && (await w.locator('#post-body').inputValue()) === '처음 쓴 내용이에요' && (await w.locator('input[name=category][value=free]').isChecked()))
  await w.locator('[data-post-form] label', { hasText: '꿀팁' }).click()
  await w.fill('#post-title', '고친 제목이에요')
  await w.fill('#post-body', '고친 내용: 궁금하면 010-2222-3333으로')
  await w.getByRole('button', { name: '고친 내용 저장' }).click()
  await w.waitForURL((u) => /\/community\/[0-9a-f-]{36}(\?|$)/.test(u.toString()) && !u.pathname.endsWith('/edit'), { timeout: 10000 }).catch(() => {})
  ok('저장하면 글로 돌아오며 안내', await see(w, '글을 고쳤어요'))
  const detail = await w.locator('[data-post-detail]').innerText()
  ok('고친 제목·말머리·번호 가림', detail.includes('고친 제목이에요') && detail.includes('꿀팁') && detail.includes('010-****-3333') && !detail.includes('2222-3333'))
  ok("'수정됨' 표시", (await w.locator('[data-edited]').count()) === 1)

  // ── 2. 남의 글·가려진 글은 못 고침 ──
  const ap = await pg(AP)
  await ap.goto(`${D}/community/${post.id}`)
  ok('남의 글: 고치기 없음', (await ap.locator('[data-edit-link]').count()) === 0)
  await ap.goto(`${D}/community/${post.id}/edit`)
  ok('남의 글 고치기 주소: 없는 화면', await see(ap, '찾는 화면이 없어요'))
  await rest(`community_posts?id=eq.${post.id}`, 'PATCH', { hidden_at: new Date().toISOString() })
  await w.goto(`${D}/community/${post.id}/edit`)
  ok('가려진 글: 고칠 수 없음', await see(w, '찾는 화면이 없어요'))
  await rest(`community_posts?id=eq.${post.id}`, 'PATCH', { hidden_at: null })

  // ── 3. 댓글 칸이 쓰는 만큼 늘어남 ──
  await ap.goto(`${D}/community/${post.id}`)
  await ap.waitForLoadState('networkidle').catch(() => {})
  const box = ap.locator('[data-comment-form] textarea')
  await box.waitFor({ timeout: 10000 }).catch(() => {})
  const h0 = (await box.boundingBox()).height
  await box.pressSequentially('첫째 줄\n둘째 줄\n셋째 줄\n넷째 줄\n다섯째 줄')
  await ap.waitForTimeout(400) // 늘어나는 움직임(0.15초)이 끝난 뒤
  const h1 = (await box.boundingBox()).height
  ok('여러 줄 쓰면 칸이 늘어남', h1 > h0 + 20, `${h0} → ${h1}`)
  await ap.getByRole('button', { name: '댓글 달기' }).click()
  await ap.locator('[data-comment]').first().waitFor({ timeout: 8000 }).catch(() => {})
  await ap.waitForTimeout(600)
  const h2 = (await box.boundingBox()).height
  ok('보내면 칸이 원래 크기로', Math.abs(h2 - h0) < 4, `${h0} / ${h2}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
