import 'server-only'
import { decrypt } from './crypto'
import { platformCompanyId } from './data'
import { allByIds, allPages, db } from './db'
import { sheetBatch, sheetBatchGet, sheetGet, sheetsConfigured, sheetTabs, sheetWrite, type SheetTab } from './gsheets'
import {
  AUTO_MARK,
  autoNote,
  b6Of,
  busyRow,
  codeOf,
  colLetter,
  detailTokens,
  FIRST_ROW,
  keepPrefilled,
  lastDataRow,
  ledgerRow,
  parseCode,
  parseLedger,
  sameProject,
  shiftFormula,
  TAB,
  taxLabel,
} from './ledger-core'
import { calcDay, settle } from './pay'
import { kstDate } from './time'
import type { Attendance, Job } from './types'
import { formatRrn } from './validate'
import { sendAdminPush } from './push'
import { withWeeklyPay } from './weekly'

/**
 * 거래장부(구글 시트 '03_결제대금') ↔ 해피워크
 * · 시트 → 앱: 장부에서 '입금확인'을 체크한 줄의 사람 근무를 지급 완료로 (근무자 알림은 보내지 않음)
 * · 앱 → 시트: 끝난 공고의 사람마다 한 줄씩 장부(05) 맨 아래에 추가 (다음 날 아침) · 장부에 없는 근무자는 02, 프로젝트는 03에 추가
 * 원칙: 시트의 기존 줄은 절대 바꾸지 않음 — 비어 있는 맨 아래 줄에만 쓰고, 쓴 줄은 하늘색 배경 + 비고 '🤖 해피워크 자동 (M/D)'
 * 관리자만: 화면·실행 모두 장부 회사의 관리자만 (근무자 화면에는 아무것도 없음)
 */

/** 장부를 쓰는 회사 (환경 변수 LEDGER_COMPANY_ID · 없으면 운영 회사) */
export async function ledgerCompanyId(): Promise<string | null> {
  return process.env.LEDGER_COMPANY_ID || (await platformCompanyId())
}

/** 이 회사 화면에 장부 연동을 보여 줄지 (연결 전이면 설정 안내를 보여 줌) */
export async function isLedgerCompany(companyId: string): Promise<boolean> {
  return !!companyId && companyId === (await ledgerCompanyId())
}

/** 이 날 이후에 끝난 공고만 장부에 올림 (그 전 행사는 이미 손으로 적어 둠) */
const EXPORT_FROM = () => process.env.LEDGER_EXPORT_FROM || '2026-11-18'
/** 자동으로 쓴 줄 배경 (연한 하늘색) */
const MARK_BG = { red: 0.86, green: 0.93, blue: 1 }

export type LedgerResult = {
  /** 시트 → 앱: 입금확인으로 지급 완료가 된 사람(공고·사람) 수 */
  paid: number
  /** 앱 → 시트: 장부(05)에 새로 쓴 줄 수 */
  rows: number
  workers: number
  projects: number
  /** 장부에 이미 같은 사람·프로젝트일이 있어서 건너뜀 */
  existing: number
  /** 퇴근 기록이 없거나 확인 전이라 다음에 올림 */
  waiting: number
  /** 생년월일을 몰라 고유코드를 못 만든 사람 (장부에 올리지 않음) */
  noBirth: number
  /** 줄 위치 (예: '05) 1857~1860줄') */
  where: string[]
}

type Audit = { action: string; target_user_id: string | null; detail: string | null }
type U = { id: string; name: string; birth_date: string | null; rrn_enc: string | null; bank_name: string | null; bank_account_enc: string | null; account_holder: string | null }

const projectOf = (j: Pick<Job, 'event_name' | 'title'>) => (j.event_name?.trim() || j.title).trim()
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** 장부 연동 기록 (이 회사 · 이 동작) — job·user 조각을 읽어 이미 한 일을 알아냄 */
async function audits(companyId: string, action: string): Promise<Audit[]> {
  return allPages<Audit>((a, b) =>
    db().from('audit_logs').select('action, target_user_id, detail').eq('company_id', companyId).eq('action', action).order('id').range(a, b),
  ).then((rows) => rows.filter((r) => r.action === action))
}

