// 묶음 305 (사용자 요청 2026-11-18: 거래장부 '03_결제대금' 구글 시트 ↔ 해피워크 연동)
// · 시트 → 앱: 장부에서 '입금확인'한 줄 → 그 사람 근무를 지급 완료로 (같은 사람 + 정확한 날짜만 · 근무자 알림 없음)
// · 앱 → 시트: 어제까지 끝난 공고의 사람마다 장부(05) 맨 아래 한 줄 · 장부에 없는 근무자는 02, 프로젝트는 03에 추가
//   기존 줄은 절대 바꾸지 않음 · 새로 쓴 줄은 하늘색 + 비고 '🤖 해피워크 자동' · 쓸 줄에 사람이 적은 게 있으면 아무 탭에도 쓰지 않음
// · 같은 공고·사람은 한 번만 (여러 번 눌러도 줄이 겹치지 않음) · 매일 아침 7시 자동(예약 작업) + 관리자 '지금 연동' 버튼
// · 매일 무엇을 연동했는지: 관리자 홈 '오늘 대금 시트' 한 줄 + '연동 기록' 화면(사람 · 공고 · 줄) — 관리자에게만, 근무자·다른 회사엔 없음
// 자체 서버를 띄움: 가짜 DB 54324 · 가짜 구글 시트 54399 · 앱 3005 (구글 연결 환경 변수를 넣어서)
// node scripts/qa/batch305.cjs <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createHmac, createCipheriv, randomBytes, generateKeyPairSync } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const ENC = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const encrypt = (plain) => { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', Buffer.from(ENC, 'base64'), iv); const b = Buffer.concat([c.update(plain, 'utf8'), c.final()]); return 'v1:' + Buffer.concat([iv, c.getAuthTag(), b]).toString('base64') }
const [SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const ROOT = path.join(__dirname, '../..')
const MP = 54324, GP = 54399, AP = 3005
const D = `http://127.0.0.1:${AP}`, MD = `http://127.0.0.1:${MP}`, GD = `http://127.0.0.1:${GP}`
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000305a2'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000305b2'
const JL0 = 'cccccccc-0000-4000-8000-000000030500', JL1 = 'cccccccc-0000-4000-8000-000000030501', JL2 = 'cccccccc-0000-4000-8000-000000030502', JL3 = 'cccccccc-0000-4000-8000-000000030503'
const T02 = '02)일용직정보', T03 = '03)프로젝트정보', T05 = '05)일용직거래장부'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const g = (p, body) => fetch(`${GD}${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const procs = []
const stop = () => { for (const p of procs) try { process.kill(-p.pid, 'SIGTERM') } catch {} }
process.on('SIGTERM', () => { stop(); process.exit(3) })
const up = async (url, tries = 80) => { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.status < 500) return true } catch {} await wait(500) } return false }

// ── 가짜 시트 (사람 정보는 모두 지어낸 값)
const F02 = (r) => ({ f: `=IF(A${r}="","", A${r} & "(" & LEFT(B${r}, 6) & ")")` })
const B05 = (r) => ({ f: `=IF(ISBLANK(A${r}),"",WORKDAY(IF(DAY(A${r})<=14,DATE(YEAR(A${r}),MONTH(A${r}),15),EOMONTH(A${r},0)),0))` })
const LK = (r, col) => ({ f: `=IF($F${r}="","",IFERROR(XLOOKUP($F${r},'02)일용직정보'!$F:$F,'02)일용직정보'!$${col}:$${col},""),""))`, d: 'x' })
const M05 = (r) => ({ f: `=IFERROR(IF(L${r}="",K${r},K${r}*0.967),"")`, d: '0' })
function seedTabs() {
  const c02 = {}, c03 = {}, c05 = {}
  ;['이름', '주민등록번호', '은행', '계좌번호', '구분', '고유코드', '비고 (팀명, 지역 등)'].forEach((h, i) => (c02[`4,${i}`] = h))
  ;[['근무자', '900101-1000001', '국민', '0000-00-000001'], ['김기존', '880202-1000002', '농협', '0000-00-000002'], ['박기존', '870303-1000003', '신한', '0000-00-000003']].forEach((r, i) => {
    r.forEach((v, c) => (c02[`${5 + i},${c}`] = v))
    c02[`${5 + i},5`] = F02(6 + i)
  })
  for (let r = 9; r <= 12; r++) c02[`${r - 1},5`] = F02(r) // 미리 깔린 고유코드 수식 (빈 줄)
  ;['구분', '프로젝트명', '발주처 (협업기관)', '지출완료 여부', '비고', '', '진행중인 프로젝트(수정X)'].forEach((h, i) => h && (c03[`4,${i}`] = h))
  ;[['문화사업부', '가을 축제', '시청', true, ''], ['브랜드사업부', '스탬프 제작', '자체사업', false, '']].forEach((r, i) => r.forEach((v, c) => v !== '' && (c03[`${5 + i},${c}`] = v)))
  c03['5,6'] = { f: '=FILTER(B6:B,D6:D=FALSE)', d: '스탬프 제작' }
  for (let r = 8; r <= 10; r++) c03[`${r - 1},3`] = false // 미리 깔린 체크칸
  ;['프로젝트일', '입금예정일', '실입금일', '실입금일', '프로젝트', '고유코드', '은행', '계좌번호', '예금주', '주민등록번호', '도급금액', '원천세', '지급금액', '입금확인', '비고'].forEach((h, i) => (c05[`4,${i}`] = h))
  const row05 = (r, a, c, e, f, k, n, o = '') => {
    const i = r - 1
    c05[`${i},0`] = a; c05[`${i},1`] = { ...B05(r), d: a }; if (c) c05[`${i},2`] = c
    c05[`${i},4`] = e; c05[`${i},5`] = f
    ;['C', 'D', 'A', 'B'].forEach((col, j) => (c05[`${i},${6 + j}`] = LK(r, col)))
    c05[`${i},10`] = k; c05[`${i},12`] = M05(r); c05[`${i},13`] = n; if (o) c05[`${i},14`] = o
  }
  row05(6, kday(-10), kday(-5), '옛 행사', '근무자(900101)', 100000, true) // 손으로 적고 입금확인한 줄 → 앱 JL0 지급 완료
  row05(7, kday(-30), kday(-25), '가을 축제', '김기존(880202)', 80000, true)
  row05(8, kday(-20), '', '스탬프 제작', '박기존(870303)', 90000, false)
  row05(9, kday(-15), '', '가을 축제', '김기존(880202)', 50000, false, '메모')
  for (let r = 10; r <= 11; r++) { c05[`${r - 1},1`] = B05(r); c05[`${r - 1},13`] = false } // 미리 깔린 수식·체크칸
  return { [T02]: { rows: 12, cols: 7, cells: c02 }, [T03]: { rows: 10, cols: 8, cells: c03 }, [T05]: { rows: 11, cols: 15, cells: c05 } }
}
// 순수 계산 (lib/ledger-core.ts — 다른 파일을 부르지 않아 바로 실행)
const { execFileSync } = require('node:child_process')
const core = (expr) => JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', `import(${JSON.stringify(path.join(ROOT, 'src/lib/ledger-core.ts'))}).then((m) => process.stdout.write(JSON.stringify(${expr})))`], { encoding: 'utf8' }))
// 연결 다리 비밀값: 서버가 SESSION_SECRET에서 만드는 값과 같게 (lib/gsheets proxySecret)
const BRIDGE = createHmac('sha256', SECRET).update('ledger-proxy:v1').digest('base64url').slice(0, 32)
const cell = (dump, tab, r, c) => dump[tab].cells[`${r - 1},${c}`]
const sameCells = (a, b, tab, maxRow) => Object.keys(a[tab].cells).filter((k) => Number(k.split(',')[0]) < maxRow).every((k) => JSON.stringify(a[tab].cells[k]) === JSON.stringify(b[tab].cells[k]))

;(async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  const env = {
    ...process.env,
    OPS_OWNER_IDS: A, SUPABASE_SERVICE_ROLE_KEY: 'dummy', SESSION_SECRET: SECRET, ENCRYPTION_KEY: ENC, ADMIN_SETUP_CODE: 'x', CRON_SECRET: 'test-cron',
    SUPABASE_URL: MD, LEDGER_COMPANY_ID: C1, LEDGER_EXPORT_FROM: kday(-5),
    // 운영과 같은 방법: 시트 안 연결 다리(Apps Script 웹 앱 · 주소만 넣음 · 비밀값은 서버가 SESSION_SECRET에서 만듦) — 끝에서 서비스 계정 방법도 한 번 확인
    LEDGER_PROXY_URL: `${GD}/proxy`,
  }
  const envSA = { ...env, LEDGER_PROXY_URL: '', LEDGER_PROXY_SECRET: '', GOOGLE_SA_EMAIL: 'ledger@test.iam.gserviceaccount.com', GOOGLE_SA_KEY: privateKey, LEDGER_SHEET_ID: 'test-sheet', GOOGLE_TOKEN_URL: `${GD}/token`, GOOGLE_SHEETS_BASE: GD }
  // ── 0. 계산
  ok("고유코드 '홍 길동(900101)' → 이름(띄어쓰기 없이) · 생년월일", JSON.stringify(core("m.parseCode('홍 길동(900101)')")) === '{"name":"홍길동","b6":"900101"}')
  ok('수식 줄 번호만 옮김 (열 전체 참조·숫자는 그대로)', core(`m.shiftFormula("=IF($F1849=\\"\\",\\"\\",XLOOKUP($F1849,'02)일용직정보'!$F:$F,'02)일용직정보'!$C:$C)+1849)", 1849, 1850)`) === `=IF($F1850="","",XLOOKUP($F1850,'02)일용직정보'!$F:$F,'02)일용직정보'!$C:$C)+1849)`)
  ok('빈 줄 판단: 미리 깔린 수식·체크 안 한 칸은 빈 것 · 사람이 쓴 칸은 막음', core(`[m.busyRow([['', '=A1', '', 'FALSE']], 10, [1], [3]), m.busyRow([['', '', '메모']], 10, [1]), m.busyRow([['', '', '', 'true']], 10, [], [3])]`).join() === ',10,10')
  ok('미리 깔린 수식은 그대로 둠', JSON.stringify(core(`m.keepPrefilled(['a', '=NEW', 3], ['', '=OLD', ''])`)) === '["a","=OLD",3]')
  ok('마지막 데이터 줄 (사람이 적는 칸만)', core(`m.lastDataRow([['a'], [], ['', 'x'], ['', '', 'FALSE']], [0, 1])`) === 8 && core('m.lastDataRow([], [0])') === 5)
  ok('공제 → 원천세 말 (일용·없음은 비움)', core(`[m.taxLabel('business', false), m.taxLabel('other', true), m.taxLabel('daily', false), m.taxLabel('none', false)]`).join('|') === '사업소득(3.3%)|기타소득+고용보험||')
  ok('생년월일 6자리: 생년월일 우선, 없으면 주민번호', core(`[m.b6Of('1995-02-03', null), m.b6Of(null, '9502032000004'), m.b6Of(null, null)]`).join() === '950203,950203,')
  ok('기록 조각 읽기', JSON.stringify(core(`m.detailTokens('장부 05) 12줄 추가 · 82,560원 · row=12 · job=J · user=U · run=abc')`)) === '{"row":"12","job":"J","user":"U","run":"abc"}')

  // 앞서 남은 서버가 있으면 그 서버(옛 코드)로 시험하게 되므로 멈춤
  for (const u of [`${MD}/rest/v1/companies`, `${GD}/_dump`, `${D}/login`, 'http://127.0.0.1:3006/login', 'http://127.0.0.1:3007/login']) if (await fetch(u).then(() => true, () => false)) { console.log(`FAIL  포트가 이미 쓰이는 중: ${u}`); process.exit(2) }
  // 각자 프로세스 묶음으로 띄워서 끝날 때 묶음째 끔 (npx 아래의 next 서버까지)
  const run = (cmd, args, e) => procs.push(spawn(cmd, args, { cwd: ROOT, env: e, stdio: 'ignore', detached: true }))
  run(process.execPath, ['scripts/qa/mock-supabase.mjs'], { ...process.env, SCENARIO: 'default', LAT: '5', PORT: String(MP) })
  run(process.execPath, ['scripts/qa/mock-gsheets.mjs'], { ...process.env, PORT: String(GP), PROXY_SECRET: BRIDGE })
  run('npx', ['next', 'start', '-p', String(AP)], env)
  ok('서버 셋 준비', (await up(`${MD}/rest/v1/companies`)) && (await up(`${GD}/_dump`)) && (await up(`${D}/login`)))
  const seed = seedTabs()
  await g('/_seed', { tabs: seed })
  const before = await g('/_dump')

  // ── 앱 자료: 둘째 회사·관리자, 새 근무자 W2(장부 02에 없음), 공고 넷
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째회사', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '둘째관리자', phone: '01030503050', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-15T00:00:00Z' })
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: W2, name: '새근무', phone: '01030513051', birth_date: '1995-02-03', rrn_enc: encrypt('9502032000004'), rrn_masked: '950203-2******', bank_name: '하나', bank_account_enc: encrypt('110123456789'), account_holder: '새근무' })
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, company: _c, ...jb } = base
  const mkJob = (id, title, event, day, tax) => rest('jobs', 'POST', { ...jb, id, company_id: C1, company: { company_name: '주식회사 테스트' }, title, event_name: event, status: 'closed', start_date: day, end_date: day, tax_type: tax, employment_insurance: false, pay_day: null, applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(JL0, '옛 행사 안내', '옛 행사', kday(-10), 'daily')
  await mkJob(JL1, '겨울 빛 축제 주차 안내', '겨울 빛 축제', kday(-2), 'daily')
  await mkJob(JL2, '가을 축제 안내', '가을 축제', kday(-1), 'business')
  await mkJob(JL3, '연말 행사', null, kday(-1), 'daily')
  const jobOf = async (id) => (await rest(`jobs?id=eq.${id}`))[0]
  let n = 0
  const att = async (job, user, day, out = true) => {
    n++
    const id = `eeeeeeee-0000-4000-8000-0000000305${String(n).padStart(2, '0')}`
    await rest('attendance', 'POST', { id, job_id: job, job: await jobOf(job), user_id: user, work_date: day, clock_in: `${day}T09:00:00+09:00`, clock_out: out ? `${day}T18:00:00+09:00` : null, adj_in: null, adj_out: null, break_override: null, extra_pay: 0, deduction: 0, paid: false, paid_at: null, confirmed: true, ot_minutes: 0, ot_status: null, ot_by: null, sched_start: null, sched_end: null, created_at: new Date().toISOString() })
    return id
  }
  const a0 = await att(JL0, W, kday(-10))
  const a1w = await att(JL1, W, kday(-2))
  const a1n = await att(JL1, W2, kday(-2))
  await att(JL2, W, kday(-1))
  const a3 = await att(JL3, W, kday(-1), false) // 퇴근 기록 없음 → 다음에
  const msgsBefore = (await rest('messages')).length

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, w = 360) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: w, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)

  // ── 1. 회사 설정: 대금 시트 카드 (연결됨 · 아직 맞춘 적 없음)
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  const card = a.locator('[data-ledger-card]')
  ok("회사 설정 '📒 대금 시트 연동' 카드 · 연결됨", (await card.count()) === 1 && (await card.locator('[data-ledger-state="on"]').count()) === 1)
  ok("마지막: '아직 맞춘 적 없어요'", one(await card.locator('[data-ledger-last]').textContent()).includes('아직 맞춘 적 없어요'))
  ok('360px 옆으로 안 밀림 (설정)', await noSide(a))

  // ── 2. 정산 탭 한 줄 → 지금 연동
  await a.goto(`${D}/admin/jobs/${JL1}?tab=pay`, { waitUntil: 'networkidle' })
  const strip = a.locator('[data-ledger-strip]')
  ok("정산 탭 '대금 시트 · 장부 0/2명' + 지금 연동", (await strip.count()) === 1 && one(await strip.textContent()).includes('장부 0/2명'), one(await strip.textContent().catch(() => '')))
  if (SHOTS) await strip.screenshot({ path: `${SHOTS}/pay-strip-before.png` }).catch(() => {})
  await strip.locator('button[type=submit]').click()
  await a.waitForURL(/m=/, { timeout: 30000 }).catch(() => {})
  await a.waitForLoadState('networkidle')
  const flash = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok('결과 한 줄: 입금확인 1명 · 장부 3줄 (근무자 1명·프로젝트 1개) · 정리 전 1명', flash === '📒 대금 시트 연동 · 입금확인 1명 지급 완료 · 장부 3줄 추가 (근무자 1명·프로젝트 1개) · 기록 정리 전 1명은 다음에', flash)

  // ── 3. 시트: 기존 줄 그대로 · 새 줄만 아래에 · 표시
  const s1 = await g('/_dump')
  const glog = await g('/_log')
  ok('05 기존 1~9줄 그대로 (한 칸도 안 바뀜)', sameCells(before, s1, T05, 9))
  ok('02 기존 1~8줄 그대로', sameCells(before, s1, T02, 8))
  ok('03 기존 1~7줄 그대로 · G열 자동 수식 그대로', sameCells(before, s1, T03, 7) && JSON.stringify(cell(s1, T03, 6, 6)) === JSON.stringify(cell(before, T03, 6, 6)))
  ok('03 쓰기는 A~E만 (G열 안 건드림)', glog.filter((l) => l.op === 'write' && l.tab === T03).every((l) => /!A\d+:E\d+$/.test(l.range)))
  const rows05 = [10, 11, 12].map((r) => ({ r, a: cell(s1, T05, r, 0), e: cell(s1, T05, r, 4), f: cell(s1, T05, r, 5), k: cell(s1, T05, r, 10), l: cell(s1, T05, r, 11), n: cell(s1, T05, r, 13), o: cell(s1, T05, r, 14), bF: cell(s1, T05, r, 1), g: cell(s1, T05, r, 6) }))
  ok('05 10~12줄: 비고 🤖 해피워크 자동 · 입금확인 체크 안 함', rows05.every((x) => String(x.o).startsWith('🤖 해피워크 자동 (') && x.n === false), JSON.stringify(rows05.map((x) => x.o)))
  ok('05 새 줄 하늘색 · 기존 줄은 색 그대로', [10, 11, 12].every((r) => s1[T05].bg[r]) && Object.keys(s1[T05].bg).every((r) => Number(r) >= 10))
  const w2row = rows05.find((x) => x.f === '새근무(950203)')
  const wJL1 = rows05.find((x) => x.f === '근무자(900101)' && x.a === kday(-2))
  const wJL2 = rows05.find((x) => x.f === '근무자(900101)' && x.a === kday(-1))
  ok('겨울 빛 축제 두 줄 (프로젝트일 = 공고 시작일 · 프로젝트 = 행사명)', !!w2row && !!wJL1 && w2row.a === kday(-2) && w2row.e === '겨울 빛 축제' && wJL1.e === '겨울 빛 축제')
  ok('도급금액 = 지급총액 (9시간 · 휴게 1시간 → 8시간 × 10,320)', !!wJL1 && wJL1.k === 82560 && w2row?.k === 82560, JSON.stringify([wJL1?.k, w2row?.k]))
  ok("일용근로 → 원천세 비움 + '⚠ 원천세 확인 필요' · 사업소득 → '사업소득(3.3%)'", !!wJL1 && wJL1.l === undefined && String(wJL1.o).includes('⚠ 원천세 확인 필요') && wJL2?.l === '사업소득(3.3%)' && wJL2?.e === '가을 축제', JSON.stringify(wJL2))
  ok('미리 깔린 수식은 그대로 · 새 줄 수식은 그 줄 번호로', cell(s1, T05, 10, 1).f === B05(10).f && cell(s1, T05, 12, 1).f === B05(12).f && String(cell(s1, T05, 12, 6)?.f).includes('$F12'), JSON.stringify(cell(s1, T05, 12, 6)))
  ok('시트 끝 줄이 모자라 1줄만 늘림 · 서식은 윗줄(9줄)에서', glog.some((l) => l.op === 'appendDimension' && l.tab === T05 && l.length === 1) && glog.some((l) => l.op === 'copyPaste' && l.tab === T05 && l.from === 9 && l.type === 'PASTE_FORMAT'))
  const n02 = [0, 1, 2, 3, 5, 6].map((c) => cell(s1, T02, 9, c))
  ok('02 9줄: 새근무 · 주민번호 · 은행 · 계좌(글자) · 고유코드 수식 · 비고 표시', n02[0] === '새근무' && n02[1] === '950203-2000004' && n02[2] === '하나' && n02[3] === '110123456789' && n02[4]?.f === F02(9).f && String(n02[5]).startsWith('🤖 해피워크 자동') && !!s1[T02].bg[9], JSON.stringify(n02))
  ok("03 8줄: '겨울 빛 축제' · 지출완료 체크 안 함 · 비고 표시 · 하늘색", cell(s1, T03, 8, 1) === '겨울 빛 축제' && cell(s1, T03, 8, 3) === false && String(cell(s1, T03, 8, 4)).includes('구분·발주처 확인 필요') && !!s1[T03].bg[8] && !s1[T03].bg[6])
  ok('연결 다리로만 시트에 접근 (토큰 직접 요청 없음)', glog.some((l) => l.op === 'proxy') && !glog.some((l) => l.op === 'token'))
  const pr = (body) => fetch(`${GD}/proxy`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json())
  ok('연결 다리: 비밀값이 틀리면 거절 · 허용하지 않은 일도 거절', (await pr({ secret: 'wrong', op: 'meta' })).error === 'forbidden' && (await pr({ secret: BRIDGE, op: 'clear' })).error === 'not allowed' && (await pr({ secret: BRIDGE, op: 'batch', requests: [{ deleteDimension: {} }] })).error === 'not allowed')
  ok('주민번호·계좌 칸은 읽지 않음 (05 G~J · 02 B~D)', glog.filter((l) => l.op === 'batchGet').every((l) => l.ranges.every((r) => !/!G|!B\d+:D|!B\d+:B/.test(r))) && glog.filter((l) => l.op === 'get' && l.render !== 'FORMULA').length === 0, JSON.stringify(glog.filter((l) => l.op === 'batchGet')))

  // ── 4. 앱: 장부에서 입금확인한 사람 → 지급 완료 · 근무자 알림 없음
  const [x0] = await rest(`attendance?id=eq.${a0}`)
  ok(`손으로 적은 입금확인 줄 → 그날 근무 지급 완료 (실입금일 ${kday(-5)})`, x0?.paid === true && String(x0?.paid_at).startsWith(kday(-5)), JSON.stringify([x0?.paid, x0?.paid_at]))
  ok('근무자에게 알림·문의함 글 없음', (await rest('messages')).length === msgsBefore)
  const logs = (await rest('audit_logs')).filter((l) => String(l.action).startsWith('ledger.'))
  const runs = new Set(logs.map((l) => (l.detail.match(/run=(\S+)$/) ?? [])[1]))
  ok('기록: 지급 1 · 장부 3 · 근무자 1 · 프로젝트 1 · 연동 1 (모두 같은 묶음 · 이 회사)', ['ledger.paid', 'ledger.export', 'ledger.worker', 'ledger.project', 'ledger.sync'].map((k) => logs.filter((l) => l.action === k).length).join() === '1,3,1,1,1' && runs.size === 1 && logs.every((l) => l.company_id === C1))

  // ── 5. 정산 탭: 🤖 장부 표시 · 장부 2/2명
  await a.goto(`${D}/admin/jobs/${JL1}?tab=pay`, { waitUntil: 'networkidle' })
  ok("두 사람 모두 '🤖 장부' · 한 줄 '장부 2/2명'", (await a.locator('[data-ledger-tag="export"]').count()) === 2 && one(await a.locator('[data-ledger-strip]').textContent()).includes('장부 2/2명'))

  // ── 6. 다시 눌러도 겹치지 않음
  await a.locator('[data-ledger-strip] button[type=submit]').click()
  await a.waitForURL(/m=/, { timeout: 30000 }).catch(() => {})
  const flash2 = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  const s2 = await g('/_dump')
  ok("다시 누르면 '기록 정리 전 1명은 다음에'만 · 시트 그대로", flash2 === '📒 대금 시트 연동 · 기록 정리 전 1명은 다음에' && JSON.stringify(s2) === JSON.stringify(s1), flash2)

  // ── 7. 대표님이 시트에서 앱이 올린 줄을 입금확인 → 아침 자동(예약 작업)이 지급 완료로
  ok('예약 작업 주소: 비밀값 없으면 401', (await fetch(`${D}/api/cron/ledger`)).status === 401)
  await g('/_set', { tab: T05, cells: { [`${wJL1.r - 1},13`]: true, [`${wJL1.r - 1},2`]: kday(0) } })
  const cr = await fetch(`${D}/api/cron/ledger`, { headers: { authorization: 'Bearer test-cron' } }).then((r) => r.json())
  ok("아침 자동: '입금확인 1명 지급 완료'", cr.ok === true && cr.text.startsWith('입금확인 1명 지급 완료'), JSON.stringify(cr))
  const [x1] = await rest(`attendance?id=eq.${a1w}`)
  const [x1n] = await rest(`attendance?id=eq.${a1n}`)
  ok('앱이 올린 줄 입금확인 → 그 사람 그 공고만 지급 완료 (같은 공고 다른 사람은 그대로)', x1?.paid === true && String(x1?.paid_at).startsWith(kday(0)) && x1n?.paid === false)
  await a.goto(`${D}/admin/jobs/${JL1}?tab=pay`, { waitUntil: 'networkidle' })
  ok("정산 탭 '📒 입금확인' 1명 · '입금확인 1명'", (await a.locator('[data-ledger-tag="paid"]').count()) === 1 && one(await a.locator('[data-ledger-strip]').textContent()).includes('입금확인 1명'))
  if (SHOTS) await a.locator('[data-pay-table]').screenshot({ path: `${SHOTS}/pay-tags.png` }).catch(() => {})

  // ── 8. 쓸 줄에 사람이 적은 게 있으면 아무 탭에도 안 씀 (03 프로젝트도 안 씀)
  await rest(`attendance?id=eq.${a3}`, 'PATCH', { clock_out: `${kday(-1)}T18:00:00+09:00` })
  await g('/_set', { tab: T05, rows: 14, cells: { '12,14': '대표님 메모' } })
  const s3 = await g('/_dump')
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await a.locator('[data-ledger-card] button[type=submit]').click()
  await a.waitForURL(/m=/, { timeout: 30000 }).catch(() => {})
  const flash3 = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  const s4 = await g('/_dump')
  ok('13줄에 메모 → 실패 알림 · 시트 전부 그대로 (03에도 안 씀)', flash3.startsWith('대금 시트 연동 실패 · 05)일용직거래장부 13줄이 비어 있지 않아') && JSON.stringify(s4) === JSON.stringify(s3), flash3)
  await g('/_set', { tab: T05, cells: { '12,14': null } })
  // 알림 글을 보여 준 뒤 주소의 m=은 지워지므로, 버튼이 보낸 요청의 응답을 기다림
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  const syncs = async () => (await rest('audit_logs')).filter((l) => l.action === 'ledger.sync').length
  const before4 = await syncs()
  await a.locator('[data-ledger-card] button[type=submit]').click()
  for (let i = 0; i < 60 && (await syncs()) === before4; i++) await wait(500)
  const s5 = await g('/_dump')
  ok("메모를 지우면 13줄에 '연말 행사' · 03에 프로젝트 추가", cell(s5, T05, 13, 4) === '연말 행사' && cell(s5, T03, 9, 1) === '연말 행사', JSON.stringify([cell(s5, T05, 13, 4), cell(s5, T03, 9, 1)]))

  // ── 9. 매일 무엇을 연동했는지: 관리자 홈 한 줄 + 연동 기록 화면
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const today = a.locator('[data-ledger-today]')
  ok("관리자 홈 '오늘 대금 시트 · HH:MM' (바뀐 내용 한 줄 → 기록 화면)", (await today.count()) === 1 && (await today.getAttribute('href')) === '/admin/ledger' && one(await today.textContent()).includes('장부 1줄 추가'), one(await today.textContent().catch(() => '')))
  if (SHOTS) await today.screenshot({ path: `${SHOTS}/home-today.png` }).catch(() => {})
  await a.goto(`${D}/admin/ledger`, { waitUntil: 'networkidle' })
  const runsUi = a.locator('[data-ledger-run]')
  ok('기록 화면: 오늘 연동 5번 (버튼 4 · 아침 자동 1)', (await runsUi.count()) === 5 && (await a.locator('[data-ledger-run="cron"]').count()) === 1, String(await runsUi.count()))
  const first = runsUi.last()
  await first.locator('summary').click()
  const ft = one(await first.textContent())
  ok("첫 연동 펼치면: 입금확인 1 · 장부 3 (새근무 · 겨울 빛 축제 주차 안내 · 82,560원) · 근무자 추가 새근무 · 프로젝트 겨울 빛 축제", (await first.locator('[data-ledger-item="paid"]').count()) === 1 && (await first.locator('[data-ledger-item="export"]').count()) === 3 && ft.includes('새근무 · 겨울 빛 축제 주차 안내 · 82,560원') && (await first.locator('[data-ledger-item="worker"]').count()) === 1 && (await first.locator('[data-ledger-item="project"]').count()) === 1, ft.slice(0, 300))
  ok('실패한 연동은 빨간 점 · 실패 글', (await a.locator('[data-ledger-run][data-ok="0"]').count()) === 1)
  ok('기록 화면에 주민번호·계좌 없음', !/\d{6}-\d{7}|110123456789/.test(await a.locator('main').textContent()))
  ok('360px 옆으로 안 밀림 (기록)', await noSide(a))
  if (SHOTS) {
    await first.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await a.waitForTimeout(300)
    await a.screenshot({ path: `${SHOTS}/ledger-history.png` })
    await a.goto(`${D}/admin/settings#ledger`, { waitUntil: 'networkidle' })
    await a.locator('[data-ledger-card]').screenshot({ path: `${SHOTS}/settings-card.png` }).catch(() => {})
  }

  // ── 10. 관리자에게만: 근무자 · 다른 회사 관리자에겐 없음
  const w = await mk(W)
  for (const p of ['/me', '/me/history', '/admin/ledger']) {
    await w.goto(`${D}${p}`, { waitUntil: 'networkidle' })
    ok(`근무자 ${p}: 대금 시트·장부 글 없음`, !/대금 시트|장부/.test((await w.locator('body').textContent()) ?? '') && (await w.locator('[data-ledger-page], [data-ledger-card]').count()) === 0)
  }
  const a2 = await mk(A2)
  await a2.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  ok('다른 회사 관리자: 설정에 대금 시트 카드 없음', (await a2.locator('[data-ledger-card]').count()) === 0)
  await a2.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok('다른 회사 관리자: 홈에 오늘 대금 시트 없음', (await a2.locator('[data-ledger-today]').count()) === 0)
  await a2.goto(`${D}/admin/ledger`, { waitUntil: 'networkidle' })
  ok("다른 회사 관리자: 기록 화면은 '이 회사는 대금 시트를 쓰지 않아요'", one(await a2.locator('main').textContent()).includes('이 회사는 대금 시트를 쓰지 않아요') && (await a2.locator('[data-ledger-run]').count()) === 0)

  // ── 11. 서비스 계정 방법(연결 다리 대신)도 같은 서버 기능으로 동작
  run('npx', ['next', 'start', '-p', '3006'], { ...envSA })
  ok('서비스 계정 방법 서버 준비', await up('http://127.0.0.1:3006/login'))
  const logBefore = (await g('/_log')).length
  const sa = await fetch('http://127.0.0.1:3006/api/cron/ledger', { headers: { authorization: 'Bearer test-cron' } }).then((r) => r.json())
  const saLog = (await g('/_log')).slice(logBefore)
  ok("서비스 계정 방법: 토큰 받고 시트 읽기 · '새로 맞출 내용이 없어요'", sa.ok === true && sa.text === '새로 맞출 내용이 없어요' && saLog.some((l) => l.op === 'token') && saLog.some((l) => l.op === 'batchGet') && !saLog.some((l) => l.op === 'proxy'), JSON.stringify(sa))

  // ── 12. 연결 전 회사 설정: '연결 코드 복사' (이 시트 하나만 권한 · 서버가 만든 비밀값) — 장부 회사 관리자에게만
  const envOff = { ...env, LEDGER_PROXY_URL: '' }
  run('npx', ['next', 'start', '-p', '3007'], envOff)
  ok('연결 전 서버 준비', await up('http://127.0.0.1:3007/login'))
  const offCtx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await offCtx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:3007' }).catch(() => {})
  await offCtx.addCookies([{ name: 'alba_session', value: cookie(A), url: 'http://127.0.0.1:3007' }])
  const off = await offCtx.newPage()
  off.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await off.goto('http://127.0.0.1:3007/admin/settings#ledger', { waitUntil: 'networkidle' })
  const offCard = off.locator('[data-ledger-card]')
  ok("연결 전: '연결 전' · 방법 4단계 · '연결 코드 복사'", (await offCard.locator('[data-ledger-state="off"]').count()) === 1 && (await offCard.locator('[data-ledger-howto] li').count()) === 4 && (await offCard.locator('[data-copy-code]').count()) === 1)
  await offCard.locator('[data-copy-code]').click()
  await off.waitForTimeout(400)
  const copied = await off.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok("복사하면 '✓ 복사했어요' · 코드는 이 시트 하나만(@OnlyCurrentDoc) · 외부 연결 없음 · 서버 비밀값", one(await offCard.locator('[data-copy-code]').textContent()) === '✓ 복사했어요' && copied.includes('@OnlyCurrentDoc') && copied.includes(`const SECRET = '${BRIDGE}'`) && !/UrlFetchApp|openById/.test(copied), copied.slice(0, 80))
  ok('360px 옆으로 안 밀림 (연결 전 카드)', await noSide(off))
  if (SHOTS) await offCard.screenshot({ path: `${SHOTS}/settings-card-off.png` }).catch(() => {})
  const offA2 = await offCtx.newPage()
  await offCtx.addCookies([{ name: 'alba_session', value: cookie(A2), url: 'http://127.0.0.1:3007' }])
  await offA2.goto('http://127.0.0.1:3007/admin/settings', { waitUntil: 'networkidle' })
  ok('다른 회사 관리자에겐 연결 코드 없음', (await offA2.locator('[data-ledger-card], [data-copy-code]').count()) === 0 && !(await offA2.content()).includes(BRIDGE))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  stop()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); stop(); process.exit(2) })
