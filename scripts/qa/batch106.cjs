// 묶음 106 (사용자 요청 2026-11-07): ① 관리자는 접속하면 관리자 화면부터 ② 한 계정으로 두 역할 (다른 회사 공고에 근무자로 지원) ③ 최상위 관리자 운영 센터
// ① 관리자가 첫 화면(/)을 열면 /admin · '근무자 화면으로 보기'로 들어오면 근무자 첫 화면 그대로 · 머리말 '관리자'로 돌아가면 다시 관리자 화면부터 · 공고 모음 링크(?co=)는 그대로
// ② 맡은 회사 공고는 '우리 회사 공고예요' · 다른 회사 공고는 처음 한 번 근무자 정보(주민번호·동의) → 지원 칸 · 지원·확정 · 단체방은 근무자로
//    · 그 회사 근무자 목록에 보임 · 신고용 주민번호 열람은 그 회사에서 일했을 때만 · 비밀번호 초기화는 안 됨 · 운영자 계정은 지원 안 함
// ③ 운영 센터: 최상위 관리자만 (/ops) · 할 일 · 숫자 칸 · 날마다 방문 · 화면 오류 · 회사별 활동 · 더보기에 '운영' 묶음 · 360px 옆으로 안 밀림 (밝은·어두운)
// node scripts/qa/batch106.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000000c6'
const B = 'aaaaaaaa-0000-4000-8000-0000000000b6' // 회사2 대표 관리자 (근무자 정보 없음)
const M = 'aaaaaaaa-0000-4000-8000-0000000000b7' // 회사1 일반 관리자 (최상위 아님)
const JX = 'cccccccc-0000-4000-8000-0000000000d6' // 회사1 공고 (내일) — B에게는 다른 회사 공고
const JO = 'cccccccc-0000-4000-8000-0000000000d7' // 회사2 공고 — B에게는 우리 회사 공고
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const tomorrow = new Date(Date.now() + 33 * 3600e3).toISOString().slice(0, 10)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => {
  const id = Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
  if (!id) throw new Error(`서버 함수 못 찾음: ${file}.${name}`)
  return id
}
const call = (p, file, name, args, form) =>
  p.evaluate(
    async ({ id, args, form }) => {
      const headers = { 'Next-Action': id, Accept: 'text/x-component' }
      let body
      if (form) {
        body = new FormData()
        for (const [k, v] of Object.entries(form)) body.append(`_1_${k}`, v)
        body.append('0', JSON.stringify([...args, '$K1']))
      } else {
        body = JSON.stringify(args)
        headers['Content-Type'] = 'text/plain;charset=UTF-8'
      }
      const r = await fetch(location.pathname, { method: 'POST', headers, body })
      return { status: r.status, redirect: decodeURIComponent(r.headers.get('x-action-redirect') || ''), text: await r.text() }
    },
    { id: idOf(file, name), args, form },
  )
const said = (r, msg) => r.text.includes(msg) || r.redirect.includes(msg)