/** 기록 남기기 · run: 한 번 연동한 묶음 번호 (연동 기록 화면에서 그때 바뀐 것을 묶어 보여 줌) */
async function log(rows: { companyId: string; actorId: string | null; action: string; user: string | null; detail: string }[], run?: string) {
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows
      .slice(i, i + 200)
      .map((r) => ({ company_id: r.companyId, actor_id: r.actorId, action: r.action, target_user_id: r.user, detail: run ? `${r.detail} · run=${run}` : r.detail, ip: null }))
    if (part.length) await db().from('audit_logs').insert(part)
  }
}

type Opt = { cols: number; template: number; formulaCols: number[]; boolCols?: number[] }
type Plan = { tab: string; info: SheetTab; start: number; end: number; values: (string | number | boolean)[][]; opt: Opt; target: string[][] }

/**
 * 시트의 비어 있는 맨 아래 줄에 덧붙이기 (기존 줄은 그대로) — 먼저 세 탭 모두 확인(prepare)하고, 다 비어 있을 때만 씀(apply)
 * prepare: 쓸 줄이 정말 비었는지 (사람이 적은 칸이 하나라도 있으면 아무 탭에도 쓰지 않음)
 */
async function prepare(tab: string, info: SheetTab, last: number, values: (string | number | boolean)[][], opt: Opt): Promise<Plan | null> {
  if (!values.length) return null
  const start = last + 1
  const end = start + values.length - 1
  const endCol = colLetter(opt.cols - 1)
  const target = start <= info.rows ? await sheetGet(`'${tab}'!A${start}:${endCol}${Math.min(end, info.rows)}`, 'FORMULA') : []
  const busy = busyRow(target, start, opt.formulaCols, opt.boolCols)
  if (busy) throw new Error(`${tab} ${busy}줄이 비어 있지 않아 아무것도 쓰지 않았어요`)
  return { tab, info, start, end, values, opt, target }
}

/** apply: 1) 모자라면 시트 끝에 빈 줄을 늘림 2) 윗줄 서식(체크칸·목록 포함) 복사 3) 값(미리 깔린 수식은 그대로) 4) 하늘색 배경 */
async function apply(p: Plan): Promise<string> {
  const { tab, info, start, end, opt } = p
  if (end > info.rows) await sheetBatch([{ appendDimension: { sheetId: info.id, dimension: 'ROWS', length: end - info.rows } }])
  const rows = p.values.map((r, i) => keepPrefilled(r, p.target[i]))
  const range = { sheetId: info.id, startRowIndex: start - 1, endRowIndex: end, startColumnIndex: 0, endColumnIndex: opt.cols }
  if (opt.template >= FIRST_ROW) {
    await sheetBatch([
      {
        copyPaste: {
          source: { sheetId: info.id, startRowIndex: opt.template - 1, endRowIndex: opt.template, startColumnIndex: 0, endColumnIndex: opt.cols },
          destination: range,
          pasteType: 'PASTE_FORMAT',
        },
      },
    ])
  }
  await sheetWrite(`'${tab}'!A${start}:${colLetter(opt.cols - 1)}${end}`, rows)
  await sheetBatch([{ repeatCell: { range, cell: { userEnteredFormat: { backgroundColor: MARK_BG } }, fields: 'userEnteredFormat.backgroundColor' } }])
  return start === end ? `${tab.slice(0, 3)} ${start}줄` : `${tab.slice(0, 3)} ${start}~${end}줄`
}

