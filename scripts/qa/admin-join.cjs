// 관리자 가입: 회사 코드로 신청 → 대표 관리자 승인 → 관리자 화면
// · 대표만 코드를 봄(복사·공유·바꾸기) · 틀린 코드·바꾼 예전 코드는 거절 · 승인 전엔 관리자 화면 못 들어감
// · 대표: 대시보드 할 일 + 메뉴 표시 + 승인·거절 · 근무자 계정도 신청 가능(승인되면 다시 로그인) · 관리자 빼기
// · 일반 관리자는 승인 못 함(요청을 직접 만들어도) · 외주 업체 계정은 신청 못 함 · 360px
// node scripts/qa/admin-join.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u, v = 1) => { const p = Buffer.from(JSON.stringify({ u, v, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2', A3 = 'aaaaaaaa-0000-4000-8000-0000000000a3', V = '44444444-0000-4000-8000-0000000000b7'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const path0 = (p) => new URL(p.url()).pathname
const noSideScroll = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]

;(async () => {
  // 회사2 (확인됨) · 대표 A2 · 일반 관리자 A3 · 외주 업체 계정 V
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, verified: true, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '이대표', phone: '01022223333', is_super: false })
  await rest('users', 'POST', { ...a1, id: A3, name: '박직원', phone: '01022224444', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  await rest('company_members', 'POST', { company_id: C2, user_id: A3, role: 'admin' })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: V, name: '빛나는조명', phone: '01060600000', member_type: 'vendor', attendance: [], ratings: [] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, v = 1) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid, v), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const twice = async (loc) => { await loc.click(); await loc.page().waitForTimeout(150); await loc.click() }

  // ── 1. 대표: 회사 설정에 초대 코드 ──
  const own = await pg(A2)
  await own.goto(`${D}/admin/settings`)
  ok('대표: 관리자 칸 · 초대 코드', (await see(own, '관리자 초대 코드')) && (await own.locator('[data-join-code]').count()) === 1)
  const code = (await own.locator('[data-join-code]').innerText()).trim()
  ok('코드 모양 ABCD-EFGH (헷갈리는 글자 없음)', /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code), code)
  ok('코드 저장됨', (await rest(`companies?id=eq.${C2}`))[0].join_code === code.replace('-', ''))
  const team = own.locator('#admins')
  ok('관리자 목록: 대표·관리자', (await team.locator('li', { hasText: '이대표' }).count()) === 1 && (await team.locator('li', { hasText: '박직원' }).count()) === 1 && (await team.locator('.badge', { hasText: '대표' }).count()) === 1)
  ok('대표 줄에는 빼기 없음', (await own.locator('li', { hasText: '이대표' }).getByRole('button', { name: '빼기' }).count()) === 0)
  ok('360px: 회사 설정 옆으로 안 밀림', await noSideScroll(own))

  // 일반 관리자: 코드 안 보임
  const staff = await pg(A3)
  await staff.goto(`${D}/admin/settings`)
  ok('일반 관리자: 코드 안 보이고 대표에게 안내', (await see(staff, '관리자 초대·승인은 대표 관리자(이대표)가 할 수 있어요')) && (await staff.locator('[data-join-code]').count()) === 0)

  // ── 2. 처음 온 사람: 가입 유형 → 회사 코드로 관리자 가입 ──
  const nu = await pg(null)
  await nu.goto(`${D}/signup`)
  await nu.getByRole('link', { name: /관리자로 가입/ }).click()
  await nu.waitForURL(/tab=join/, { timeout: 8000 }).catch(() => {})
  ok('가입 유형에서 관리자 가입으로', path0(nu) === '/start' && (await see(nu, '대표 관리자에게 받은 코드')))
  ok('합류 단계 안내', await see(nu, '③ 대표 관리자가 승인하면 관리자 화면이 열려요'))
  ok('360px: 합류 화면 옆으로 안 밀림', await noSideScroll(nu))
  const tabH = await nu.getByRole('link', { name: '기존 회사에 합류' }).boundingBox()
  ok('탭 글자 한 줄', !!tabH && tabH.height < 48, JSON.stringify(tabH))
  const fill = async (codeText) => {
    await nu.locator('input[name=code]').fill(codeText)
    await nu.locator('input[name=name]').fill('최신입')
    await nu.locator('input[name=phone]').fill('01045456767')
    await nu.locator('input[name=pin]').fill('482913')
    await nu.locator('input[name=pin2]').fill('482913')
    await nu.locator('input[name=agree_privacy]').check()
    await nu.getByRole('button', { name: '관리자 가입 신청' }).click()
  }
  await fill('ZZZZ-ZZZZ')
  ok('틀린 코드는 거절', await see(nu, '회사 코드가 맞지 않아요', 15000))
  ok('틀린 코드로는 계정 안 만들어짐', (await rest('users?phone=eq.01045456767')).length === 0)
  // 소문자·줄표 없이 넣어도 됨
  await fill(code.replace('-', '').toLowerCase())
  ok('입력하면 대문자·줄표로 정리', (await nu.locator('input[name=code]').inputValue()) === code)
  await nu.waitForURL(/\/start\/wait/, { timeout: 15000 }).catch(() => {})
  ok('신청하면 기다리는 화면', (await see(nu, '⏳ 승인을 기다리고 있어요')) && (await see(nu, '두번째컴퍼니')))
  const nuser = (await rest('users?phone=eq.01045456767'))[0]
  ok('계정: 관리자지만 회사 소속 없음', nuser?.role === 'admin' && nuser?.is_super === false && !(await rest('company_members')).some((m) => m.user_id === nuser?.id))
  ok('신청 저장', (await rest('company_join_requests')).some((r) => r.company_id === C2 && r.user_id === nuser?.id))
  ok('360px: 기다리는 화면 옆으로 안 밀림', await noSideScroll(nu))
  // 승인 전: 관리자 화면 못 들어감
  for (const u of ['/admin', '/admin/workers', '/admin/settings']) {
    await nu.goto(`${D}${u}`)
    await nu.waitForURL(/\/start\/wait/, { timeout: 10000 }).catch(() => {})
    ok(`승인 전 ${u} → 기다리는 화면`, path0(nu) === '/start/wait' && !(await see(nu, '근무자 명단', 500)), nu.url())
  }

  // ── 3. 대표: 할 일·메뉴 표시 → 승인 ──
  await own.goto(`${D}/admin`)
  ok('대시보드 할 일: 관리자 가입 신청', await see(own, '관리자 가입 신청 · 승인해 주세요'))
  ok('메뉴 회사 설정 옆 표시', (await own.locator('[aria-label="관리자 가입 신청 1명"]').count()) === 1)
  await staff.goto(`${D}/admin`)
  ok('일반 관리자에게는 할 일 안 보임', !(await see(staff, '관리자 가입 신청', 1200)))
  // 일반 관리자가 승인 요청을 직접 만들어도 막힘
  const forged = await staff.evaluate(
    async ({ id, uid }) => {
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify([uid, true]) })
      return decodeURIComponent(r.headers.get('x-action-redirect') || '')
    },
    { id: idOf('team', 'decideJoin'), uid: nuser.id },
  )
  ok('일반 관리자: 승인 막힘', forged.includes('대표 관리자만') && !(await rest('company_members')).some((m) => m.user_id === nuser.id), forged)

  await own.goto(`${D}/admin/settings`)
  ok('회사 설정: 가입 신청 1명', (await see(own, '🧑‍💼 가입 신청 1명')) && (await see(own, '최신입')) && (await see(own, '010-4545-6767')))
  await twice(own.getByRole('button', { name: '승인' }).first())
  ok('승인 안내', await see(own, '최신입님을 관리자로 승인했어요', 15000))
  ok('회사 관리자로 소속', (await rest('company_members')).some((m) => m.company_id === C2 && m.user_id === nuser.id && m.role === 'admin'))
  ok('신청은 지워짐', !(await rest('company_join_requests')).some((r) => r.user_id === nuser.id))
  // 신입: 다시 보면 승인됨 → 관리자 화면
  await nu.goto(`${D}/start/wait`)
  ok('신입: 승인됐어요 안내', await see(nu, '관리자로 승인됐어요'))
  await nu.getByText('관리자 화면 →').click()
  await nu.waitForURL(/\/admin/, { timeout: 10000 }).catch(() => {})
  ok('신입: 관리자 화면 · 회사2', path0(nu) === '/admin' && (await see(nu, '🏢 두번째컴퍼니')), nu.url())
  ok('신입: 일반 관리자라 코드 안 보임', (await nu.goto(`${D}/admin/settings`), (await see(nu, '관리자 초대·승인은 대표 관리자')) && (await nu.locator('[data-join-code]').count()) === 0))

  // ── 4. 근무자 계정으로 신청 → 거절 → 다시 신청 → 승인 (다시 로그인) ──
  const wk = await pg(W)
  await wk.goto(`${D}/start?tab=join&code=${code.replace('-', '')}`)
  ok('근무자: 내 계정으로 신청 + 알바 지원 못 한다는 안내', (await see(wk, '근무자님 계정으로 신청해요')) && (await see(wk, '관리자가 되면 이 번호로는 알바 지원을 할 수 없어요')))
  ok('링크의 코드가 채워짐', (await wk.locator('input[name=code]').inputValue()).replace('-', '') === code.replace('-', ''))
  await wk.getByRole('button', { name: '관리자 가입 신청' }).click()
  await wk.waitForURL(/\/start\/wait/, { timeout: 15000 }).catch(() => {})
  ok('근무자: 기다리는 화면', await see(wk, '⏳ 승인을 기다리고 있어요'))
  await own.goto(`${D}/admin/settings`)
  await twice(own.locator('div', { hasText: '근무자' }).getByRole('button', { name: '거절' }).last())
  ok('거절 안내', await see(own, '근무자님의 신청을 거절했어요', 15000))
  ok('거절: 근무자 그대로', (await rest(`users?id=eq.${W}`))[0].role === 'worker' && !(await rest('company_join_requests')).some((r) => r.user_id === W))
  await wk.goto(`${D}/start/wait`)
  ok('거절 뒤: 소속 없음 안내', await see(wk, '아직 소속된 회사가 없어요'))
  // 다시 신청 → 승인
  await wk.goto(`${D}/start?tab=join&code=${code}`)
  await wk.getByRole('button', { name: '관리자 가입 신청' }).click()
  await wk.waitForURL(/\/start\/wait/, { timeout: 15000 }).catch(() => {})
  await own.goto(`${D}/admin/settings`)
  await twice(own.getByRole('button', { name: '승인' }).first())
  ok('근무자 승인 안내', await see(own, '근무자님을 관리자로 승인했어요', 15000))
  const wRow = (await rest(`users?id=eq.${W}`))[0]
  ok('근무자 → 관리자, 다시 로그인하게', wRow.role === 'admin' && wRow.session_version === 2)
  await wk.goto(`${D}/start/wait`)
  await wk.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {})
  ok('예전 로그인은 끊김 → 로그인 화면', path0(wk) === '/login', wk.url())
  const wk2 = await pg(W, 2)
  await wk2.goto(`${D}/admin`)
  ok('다시 로그인하면 관리자 화면', path0(wk2) === '/admin' && (await see(wk2, '🏢 두번째컴퍼니')), wk2.url())

  // ── 5. 대표: 관리자 빼기 ──
  await own.goto(`${D}/admin/settings`)
  await twice(own.locator('li', { hasText: '최신입' }).locator('button'))
  ok('빼기 안내', await see(own, '최신입님을 이 회사 관리자에서 뺐어요', 15000))
  const out = (await rest(`users?id=eq.${nuser.id}`))[0]
  ok('뺀 사람: 소속 없음 → 근무자 계정 · 다시 로그인', !(await rest('company_members')).some((m) => m.user_id === nuser.id) && out.role === 'worker' && out.session_version === 2)

  // ── 6. 코드 바꾸기 → 예전 코드 거절 ──
  await twice(own.getByRole('button', { name: /새 코드로 바꾸기|예전 코드는 막혀요/ }))
  ok('코드 바꿈 안내', await see(own, '새 코드로 바꿨어요', 15000))
  const code2 = (await own.locator('[data-join-code]').innerText()).trim()
  ok('새 코드는 다름', code2 !== code && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code2), `${code} → ${code2}`)
  const nu2 = await pg(null)
  await nu2.goto(`${D}/start?tab=join`)
  await nu2.locator('input[name=code]').fill(code)
  await nu2.locator('input[name=name]').fill('늦은신입')
  await nu2.locator('input[name=phone]').fill('01045450000')
  await nu2.locator('input[name=pin]').fill('482913')
  await nu2.locator('input[name=pin2]').fill('482913')
  await nu2.locator('input[name=agree_privacy]').check()
  await nu2.getByRole('button', { name: '관리자 가입 신청' }).click()
  ok('예전 코드로는 신청 안 됨', await see(nu2, '회사 코드가 맞지 않아요', 15000))

  // ── 7. 외주 업체 계정은 신청 못 함 · 새 회사 등록 탭에 합류 안내 ──
  const vd = await pg(V)
  await vd.goto(`${D}/start?tab=join`)
  ok('외주 업체: 관리자 신청 못 한다는 안내', (await see(vd, '외주 업체 계정으로는 관리자가 될 수 없어요')) && (await vd.locator('input[name=code]').count()) === 0)
  await nu2.goto(`${D}/start`)
  ok('새 회사 등록 탭: 회사 코드로 합류 안내', await see(nu2, '회사 코드로 합류 →'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
