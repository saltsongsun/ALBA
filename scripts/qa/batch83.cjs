// 묶음 83: 새로 시작한 회사의 공고 목록 — 공고가 하나도 없으면 '첫 공고를 올려 보세요'(복사할 지난 공고가 없으니 '지난 공고 복사하기'는 숨김)
// · 맨 위 '우리 회사 공고 모음 링크' 칸: 360px에서 글이 잘리지 않음(버튼은 아래 줄로) · 새 회사는 '첫 공고를 올린 뒤 단톡방에 올려 두세요'
// · 공고를 올려 본 회사는 그대로 '진행 중인 공고가 없어요' + 지난 공고 복사하기
// node scripts/qa/batch83.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C3 = '99999999-0000-4000-8000-0000000000d3', A3 = 'aaaaaaaa-0000-4000-8000-0000000000d3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 공고를 한 번도 안 올린 새 회사와 그 대표 관리자
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '처음행사', seal_image: null, created_at: new Date().toISOString() })
  const [admin1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...admin1, id: A3, name: '처음관리', phone: '01022224444', is_super: false })
  await rest('company_members', 'POST', { company_id: C3, user_id: A3, role: 'owner' })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const clipped = (loc) => loc.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)

  // ── 1. 새 회사 ──
  const n = await pg(A3)
  await n.goto(`${D}/admin/jobs`)
  const empty = n.locator('[data-jobs-empty=active]')
  await empty.waitFor({ timeout: 10000 }).catch(() => {})
  ok("빈 화면: '첫 공고를 올려 보세요' + 첫 공고 등록", (await empty.innerText().catch(() => '')).includes('첫 공고를 올려 보세요') && (await empty.locator('a[href="/admin/jobs/new"]').count()) === 1)
  ok('안내 문장은 문장마다 한 줄 (어색한 줄바꿈 없음)', (await empty.locator('[data-first-job] span').evaluateAll((els) => els.map((e) => e.getClientRects().length))).every((n) => n === 1))
  ok("복사할 공고가 없으니 '지난 공고 복사하기' 없음", (await empty.locator('a[href="/admin/jobs?tab=past"]').count()) === 0)
  const card = n.locator('[data-share-card]')
  ok("공고 모음 칸: 새 회사 안내 '첫 공고를 올린 뒤 단톡방에 올려 두세요'", (await card.innerText()).includes('첫 공고를 올린 뒤'))
  ok('공고 모음 칸: 글이 잘리지 않음 (360px)', (await clipped(card.locator('span.block'))) === 0 && (await card.getByRole('link', { name: 'QR' }).isVisible()))
  ok('360px: 옆으로 안 밀림 (새 회사 공고 목록)', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 공고를 올려 본 회사: 그대로 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'done' })
  const a = await pg(A)
  await a.goto(`${D}/admin/jobs`)
  const ea = a.locator('[data-jobs-empty=active]')
  await ea.waitFor({ timeout: 10000 }).catch(() => {})
  ok("공고를 올려 본 회사: '진행 중인 공고가 없어요' + 지난 공고 복사하기", (await ea.innerText().catch(() => '')).includes('진행 중인 공고가 없어요') && (await ea.locator('a[href="/admin/jobs?tab=past"]').count()) === 1)
  // 진행 공고가 없으면 링크를 열어도 지원할 공고가 없음 → 그대로 알려 줌 (빈 링크를 올리지 않게 · 묶음 238)
  ok("공고 모음 칸: '지금 링크엔 지원할 공고가 없어요'", (await a.locator('[data-link-count="0"]').innerText().catch(() => '')).includes('지금 링크엔 지원할 공고가 없어요'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
