// 직인 위치 · 서류 보호 · 공고 조회 현황 · 경력 · 긴급 투입 QR · 개선 10가지 테스트
// node scripts/qa/round3.cjs <default 앱> <default 가짜> <working 앱> <working 가짜> <fresh 앱> <fresh 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const fs = require('node:fs')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, W_, MW, F, MF] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (m, path, method = 'GET', body) => fetch(`${m}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 33 * 3600e3).toISOString().slice(0, 10)
const PNG = 'data:image/png;base64,' + fs.readFileSync(process.cwd() + '/public/icons/icon-192.png').toString('base64')
const errs = []
;(async () => {
  const b = await chromium.launch()
  const pg = async (base, uid, opt = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR', ...opt })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${base} ${e.message.slice(0, 120)}`)); return p
  }

  // ── 직인이 (인) 한가운데 ──
  await rest(MD, `signed_docs?id=eq.${DOC_SIGNED}`, 'PATCH', { seal_image: PNG, company_snapshot: { company_name: '주식회사 테스트', ceo_name: '아주긴대표자이름', business_no: null, company_address: null, company_phone: null } })
  const ad = await pg(D, A)
  await ad.goto(`${D}/docs/${DOC_SIGNED}`)
  await ad.locator('img[alt=직인]').waitFor({ timeout: 8000 }).catch(() => {})
  const inBox = await ad.getByText('(인)').first().boundingBox()
  const sealBox = await ad.locator('img[alt=직인]').first().boundingBox()
  const dx = inBox && sealBox ? Math.abs(inBox.x + inBox.width / 2 - (sealBox.x + sealBox.width / 2)) : 999
  const dy = inBox && sealBox ? Math.abs(inBox.y + inBox.height / 2 - (sealBox.y + sealBox.height / 2)) : 999
  ok('직인: (인) 한가운데에 찍힘', dx < 2 && dy < 2, `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`)

  // ── 서류 보호: 근무자 화면 워터마크·복사 막기 / 무효 서류는 못 봄 ──
  const wd = await pg(D, WK)
  await wd.goto(`${D}/docs/${DOC_SIGNED}`)
  const style = await wd.locator('article.print-sheet').first().getAttribute('style')
  ok('근무자 서류: 열람 일시 워터마크', !!style && style.includes('svg') && decodeURIComponent(style).includes('열람'))
  ok('근무자 서류: 글자 선택·복사 막기', (await wd.locator('.doc-guard.select-none').count()) === 1)
  const adStyle = await ad.locator('article.print-sheet').first().getAttribute('style')
  ok('관리자 화면은 워터마크 없이', !adStyle || !adStyle.includes('svg'))
  await rest(MD, `signed_docs?id=eq.${DOC_SIGNED}`, 'PATCH', { status: 'void' })
  await wd.reload()
  ok('무효 서류는 근무자가 못 봄', await see(wd, '볼 수 없는 서류예요'))
  ok('관리자는 무효 서류도 봄', (await (await ad.reload(), ad.getByText('무효 처리된 서류입니다.').count())) === 1)

  // ── 개선: 진행 단계 · 내 근무 할 일 배지 · 다른 모집 공고 ──
  await rest(MD, 'jobs', 'POST', { ...(await rest(MD, `jobs?id=eq.${J}`))[0], id: 'cccccccc-0000-4000-8000-0000000000c2', title: '내일 다른 행사', start_date: tomorrow, end_date: tomorrow, status: 'open', applications: [] })
  await wd.goto(`${D}/jobs/${J}`)
  ok('지원 진행 단계 표시 (서명 단계)', (await wd.locator('ol[aria-label="진행 단계 3/4"]').count()) === 1)
  ok('다른 모집 중인 알바', await see(wd, '다른 모집 중인 알바'))
  const navMe = wd.locator('nav[data-bottom-nav] a[href="/me"]')
  ok('아래 탭 내 근무: 할 일 배지', ((await navMe.innerText()) || '').includes('1'))

  // ── 공고 조회 현황 (관리자만) ──
  const anon = await pg(D)
  await anon.goto(`${D}/jobs/${J}`)
  await anon.waitForTimeout(1200)
  await ad.goto(`${D}/jobs/${J}`) // 관리자 조회는 세지 않음
  await ad.waitForTimeout(800)
  const views = await rest(MD, `job_views?job_id=eq.${J}`)
  ok('조회 기록: 비회원 1 + 근무자 1 (관리자 제외)', views.length === 2 && views.some((v) => v.viewer === `u:${WK}`) && !views.some((v) => v.viewer === `u:${A}`), views.map((v) => v.viewer.slice(0, 2)).join(','))
  await ad.goto(`${D}/admin/jobs/${J}`)
  ok('관리자: 확인 2명 · 가입자 1명', (await see(ad, /확인\s*2\s*명/)) && (await see(ad, '(가입자 1명)')))
  ok('관리자: 지금 보는 중', await see(ad, /지금 보는 중\s*2\s*명/))
  await ad.getByText(/본 가입자 1명/).click()
  ok('본 가입자 목록 (근무자 · 지원함)', await see(ad, '지원함'))
  await ad.goto(`${D}/admin/jobs`)
  ok('공고 목록: 확인 인원', await see(ad, /👀 2/))
  const w403 = await fetch(`${D}/api/jobs/${J}/viewers`)
  ok('조회 현황 숫자는 관리자만', w403.status === 403)

  // ── 경력 ──
  await ad.goto(`${D}/admin/jobs/${J}?tab=apps`)
  ok('지원자 카드에 경력', await see(ad, /부산국제영화제/))
  await ad.goto(`${D}/admin/jobs/${J}?tab=apps&sort=exp`)
  ok('지원자 정렬: 경험 많은 순', (await ad.getByRole('link', { name: '경험 많은 순' }).getAttribute('class')).includes('bg-ink'))
  await wd.goto(`${D}/me/profile`)
  await wd.getByText('행사 경력').first().click()
  await wd.getByRole('button', { name: '+ 경력 추가' }).click()
  await wd.getByPlaceholder('행사명 (예: 부산국제영화제)').fill('서울재즈페스티벌')
  await wd.getByPlaceholder('기간 (예: 2025.10, 3일)').fill('2025.05')
  await wd.getByPlaceholder('역할 (예: 안내·주차)').fill('티켓 확인')
  await wd.getByRole('button', { name: '경력 저장' }).click()
  ok('내 정보: 경력 저장', await see(wd, '경력 1개를 저장했어요.'))
  const me = (await rest(MD, `users?id=eq.${WK}`))[0]
  ok('경력이 계정에 저장됨', me.careers?.[0]?.event === '서울재즈페스티벌' && me.careers[0].role === '티켓 확인')

  // ── 근무자 목록 거르기 · 문의 안 읽음 ──
  await ad.goto(`${D}/admin/workers?f=nophoto`)
  ok('근무자 목록: 사진 없음만', (await see(ad, '근무자')) && !(await see(ad, '김지원', 1200)))
  await ad.goto(`${D}/admin/chat?unread=1`)
  ok('문의: 안 읽음만', await see(ad, /안 읽음 1/))

  // ── 가입 진행률 ──
  const signup = await pg(D)
  await signup.goto(`${D}/signup`)
  ok('가입 진행률 표시', await see(signup, /필수 0\/7/))
  await signup.locator('#name').fill('홍길동')
  ok('입력하면 진행률 올라감', await see(signup, /필수 1\/7/))

  // ── 긴급 투입 QR (fresh: 행사 당일) ──
  const af = await pg(F, A)
  await af.goto(`${F}/admin/jobs/${J}/qr`)
  ok('긴급 투입 QR 화면', (await af.locator('svg').count()) > 0 && (await see(af, '휴대폰 카메라로 찍으면')))
  const code = createHmac('sha256', SECRET).update(`join|${J}|${today}`).digest('base64url').slice(0, 12)
  const ap = await pg(F, AP)
  await ap.goto(`${F}/join/${J}?c=wrongcode000`)
  ok('틀린 QR은 만료 안내', await see(ap, 'QR이 만료됐어요'))
  await ap.goto(`${F}/join/${J}?c=${code}`)
  await ap.getByRole('button', { name: '바로 합류하기' }).click()
  ok('QR로 바로 합류 → 내 근무', await see(ap, /합류했어요/, 15000))
  const app = (await rest(MF, `applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]
  ok('확정 + 긴급 투입 표시', app.status === 'approved' && app.admin_memo === '긴급 투입(QR)')
  await af.goto(`${F}/admin/jobs/${J}?tab=att`)
  ok('출퇴근 탭: 긴급 투입 배지', await see(af, '🚨 긴급 투입'))
  const anonJoin = await pg(F)
  await anonJoin.goto(`${F}/join/${J}?c=${code}`)
  ok('비회원: 가입 후 바로 합류 안내', (await see(anonJoin, '1분 가입')) && (await anonJoin.getByRole('link', { name: '1분 가입' }).getAttribute('href')).includes(encodeURIComponent(`/join/${J}`)))

  // ── 근무 중 진행 바 · 이체 목록 복사 (working) ──
  await rest(MW, `jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '23:59:00' })
  const ww = await pg(W_, WK)
  await ww.goto(`${W_}/me`)
  ok('근무 중: 종료까지 남은 시간', await see(ww, /종료\(23:59\)까지/))
  await rest(MW, `attendance?job_id=eq.${J}`, 'PATCH', { clock_in: new Date(Date.now() - 3 * 3600e3).toISOString(), clock_out: new Date().toISOString() })
  await rest(MW, `users?id=eq.${WK}`, 'PATCH', { bank_name: '국민' })
  const aw = await pg(W_, A, { permissions: ['clipboard-read', 'clipboard-write'] })
  await aw.goto(`${W_}/admin/jobs/${J}?tab=pay`)
  await aw.getByRole('button', { name: '💸 이체 목록 복사' }).click()
  ok('이체 목록 복사', await see(aw, '1명 이체 목록을 복사했어요'))
  const clip = await aw.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok('복사 내용: 은행·예금주·금액', clip.includes('국민') && clip.includes('근무자') && /\t\d+$/.test(clip.trim()), clip.split('\n')[1])

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
