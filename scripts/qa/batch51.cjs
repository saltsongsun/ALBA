// 묶음 51: 오늘 끝난 근무엔 지원을 받지 않음 — 공고 '오늘 근무 종료' + '모집 중인 다른 알바 보기' · 서버도 막음
//          · 하루짜리 근무가 이미 시작했으면 지원 칸에 'n시에 이미 시작한 근무예요' (지원은 받음)
//          · 공고 카드 '오늘 근무 종료' · '지원 가능만'에서 빠짐 · 확정된 사람은 그대로 내 상태
//          · 공고 담당자 번호 아래 전화·문자 한 줄 · 서류는 이름 아래 받는 방법 · 관리자 근무자 칩 줄 끝 흐림 · 360px
// (근무 시간을 지금 시각 기준으로 바꿔 가며 확인 — 한국 시각 0시~0시 40분엔 '끝난 근무'를 만들 수 없어 그 부분은 건너뜀)
// node scripts/qa/batch51.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', JOB = 'cccccccc-0000-4000-8000-000000000003'
const NEW = 'bbbbbbbb-0000-4000-8000-0000000000f1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
// 한국 시각 (분) 과 'HH:MM:00'
const kstMin = () => { const d = new Date(Date.now() + 9 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`

;(async () => {
  const [job0] = await rest(`jobs?id=eq.${JOB}`)
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${JOB}`, 'PATCH', { start_date: today, end_date: today })
  const [w] = await rest(`users?id=eq.${W}`)
  if (!(await rest(`users?id=eq.${NEW}`)).length) await rest('users', 'POST', { ...w, id: NEW, name: '늦은회원', phone: '01012123434', photo_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const n = await pg(NEW)
  const now = kstMin()

  // ── 1. 이미 시작한 하루짜리 근무: 안내 + 지원은 받음 ──
  if (now >= 61 && now <= 23 * 60) {
    await rest(`jobs?id=eq.${JOB}`, 'PATCH', { start_time: hm(now - 60), end_time: hm(Math.min(now + 120, 23 * 60 + 59)) })
    await n.goto(`${D}/jobs/${JOB}`)
    const note = n.locator('[data-started-note]')
    await note.waitFor({ timeout: 10000 }).catch(() => {})
    ok("시작한 근무: '이미 시작한 근무예요' + 지원 버튼 그대로", (await note.innerText().catch(() => '')).includes('이미 시작한 근무예요') && (await n.getByRole('button', { name: '늦은회원님으로 지원하기' }).count()) === 1, await note.innerText().catch(() => ''))
    ok('시작한 근무: 모집중 표시 (종료 아님)', (await n.locator('[data-over-today]').count()) === 0)
  } else console.log('SKIP  시작한 근무 안내 (한국 시각이 너무 이르거나 늦음)')

  // ── 2. 화면을 연 사이 근무가 끝나면 서버가 막음 ──
  if (now >= 40) {
    await rest(`jobs?id=eq.${JOB}`, 'PATCH', { start_time: hm(Math.max(now - 120, 0)), end_time: hm(Math.max(now - 5, 1)) })
    if (now < 61 || now > 23 * 60) {
      // 1단계를 건너뛴 때: 끝나기 전 화면을 먼저 열 수 없으므로 서버 확인은 건너뜀
      console.log('SKIP  서버 막기 (지원 칸을 열 수 있는 시각이 아님)')
    } else {
      // 지원 버튼은 두 번 눌러야 지원됨 (첫 번째는 확인 문구)
      const applyBtn = n.locator('#apply form button[type=submit]').last()
      await applyBtn.click()
      await applyBtn.click()
      await n.getByText('오늘 근무가').first().waitFor({ timeout: 10000 }).catch(() => {})
      ok("열어 둔 화면에서 지원해도 서버가 막음: '오늘 근무가 …에 끝났어요'", (await n.getByText(/오늘 근무가 \d\d:\d\d에 끝났어요/).count()) > 0)
      ok('지원서가 만들어지지 않음', (await rest(`applications?job_id=eq.${JOB}&user_id=eq.${NEW}`)).length === 0)
    }

    // ── 3. 끝난 근무 화면: 지원 칸 대신 안내 ──
    await n.goto(`${D}/jobs/${JOB}`)
    const over = n.locator('[data-over-today-note]')
    await over.waitFor({ timeout: 10000 }).catch(() => {})
    ok("공고: '오늘 근무 종료' 배지 + '오늘 근무가 …에 끝났어요'", (await n.locator('[data-over-today]').innerText().catch(() => '')).includes('오늘 근무 종료') && (await over.innerText().catch(() => '')).includes('끝났어요'))
    ok("지원 버튼·아래 지원 바 없음 + '모집 중인 다른 알바 보기'", (await n.getByRole('button', { name: /지원하기/ }).count()) === 0 && (await n.locator('.animate-slide-up').count()) === 0 && (await over.locator('a[href="/"]').count()) === 1)
    ok('360px: 옆으로 안 밀림 (끝난 공고)', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

    // ── 4. 공고 카드·'지원 가능만' ──
    await n.goto(`${D}/`)
    const card = n.locator(`a[href="/jobs/${JOB}"]`).first()
    await card.waitFor({ timeout: 10000 }).catch(() => {})
    ok("공고 카드: '오늘 근무 종료' · 남은 자리 대신 'n/n명 확정'", (await card.locator('[data-over-today]').count()) === 1 && !(await card.innerText()).includes('자리 남음') && /\d+\/\d+명 확정/.test(await card.innerText()))
    await n.goto(`${D}/?avail=1`)
    await n.waitForLoadState('networkidle').catch(() => {})
    ok("'지원 가능만'에서 빠짐", (await n.locator(`a[href="/jobs/${JOB}"]`).count()) === 0)

    // ── 5. 확정된 사람은 끝난 뒤에도 내 상태 그대로 ──
    const p = await pg(W)
    await p.goto(`${D}/jobs/${JOB}`)
    await p.locator('[data-over-today]').waitFor({ timeout: 10000 }).catch(() => {})
    ok('확정자: 끝난 안내 대신 내 상태', (await p.locator('[data-over-today-note]').count()) === 0 && (await p.getByText('근무가 확정됐어요').count()) > 0)
    await p.close()
  } else console.log('SKIP  끝난 근무 (한국 시각 0시 40분 전)')

  // ── 6. 담당자 연락 · 서류 줄 ──
  await rest(`jobs?id=eq.${JOB}`, 'PATCH', { start_time: job0.start_time, end_time: job0.end_time, start_date: job0.start_date, end_date: job0.end_date })
  await n.goto(`${D}/jobs/${JOB}`)
  const mc = n.locator('[data-manager-contact]')
  await mc.waitFor({ timeout: 10000 }).catch(() => {})
  const tops = await mc.locator('a').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('담당자: 번호 아래 전화·문자가 한 줄', tops.length === 2 && tops[0] === tops[1] && (await mc.innerText()).includes('010-5555-6666'), JSON.stringify(tops))
  const docLines = n.locator('[data-doc-lines]')
  ok("서류: 이름 아래 '확정 후 앱에서 전자서명' (괄호 없이)", (await docLines.innerText().catch(() => '')).includes('확정 후 앱에서 전자서명') && !(await docLines.innerText().catch(() => '')).includes('('))
  ok('360px: 옆으로 안 밀림 (공고)', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 7. 관리자 근무자 목록 칩 줄 끝 흐림 ──
  const a = await pg(A)
  await a.goto(`${D}/admin/workers`)
  const row = a.locator('[data-filter-row]')
  await row.waitFor({ timeout: 10000 }).catch(() => {})
  ok('관리자 근무자 칩 줄: 끝 흐림', /linear-gradient/.test(await row.evaluate((el) => getComputedStyle(el).maskImage || '')))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
