// 근로계약서 받는 방법 · 근무시간 변경 동의 · 얼굴 사진 등록 창 · 항목별 서식 편집 · 해피워크 이름 확인
// 가짜 Supabase 3개(default 54321 / working 54322 / fresh 54323)와 앱 3개(3002~3004)를 새로 띄운 뒤 실행
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, W_, MW, F, MF] = process.argv.slice(2)
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', TPL = 'ffffffff-0000-4000-8000-000000000007'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (m, path) => fetch(`${m}/rest/v1/${path}`).then((r) => r.json())
const see = (p, text, t = 8000) => p.getByText(text).first().waitFor({ timeout: t }).then(() => true, () => false)
const errs = []
;(async () => {
  const b = await chromium.launch()
  const page = async (base, uid, { prompt = false } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    if (!prompt) await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(`${base} ${e.message.slice(0, 150)}`))
    return p
  }

  // ── 얼굴 사진 등록 창 (사진 없는 기존 가입자) ──
  const wp = await page(D, WK, { prompt: true })
  await wp.goto(`${D}/me`)
  ok('사진 없으면 열자마자 등록 창', await see(wp, '얼굴 사진을 등록해 주세요'))
  ok('창 안에서 바로 사진 올리기', (await wp.locator('dialog[open] input[type=file]').count()) > 0)
  await wp.getByRole('button', { name: '나중에 할게요' }).click()
  ok('나중에 → 닫힘', (await wp.locator('dialog[open]').count()) === 0)
  await wp.reload()
  await wp.waitForTimeout(500)
  ok('같은 접속 동안은 다시 안 띄움 (카드로는 계속 안내)', (await wp.locator('dialog[open]').count()) === 0 && (await see(wp, '얼굴 사진을 올려 주세요')))

  // ── 근로계약서: 종이로 받기 ──
  const ad = await page(D, ADMIN)
  await ad.goto(`${D}/admin/jobs/${J}/edit#docs`)
  await ad.locator('label', { hasText: '종이(서면)로 받기' }).click()
  ok('종이 선택하면 앱 서명에서 빠진다고 안내', await see(ad, /앱에서는 근로계약서 서명을 요청하지 않아요/))
  await ad.getByRole('button', { name: '공고 저장' }).click()
  ok('저장', await see(ad, '저장했습니다', 15000))
  ok('앱에서 기다리던 계약서 서명 요청은 거둠', (await rest(MD, `signed_docs?job_id=eq.${J}&status=eq.pending&kind=eq.contract`)).length === 0)
  await ad.goto(`${D}/admin/jobs/${J}?tab=att`)
  ok('출퇴근 탭: 계약서 미수령 표시', await see(ad, '📝 계약서 미수령'))
  const wd = await page(D, WK)
  await wd.goto(`${D}/me`)
  ok('근무자: 근로계약서는 종이로 작성해요 안내', await see(wd, '근로계약서는 종이로 작성해요.'))
  ok('근무자: 앱 서명 없이 출퇴근 버튼 보임', await see(wd, '근무 종료'))
  await ad.goto(`${D}/admin/jobs/${J}?tab=docs`)
  ok('서류 탭: 종이 계약서 받음 기록 칸', await see(ad, '📝 근로계약서 · 종이(서면)로 받기'))
  await ad.getByRole('button', { name: '받음으로 표시' }).click()
  ok('받음으로 표시 → 받음 ✓', await see(ad, '받음 ✓'))
  await wd.reload()
  ok('받은 뒤에는 근무자 안내 사라짐', !(await see(wd, '근로계약서는 종이로 작성해요.', 1500)))

  // ── 항목별 서식 편집 ──
  await ad.goto(`${D}/admin/docs/${TPL}`)
  ok('서식 편집: 항목별로 고치기가 기본', await see(ad, '조항 0개'))
  await ad.getByRole('button', { name: '+ 조항 추가' }).click()
  await ad.getByPlaceholder('조항 제목 (예: 근로시간)').last().fill('근로시간')
  const row = ad.getByPlaceholder('내용').last()
  await row.fill('근무시간: ')
  await row.click()
  await ad.keyboard.press('End')
  await ad.getByRole('button', { name: '{{근무시간}}' }).click()
  await ad.getByRole('button', { name: '서식 저장' }).click()
  ok('서식 저장', await see(ad, /저장했습니다/, 15000))
  const tpl = (await rest(MD, `doc_templates?id=eq.${TPL}`))[0]
  ok('조항·자리채움이 서식에 들어감', /## 근로시간\n- 근무시간: \{\{근무시간\}\}/.test(tpl.body), JSON.stringify(tpl.body))

  // ── 해피워크 이름·아이콘·시작 화면 ──
  const html = await (await fetch(`${D}/login`)).text()
  ok('앱 이름 해피워크', /<title>로그인 · 해피워크<\/title>/.test(html))
  ok('아이폰 시작 화면 10가지 크기', (html.match(/rel="apple-touch-startup-image"/g) ?? []).length === 10)
  const mf = await (await fetch(`${D}/manifest.webmanifest`)).json()
  ok('설치 앱 이름·시작 화면 색', mf.name === '해피워크' && mf.background_color === '#ffffff')
  ok('시작 화면 이미지 받아짐', (await fetch(`${D}/splash/splash-1179x2556.png`)).status === 200)

  // ── 근무시간 연장 → 근무자 동의 (working: 근무 중) ──
  const aw = await page(W_, ADMIN)
  await aw.goto(`${W_}/admin/jobs/${J}?tab=att&shift=1`)
  await aw.getByRole('button', { name: '+1시간' }).click()
  await aw.locator('input[name=reason]').fill('행사 진행이 늦어져 연장')
  await aw.getByRole('button', { name: '근무자에게 동의 요청 보내기' }).click()
  ok('연장 동의 요청 보냄', await see(aw, '1명에게 근무시간 변경 동의를 요청했어요', 15000))
  let sc = await rest(MW, `shift_changes?job_id=eq.${J}`)
  ok('요청 기록 (18:00 → 19:00, 대기)', sc.length === 1 && sc[0].status === 'pending' && sc[0].end_time.startsWith('19:00') && sc[0].prev_end.startsWith('18:00'))
  ok('관리자: 동의 기다리는 중', await see(aw, '근무자 동의 기다리는 중'))
  const ww = await page(W_, WK)
  await ww.goto(`${W_}/me`)
  ok('근무자: 근무시간이 바뀌었어요 · 계속하시겠습니까?', (await see(ww, '🕒 근무시간이 바뀌었어요')) && (await see(ww, '계속하시겠습니까?')))
  await ww.getByRole('button', { name: '네, 계속할게요' }).click()
  ok('동의 → 안내', await see(ww, /계속 근무하기로 했어요/, 15000))
  const att = (await rest(MW, `attendance?job_id=eq.${J}&user_id=eq.${WK}`))[0]
  ok('출근 기록에 19:00까지 적용 (퇴근 유연화)', att.sched_end && att.sched_end.startsWith('19:00'), att.sched_end)
  ok('오늘 카드: 바뀐 시간 표시', await see(ww, /09:00 ~ 19:00 \(변경 동의\)/))
  await aw.reload()
  ok('관리자: 동의 표시', await see(aw, /19:00 동의/))
  // 앱을 못 쓰는 근무자: 관리자가 현장 동의로 기록
  await aw.goto(`${W_}/admin/jobs/${J}?tab=att&shift=1`)
  await aw.locator('input[name=end_time]').fill('20:00')
  await aw.getByRole('button', { name: '근무자에게 동의 요청 보내기' }).click()
  await see(aw, '1명에게 근무시간 변경 동의를 요청했어요', 15000)
  await aw.getByRole('button', { name: '현장 동의 받음' }).click()
  await aw.getByRole('button', { name: '현장에서 동의받았나요?' }).click()
  ok('현장 동의 기록', await see(aw, /20:00 동의 \(현장 동의\)/))
  const att2 = (await rest(MW, `attendance?job_id=eq.${J}&user_id=eq.${WK}`))[0]
  ok('현장 동의도 출근 기록에 적용', att2.sched_end && att2.sched_end.startsWith('20:00'), att2.sched_end)

  // ── 전체 일정 변경 → 근무자가 어려워요 (fresh: 출근 전) ──
  const af = await page(F, ADMIN)
  await af.goto(`${F}/admin/jobs/${J}?tab=att&shift=1`)
  await af.locator('label', { hasText: '전체 일정' }).click()
  await af.locator('input[name=start_time]').fill('10:00')
  await af.getByRole('button', { name: '근무자에게 동의 요청 보내기' }).click()
  ok('전체 일정 변경 요청', await see(af, '1명에게 근무시간 변경 동의를 요청했어요', 15000))
  const jf = (await rest(MF, `jobs?id=eq.${J}`))[0]
  ok('공고 시간도 바뀜', jf.start_time.startsWith('10:00'))
  const wf = await page(F, WK)
  await wf.goto(`${F}/me`)
  ok('근무자: 전체 일정 변경 확인', await see(wf, '전체 일정 · '))
  await wf.getByRole('button', { name: '아니요, 어려워요' }).click()
  await wf.getByRole('button', { name: '근무 확정이 취소돼요. 괜찮나요?' }).click()
  ok('어려워요 → 확정 취소 안내', await see(wf, '근무 확정을 취소했어요', 15000))
  const appF = (await rest(MF, `applications?job_id=eq.${J}&user_id=eq.${WK}`))[0]
  ok('지원 상태 취소', appF.status === 'cancelled')
  const msgs = (await rest(MF, `messages?thread_user_id=eq.${WK}`)).map((m) => m.body.split('\n')[0])
  ok('담당자 문의함에 어려움 알림', msgs.some((h) => h.startsWith('⚠️ 근무시간 변경 어려움')), msgs.join(' | '))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
