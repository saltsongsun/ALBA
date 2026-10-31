// 직인 올리기 · 서명 되돌리기 · 귀가 조치 · 기능·디자인 개선 10가지 테스트
// node scripts/qa/round10.cjs <default 앱> <default 가짜> <working 앱> <working 가짜> <fresh 앱> <fresh 가짜> <큰 직인 사진 경로>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, W_, MW, F, MF, BIG] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000000b2', APP_W = '11111111-0000-4000-8000-000000000008'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (m, path, method = 'GET', body) => fetch(`${m}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const tomorrow = new Date(Date.now() + 33 * 3600e3).toISOString().slice(0, 10)
const errs = []
;(async () => {
  const b = await chromium.launch()
  const pg = async (base, uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${base} ${e.message.slice(0, 120)}`)); return p
  }

  // ── 직인: 큰 사진도 줄여서 저장 ──
  const ad = await pg(D, A)
  const before = (await rest(MD, 'settings'))[0].seal_image
  await ad.goto(`${D}/admin/settings`)
  await ad.waitForLoadState('networkidle')
  await ad.locator('input[type=file]').setInputFiles(BIG)
  ok('직인: 고르면 미리보기·저장 안내', await see(ad, '아래 ‘저장’을 눌러야 바뀌어요.'))
  await ad.getByRole('button', { name: /저장/ }).last().click()
  ok('직인: 저장됨', await see(ad, '저장했습니다.'))
  const after = (await rest(MD, 'settings'))[0].seal_image
  ok('직인: 1MB 사진이 줄어서 저장 (투명 PNG)', after !== before && after.startsWith('data:image/png;base64,') && after.length < 560000, `${after.length}자`)

  // ── 개선 8: 관리자 공고 검색 ──
  await ad.goto(`${D}/admin/jobs?q=${encodeURIComponent('생활체육')}`)
  ok('공고 검색: 맞는 공고', await see(ad, '‘생활체육’ 검색 결과 1건'))
  await ad.goto(`${D}/admin/jobs?q=${encodeURIComponent('없는말')}`)
  ok('공고 검색: 없으면 0건', await see(ad, '‘없는말’ 검색 결과 0건'))

  // ── 개선 9: 얼굴 명단 ──
  await ad.goto(`${D}/admin/jobs/${J}?tab=att&view=faces`)
  const grid = ad.locator('div.grid > div.card', { hasText: '근무자' }).first()
  const gridText = (await grid.innerText().catch(() => '')) || ''
  ok('얼굴 명단: 사진·이름·배치·상태', gridText.includes('근무자') && gridText.includes('A게이트') && gridText.includes('근무 중'), gridText.replace(/\n/g, ' '))

  // ── 개선 1·2: 알바 찾기 날짜 필터 · 남은 자리 ──
  const anon = await pg(D)
  await anon.goto(`${D}/`)
  ok('공고 카드: 남은 자리', await see(anon, '4자리 남음'))
  await anon.getByRole('link', { name: '오늘·내일' }).click()
  await anon.waitForURL(/when=soon/)
  ok('날짜 필터: 오늘·내일에 오늘 행사', await see(anon, '경상남도 생활체육대축전 행사장 안내 스태프'))
  const wd = await pg(D, WK)
  await wd.goto(`${D}/?avail=1`)
  ok('지원 가능만: 이미 확정된 공고는 빠짐', await see(wd, '조건에 맞는 공고가 없어요'))

  // ── 개선 6: 지원 한마디 칩 ──
  await rest(MD, 'jobs', 'POST', { ...(await rest(MD, `jobs?id=eq.${J}`))[0], id: J2, title: '새 행사 스태프', start_date: tomorrow, end_date: tomorrow, status: 'open', applications: [] })
  await wd.goto(`${D}/jobs/${J2}`)
  await wd.getByRole('button', { name: '+ 차량 있어요' }).click()
  ok('한마디 칩: 누르면 칸에 들어감', (await wd.locator('#message').inputValue()) === '차량 있어요')

  // ── 개선 7: 글자 크게 보기 ──
  await wd.goto(`${D}/me/profile`)
  await wd.getByRole('switch', { name: /글자 크게 보기/ }).click()
  await wd.reload()
  const fs = await wd.evaluate(() => [document.documentElement.dataset.text, getComputedStyle(document.documentElement).fontSize])
  ok('글자 크게: 다시 열어도 유지 (18px)', fs[0] === 'lg' && fs[1] === '18px', fs.join(' '))

  // ── 개선 10: 없는 화면 ──
  await wd.goto(`${D}/jobs/00000000-0000-4000-8000-000000000000`)
  ok('없는 화면 안내', await see(wd, '찾는 화면이 없어요'))

  // ── 개선 4: 다음 근무 카드 (오늘 근무가 없을 때) ──
  await rest(MD, `jobs?id=eq.${J}`, 'PATCH', { start_date: tomorrow, end_date: tomorrow })
  await rest(MD, `attendance?job_id=eq.${J}`, 'DELETE')
  await wd.goto(`${D}/me`)
  ok('다음 근무 카드: 내일 · 공고', (await see(wd, '다음 근무')) && (await see(wd, '내일')))

  // ── 귀가 조치 (working: 근무 중) + 개선 3·5 ──
  // 밤에 돌려도 근무 시간 안에 있도록 종료 시각을 늦춤
  await rest(MW, `jobs?id=eq.${J}`, 'PATCH', { dress_code: '검정 바지', supplies: '신분증', start_time: '00:00:00', end_time: '23:59:00' })
  await rest(MW, `attendance?job_id=eq.${J}`, 'PATCH', { clock_in: new Date(Date.now() - 3 * 3600e3).toISOString() })
  const ww = await pg(W_, WK)
  await ww.goto(`${W_}/me`)
  ok('오늘 카드: 복장·준비물', (await see(ww, '검정 바지')) && (await see(ww, '신분증')))
  const aw = await pg(W_, A)
  await aw.goto(`${W_}/admin/jobs/${J}?tab=att`)
  await aw.getByText('🏠 귀가 조치 (불성실 근무)').click()
  await aw.locator('label', { hasText: '음주' }).click()
  await aw.locator('input[name=memo]').fill('근무 중 음주 확인')
  await aw.getByRole('button', { name: '귀가 조치', exact: true }).click()
  await aw.getByRole('button', { name: '정말 귀가 조치할까요?' }).click()
  ok('귀가 조치: 완료 안내', await see(aw, /귀가 조치했어요/, 15000))
  const att = (await rest(MW, `attendance?job_id=eq.${J}`))[0]
  ok('귀가 조치: 지금 시각 종료·사유 기록', !!att.clock_out && att.note.startsWith('귀가 조치(음주)'), att.note)
  ok('귀가 조치: 출퇴근 탭 배지', await see(aw, '귀가 조치(음주)'))
  ok('귀가 조치: 근무자에게 안내', (await rest(MW, `messages?thread_user_id=eq.${WK}`)).some((m) => m.body.startsWith('🏠 귀가 조치 안내')))
  await ww.goto(`${W_}/me/history`)
  ok('지난 근무: 입금 대기 금액', await see(ww, '입금 대기'))

  // ── 서명 되돌리기 (fresh: 출근 전, 서류 서명 끝) ──
  const af = await pg(F, A)
  await af.goto(`${F}/admin/jobs/${J}?tab=apps`)
  await af.getByText(/^확정 \d+명$/).first().click() // 대기자가 있으면 확정 목록은 접혀 있음
  await af.getByRole('button', { name: '대기로' }).first().click()
  await af.getByRole('button', { name: '서명도 취소돼요 · 대기로?' }).click()
  await af.waitForTimeout(2000)
  const app = (await rest(MF, `applications?id=eq.${APP_W}`))[0]
  const docs = await rest(MF, `signed_docs?user_id=eq.${WK}&job_id=eq.${J}`)
  ok('대기로 되돌리면 확정 해제', app.status === 'applied')
  ok('서명한 서류도 무효(취소)', docs.length > 0 && docs.every((d) => d.status === 'void'), docs.map((d) => d.status).join(','))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
