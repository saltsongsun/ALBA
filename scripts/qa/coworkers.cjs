// 함께 일한 사람: 한쪽으로만 '내 지원 보여 주기' (사용자 요청 "스토킹 걱정 · 내 지원 정보를 지정된 사람에게만 · 남의 정보를 내가 아는 건 아님")
// · 같은 공고에서 함께 출근한 사람만 목록(별명, 함께 N번) · 내가 고른 사람에게만 내 지원이 보임 (요청·수락·알림 없음)
// · 내가 보여 줘도 상대의 지원은 안 보임 · 상대 공고 화면에 '🤝 동료 N명도 지원했어요'는 상대가 고른 경우만
// · 함께 일한 적 없는 사람은 못 고름 · 관리자는 못 씀 · 그만 보여 주기 · 360px
// node scripts/qa/coworkers.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
const STRANGER = '77777777-0000-4000-8000-000000000077'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, timeout = 6000) => p.getByText(t).first().waitFor({ timeout }).then(() => true, () => false)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const links = () => rest('coworker_links').then((r) => (Array.isArray(r) ? r : []))

;(async () => {
  // 운영자 전체 스위치: 이 기능은 처음엔 꺼져 있음 → 켜고 시작
  await rest('audit_logs', 'POST', { actor_id: 'aaaaaaaa-0000-4000-8000-000000000001', action: 'feature.coworkers', detail: 'on', created_at: new Date().toISOString() })
  // 김지원(AP)도 같은 공고에서 출근함 · 별명
  await rest('attendance', 'POST', { job_id: J, user_id: AP, work_date: new Date().toISOString().slice(0, 10), clock_in: new Date().toISOString(), clock_out: null })
  await rest(`users?id=eq.${W}`, 'PATCH', { nickname: '주차왕' })
  await rest(`users?id=eq.${AP}`, 'PATCH', { nickname: '새벽스태프' })
  await rest('users', 'POST', { id: STRANGER, name: '모르는사람', phone: '01088880000', pin_hash: 's1:x:y', created_at: '2026-01-01T00:00:00Z' })

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

  // ── 1. 목록: 함께 출근한 사람만, 별명 ──
  const w = await pg(W)
  await w.goto(`${D}/community`)
  await w.locator('[data-coworkers-link]').click()
  await w.waitForURL(/\/community\/coworkers/, { timeout: 8000 }).catch(() => {})
  // 불러오는 중 화면이 지나갈 때까지
  await w.locator('[data-coworker-list]').waitFor({ timeout: 10000 }).catch(() => {})
  const row = w.locator('[data-coworker]').first()
  ok('함께 출근한 사람: 별명 + 함께 1번', (await w.locator('[data-coworker]').count()) === 1 && (await row.innerText()).includes('새벽스태프') && (await row.innerText()).includes('함께 1번'))
  ok('실명(김지원)·모르는 사람 안 보임', !(await w.locator('body').innerText()).includes('김지원') && !(await w.locator('body').innerText()).includes('모르는사람'))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 한쪽으로만 보여 주기: 주차왕(W)이 새벽스태프(AP)에게 '내 지원 보여 주기' ──
  await w.goto(`${D}/community/coworkers`)
  await w.getByRole('button', { name: '내 지원 보여 주기' }).click()
  ok("누르면 '✓ 보여 주는 중'", await w.locator('[data-coworker=sharing]').waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('기록: 주차왕 → 새벽스태프 (한 줄만)', (await links()).some((l) => l.from_id === W && l.to_id === AP) && !(await links()).some((l) => l.from_id === AP && l.to_id === W))
  // 내가 보여 줘도 남의 지원은 안 보임 (새벽스태프도 이 공고에 지원했지만)
  await w.goto(`${D}/jobs/${J}`)
  ok('내가 보여 줘도 상대의 지원은 안 보임', (await w.locator('[data-coworkers-on-job]').count()) === 0)

  // 받은 쪽: 요청·수락 없음, 상대가 고른 사실만 (상대의 선택)
  const ap = await pg(AP)
  await ap.goto(`${D}/community/coworkers`)
  await ap.locator('[data-coworker-list]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("받은 쪽: '나에게 지원 공고를 보여 줘요' · 수락 버튼·요청 배지 없음", (await ap.locator('[data-shares-with-me]').count()) === 1 && (await ap.getByRole('button', { name: '수락' }).count()) === 0 && !(await ap.locator('body').innerText()).includes('요청'))
  ok('받은 쪽은 아무것도 안 했으니 자기 지원은 비공개 그대로', (await ap.locator('[data-coworker=sharing]').count()) === 0)

  // ── 3. 공고 화면: 보여 준 사람의 지원만 ──
  await ap.goto(`${D}/jobs/${J}`)
  const pal = ap.locator('[data-coworkers-on-job]')
  ok('새벽스태프의 공고 화면: 🤝 동료 1명도 지원했어요 · 주차왕 (주차왕이 고름)', (await pal.count()) === 1 && (await pal.innerText()).includes('동료 1명') && (await pal.innerText()).includes('주차왕'), await pal.innerText().catch(() => ''))
  ok('360px: 공고 화면 옆으로 안 밀림', await ap.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 함께 일한 적 없는 사람에게는 요청 안 됨 ──
  const before = (await links()).length
  const linkId = idOf('coworkers', 'linkCoworker')
  await w.evaluate(async ({ id, T }) => {
    const body = new FormData()
    body.append('0', JSON.stringify([T, '$K1']))
    await fetch('/community/coworkers', { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
  }, { id: linkId, T: STRANGER })
  ok('함께 일한 적 없는 사람: 요청 안 됨', (await links()).length === before && !(await links()).some((l) => l.to_id === STRANGER))

  // ── 5. 관리자는 못 씀 ──
  const ad = await pg(A)
  await ad.goto(`${D}/community/coworkers`)
  ok('관리자: 쓸 수 없다는 안내', await see(ad, '쓸 수 없어요'))

  // ── 6. 그만 보여 주기 (내 쪽만 · 알림 없음) ──
  await w.goto(`${D}/community/coworkers`)
  const stop = w.locator('[data-coworker=sharing] form button')
  await stop.click()
  await stop.click()
  await w.locator('[data-coworker=none]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('그만 보여 주기: 기록 지움', !(await links()).some((l) => l.from_id === W && l.to_id === AP))
  await ap.goto(`${D}/jobs/${J}`)
  ok('그만 보여 준 뒤: 상대 공고 화면에서도 사라짐', (await ap.locator('[data-coworkers-on-job]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