/** 시트 → 앱: 장부에서 입금확인한 줄 → 그 사람 근무를 지급 완료로 (같은 사람 + 정확히 맞는 날짜만 · 애매하면 건너뜀) */
async function importPaid(
  companyId: string,
  actorId: string | null,
  ledger: ReturnType<typeof parseLedger>,
  exported: Set<string>,
  today: string,
  run: string,
): Promise<number> {
  const confirmed = ledger.filter((r) => r.confirmed && r.projectDate && r.b6)
  if (!confirmed.length) return 0
  // 아직 지급 전인 이 회사 근무 (퇴근까지 한 것만)
  const open = await allPages<Pick<Attendance, 'id' | 'job_id' | 'user_id' | 'work_date' | 'clock_out' | 'paid'>>((a, b) =>
    db().from('attendance').select('id, job_id, user_id, work_date, clock_out, paid').eq('company_id', companyId).eq('paid', false).order('id').range(a, b),
  ).then((rows) => rows.filter((r) => !r.paid && r.clock_out))
  if (!open.length) return 0
  const userIds = [...new Set(open.map((a) => a.user_id))]
  const jobIds = [...new Set(open.map((a) => a.job_id))]
  const [users, jobs] = await Promise.all([
    allByIds<{ id: string; name: string; birth_date: string | null }>(userIds, (ids, a, b) => db().from('users').select('id, name, birth_date').in('id', ids).order('id').range(a, b)),
    allByIds<Pick<Job, 'id' | 'title' | 'event_name' | 'start_date' | 'company_id'>>(jobIds, (ids, a, b) =>
      db().from('jobs').select('id, title, event_name, start_date, company_id').eq('company_id', companyId).in('id', ids).order('id').range(a, b),
    ),
  ])
  // 고유코드(이름+생년월일 6자리) → 사람 (같은 코드가 둘이면 누군지 모르니 건너뜀)
  const byCode = new Map<string, string[]>()
  for (const u of users) {
    const key = codeOf(u.name.replace(/\s+/g, ''), b6Of(u.birth_date))
    byCode.set(key, [...(byCode.get(key) ?? []), u.id])
  }
  const jobById = new Map(jobs.filter((j) => j.company_id === companyId).map((j) => [j.id, j]))
  const marks = new Map<string, { ids: string[]; at: string; row: number; job: string; user: string }>()
  for (const r of confirmed) {
    const who = byCode.get(codeOf(r.name, r.b6)) ?? []
    if (who.length !== 1) continue
    const uid = who[0]
    const mine = open.filter((a) => a.user_id === uid && jobById.has(a.job_id))
    // 1) 앱이 올린 줄: 프로젝트일 = 공고 시작일 · 프로젝트 = 행사명 → 그 공고의 근무 전부
    const viaExport = mine.filter((a) => {
      const j = jobById.get(a.job_id)!
      return exported.has(`${a.job_id}|${uid}`) && j.start_date === r.projectDate && sameProject(projectOf(j), r.project)
    })
    // 2) 손으로 적은 줄: 그 사람의 그날 근무만 (여러 날을 한 줄에 적었으면 첫날만 · 지급 안 한 것을 지급으로 잘못 바꾸지 않게)
    const hits = viaExport.length ? viaExport : mine.filter((a) => a.work_date === r.projectDate)
    const at = `${r.paidDate ?? r.dueDate ?? today}T12:00:00+09:00`
    for (const a of hits) {
      const key = `${a.job_id}|${uid}`
      const m = marks.get(key) ?? { ids: [], at, row: r.row, job: a.job_id, user: uid }
      if (!m.ids.includes(a.id)) m.ids.push(a.id)
      marks.set(key, m)
    }
  }
  if (!marks.size) return 0
  for (const m of marks.values()) {
    await db().from('attendance').update({ paid: true, paid_at: m.at }).eq('company_id', companyId).eq('paid', false).in('id', m.ids)
  }
  await log(
    [...marks.values()].map((m) => ({
      companyId,
      actorId,
      action: 'ledger.paid',
      user: m.user,
      detail: `장부 입금확인 → 지급 완료 · ${m.ids.length}일 · row=${m.row} · date=${m.at.slice(0, 10)} · job=${m.job} · user=${m.user}`,
    })),
    run,
  )
  return marks.size
}

