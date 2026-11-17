// 묶음 287 (정기 개선 2026-11-17 14:35 KST) — 막 시작한 회사 화면을 할 일 하나로
// · 관리자 문의함: 대화가 하나도 없으면 '모든 대화 저장'·찾기·'전체 0 / 안 읽음 0'은 숨김
//   빈 칸에 다음에 할 일 하나: 공고가 없으면 '+ 첫 공고 등록' · 공고가 있으면 공고 모음 링크 '공유하기'
//   (대화가 있는 회사는 그대로)
// · 공고 화면: 공고를 한 번도 안 올린 회사는 맨 위 '+ 새 공고 등록'·탭(임시저장·지난 공고)·찾기 칸을 숨김
//   ('+ 첫 공고 등록' 하나만) · 공고 모음 '공유하기'는 첫 공고를 올리기 전엔 회색
// node scripts/qa/batch287.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const NAME = '이백팔십칠행사'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: D })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 0. 새 회사로 시작 (/start)
  const n = await mk(null)
  await n.goto(`${D}/start`, { waitUntil: 'networkidle' })
  await n.fill('#company_name', NAME)
  await n.fill('#business_no', '1058712345')
  await n.fill('#ceo_name', '김대표')
  await n.fill('#name', '최담당')
  await n.fill('#phone', '01028702870')
  await n.fill('#pin', '482917')
  await n.fill('#pin2', '482917')
  await n.check('input[name="agree_privacy"]')
  await n.click('button[type="submit"]:has-text("회사로 시작하기")')
  await n.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {})
  const [co] = await rest(`companies?company_name=eq.${encodeURIComponent(NAME)}`)
  ok('준비: 새 회사가 만들어짐', !!co?.id)

  // ── 1. 새 회사 문의함 (대화 0 · 공고 0): 도구는 숨기고 '+ 첫 공고 등록' 하나
  await n.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  const start = n.locator('[data-inbox-start]')
  await start.waitFor({ timeout: 15000 }).catch(() => {})
  ok("'모든 대화 저장'·찾기 칸·'전체 0 / 안 읽음 0' 없음", (await n.locator('a[href="/admin/chat/export"]').count()) === 0 && (await n.locator('[data-chat-search]').count()) === 0 && (await n.getByRole('link', { name: /^전체 \d+$/ }).count()) === 0)
  ok("공고가 없으면 다음 할 일: '+ 첫 공고 등록' → 공고 등록", (await start.getAttribute('data-inbox-start')) === 'job' && one(await start.locator('a[href="/admin/jobs/new"]').textContent().catch(() => '')) === '+ 첫 공고 등록')
  ok("제목 '아직 들어온 문의가 없어요' · 안내는 문장마다 한 줄", one(await start.textContent()).includes('아직 들어온 문의가 없어요') && (await start.locator('p span.block').evaluateAll((els) => els.length === 2 && els.every((e) => e.getClientRects().length === 1))))
  ok('360px 옆으로 안 밀림 (새 회사 문의함)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/newco-inbox-nojob.png` }).catch(() => {})

  // ── 2. 새 회사 공고 화면: '+ 첫 공고 등록' 하나 · 탭·찾기 없음 · 공유하기 회색
  await n.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' })
  await n.locator('[data-jobs-empty=active]').waitFor({ timeout: 15000 }).catch(() => {})
  const newLinks = await n.locator('main a[href="/admin/jobs/new"]').allTextContents()
  ok("새 공고 링크는 빈 칸의 '+ 첫 공고 등록' 하나 (맨 위 버튼 없음)", newLinks.length === 1 && one(newLinks[0]) === '+ 첫 공고 등록' && (await n.locator('[data-jobs-new-top]').count()) === 0, newLinks.map(one).join(','))
  ok('탭(임시저장·지난 공고)·찾기 칸 없음', (await n.locator('[data-jobs-tabs]').count()) === 0 && (await n.locator('main form[role=search]').count()) === 0)
  const share = n.locator('[data-share-card]').getByRole('button', { name: '공유하기' })
  ok("공고 모음 '공유하기'는 회색 (첫 공고 전) · 안내 줄 그대로", !((await share.getAttribute('class')) ?? '').includes('chip-primary') && (await n.locator('[data-share-card]').innerText()).includes('첫 공고를 올린 뒤'))
  ok('360px 옆으로 안 밀림 (새 회사 공고)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/newco-jobs.png` }).catch(() => {})

  // ── 3. 첫 공고를 올린 뒤: 문의함은 '공유하기' (공고 모음 링크) · 공고 화면은 평소 모양
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: 'cccccccc-0000-4000-8000-000002870001', company_id: co.id, title: '가을 축제 안내 스태프', status: 'open', audience: 'worker', start_date: kday(3), end_date: kday(3), applications: [], created_at: new Date().toISOString() })
  await n.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  await start.waitFor({ timeout: 15000 }).catch(() => {})
  // 누르면 글자가 '링크 복사됨 ✓'로 바뀌므로 이름이 아닌 자리로 찾음
  const sb = start.locator('button').first()
  ok("공고가 있으면 다음 할 일: 공고 모음 링크 '공유하기' (파란 버튼)", (await start.getAttribute('data-inbox-start')) === 'share' && one(await sb.textContent().catch(() => '')) === '공유하기' && ((await sb.getAttribute('class').catch(() => '')) ?? '').includes('btn-primary') && one(await start.textContent()).includes('공고 모음 링크를 단톡방에 올려 두면'))
  await sb.click().catch(() => {})
  await n.waitForTimeout(400)
  const clip = await n.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok('누르면 우리 회사 공고 모음 링크가 복사됨 (회사 이름 · ?co=회사)', clip.includes(`${NAME} 모집 공고 모음`) && clip.includes(`/?co=${co.id}`) && one(await sb.textContent().catch(() => '')) === '링크 복사됨 ✓', clip.replace(/\n/g, ' | '))
  ok('360px 옆으로 안 밀림 (공유 안내)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/newco-inbox-share.png` }).catch(() => {})
  await n.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' })
  ok("공고를 올린 회사: 맨 위 '+ 새 공고 등록'·탭·찾기 다시 보임 · 공유하기 파랗게", (await n.locator('[data-jobs-new-top]').count()) === 1 && (await n.locator('[data-jobs-tabs]').count()) === 1 && (await n.locator('main form[role=search]').count()) === 1 && ((await n.locator('[data-share-card]').getByRole('button', { name: '공유하기' }).getAttribute('class')) ?? '').includes('chip-primary'))

  // ── 4. 대화가 있는 회사: 문의함 그대로
  const a = await mk(A)
  await a.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  await a.locator('[data-chat-search]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("대화가 있는 회사: '모든 대화 저장'·찾기·'전체 n' 그대로 · 시작 안내 없음", (await a.locator('a[href="/admin/chat/export"]').count()) === 1 && (await a.locator('[data-chat-search]').count()) === 1 && (await a.getByRole('link', { name: /^전체 \d+$/ }).count()) === 1 && (await a.locator('[data-inbox-start]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