;(async () => {
  // ── 준비: 회사2(확인됨) + 대표 관리자 B (주민번호 없음 · 얼굴 사진 있음) · 회사1 내일 공고 JX · 회사2 공고 JO ──
  const [c1] = await rest(`companies?id=eq.${C}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째상사', seal_image: null, verified: true, created_at: new Date().toISOString() })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: B, name: '둘째대표', phone: '01046460606', is_super: false, rrn_enc: null, rrn_hash: null, rrn_masked: null, birth_date: null, photo_at: '2026-10-29T00:00:00Z', attendance: [], ratings: [] })
  await rest('company_members', 'POST', { company_id: C2, user_id: B, role: 'owner' })
  await rest('users', 'POST', { ...a1, id: M, name: '일반담당', phone: '01046460707', is_super: false, attendance: [], ratings: [] })
  await rest('company_members', 'POST', { company_id: C, user_id: M, role: 'admin' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: JX, title: '내일 행사 안내 스태프', start_date: tomorrow, end_date: tomorrow, applications: [], required_docs: [] })
  await rest('jobs', 'POST', { ...j1, id: JO, company_id: C2, company: { company_name: '둘째상사' }, title: '둘째상사 자체 행사', start_date: tomorrow, end_date: tomorrow, applications: [], required_docs: [], created_by: B })
  // 운영 센터용: 화면 오류·답답함 기록 (7일 안)
  const now = new Date().toISOString()
  for (const s of ['s-1', 's-2']) await rest('usage_events', 'POST', { at: now, session: s, role: 'worker', path: '/me', prev: null, kind: 'view', ms: null, depth: null, label: null })
  await rest('usage_events', 'POST', { at: now, session: 's-1', role: 'worker', path: '/me', prev: null, kind: 'error', ms: null, depth: null, label: '출근 기록을 저장하지 못했어요' })
  await rest('usage_events', 'POST', { at: now, session: 's-2', role: 'worker', path: '/me', prev: null, kind: 'error', ms: null, depth: null, label: '출근 기록을 저장하지 못했어요' })
  await rest('usage_events', 'POST', { at: now, session: 's-2', role: 'worker', path: '/jobs/[id]', prev: null, kind: 'rage', ms: null, depth: null, label: '지원하기' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, scheme = 'light') => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', colorScheme: scheme })
    await ctx.addInitScript((sc) => {
      try {
        if (sc === 'dark') localStorage.setItem('theme', 'dark')
        localStorage.setItem('push-nudge-later', String(Date.now()))
        localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5))
        sessionStorage.setItem('photo-prompt-later', '1')
      } catch {}
    }, scheme)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const pathOf = (p) => new URL(p.url()).pathname

  // ── ① 관리자는 접속하면 관리자 화면부터 ──
  const bp = await pg(B)
  await bp.goto(`${D}/`)
  ok("관리자가 '/' 열면 → /admin", pathOf(bp) === '/admin', bp.url())
  await bp.goto(`${D}/?co=${C}`)
  ok('공고 모음 링크(/?co=)는 그대로 (근무자 화면)', pathOf(bp) === '/' && (await bp.locator('[data-admin-tabbar]').count()) === 0, bp.url())
  await bp.goto(`${D}/admin`)
  await bp.locator('[data-admin-tabbar] button').last().click()
  await bp.locator('[data-to-worker]').first().waitFor({ timeout: 5000 }).catch(() => {})
  ok("더보기에 '근무자 화면으로 보기'", (await bp.locator('[data-admin-more] [data-to-worker]').count()) === 1)
  ok('회사 관리자(최상위 아님)는 더보기에 운영 묶음 없음', (await bp.locator('[data-super-group]').count()) === 0)
  await Promise.all([bp.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10000 }).catch(() => {}), bp.locator('[data-admin-more] [data-to-worker]').click()])
  ok("'근무자 화면으로 보기' → 근무자 첫 화면", pathOf(bp) === '/' && (await bp.locator('[data-admin-tabbar]').count()) === 0, bp.url())
  const vc = (await bp.context().cookies(D)).find((c) => c.name === 'hw-view')
  ok('근무자 화면 표시: httpOnly · 몇 시간만', !!vc && vc.httpOnly && vc.value === 'worker' && vc.expires > Date.now() / 1000 && vc.expires < Date.now() / 1000 + 7 * 3600, JSON.stringify(vc))
  await bp.goto(`${D}/`)
  ok("근무자 화면으로 들어온 동안은 '/' 그대로", pathOf(bp) === '/', bp.url())
  await Promise.all([bp.waitForURL((u) => new URL(u).pathname === '/admin', { timeout: 10000 }).catch(() => {}), bp.locator('[data-to-admin]').click()])
  ok("머리말 '관리자' → 관리자 화면", pathOf(bp) === '/admin', bp.url())
  await bp.goto(`${D}/`)
  ok("관리자 화면으로 돌아오면 다음 '/'는 다시 관리자 화면부터", pathOf(bp) === '/admin', bp.url())
  const wk = await pg(W)
  await wk.goto(`${D}/`)
  ok('근무자는 첫 화면 그대로', pathOf(wk) === '/')

  // ── ② 한 계정으로 두 역할 ──
  await bp.goto(`${D}/jobs/${JO}`)
  ok("맡은 회사 공고: '우리 회사 공고예요' · 지원 칸 없음", (await bp.locator('[data-own-job]').innerText().catch(() => '')).includes('우리 회사 공고예요') && (await bp.locator('#message').count()) === 0 && (await bp.locator('[data-worker-identity]').count()) === 0)
  let r = await call(bp, 'worker', 'applyJob', [JO], { message: '' })
  ok('맡은 회사 공고에 직접 지원 요청도 막힘', said(r, '우리 회사 공고에는 근무자로 지원할 수 없어요'), r.redirect)

  await bp.goto(`${D}/jobs/${JX}`)
  ok('다른 회사 공고: 처음 한 번 근무자 정보 칸', (await bp.locator('[data-worker-identity]').count()) === 1 && (await bp.locator('#message').count()) === 0)
  r = await call(bp, 'worker', 'applyJob', [JX], { message: '' })
  ok('근무자 정보 없이 지원 요청 → 막힘', said(r, '근무자 정보(주민등록번호)를 먼저 넣어 주세요'), r.redirect)
  r = await call(bp, 'worker', 'addWorkerIdentity', [null], { rrn1: '950505', rrn2: '1234567' })
  ok('동의 없이 근무자 정보 → 막힘', said(r, '필수 동의 항목에 모두 체크해 주세요'))
  r = await call(bp, 'worker', 'addWorkerIdentity', [null], { rrn1: '150505', rrn2: '3234567', agree_third: 'on', agree_rrn: 'on' })
  ok('만 15세 미만 → 막힘', said(r, '만 15세 미만은 근무할 수 없습니다'))
  const idForm = bp.locator('[data-worker-identity]')
  if (SHOTS) await idForm.screenshot({ path: `${SHOTS}/identity.png` }).catch(() => {})
  ok('360px: 근무자 정보 칸 옆으로 안 밀림', await wide(bp))
  await idForm.locator('input[name=rrn1]').fill('950505')
  await idForm.locator('input[name=rrn2]').fill('1234567')
  await idForm.locator('input[name=agree_third]').check()
  await idForm.locator('input[name=agree_rrn]').check()
  await idForm.getByRole('button', { name: '근무자 정보 넣기' }).click()
  await bp.locator('#message').waitFor({ timeout: 10000 }).catch(() => {})
  ok('넣으면 바로 지원 칸으로 바뀜', (await bp.locator('#message').count()) === 1 && (await bp.locator('[data-worker-identity]').count()) === 0)
  const [bu] = await rest(`users?id=eq.${B}`)
  ok('주민번호는 암호화 · 가린 번호 · 생년월일 저장', !!bu.rrn_enc && !bu.rrn_enc.includes('9505051234567') && bu.rrn_masked === '950505-1******' && bu.birth_date === '1995-05-05' && !!bu.rrn_hash, JSON.stringify({ m: bu.rrn_masked, b: bu.birth_date }))
  ok('관리자 권한은 그대로', bu.role === 'admin')
  ok('기록: worker.identity', (await rest('audit_logs')).some((x) => x.action === 'worker.identity' && x.actor_id === B))
  r = await call(bp, 'worker', 'addWorkerIdentity', [null], { rrn1: '900101', rrn2: '1234567', agree_third: 'on', agree_rrn: 'on' })
  const [bu2] = await rest(`users?id=eq.${B}`)
  ok('한 번 넣은 근무자 정보는 다시 바꾸지 않음', said(r, '이미 근무자 정보가 있어요') && bu2.rrn_masked === '950505-1******')

  const apply = bp.locator('form:has(#message)')
  await apply.locator('#message').fill('주말 행사 경험 있어요')
  await apply.getByRole('button', { name: /지원하기/ }).click()
  await apply.getByRole('button', { name: '한 번 더 누르면 지원돼요' }).click()
  await bp.waitForTimeout(2000)
  const myApp = (await rest(`applications?job_id=eq.${JX}`)).find((x) => x.user_id === B)
  ok('다른 회사 공고에 근무자로 지원됨', !!myApp && myApp.status === 'applied' && myApp.company_id === C, JSON.stringify(myApp))

  // 회사1(최상위 관리자 A가 보는 회사)에서: 근무자 목록에 보임
  const ap = await pg(A)
  await ap.goto(`${D}/admin/workers?q=${encodeURIComponent('둘째')}`)
  await ap.getByText('둘째대표').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('지원받은 회사 근무자 목록에 그 관리자 계정이 보임', (await ap.locator('main').innerText()).includes('둘째대표'), (await ap.locator('main').innerText()).slice(0, 300).replace(/\n/g, ' | '))
  // 확정 → 단체방은 근무자로
  await rest(`applications?id=eq.${myApp.id}`, 'PATCH', { status: 'approved' })
  await bp.goto(`${D}/me/chat/room/${JX}`)
  ok('확정된 다른 회사 단체방은 근무자 화면으로 (관리자 단체방으로 안 넘어감)', pathOf(bp) === `/me/chat/room/${JX}`, bp.url())
  r = await call(bp, 'room', 'sendRoom', [JX, null], { body: '내일 뵙겠습니다' })
  const msg = (await rest(`job_chat?job_id=eq.${JX}`)).find((m) => m.sender_id === B)
  ok('단체방 글은 근무자로 (담당자 표시 아님)', !!msg && msg.from_admin === false, JSON.stringify({ r: r.text.slice(0, 80), msg }))
  await bp.goto(`${D}/me/chat/room/${JO}`)
  await bp.waitForURL((u) => new URL(u).pathname === `/admin/chat/room/${JO}`, { timeout: 8000 }).catch(() => {})
  ok('맡은 회사 단체방은 관리자 단체방으로', pathOf(bp) === `/admin/chat/room/${JO}`, bp.url())

  // 지원받은 회사(회사1)의 일반 관리자 M: 신고용 주민번호는 그 회사에서 일한 기록이 있어야 · 비밀번호 초기화는 안 됨 (관리자 계정 가로채기 막기)
  const mp = await pg(M)
  await mp.goto(`${D}/admin`)
  r = await call(mp, 'admin', 'revealRrn', [B, null])
  ok('일한 기록 전에는 주민번호 안 보임', said(r, '이 회사에서 근무한 기록이 있는 근무자만'), r.text.slice(0, 160))
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000000000e6', company_id: C, job_id: JX, user_id: B, work_date: tomorrow, clock_in: new Date().toISOString(), clock_out: null })
  r = await call(mp, 'admin', 'revealRrn', [B, null])
  ok('그 회사에서 일했으면 신고용 주민번호 열람', said(r, '950505-1234567'), r.text.slice(0, 160))
  r = await call(mp, 'admin', 'resetPin', [B, null])
  ok('다른 회사 관리자 계정 비밀번호 초기화는 막힘', said(r, '이 회사에 확정됐거나 근무한 근무자만'), r.text.slice(0, 160))
  await mp.goto(`${D}/admin/workers/${B}`)
  ok('근무자 화면에 비밀번호 초기화 버튼 없음', (await mp.getByRole('button', { name: /비밀번호 초기화/ }).count()) === 0)
  // 회사2(B가 맡은 회사)에서는 B의 근무 기록이 없어 아무것도 안 보임 · 같은 회사 동료 관리자 주민번호는 안 보임
  const b2 = await pg(B)
  await b2.goto(`${D}/admin`)
  // 운영자 계정은 근무자로 지원 안 함
  await ap.goto(`${D}/jobs/${JX}`)
  ok("운영자: '운영자 계정은 근무자로 지원하지 않아요'", (await ap.locator('[data-own-job]').innerText().catch(() => '')).includes('운영자 계정은 근무자로 지원하지 않아요') && (await ap.locator('#message').count()) === 0)

  // ── ③ 운영 센터 ──
  await ap.goto(`${D}/ops`)
  await ap.locator('[data-ops]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("운영센터 제목 '전체 현황' (머리줄이 '운영센터')", (await ap.locator('h1').innerText().catch(() => '')) === '전체 현황')
  const tiles = await ap.locator('[data-ops-tile]').evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0].trim()))
  ok('숫자 칸: 회사 · 방문 (7일) · 근무자 회원 · 오늘 출근', tiles.join(',') === '회사,방문 (7일),근무자 회원,오늘 출근', tiles.join(','))
  const coTile = (await ap.locator('[data-ops-tile]').first().innerText()).replace(/\n+/g, '\n')
  // 숫자는 0에서 올라가므로 실제 값(data-value)으로 확인
  ok('회사 칸: 2곳 · 새 회사 1곳', (await ap.locator('[data-ops-tile]').first().locator('[data-value]').getAttribute('data-value')) === '2' && coTile.includes('새 회사 1'), JSON.stringify(coTile))
  const err = ap.locator('[data-ops-error]').first()
  ok("화면 오류: '출근 기록을 저장하지 못했어요' · 2명 · 내 근무", (await err.innerText().catch(() => '')).includes('출근 기록을 저장하지 못했어요') && (await err.innerText()).includes('2명') && (await err.innerText()).includes('내 근무'), await err.innerText().catch(() => ''))
  ok("답답한 곳: '지원하기'", (await ap.locator('[data-ops-rage]').innerText().catch(() => '')).includes('지원하기'))
  ok("할 일: '7일 동안 화면 오류 1가지'", (await ap.locator('[data-ops-todo]').innerText()).includes('7일 동안 화면 오류 1가지'), await ap.locator('[data-ops-todo]').innerText())
  ok('날마다 방문 막대 7개 · 오늘', (await ap.locator('[data-ops-visits] li').count()) === 7 && (await ap.locator('[data-ops-visits] li').last().innerText()).includes('오늘'))
  const co = await ap.locator('[data-ops-company]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))
  ok('회사별 활동: 주식회사 테스트(출근 있음) · 둘째상사(모집 1)', co.some((t) => t.includes('주식회사 테스트')) && co.some((t) => t.includes('둘째상사') && t.includes('모집 1')), co.join(' / '))
  ok('360px: 운영 센터 옆으로 안 밀림 (밝은 화면)', await wide(ap))
  if (SHOTS) await ap.screenshot({ path: `${SHOTS}/ops.png`, fullPage: true })
  await ap.goto(`${D}/admin`)
  await ap.locator('[data-admin-tabbar] button').last().click()
  await ap.locator('[data-super-group]').first().waitFor({ timeout: 5000 }).catch(() => {})
  const group = await ap.locator('[data-admin-more] li').evaluateAll((els) => els.map((e) => e.innerText.trim()))
  const gi = group.indexOf('운영 · 최상위 관리자')
  // 운영센터는 관리자 화면 밖 따로 (/ops · 주인 한 사람만 — 2026-11-09)
  ok("더보기: '운영 · 최상위 관리자' 아래 운영센터 ↗·회사 관리·인사이트·커뮤니티 관리", gi > 0 && group.slice(gi + 1, gi + 5).join(',') === '운영센터 ↗,회사 관리,인사이트,커뮤니티 관리', group.join(' / '))
  if (SHOTS) await ap.screenshot({ path: `${SHOTS}/more.png` })
  await ap.locator('[data-admin-more] a', { hasText: '운영센터' }).click()
  await ap.waitForURL((u) => new URL(u).pathname === '/ops', { timeout: 8000 }).catch(() => {})
  ok('더보기 → 운영 센터', pathOf(ap) === '/ops')
  const dk = await pg(A, 'dark')
  await dk.goto(`${D}/ops`)
  ok('360px: 운영 센터 옆으로 안 밀림 (어두운 화면)', (await dk.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await wide(dk)))
  if (SHOTS) await dk.screenshot({ path: `${SHOTS}/ops-dark.png`, fullPage: true })
  await b2.goto(`${D}/ops`)
  await b2.waitForTimeout(800)
  ok('회사 관리자(최상위 아님)는 운영 센터 못 엶 (없는 화면)', (await b2.locator('[data-ops]').count()) === 0 && (await b2.locator('[data-ops-tile]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