/** 장부 연동 한 번 (시트 → 앱 입금확인, 그다음 앱 → 시트 새 줄) — 관리자 버튼 · 매일 아침 7시 자동 */
export async function syncLedger(companyId: string, actorId: string | null, run = Date.now().toString(36)): Promise<LedgerResult> {
  if (!sheetsConfigured()) throw new Error('장부 시트가 아직 연결되지 않았어요')
  if (!(await isLedgerCompany(companyId))) throw new Error('이 회사는 장부 연동 대상이 아니에요')
  const today = kstDate()
  const out: LedgerResult = { paid: 0, rows: 0, workers: 0, projects: 0, existing: 0, waiting: 0, noBirth: 0, where: [] }

  // 시트 읽기 — 주민번호·계좌 칸(05의 G~J, 02의 B~D)은 읽지 않음
  const [tabs, [w02a, w02f, p03, l05a, l05k]] = await Promise.all([
    sheetTabs(),
    sheetBatchGet([`'${TAB.workers}'!A${FIRST_ROW}:A`, `'${TAB.workers}'!F${FIRST_ROW}:F`, `'${TAB.projects}'!A${FIRST_ROW}:E`, `'${TAB.ledger}'!A${FIRST_ROW}:F`, `'${TAB.ledger}'!K${FIRST_ROW}:O`]),
  ])
  for (const t of Object.values(TAB)) if (!tabs.has(t)) throw new Error(`시트에 '${t}' 탭이 없어요`)
  const merged = Array.from({ length: Math.max(l05a.length, l05k.length) }, (_, i) => {
    const a = l05a[i] ?? []
    const k = l05k[i] ?? []
    return [...Array.from({ length: 6 }, (_, c) => a[c] ?? ''), '', '', '', '', ...Array.from({ length: 5 }, (_, c) => k[c] ?? '')]
  })
  const ledger = parseLedger(merged)

  const exportedRows = await audits(companyId, 'ledger.export')
  const exported = new Set(
    exportedRows.map((r) => detailTokens(r.detail)).filter((t) => t.job && t.user).map((t) => `${t.job}|${t.user}`),
  )

  // 1) 시트 → 앱
  out.paid = await importPaid(companyId, actorId, ledger, exported, today, run)

  // 2) 앱 → 시트: 어제까지 끝난 공고 (취소·임시 저장 빼고)
  const jobs = (
    await allPages<Job>((a, b) => db().from('jobs').select('*').eq('company_id', companyId).gte('end_date', EXPORT_FROM()).lt('end_date', today).order('id').range(a, b))
  ).filter((j) => j.company_id === companyId && j.end_date >= EXPORT_FROM() && j.end_date < today && j.status !== 'cancelled' && j.status !== 'draft')
  if (!jobs.length) return out
  const raw = await allByIds<Attendance>(
    jobs.map((j) => j.id),
    (ids, a, b) => db().from('attendance').select('*').eq('company_id', companyId).in('job_id', ids).order('id').range(a, b),
  )
  const atts = await withWeeklyPay(raw, companyId)
  type Cand = { job: Job; uid: string; gross: number; days: number }
  const cands: Cand[] = []
  for (const job of jobs) {
    const byUser = new Map<string, typeof atts>()
    for (const a of atts) if (a.job_id === job.id) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a])
    for (const [uid, mine] of byUser) {
      if (exported.has(`${job.id}|${uid}`)) continue
      const worked = mine.filter((a) => a.clock_in)
      if (!worked.length) continue
      const s = settle(job, worked.map((a) => calcDay(job, a)))
      // 퇴근 기록이 없거나 연장 확인이 남은 근무는 금액이 바뀔 수 있어서 다음에
      if (s.incomplete > 0 || worked.some((a) => !a.clock_out || calcDay(job, a).otOpen)) {
        out.waiting++
        continue
      }
      if (s.gross > 0) cands.push({ job, uid, gross: s.gross, days: s.days })
    }
  }
  if (!cands.length) return out

  const users = new Map(
    (
      await allByIds<U>([...new Set(cands.map((c) => c.uid))], (ids, a, b) =>
        db().from('users').select('id, name, birth_date, rrn_enc, bank_name, bank_account_enc, account_holder').in('id', ids).order('id').range(a, b),
      )
    ).map((u) => [u.id, u]),
  )

  // 장부에 이미 같은 사람·같은 프로젝트일 줄이 있으면 (손으로 적어 둔 것) 쓰지 않고 기록만
  // 사람이 적은 줄은 같은 사람 · 같은 프로젝트일이면 (프로젝트 이름을 다르게 적었을 수 있어서), 앱이 쓴 줄(🤖)은 프로젝트까지 같을 때만
  // — 같은 날 다른 행사를 또 했으면 따로 올라가게
  const have = new Set(
    ledger
      .filter((r) => r.b6)
      .map((r) => (r.note.startsWith(AUTO_MARK) ? `${codeOf(r.name, r.b6)}|${r.projectDate}|${r.project.replace(/\s+/g, '').toLowerCase()}` : `${codeOf(r.name, r.b6)}|${r.projectDate}`)),
  )
  // 02의 고유코드 그대로 (05 칸들이 이 글자로 은행·계좌를 찾음 → 띄어쓰기까지 똑같이 써야 함) · 비교는 띄어쓰기 없이
  const known02 = new Map<string, string>()
  for (const r of w02f) {
    const c = (r[0] ?? '').trim()
    const p = c && parseCode(c)
    if (p && p.b6) known02.set(codeOf(p.name, p.b6), c)
  }
  const known03 = p03.map((r) => (r[1] ?? '').trim()).filter(Boolean)

  const logs: Parameters<typeof log>[0] = []
  const new02: { uid: string; row: (string | number | boolean)[] }[] = []
  const new02Codes = new Map<string, string>()
  const new03: string[] = []
  const new05: { c: Cand; code: string; project: string; tax: string; note: string }[] = []
  for (const c of cands) {
    const u = users.get(c.uid)
    if (!u) continue
    const rrn = (decrypt(u.rrn_enc) ?? '').replace(/\D/g, '')
    const b6 = b6Of(u.birth_date, rrn)
    if (!b6) {
      out.noBirth++
      continue
    }
    const norm = codeOf(u.name.replace(/\s+/g, ''), b6)
    // 02에 있으면 그 글자 그대로, 새로 넣으면 02 수식이 만들 글자(이름(생년월일 6자리))와 같게
    const code = known02.get(norm) ?? new02Codes.get(norm) ?? `${u.name.trim()}(${b6})`
    const project = projectOf(c.job)
    if (have.has(`${norm}|${c.job.start_date}`) || have.has(`${norm}|${c.job.start_date}|${project.replace(/\s+/g, '').toLowerCase()}`)) {
      out.existing++
      logs.push({ companyId, actorId, action: 'ledger.export', user: c.uid, detail: `장부에 이미 있음 · date=${c.job.start_date} · job=${c.job.id} · user=${c.uid}` })
      continue
    }
    if (!known02.has(norm) && !new02Codes.has(norm)) {
      new02Codes.set(norm, code)
      const account = decrypt(u.bank_account_enc) ?? ''
      const holder = (u.account_holder ?? '').trim()
      new02.push({ uid: c.uid, row: [
        u.name.trim(),
        rrn.length === 13 ? formatRrn(rrn) : '',
        u.bank_name ?? '',
        // 숫자만 있는 계좌는 글자로 (앞자리 0이 사라지거나 숫자로 바뀌지 않게)
        account ? `'${account}` : '',
        '',
        '', // 고유코드 수식은 아래에서 윗줄 수식을 옮겨 채움
        autoNote(today, [
          rrn.length !== 13 && '⚠ 주민번호 없음',
          !account && '⚠ 계좌 없음',
          holder && holder.replace(/\s+/g, '') !== u.name.replace(/\s+/g, '') && `⚠ 예금주 ${holder}`,
        ]),
      ] })
    }
    if (!known03.some((p) => sameProject(p, project)) && !new03.some((p) => sameProject(p, project))) new03.push(project)
    const tax = taxLabel(c.job.tax_type, !!c.job.employment_insurance)
    new05.push({
      c,
      code,
      project: known03.find((p) => sameProject(p, project)) ?? project,
      tax,
      note: autoNote(today, [c.job.title !== project && c.job.title, `${c.days}일`, !tax && '⚠ 원천세 확인 필요']),
    })
  }

  // 03 프로젝트 (A 구분 · B 프로젝트명 · C 발주처 · D 지출완료 · E 비고 — G열 자동 수식은 건드리지 않음)
  const last03 = lastDataRow(p03, [0, 1, 2, 4])
  const plan03 = await prepare(
    TAB.projects,
    tabs.get(TAB.projects)!,
    last03,
    new03.map((p) => ['', p, '', false, autoNote(today, ['구분·발주처 확인 필요'])]),
    { cols: 5, template: last03, formulaCols: [], boolCols: [3] },
  )

  // 02 근무자 (A 이름 · B 주민번호 · C 은행 · D 계좌 · E 구분 · F 고유코드(수식) · G 비고)
  const last02 = Math.max(lastDataRow(w02a, [0]), lastDataRow(w02f, [0]))
  const tplF = new02.length && last02 >= FIRST_ROW ? ((await sheetGet(`'${TAB.workers}'!F${last02}`, 'FORMULA'))[0]?.[0] ?? '') : ''
  const plan02 = await prepare(
    TAB.workers,
    tabs.get(TAB.workers)!,
    last02,
    new02.map(({ row }, i) => {
      const at = last02 + 1 + i
      const f = tplF.startsWith('=') ? shiftFormula(tplF, last02, at) : `=IF(A${at}="","", A${at} & "(" & LEFT(B${at}, 6) & ")")`
      return row.map((v, c) => (c === 5 ? f : v))
    }),
    { cols: 7, template: last02, formulaCols: [5] },
  )

  // 05 장부 (프로젝트일 · 프로젝트 · 고유코드 · 도급금액 · 원천세 · 비고만 쓰고, 나머지 칸은 윗줄 수식)
  const last05 = lastDataRow(merged, [0, 4, 5, 10])
  const tpl = new05.length && last05 >= FIRST_ROW ? ((await sheetGet(`'${TAB.ledger}'!A${last05}:O${last05}`, 'FORMULA'))[0] ?? []) : []
  const plan05 = await prepare(
    TAB.ledger,
    tabs.get(TAB.ledger)!,
    last05,
    new05.map((n, i) =>
      ledgerRow(tpl, last05, last05 + 1 + i, { projectDate: n.c.job.start_date, project: n.project, code: n.code, amount: n.c.gross, tax: n.tax, note: n.note }),
    ),
    { cols: 15, template: last05, formulaCols: [1, 2, 3, 6, 7, 8, 9, 12], boolCols: [13] },
  )

  // 세 탭 모두 비어 있는 걸 확인한 뒤에만 씀 (03 → 02 → 05: 장부 줄이 찾는 프로젝트·근무자가 먼저 있게)
  if (plan03) {
    out.where.push(await apply(plan03))
    out.projects = new03.length
    logs.push(...new03.map((p) => ({ companyId, actorId, action: 'ledger.project', user: null, detail: `장부 03) 프로젝트 추가 · ${p}` })))
  }
  if (plan02) {
    out.where.push(await apply(plan02))
    out.workers = new02.length
    logs.push(...new02.map((r, i) => ({ companyId, actorId, action: 'ledger.worker', user: r.uid, detail: `장부 02) 근무자 추가 · ${r.row[0]} · row=${plan02.start + i}` })))
  }
  if (plan05) {
    out.where.push(await apply(plan05))
    out.rows = new05.length
    logs.push(
      ...new05.map((n, i) => ({
        companyId,
        actorId,
        action: 'ledger.export',
        user: n.c.uid,
        detail: `장부 05) ${plan05.start + i}줄 추가 · ${won(n.c.gross)} · row=${plan05.start + i} · date=${n.c.job.start_date} · job=${n.c.job.id} · user=${n.c.uid}`,
      })),
    )
  }
  await log(logs, run)
  return out
}

/** 결과 한 줄 ('입금확인 2명 · 장부 5줄 추가 (근무자 1명·프로젝트 1개)') */
export function ledgerSummary(r: LedgerResult): string {
  const parts = [
    r.paid > 0 && `입금확인 ${r.paid}명 지급 완료`,
    r.rows > 0 && `장부 ${r.rows}줄 추가${r.workers || r.projects ? ` (${[r.workers && `근무자 ${r.workers}명`, r.projects && `프로젝트 ${r.projects}개`].filter(Boolean).join('·')})` : ''}`,
    r.existing > 0 && `이미 있음 ${r.existing}`,
    r.waiting > 0 && `기록 정리 전 ${r.waiting}명은 다음에`,
    r.noBirth > 0 && `생년월일 없음 ${r.noBirth}명`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '새로 맞출 내용이 없어요'
}

/** 연동 한 번 + 결과 기록 (실패해도 기록) */
export async function runLedgerSync(companyId: string, actorId: string | null, via: 'button' | 'cron'): Promise<{ ok: boolean; text: string; result?: LedgerResult }> {
  const run = Date.now().toString(36)
  const head = via === 'cron' ? '아침 자동' : '버튼'
  try {
    const result = await syncLedger(companyId, actorId, run)
    const text = ledgerSummary(result)
    await log([{ companyId, actorId, action: 'ledger.sync', user: null, detail: `${head} · ${text}${result.where.length ? ` · 위치 ${result.where.join(', ')}` : ''}` }], run)
    // 아침 자동 연동에서 바뀐 게 있으면 그 회사 관리자에게만 알림 (근무자에게는 보내지 않음)
    if (via === 'cron' && runChanged(result)) await sendAdminPush(companyId, { title: '📒 대금 시트 연동', body: text, url: '/admin/ledger', tag: 'ledger' }).catch(() => null)
    return { ok: true, text, result }
  } catch (e) {
    const text = e instanceof Error ? e.message : '장부 연동 실패'
    await log([{ companyId, actorId, action: 'ledger.sync', user: null, detail: `${head} · 실패: ${text}` }], run).catch(() => null)
    if (via === 'cron') await sendAdminPush(companyId, { title: '📒 대금 시트 연동 실패', body: text, url: '/admin/ledger', tag: 'ledger' }).catch(() => null)
    return { ok: false, text }
  }
}

export type LedgerStatus = {
  configured: boolean
  last: { at: string; detail: string; ok: boolean } | null
  /** 공고별: 장부에 올린 사람 · 입금확인으로 지급 완료가 된 사람 */
  exported: Set<string>
  paid: Set<string>
}

/** 화면용: 연결 상태 · 마지막 연동 · (공고를 주면) 그 공고에서 장부에 올린/입금확인된 사람 */
export async function ledgerStatus(companyId: string, jobId?: string): Promise<LedgerStatus> {
  const [last, rows] = await Promise.all([
    db()
      .from('audit_logs')
      .select('detail, created_at, action')
      .eq('company_id', companyId)
      .eq('action', 'ledger.sync')
      .order('created_at', { ascending: false })
      .limit(1)
      .then((r) => {
        const x = ((r.data ?? []) as { detail: string | null; created_at: string; action: string }[])
          .filter((a) => a.action === 'ledger.sync')
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        return x ? { at: x.created_at, detail: syncText(x.detail), ok: !(x.detail ?? '').includes('실패: ') } : null
      }),
    jobId
      ? db()
          .from('audit_logs')
          .select('action, target_user_id, detail')
          .eq('company_id', companyId)
          .in('action', ['ledger.export', 'ledger.paid'])
          .like('detail', `%job=${jobId}%`)
          .limit(2000)
          .then((r) => (r.data ?? []) as Audit[])
      : Promise.resolve([] as Audit[]),
  ])
  const exported = new Set<string>()
  const paid = new Set<string>()
  for (const r of rows) {
    const t = detailTokens(r.detail)
    if (t.job !== jobId || !t.user) continue
    if (r.action === 'ledger.export') exported.add(t.user)
    if (r.action === 'ledger.paid') paid.add(t.user)
  }
  return { configured: sheetsConfigured(), last, exported, paid }
}

/** 연동 기록 글에서 보여 줄 부분만 ('아침 자동 · …' 앞머리 · run= 꼬리 빼고) */
export function syncText(detail: string | null | undefined): string {
  return (detail ?? '').replace(/ · run=\S+$/, '').replace(/^(버튼|아침 자동) · /, '')
}

export type LedgerItem = {
  kind: 'paid' | 'export' | 'existing' | 'worker' | 'project'
  user: string | null
  name: string | null
  job: string | null
  jobTitle: string | null
  /** 시트 줄 번호 (있으면) */
  row: string | null
  /** 금액 ('125,000원') · 일수 ('2일') · 프로젝트 이름 등 한 조각 */
  note: string
}
export type LedgerRun = { run: string; at: string; via: 'cron' | 'button' | 'first'; actor: string | null; ok: boolean; summary: string; items: LedgerItem[] }

type Row = { id: number; action: string; actor_id: string | null; target_user_id: string | null; detail: string | null; created_at: string }
const RUN_ACTIONS = ['ledger.sync', 'ledger.paid', 'ledger.export', 'ledger.worker', 'ledger.project']

/**
 * 연동 기록 (최근 days일) — 한 번 연동한 묶음마다: 언제 · 누가(아침 자동/버튼) · 결과 한 줄 · 바뀐 것 (사람 · 공고 · 줄)
 * 관리자 화면 전용 (이름·공고 제목만 · 주민번호·계좌는 보여 주지 않음)
 */
export async function ledgerRuns(companyId: string, days = 14): Promise<LedgerRun[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const rows = (
    await allPages<Row>((a, b) =>
      db()
        .from('audit_logs')
        .select('id, action, actor_id, target_user_id, detail, created_at')
        .eq('company_id', companyId)
        .in('action', RUN_ACTIONS)
        .gte('created_at', since)
        .order('id', { ascending: false })
        .range(a, b),
    )
  ).filter((r) => RUN_ACTIONS.includes(r.action) && r.created_at >= since)
  const runs = new Map<string, LedgerRun>()
  const userIds = new Set<string>()
  const jobIds = new Set<string>()
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const t = detailTokens(r.detail)
    // 묶음 번호가 없는 예전 기록(처음 한 번 맞춘 것)은 그날 하나로
    const key = t.run ?? `first-${kstDate(new Date(r.created_at))}`
    const run = runs.get(key) ?? { run: key, at: r.created_at, via: t.run ? 'button' : 'first', actor: null, ok: true, summary: '', items: [] }
    if (r.action === 'ledger.sync') {
      run.at = r.created_at
      run.via = (r.detail ?? '').startsWith('아침 자동') ? 'cron' : 'button'
      run.actor = r.actor_id
      run.ok = !(r.detail ?? '').includes('실패: ')
      run.summary = syncText(r.detail)
    } else {
      const user = t.user ?? r.target_user_id
      const kind: LedgerItem['kind'] =
        r.action === 'ledger.paid' ? 'paid' : r.action === 'ledger.worker' ? 'worker' : r.action === 'ledger.project' ? 'project' : (r.detail ?? '').startsWith('장부에 이미') ? 'existing' : 'export'
      const note =
        kind === 'export'
          ? ((r.detail ?? '').match(/([\d,]+원)/)?.[1] ?? '')
          : kind === 'paid'
            ? ((r.detail ?? '').match(/ (\d+일) /)?.[1] ?? '')
            : kind === 'project'
              ? (r.detail ?? '').replace(/^장부 03\) 프로젝트 추가 · /, '').replace(/ · run=\S+$/, '')
              : ''
      run.items.push({ kind, user: user ?? null, name: null, job: t.job ?? null, jobTitle: null, row: t.row ?? null, note })
      if (user) userIds.add(user)
      if (t.job) jobIds.add(t.job)
    }
    runs.set(key, run)
  }
  for (const r of runs.values()) if (r.actor) userIds.add(r.actor)
  const [users, jobs] = await Promise.all([
    allByIds<{ id: string; name: string }>([...userIds], (ids, a, b) => db().from('users').select('id, name').in('id', ids).order('id').range(a, b)),
    allByIds<{ id: string; title: string; company_id: string }>([...jobIds], (ids, a, b) =>
      db().from('jobs').select('id, title, company_id').eq('company_id', companyId).in('id', ids).order('id').range(a, b),
    ),
  ])
  const nameOf = new Map(users.map((u) => [u.id, u.name]))
  const titleOf = new Map(jobs.filter((j) => j.company_id === companyId).map((j) => [j.id, j.title]))
  const out = [...runs.values()].map((r) => ({
    ...r,
    actor: r.actor ? (nameOf.get(r.actor) ?? null) : null,
    summary: r.summary || (r.via === 'first' ? `처음 맞춤 · 입금확인 ${r.items.filter((i) => i.kind === 'paid').length}건 지급 완료` : ''),
    items: r.items.map((i) => ({ ...i, name: i.user ? (nameOf.get(i.user) ?? null) : null, jobTitle: i.job ? (titleOf.get(i.job) ?? null) : null })),
  }))
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** 바뀐 것이 있었는지 (알림·홈 카드 강조용) */
export const runChanged = (r: Pick<LedgerResult, 'paid' | 'rows' | 'workers' | 'projects'>) => r.paid + r.rows + r.workers + r.projects > 0
