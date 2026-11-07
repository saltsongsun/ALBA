'use server'

import { randomInt } from 'node:crypto'
import { rosterUnlockedFor } from '@/lib/rosterLock'
import { FINISHED_NOTE, finishIfAllOut, tellPaydayOnEnd } from '@/lib/autoFinish'
import { remindOthersToClockOut } from '@/lib/remind'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { decrypt, hashPin } from '@/lib/crypto'
import { phoneFmt } from '@/lib/format'
import { audit, ensurePendingDocs, getJob, releaseDocs } from '@/lib/data'
import { db, must } from '@/lib/db'
import { withWeeklyPay } from '@/lib/weekly'
import { DEFAULT_TEMPLATES } from '@/lib/default-templates'
import { scheduleSummary, wageText } from '@/lib/docs'
import { hiddenFromForm } from '@/lib/jobFields'
import { calcDay, estimateDay, MIN_WAGE_2026, OT_ASK_MIN, scheduledEnd, settle, shiftOf } from '@/lib/pay'
import { tellWorkers } from '@/lib/notify'
import { contractNameOf, myWorkTab } from '@/lib/members'
import { overLimit } from '@/lib/ratelimit'
import { sendPush } from '@/lib/push'
import { agreedShiftFor, applyAgreedShift, freezeAttendance, requestShiftChange } from '@/lib/shift'
import { DISMISS_NOTE, DISMISS_REASONS, fixTime, isFullTimeAsk, parseFix, pendingFix, SIGNAL, signalOf } from '@/lib/signals'
import { requireAdmin } from '@/lib/session'
import { companyJob, companyRow, workerInCompany } from '@/lib/company'
import { dateList, fmtDate, fmtDateRange, fromKstInput, hhmm, kstAt, kstDate, kstTime } from '@/lib/time'
import type { Attendance, Job, JobCondition, ShiftChange, SignedDoc } from '@/lib/types'
import { bool, formatRrn, int, isDate, isTime, isUuid, line, normalizePhone, oneLine, optLine, optStr, str, weakPin } from '@/lib/validate'
import type { FormState } from './auth'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// ───────────── 공고 ─────────────

/** 이 회사의 용역계약서 서식 id (없으면 기본 용역계약서를 넣고 그 id) */
async function serviceTemplateId(companyId: string): Promise<string> {
  const { data } = await db().from('doc_templates').select('id, active').eq('company_id', companyId).eq('kind', 'service')
  const found = ((data ?? []) as { id: string; active: boolean }[]).find((t) => t.active !== false)
  if (found) return found.id
  const tpl = DEFAULT_TEMPLATES.find((t) => t.kind === 'service')!
  const created = must(await db().from('doc_templates').insert({ ...tpl, company_id: companyId, active: true }).select('id').single()) as { id: string }
  return created.id
}

/** 근무 조건: 화면에서 보낸 JSON 목록에서 빈 줄은 버리고 길이·개수를 제한 (형식이 틀리면 null) */
function parseConditions(raw: string): JobCondition[] | null {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  return data
    .map((c) => ({ label: String(c?.label ?? '').trim().slice(0, 20), value: String(c?.value ?? '').trim().slice(0, 100) }))
    .filter((c) => c.label && c.value)
    .slice(0, 15)
}

function parseJob(form: FormData): { row?: Omit<Job, 'id' | 'created_at' | 'company_id'>; error?: string } {
  const title = str(form, 'title', 100)
  if (!title) return { error: '공고 제목을 입력해 주세요.' }
  const start_date = str(form, 'start_date')
  const end_date = str(form, 'end_date') || start_date
  if (!isDate(start_date) || !isDate(end_date)) return { error: '근무 날짜를 입력해 주세요.' }
  if (end_date < start_date) return { error: '종료일이 시작일보다 빠릅니다.' }
  const start_time = str(form, 'start_time')
  const end_time = str(form, 'end_time')
  if (!isTime(start_time) || !isTime(end_time)) return { error: '근무 시작·종료 시각을 입력해 주세요.' }

  const latRaw = str(form, 'lat')
  const lngRaw = str(form, 'lng')
  const lat = latRaw ? Number(latRaw) : null
  const lng = lngRaw ? Number(lngRaw) : null
  if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng)) || (lat == null) !== (lng == null)) {
    return { error: '위도·경도를 둘 다 숫자로 입력하거나 둘 다 비워 주세요.' }
  }
  const gps_required = bool(form, 'gps_required')
  if (gps_required && lat == null) return { error: '현장 위치 확인을 쓰려면 행사장 위도·경도를 넣어 주세요.' }

  const pay_type = str(form, 'pay_type') === 'daily' ? 'daily' : 'hourly'
  const break_mode = (['auto', 'fixed', 'none'] as const).find((m) => m === str(form, 'break_mode')) ?? 'auto'
  // 모집 대상: 전문가 의뢰는 사업소득 3.3%로만 (근로계약이 아니므로 고용보험도 없음)
  const audience = str(form, 'audience') === 'expert' ? 'expert' : 'worker'
  const tax_type = audience === 'expert' ? 'business' : ((['daily', 'business', 'other', 'none'] as const).find((m) => m === str(form, 'tax_type')) ?? 'daily')
  const round = int(form, 'round_unit', 1)
  const status = (['draft', 'open', 'closed', 'done', 'cancelled'] as const).find((m) => m === str(form, 'status')) ?? 'open'
  const conditions = parseConditions(str(form, 'conditions', 5000))
  if (!conditions) return { error: '근무 조건을 다시 입력해 주세요.' }
  // 모두싸인 등 다른 서비스 서명 링크 (https만)
  const contractUrl = str(form, 'contract_method') === 'external' ? optStr(form, 'contract_url', 500) : null
  if (contractUrl && !/^https:\/\/[^\s]+$/.test(contractUrl)) return { error: '서명 링크는 https://로 시작하는 주소로 넣어 주세요.' }

  const row = {
    title,
    event_name: optStr(form, 'event_name', 100),
    description: optStr(form, 'description', 3000),
    task: optStr(form, 'task', 300),
    location_name: optStr(form, 'location_name', 100),
    address: optLine(form, 'address', 200),
    lat,
    lng,
    gps_required,
    gps_radius_m: clamp(int(form, 'gps_radius_m', 300), 50, 5000),
    start_date,
    end_date,
    start_time,
    end_time,
    headcount: clamp(int(form, 'headcount', 1), 1, 999),
    pay_type,
    hourly_wage: clamp(int(form, 'hourly_wage', MIN_WAGE_2026), 0, 1_000_000),
    daily_wage: clamp(int(form, 'daily_wage', 0), 0, 10_000_000),
    break_mode,
    break_minutes: clamp(int(form, 'break_minutes', 0), 0, 240),
    round_unit: [1, 5, 10, 15, 30].includes(round) ? round : 1,
    early_clamp: bool(form, 'early_clamp'),
    premium_enabled: bool(form, 'premium_enabled'),
    allowance: clamp(int(form, 'allowance', 0), 0, 1_000_000),
    allowance_label: optStr(form, 'allowance_label', 20),
    tax_type,
    audience,
    employment_insurance: audience === 'expert' ? false : bool(form, 'employment_insurance'),
    pay_day: optStr(form, 'pay_day', 100),
    dress_code: optStr(form, 'dress_code', 200),
    supplies: optStr(form, 'supplies', 200),
    meeting_point: optStr(form, 'meeting_point', 200),
    manager_name: optStr(form, 'manager_name', 30),
    manager_phone: normalizePhone(str(form, 'manager_phone')) ?? optStr(form, 'manager_phone', 20),
    required_docs: form.getAll('required_docs').map(String).filter(isUuid),
    contract_method: (['app', 'paper', 'external'] as const).find((m) => m === str(form, 'contract_method')) ?? 'app',
    contract_url: contractUrl,
    auto_approve: bool(form, 'auto_approve'),
    status,
    conditions,
    hidden_fields: hiddenFromForm(form),
  } satisfies Omit<Job, 'id' | 'created_at' | 'company_id'>

  // 최저임금 확인
  if (pay_type === 'hourly' && row.hourly_wage < MIN_WAGE_2026) {
    return { error: `시급이 2026년 최저임금(${MIN_WAGE_2026.toLocaleString()}원)보다 낮습니다.` }
  }
  if (pay_type === 'daily') {
    const est = estimateDay(row)
    const minDaily = Math.ceil((est.paidMin / 60) * MIN_WAGE_2026)
    if (row.daily_wage < minDaily) {
      return { error: `일급이 근무시간(${(est.paidMin / 60).toFixed(1)}시간) 기준 최저임금 ${minDaily.toLocaleString()}원보다 낮습니다.` }
    }
  }
  return { row }
}

/** 근무자가 알아야 할 공고 내용이 바뀌었는지: ["시간: 10:00~18:00 → 11:00~19:00", ...] */
function jobChanges(before: Job, after: Job): string[] {
  const out: string[] = []
  const line = (label: string, a: string, b: string) => a !== b && out.push(`${label}: ${a || '없음'} → ${b || '없음'}`)
  line('날짜', fmtDateRange(before.start_date, before.end_date), fmtDateRange(after.start_date, after.end_date))
  line('시간', `${hhmm(before.start_time)}~${hhmm(before.end_time)}`, `${hhmm(after.start_time)}~${hhmm(after.end_time)}`)
  line('장소', [before.location_name, before.address].filter(Boolean).join(' '), [after.location_name, after.address].filter(Boolean).join(' '))
  line('집결', before.meeting_point ?? '', after.meeting_point ?? '')
  line('급여', wageText(before), wageText(after))
  line('복장', before.dress_code ?? '', after.dress_code ?? '')
  line('준비물', before.supplies ?? '', after.supplies ?? '')
  return out
}

export async function saveJob(jobId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const { row, error } = parseJob(form)
  if (!row) return { error }
  // 서류 서식은 이 회사 것만
  if (row.required_docs.length) {
    const own = must(
      await db().from('doc_templates').select('id, kind').eq('company_id', admin.companyId).in('id', row.required_docs),
    ) as { id: string; kind: string }[]
    // 전문가 의뢰: 근로계약서 대신 용역계약서 (없으면 기본 용역계약서를 이 회사 서식에 넣음)
    const ok = new Set(own.filter((t) => row.audience !== 'expert' || t.kind !== 'contract').map((t) => t.id))
    row.required_docs = row.required_docs.filter((d) => ok.has(d))
  }
  if (row.audience === 'expert') {
    const service = await serviceTemplateId(admin.companyId)
    if (!row.required_docs.includes(service)) row.required_docs = [service, ...row.required_docs]
  }
  let id = jobId
  let note = ''
  if (id) {
    if (!isUuid(id)) return { error: '잘못된 요청입니다.' }
    const before = await companyJob(admin, id)
    if (!before) return { error: '공고를 찾을 수 없습니다.' }
    // 취소한 행사는 '행사 취소' 상태로만 남김 (다시 모집하려면 복사해서 새 공고로)
    if (before.status === 'cancelled') row.status = 'cancelled'
    else if (row.status === 'cancelled') row.status = before.status
    const timeChanged = hhmm(before.start_time) !== hhmm(row.start_time) || hhmm(before.end_time) !== hhmm(row.end_time)
    // 시간을 바꾸면 이미 일한 기록은 예전 시간으로 고정 (지난 급여가 바뀌지 않게)
    if (timeChanged) await freezeAttendance(id, before.start_time, before.end_time)
    must(await db().from('jobs').update(row).eq('id', id))
    // 서류 구성을 바꿨다면 이미 확정된 인원에게도 서명 요청
    const job = await getJob(id)
    const apps = must(
      await db().from('applications').select('user_id, status').eq('job_id', id).in('status', ['approved', 'applied']),
    ) as { user_id: string; status: string }[]
    const approved = apps.filter((a) => a.status === 'approved')
    // 근로계약서를 종이·다른 서비스로 받기로 바꿨으면 앱에서 기다리던 계약서 서명 요청은 거둠
    if (job && job.contract_method !== 'app') {
      await db().from('signed_docs').delete().eq('job_id', id).eq('kind', 'contract').eq('status', 'pending')
    }
    if (job) for (const a of approved) await ensurePendingDocs(job, a.user_id)
    // 일정·장소·급여가 바뀌었으면 확정자·지원자에게 바로 알림 (끝난 행사·임시저장 제외)
    const changes = job ? jobChanges(before, job) : []
    if (job && changes.length && apps.length && form.get('notify_change') && ['open', 'closed'].includes(job.status) && before.end_date >= kstDate()) {
      const n = await tellWorkers(
        apps.map((a) => a.user_id),
        {
          senderId: admin.id,
          companyId: admin.companyId,
          jobId: id,
          title: SIGNAL.change,
          text: `${job.title}의 내용이 바뀌었어요.\n${changes.join('\n')}\n${timeChanged ? `확정된 분은 앱 '${myWorkTab(job.audience)}'에서 계속 ${job.audience === 'expert' ? '할지' : '근무할지'} 알려 주세요.` : '못 오게 되면 앱에서 담당자에게 알려 주세요.'}`,
          url: `/jobs/${id}`,
          tag: `change-${id}`,
        },
      )
      await audit(admin.id, 'job.change_notice', null, `${id} ${n}명 ${changes.map((c) => c.split(':')[0]).join(',')}`, admin.companyId)
      // 근무시간이 바뀌면 확정자에게 '계속하시겠습니까' 동의를 받음 (알림은 위에서 보냄)
      if (timeChanged && approved.length) {
        await requestShiftChange({
          job,
          adminId: admin.id,
          userIds: approved.map((a) => a.user_id),
          workDate: null,
          start: job.start_time,
          end: job.end_time,
          reason: null,
          prevOf: () => ({ start: before.start_time, end: before.end_time }),
          notify: false,
        })
        note += ' 확정자에게 바뀐 시간으로 계속할지 동의를 요청했어요.'
      }
      note = ` 확정·지원자 ${n}명에게 바뀐 내용을 알렸어요.`
      // 이미 서명한 계약서는 예전 내용 → 다시 받도록 안내
      if (changes.some((c) => /^(날짜|시간|장소|급여)/.test(c))) {
        const { count } = await db().from('signed_docs').select('id', { count: 'exact', head: true }).eq('job_id', id).eq('status', 'signed')
        if (count) note += ` 서명된 서류 ${count}건은 예전 내용이에요. 서류 탭에서 '다시 요청'을 눌러 주세요.`
      }
      revalidatePath('/admin/chat')
    }
  } else {
    const created = must(await db().from('jobs').insert({ ...row, company_id: admin.companyId, created_by: admin.id }).select('id').single()) as { id: string }
    id = created.id
  }
  revalidatePath('/admin/jobs')
  revalidatePath('/')
  redirect(`/admin/jobs/${id}?m=${encodeURIComponent(`저장했습니다.${note}`)}`)
}

export async function setJobStatus(jobId: string, status: Job['status']) {
  const admin = await requireAdmin()
  if (!isUuid(jobId) || !['draft', 'open', 'closed', 'done'].includes(status)) return
  // 취소한 행사는 되돌리지 않음 (지원이 모두 취소됨 → 복사해서 새 공고로)
  must(await db().from('jobs').update({ status }).eq('id', jobId).eq('company_id', admin.companyId).neq('status', 'cancelled'))
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/')
}

/**
 * 관리자 '행사 종료하기' (근무자의 '근무 종료'처럼 큰 버튼): 아직 근무 중인 사람은 예정 종료 시각(지났으면) 또는 지금으로 근무 종료,
 * 공고는 '행사 종료'로 바꾸고 정산 탭으로. 마지막 날부터만 (여러 날 행사의 중간 날엔 '오늘 근무 마무리'를 씀)
 * 사용자 요청 2026-11-06 "관리자도 근무자처럼 버튼들 만들어줘 · 행사 종료하기 등등"
 */
export async function endEvent(jobId: string) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const path = `/admin/jobs/${jobId}`
  if (!['open', 'closed'].includes(job.status)) back(path, '이미 종료했거나 취소된 행사예요.')
  if (kstDate() < job.end_date) back(path, '마지막 날부터 행사를 종료할 수 있어요. 오늘 근무만 마치려면 \'오늘 근무 마무리\'를 눌러 주세요.')
  const open = must(
    await db().from('attendance').select('id, user_id, work_date, clock_in, sched_start, sched_end, note').eq('job_id', jobId).eq('company_id', admin.companyId).is('clock_out', null),
  ) as { id: string; user_id: string; work_date: string; clock_in: string; sched_start: string | null; sched_end: string | null; note: string | null }[]
  const now = new Date()
  const outOf = new Map<string, string>()
  await Promise.all(
    open.map(async (a) => {
      // 사람마다 그날 종료 시각이 지났으면 그 시각, 아니면 지금 (일괄 종료와 같은 규칙)
      const end = scheduledEnd(shiftOf(job, a), a.work_date)
      const out = end < now ? end : now
      const t = new Date(a.clock_in) < out ? out : now
      const note = [a.note, '행사 종료로 근무 종료'].filter(Boolean).join(' · ').slice(0, 300)
      const { error } = await db().from('attendance').update({ clock_out: t.toISOString(), note }).eq('id', a.id).is('clock_out', null)
      if (!error) outOf.set(a.user_id, kstTime(t))
    }),
  )
  must(await db().from('jobs').update({ status: 'done' }).eq('id', jobId).eq('company_id', admin.companyId).in('status', ['open', 'closed']))
  await audit(admin.id, 'job.end', null, `${jobId} 근무 종료 ${outOf.size}명`, admin.companyId)
  // 일한 근무자 모두에게 정산 예정일 안내 (지급일을 정해 둔 공고만)
  const paydayTold = await tellPaydayOnEnd(job, admin.id)
  if (outOf.size) {
    await tellWorkers([...outOf.keys()], {
      senderId: admin.id,
      companyId: admin.companyId,
      jobId,
      title: '🏁 행사가 끝났어요',
      text: (uid) => `${job.title} · 담당자가 행사를 종료하면서 ${outOf.get(uid)} 근무 종료로 기록했어요. 시각이 다르면 앱에서 기록 정정을 요청해 주세요.`,
      tag: `clockout-${jobId}`,
    })
  }
  revalidatePath(path)
  revalidatePath('/admin')
  revalidatePath('/admin/jobs')
  revalidatePath('/')
  back(
    `${path}?tab=pay`,
    `행사를 종료했어요.${outOf.size ? ` 근무 중이던 ${outOf.size}명은 근무 종료로 기록했어요.` : ''}${paydayTold ? ` ${paydayTold}명에게 정산 예정일을 알렸어요.` : ''}`,
  )
}

/**
 * 정산 예정일 알리기 (정산 탭): 이 행사에서 일한 근무자 모두에게 '💰 정산 예정일 안내' (앱 알림 + 문의함).
 * 근무자의 '지난 근무'에 그 날짜가 보임 · 사용자 요청 2026-11-06 "정산예정일자 고지기능 넣어줘"
 */
export async function announcePayday(jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=pay`
  const date = str(form, 'payday')
  if (!isDate(date)) back(path, '정산 예정일을 골라 주세요.')
  const memo = optLine(form, 'memo', 80)
  const ids = [
    ...new Set((must(await db().from('attendance').select('user_id').eq('job_id', jobId).eq('company_id', admin.companyId)) as { user_id: string }[]).map((r) => r.user_id)),
  ]
  if (!ids.length) back(path, '아직 근무 기록이 있는 근무자가 없어요.')
  await tellWorkers(ids, {
    senderId: admin.id,
    companyId: admin.companyId,
    jobId,
    title: `${SIGNAL.payday} 안내`,
    text: `${job.title} · 정산 예정일: ${fmtDate(date)}${memo ? `\n${memo}` : ''}`,
    url: '/me/history',
    tag: `payday-${jobId}`,
  })
  await audit(admin.id, 'job.payday', null, `${jobId} ${date} ${ids.length}명`, admin.companyId)
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, `${ids.length}명에게 정산 예정일(${fmtDate(date)})을 알렸어요.`)
}

export async function duplicateJob(jobId: string) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) back('/admin/jobs', '공고를 찾을 수 없습니다.')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, ...rest } = job as Job & { updated_at?: string }
  const created = must(
    await db()
      .from('jobs')
      .insert({ ...rest, company_id: admin.companyId, title: `${job.title} (복사)`, status: 'draft', created_by: admin.id })
      .select('id')
      .single(),
  ) as { id: string }
  redirect(`/admin/jobs/${created.id}/edit?m=${encodeURIComponent('복사본을 만들었습니다. 날짜를 바꾸고 공개로 저장하세요.')}`)
}

export async function deleteJob(jobId: string) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const [{ count: atts }, { count: signed }, { count: approved }] = await Promise.all([
    db().from('attendance').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
    db().from('signed_docs').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('status', 'signed'),
    db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('status', 'approved'),
  ])
  if (atts || signed) {
    back(`/admin/jobs/${jobId}`, '근무 기록이나 서명된 서류가 있어 삭제할 수 없습니다. 상태를 "종료"로 바꿔 주세요.')
  }
  // 실수 막기: 아직 안 끝난 행사에 확정된 근무자가 있으면 지우지 않음 (지우면 근무자는 알림 없이 근무가 사라짐) → 행사 취소로 알리게
  if (approved && job.status !== 'cancelled' && job.end_date >= kstDate()) {
    back(`/admin/jobs/${jobId}`, `확정된 근무자 ${approved}명이 있어 삭제하지 않았어요. 지우면 근무자는 알림 없이 근무가 사라져요. 더보기의 '행사가 취소됐나요?'로 취소하면 근무자에게 알려져요.`)
  }
  must(await db().from('jobs').delete().eq('id', jobId))
  await audit(admin.id, 'job.delete', null, jobId, admin.companyId)
  revalidatePath('/admin/jobs')
  back('/admin/jobs', '공고를 삭제했습니다.')
}

/**
 * 행사 취소 (우천·주최측 사정 등): 공고를 '행사 취소'로, 확정·대기 지원을 모두 취소하고 서명 대기 서류를 지움.
 * 확정자·지원자 각자에게 사유와 함께 알림. 이미 근무 기록이 있으면 (행사 도중) 종료로 처리하도록 막음
 */
export async function cancelEvent(jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const path = `/admin/jobs/${jobId}`
  if (job.status === 'cancelled') back(path, '이미 취소한 행사입니다.')
  const reason = str(form, 'reason', 200)
  if (!reason) back(path, '취소 사유를 적어 주세요. 근무자에게 그대로 전달돼요.')
  const { count: worked } = await db().from('attendance').select('id', { count: 'exact', head: true }).eq('job_id', jobId)
  if (worked) back(path, '이미 근무 기록이 있어 행사 취소로 바꿀 수 없어요. 남은 날짜는 공고를 고쳐 줄이거나 \'행사 종료\'를 눌러 주세요.')
  const apps = must(
    await db().from('applications').select('id, user_id, status').eq('job_id', jobId).in('status', ['approved', 'applied']),
  ) as { id: string; user_id: string; status: string }[]
  must(await db().from('jobs').update({ status: 'cancelled' }).eq('id', jobId).eq('company_id', admin.companyId))
  if (apps.length) {
    must(
      await db()
        .from('applications')
        .update({ status: 'cancelled', admin_memo: `행사 취소: ${reason}`.slice(0, 300) })
        .in('id', apps.map((a) => a.id)),
    )
  }
  // 서명 대기는 지우고, 이미 서명한 서류도 무효로 (근무 기록이 없는 행사라서)
  for (const a of apps) await releaseDocs(jobId, a.user_id)
  const n = await tellWorkers(
    apps.map((a) => a.user_id),
    {
      senderId: admin.id,
      companyId: job.company_id,
      jobId,
      title: SIGNAL.cancel,
      text: `${job.title} (${fmtDateRange(job.start_date, job.end_date)} ${hhmm(job.start_time)}) 행사가 취소됐어요.\n사유: ${reason}\n지원·확정은 모두 취소 처리됐어요. 불편을 드려 죄송합니다.`,
      url: '/me/chat',
      tag: `cancel-${jobId}`,
    },
  )
  await audit(admin.id, 'job.cancel', null, `${jobId} ${n}명 ${reason}`.slice(0, 500), admin.companyId)
  revalidatePath('/admin/jobs')
  revalidatePath('/admin')
  revalidatePath('/')
  back(path, `행사를 취소했어요.${n ? ` 확정·지원자 ${n}명에게 알렸어요.` : ''}`)
}

// ───────────── 지원자 ─────────────

/** 근무 확정 알림 (서류가 있으면 서명 안내) */
/**
 * 확정 알림: 근무자 문의함에 남기고(휴대폰 알림을 안 켠 사람도 앱에서 안 읽음 표시로 알게) 휴대폰 알림도.
 * 서명할 서류가 있으면 함께 안내
 */
async function tellApproved(job: Job, userIds: string[], adminId: string | null) {
  if (!userIds.length) return
  await tellWorkers(userIds, {
    senderId: adminId,
    companyId: job.company_id,
    jobId: job.id,
    title: job.audience === 'expert' ? '✅ 의뢰가 확정됐어요' : '✅ 근무가 확정됐어요',
    text: [
      job.title,
      `${scheduleSummary(job)}${job.location_name ? ` · ${job.location_name}` : ''}`,
      job.required_docs.length ? `✍️ 앱 ‘${myWorkTab(job.audience)}’에서 서류에 서명해 주세요.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    url: '/me',
    tag: `approved-${job.id}`,
  })
}

/** 미선발 알림: 근무자가 결과를 몰라 계속 기다리거나 "확정됐나요?" 문의하지 않게 (문의함 + 휴대폰 알림) */
async function tellNotSelected(job: Job, userIds: string[], adminId: string, closed: boolean) {
  return tellWorkers(userIds, {
    senderId: adminId,
    companyId: job.company_id,
    jobId: job.id,
    title: '🙏 이번엔 함께하지 못해요',
    text: `${job.title}\n${scheduleSummary(job)}\n${closed ? '모집이 마감돼 ' : ''}이번에는 함께하지 못하게 됐어요. 지원해 주셔서 고마워요. 다음 행사 때 다시 만나요!`,
    // 다른 공고 목록으로 (관리자 계정이 근무자로 받아도 관리자 화면으로 넘어가지 않게 표시를 붙임)
    url: '/?from=push',
    tag: `notsel-${job.id}`,
  })
}

/** from='dashboard': 대시보드에서 눌렀으면 처리 뒤 대시보드 위쪽에 '○○님 확정 · 알림을 보냈어요' (누가 어떻게 됐는지 바로 보이게) */
// (공고 화면처럼 두 값만 묶어 폼에 걸면 세 번째 자리에 폼 데이터가 들어오므로 'dashboard'일 때만 대시보드로)
export async function decideApplication(appId: string, status: 'approved' | 'rejected' | 'applied', from?: 'dashboard' | FormData) {
  const admin = await requireAdmin()
  if (!isUuid(appId) || !['approved', 'rejected', 'applied'].includes(status)) return
  const app = await companyRow<{ id: string; job_id: string; user_id: string; company_id: string; status: string }>(
    admin,
    'applications',
    appId,
    'id, job_id, user_id, status',
  )
  if (!app) return
  must(
    await db()
      .from('applications')
      // 확정·미선발·대기로 정하면 보류는 풀림
      .update({ status, decided_at: status === 'applied' ? null : new Date().toISOString(), held_at: null })
      .eq('id', appId),
  )
  if (status === 'approved') {
    const job = await getJob(app.job_id)
    if (job) {
      await ensurePendingDocs(job, app.user_id)
      await tellApproved(job, [app.user_id], admin.id)
    }
  } else {
    // 되돌리면(대기로·미선발) 서명 대기 서류는 지우고, 이미 서명한 서류도 무효로 (다시 확정하면 새로 서명)
    const voided = await releaseDocs(app.job_id, app.user_id)
    if (voided) await audit(admin.id, 'doc.void_on_revert', app.user_id, `${app.job_id} ${voided}건`, admin.companyId)
    // 대기 중이던 지원을 미선발로 정하면 근무자에게 결과를 알림
    if (status === 'rejected' && app.status === 'applied') {
      const job = await getJob(app.job_id)
      if (job) await tellNotSelected(job, [app.user_id], admin.id, false)
    }
    // 확정을 되돌리면(아직 끝나지 않은 행사): 확정된 줄 알고 현장에 나오지 않게 근무자에게 알림
    if (app.status === 'approved') {
      const job = await getJob(app.job_id)
      if (job && job.end_date >= kstDate()) {
        await tellWorkers([app.user_id], {
          senderId: admin.id,
          companyId: job.company_id,
          jobId: job.id,
          title: '↩️ 근무 확정이 취소됐어요',
          text: `${job.title}\n${scheduleSummary(job)}\n담당자가 확정을 ${status === 'rejected' ? '취소' : '대기로 바꿨'}어요. 다시 확정되기 전에는 현장에 나오지 않아도 돼요. 궁금한 점은 여기로 물어봐 주세요.`,
          url: '/me/chat',
          tag: `unapproved-${job.id}`,
        })
      }
    }
  }
  revalidatePath(`/admin/jobs/${app.job_id}`)
  revalidatePath('/admin')
  if (from === 'dashboard' && status !== 'applied') {
    const { data: u } = await db().from('users').select('name').eq('id', app.user_id).maybeSingle()
    const name = (u as { name: string } | null)?.name ?? '근무자'
    // 휴대폰 한 줄에 들어가게 짧게
    const msg = status === 'approved' ? `${name}님 확정 · 알림을 보냈어요` : app.status === 'applied' ? `${name}님 미선발 · 알림을 보냈어요` : `${name}님을 미선발로 바꿨어요`
    redirect(`/admin?m=${encodeURIComponent(msg)}`)
  }
}

export async function approveAllApplied(jobId: string) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const apps = must(
    // 보류한 지원자는 '모두 확정'에서 빼고
    await db().from('applications').select('id, user_id').eq('job_id', jobId).eq('status', 'applied').is('held_at', null),
  ) as { id: string; user_id: string }[]
  if (!apps.length) return
  must(
    await db()
      .from('applications')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .in('id', apps.map((a) => a.id)),
  )
  for (const a of apps) await ensurePendingDocs(job, a.user_id)
  await tellApproved(job, apps.map((a) => a.user_id), admin.id)
  revalidatePath(`/admin/jobs/${jobId}`)
}

/** 지원자 탭에서 고른 사람만 한 번에 확정 (대기 중인 지원만) */
/**
 * 지원자 보류 / 보류 풀기 (사용자 요청 2026-11-06 "확정과 미선발 외에도 보류 · 근무자에게는 알림 가지 않게").
 * 상태는 그대로 '지원'(applied) — 근무자 화면은 계속 '검토 중'이고 알림·문의함 기록 없음. 관리자 화면에서만 '보류' 칸으로 모음
 */
export async function holdApplication(appId: string, hold: boolean, from?: 'dashboard' | FormData) {
  const admin = await requireAdmin()
  if (!isUuid(appId)) return
  const app = await companyRow<{ id: string; job_id: string; user_id: string; company_id: string; status: string }>(admin, 'applications', appId, 'id, job_id, user_id, status')
  if (!app) return
  const path = from === 'dashboard' ? '/admin' : `/admin/jobs/${app.job_id}?tab=apps`
  if (app.status !== 'applied') back(path, '대기 중인 지원자만 보류할 수 있어요.')
  must(await db().from('applications').update({ held_at: hold ? new Date().toISOString() : null }).eq('id', appId).eq('status', 'applied'))
  await audit(admin.id, hold ? 'application.hold' : 'application.unhold', app.user_id, app.job_id, admin.companyId)
  const { data: u } = await db().from('users').select('name').eq('id', app.user_id).maybeSingle()
  const name = (u as { name: string } | null)?.name ?? '지원자'
  revalidatePath(`/admin/jobs/${app.job_id}`)
  revalidatePath('/admin')
  back(path, hold ? `${name}님 보류 · 근무자에게는 알리지 않았어요` : `${name}님 보류를 풀었어요 · 다시 대기`)
}

export async function approveSelected(jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=apps`
  const ids = [...new Set(form.getAll('app').map(String).filter(isUuid))]
  if (!ids.length) back(path, '확정할 지원자를 골라 주세요.')
  const apps = (
    must(await db().from('applications').select('id, user_id, status, job_id').in('id', ids).eq('job_id', jobId).eq('status', 'applied')) as {
      id: string
      user_id: string
      status: string
      job_id: string
    }[]
  ).filter((a) => a.status === 'applied' && a.job_id === jobId && ids.includes(a.id))
  if (!apps.length) back(path, '이미 처리된 지원이에요.')
  must(
    await db()
      .from('applications')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .in('id', apps.map((a) => a.id)),
  )
  for (const a of apps) await ensurePendingDocs(job, a.user_id)
  await tellApproved(job, apps.map((a) => a.user_id), admin.id)
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin')
  back(path, `${apps.length}명을 확정했어요. 근무자에게 알렸어요.`)
}

/**
 * 모집이 끝났는데 남은 대기 지원자: 한 번에 미선발로 정리하고 '이번엔 함께하지 못해요' 알림
 * (결과를 몰라 계속 기다리거나 "확정됐나요?" 문의하지 않게)
 */
export async function rejectWaiting(jobId: string) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=apps`
  const apps = must(
    // 보류한 지원자는 빼고 (보류는 관리자가 따로 정함)
    await db().from('applications').select('id, user_id').eq('job_id', jobId).eq('company_id', admin.companyId).eq('status', 'applied').is('held_at', null),
  ) as { id: string; user_id: string }[]
  if (!apps.length) back(path, '대기 중인 지원자가 없어요.')
  must(
    await db()
      .from('applications')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .in('id', apps.map((a) => a.id))
      .eq('status', 'applied'),
  )
  const n = await tellNotSelected(job, apps.map((a) => a.user_id), admin.id, true)
  await audit(admin.id, 'app.reject_waiting', null, `${jobId} ${apps.length}명`, admin.companyId)
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin')
  back(path, `대기 ${apps.length}명을 미선발로 정리하고 ${n}명에게 알렸어요.`)
}

/** 근무자 정보 화면에서 모집 중인 공고에 바로 확정 (예전에 잘한 사람을 다시 부를 때) */
export async function assignWorkerToJob(userId: string, form: FormData) {
  const admin = await requireAdmin()
  if (!isUuid(userId)) return
  const path = `/admin/workers/${userId}`
  // 확인 전 회사는 우리 회사에 지원한 적 없는 회원을 바로 확정할 수 없음
  if (!admin.companyVerified && !(await workerInCompany(admin.companyId, userId))) back(path, '회사 확인을 마치면 바로 확정할 수 있어요.')
  const jobId = str(form, 'job_id', 40)
  const job = await companyJob(admin, jobId)
  if (!job || !['open', 'closed'].includes(job.status) || job.end_date < kstDate()) back(path, '확정할 공고를 골라 주세요.')
  const { data: u } = await db().from('users').select('id, name, active, role, member_type').eq('id', userId).maybeSingle()
  // 관리자·외주 업체 계정은 근무로 확정할 수 없음
  if (!u || !u.active || u.role !== 'worker' || u.member_type === 'vendor') back(path, '사용할 수 없는 계정이에요.')
  const { data: cur } = await db().from('applications').select('status').eq('job_id', job.id).eq('user_id', userId).maybeSingle()
  if ((cur as { status: string } | null)?.status === 'approved') back(path, `이미 「${job.title}」에 확정된 근무자예요.`)
  must(
    await db()
      .from('applications')
      .upsert(
        { job_id: job.id, user_id: userId, status: 'approved', decided_at: new Date().toISOString(), admin_memo: '관리자 직접 추가' },
        { onConflict: 'job_id,user_id' },
      ),
  )
  await ensurePendingDocs(job, userId)
  await tellApproved(job, [userId], admin.id)
  revalidatePath(`/admin/jobs/${job.id}`)
  revalidatePath(path)
  back(path, `${u.name}님을 「${job.title}」에 확정했어요. 근무자에게 알렸어요.`)
}

export async function addWorkerToJob(jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=apps`
  // 확인 전 회사는 번호만으로 남의 회원을 데려올 수 없음 (공고 링크로 본인이 지원하게)
  if (!admin.companyVerified) back(path, '회사 확인을 마치면 번호로 직접 추가할 수 있어요. 지금은 공고 링크를 보내 지원을 받아 주세요.')
  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) back(path, '휴대폰 번호를 확인해 주세요.')
  const { data: u } = await db().from('users').select('id, name, active, role, member_type').eq('phone', phone).maybeSingle()
  // 근무자(알바·전문가) 계정만 (관리자·외주 업체 계정을 끌어오지 못하게)
  if (!u || !u.active || u.role !== 'worker' || u.member_type === 'vendor') back(path, '가입된 근무자가 아닙니다. 먼저 앱에서 가입하도록 안내해 주세요.')
  must(
    await db()
      .from('applications')
      .upsert(
        { job_id: jobId, user_id: u.id, status: 'approved', decided_at: new Date().toISOString(), admin_memo: '관리자 직접 추가' },
        { onConflict: 'job_id,user_id' },
      ),
  )
  await ensurePendingDocs(job, u.id)
  await tellApproved(job, [u.id], admin.id)
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, `${u.name}님을 확정 인원에 추가했습니다.`)
}

// ───────────── 출퇴근 ─────────────

export async function saveAttendance(attId: string, form: FormData) {
  const admin = await requireAdmin()
  const att = await companyRow<Pick<Attendance, 'id' | 'job_id' | 'user_id' | 'work_date' | 'clock_in' | 'clock_out' | 'company_id'>>(
    admin,
    'attendance',
    attId,
    'id, job_id, user_id, work_date, clock_in, clock_out',
  )
  if (!att) return
  const path = `/admin/jobs/${att.job_id}?tab=att&date=${att.work_date}`
  const inV = str(form, 'adj_in')
  const outV = str(form, 'adj_out')
  const inIso = inV ? fromKstInput(inV) : null
  const outIso = outV ? fromKstInput(outV) : null
  if ((inV && !inIso) || (outV && !outIso)) back(path, '시각 형식이 올바르지 않습니다.')
  if (inIso && outIso && outIso <= inIso) back(path, '퇴근 시각이 출근 시각보다 빠릅니다.')
  // 원래 기록과 1분 이상 다를 때만 보정값으로 저장 (원본은 그대로 남김)
  const differs = (a: string | null, b: string | null) =>
    !!a && (!b || Math.abs(new Date(a).getTime() - new Date(b).getTime()) >= 60_000)
  const adjIn = differs(inIso, att.clock_in) ? inIso : null
  // 종료를 안 누른 기록은 관리자가 넣은 시각을 퇴근 기록으로 사용
  const closeNow = !att.clock_out && !!outIso
  const adjOut = !closeNow && differs(outIso, att.clock_out) ? outIso : null
  const breakRaw = str(form, 'break_override')
  must(
    await db()
      .from('attendance')
      .update({
        adj_in: adjIn,
        adj_out: adjOut,
        ...(closeNow ? { clock_out: outIso } : {}),
        break_override: breakRaw === '' ? null : clamp(int(form, 'break_override'), 0, 600),
        extra_pay: clamp(int(form, 'extra_pay'), -10_000_000, 10_000_000),
        deduction: clamp(int(form, 'deduction'), 0, 10_000_000),
        note: optStr(form, 'note', 300),
        confirmed: bool(form, 'confirmed'),
      })
      .eq('id', attId),
  )
  await audit(admin.id, 'attendance.edit', att.user_id, `${att.work_date} ${inV || '-'}~${outV || '-'}`, admin.companyId)
  const finished = closeNow && (await finishIfAllOut(att.job_id, att.work_date))
  revalidatePath(`/admin/jobs/${att.job_id}`)
  // 정산 탭의 '시간 수정'으로 왔으면 정산 탭으로 (바뀐 금액을 바로 확인)
  if (str(form, 'back') === 'pay') back(`/admin/jobs/${att.job_id}?tab=pay`, `근무 기록을 고쳤어요. 정산 금액에 바로 반영했어요.${finished ? FINISHED_NOTE : ''}`)
  back(path, `근무 기록을 저장했습니다.${finished ? FINISHED_NOTE : ''}`)
}

/**
 * 근로시간 일괄 조정 (사용자 요청 2026-11-07 "근로시간 선택해서 일괄조정 가능하게"):
 * 그날 근무 기록이 있는 사람을 골라 출근·종료 시각을 한 번에 (한 사람 '수정'과 같은 규칙 — 원래 기록은 두고 보정값으로 저장,
 * 종료를 안 누른 기록은 넣은 시각을 퇴근 기록으로). 지급 완료한 기록은 그대로. 종료 시각이 출근보다 이르면 다음 날(밤샘)로 봄
 */
export async function bulkAdjustTimes(jobId: string, date: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const job = isDate(date) ? await companyJob(admin, jobId) : null
  if (!job) return { error: '공고를 찾을 수 없습니다.' }
  const uids = [...new Set(form.getAll('uid').map(String).filter(isUuid))]
  if (!uids.length) return { error: '고칠 사람을 골라 주세요.' }
  const inT = str(form, 'in_time')
  const outT = str(form, 'out_time')
  if (!inT && !outT) return { error: '출근이나 종료 시각을 넣어 주세요.' }
  if ((inT && !isTime(inT)) || (outT && !isTime(outT))) return { error: '시각을 확인해 주세요.' }
  const rows = must(
    await db()
      .from('attendance')
      .select('id, user_id, work_date, clock_in, clock_out, adj_in, adj_out, note, paid, company_id, job_id')
      .eq('company_id', admin.companyId)
      .eq('job_id', jobId)
      .eq('work_date', date)
      .in('user_id', uids),
  ) as Pick<Attendance, 'id' | 'user_id' | 'work_date' | 'clock_in' | 'clock_out' | 'adj_in' | 'adj_out' | 'note' | 'paid' | 'company_id' | 'job_id'>[]
  const differs = (a: Date, b: string | null) => !b || Math.abs(a.getTime() - new Date(b).getTime()) >= 60_000
  let done = 0
  let paidSkip = 0
  let badSkip = 0
  let closed = false
  for (const a of rows.filter((r) => r.company_id === admin.companyId && r.job_id === jobId && r.work_date === date && uids.includes(r.user_id))) {
    if (a.paid) {
      paidSkip++
      continue
    }
    const inAt = inT ? kstAt(date, inT) : new Date(a.adj_in ?? a.clock_in)
    let outAt: Date | null = outT ? kstAt(date, outT) : a.adj_out ?? a.clock_out ? new Date((a.adj_out ?? a.clock_out)!) : null
    // 종료 시각이 출근보다 이르면 다음 날 끝난 것으로 (밤샘 근무)
    if (outT && outAt && outAt <= inAt) outAt = new Date(outAt.getTime() + 86_400_000)
    if (outAt && outAt <= inAt) {
      badSkip++
      continue
    }
    const closeNow = !a.clock_out && !!outT && !!outAt
    const memo = `일괄 시간 조정 ${inT || kstTime(inAt)}~${outT || (outAt ? kstTime(outAt) : '')}`
    must(
      await db()
        .from('attendance')
        .update({
          ...(inT ? { adj_in: differs(inAt, a.clock_in) ? inAt.toISOString() : null } : {}),
          ...(outT && outAt ? (closeNow ? { clock_out: outAt.toISOString(), adj_out: null } : { adj_out: differs(outAt, a.clock_out) ? outAt.toISOString() : null }) : {}),
          note: (a.note ? `${a.note} · ${memo}` : memo).slice(0, 300),
        })
        .eq('id', a.id),
    )
    if (closeNow) closed = true
    done++
  }
  if (!done) return { error: paidSkip ? '고른 기록이 모두 지급 완료라 고치지 않았어요.' : '고칠 수 있는 기록이 없어요. 시각을 확인해 주세요.' }
  await audit(admin.id, 'attendance.bulk_adjust', null, `${date} ${done}명 ${inT || '-'}~${outT || '-'}`, admin.companyId)
  const finished = closed && (await finishIfAllOut(jobId, date))
  revalidatePath(`/admin/jobs/${jobId}`)
  const skip = [paidSkip && `지급 완료 ${paidSkip}명`, badSkip && `시각이 맞지 않는 ${badSkip}명`].filter(Boolean).join(' · ')
  return { ok: `${done}명 시간을 고쳤어요. 정산 금액에 바로 반영돼요.${skip ? ` (${skip}은 그대로)` : ''}${finished ? FINISHED_NOTE : ''}` }
}

export async function addAttendance(jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  const userId = str(form, 'user_id')
  const date = str(form, 'work_date')
  const path = `/admin/jobs/${jobId}?tab=att&date=${date}`
  if (!isUuid(userId) || !isDate(date)) back(path, '근무자와 날짜를 확인해 주세요.')
  // 이 공고에 확정된 사람만 (아무 회원 id로 기록을 만들어 신고자료로 주민번호·계좌를 빼 가지 못하게)
  const { count: approvedApp } = await db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('user_id', userId).eq('status', 'approved')
  if (!approvedApp) back(path, '이 공고에 확정된 근무자만 기록을 추가할 수 있어요.')
  const inT = str(form, 'in') || job.start_time.slice(0, 5)
  const outT = str(form, 'out')
  if (!isTime(inT) || (outT && !isTime(outT))) back(path, '시각을 확인해 주세요.')
  const clockIn = kstAt(date, inT)
  let clockOut: Date | null = outT ? kstAt(date, outT) : null
  if (clockOut && clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 24 * 3600_000)
  const { error } = await db().from('attendance').insert({
    job_id: jobId,
    user_id: userId,
    work_date: date,
    clock_in: clockIn.toISOString(),
    clock_out: clockOut?.toISOString() ?? null,
    source: 'admin',
    note: optStr(form, 'note', 300) ?? '관리자 등록',
    ...(await agreedShiftFor(jobId, userId, date)),
  })
  if (error) back(path, error.code === '23505' ? '그날 이미 기록이 있습니다. 기존 기록을 고쳐 주세요.' : '등록하지 못했습니다.')
  await audit(admin.id, 'attendance.add', userId, `${date} ${inT}~${outT || '-'}`, admin.companyId)
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, '근무 기록을 추가했습니다.')
}

/**
 * 현장 위치 확인이 안 돼 근무자가 보낸 '출근 확인 요청'을 받아들임: 요청한 시각으로 출근 기록 (근무자는 이후 앱에서 종료)
 * 그날 그 근무자의 가장 최근 요청을 서버에서 다시 찾음
 */
export async function approveArrival(jobId: string, userId: string, date: string) {
  const admin = await requireAdmin()
  const job = isUuid(userId) && isDate(date) ? await companyJob(admin, jobId) : null
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=att&date=${date}`
  const rows = must(
    await db()
      .from('messages')
      .select('body, created_at')
      .eq('thread_user_id', userId)
      .eq('job_id', jobId)
      .eq('from_admin', false)
      .gte('created_at', kstAt(date, '00:00').toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  ) as { body: string; created_at: string }[]
  const req = rows.find((m) => kstDate(m.created_at) === date && signalOf(m.body) === 'arrive')
  if (!req) back(path, '출근 확인 요청을 찾을 수 없어요.')
  const { count: approvedApp } = await db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('user_id', userId).eq('status', 'approved')
  if (!approvedApp) back(path, '이 공고에 확정된 근무자가 아니에요.')
  const { error } = await db().from('attendance').insert({
    job_id: jobId,
    user_id: userId,
    work_date: date,
    clock_in: req.created_at,
    source: 'admin',
    note: `위치 확인 실패 · ${kstTime(req.created_at)} 출근 확인 요청 승인`,
    ...(await agreedShiftFor(jobId, userId, date)),
  })
  if (error) back(path, error.code === '23505' ? '이미 출근 기록이 있어요.' : '출근 처리하지 못했어요.')
  await audit(admin.id, 'attendance.arrive_ok', userId, `${date} ${kstTime(req.created_at)}`, admin.companyId)
  await tellWorkers([userId], {
    senderId: admin.id,
    companyId: admin.companyId,
    jobId,
    title: '✅ 출근 처리됐어요',
    text: `${job.title} · ${kstTime(req.created_at)} 출근으로 기록했어요. 일이 끝나면 앱에서 '근무 종료'를 눌러 주세요.`,
    tag: `arrive-ok-${jobId}`,
  })
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, `${kstTime(req.created_at)} 출근으로 처리했어요.`)
}

/** 근무자의 기록 정정 요청에 답하기: accept면 요청한 시각으로 보정(adj_in/adj_out), 아니면 그대로 두고 알림 */
export async function decideFix(jobId: string, userId: string, date: string, accept: boolean) {
  const admin = await requireAdmin()
  const job = isUuid(userId) && isDate(date) ? await companyJob(admin, jobId) : null
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=att&date=${date}`
  const [msgs, { data }] = await Promise.all([
    db()
      .from('messages')
      .select('body, created_at, from_admin')
      .eq('thread_user_id', userId)
      .eq('job_id', jobId)
      .gte('created_at', kstAt(date, '00:00').toISOString())
      .order('created_at', { ascending: false })
      .limit(100)
      .then((r) => must(r) as { body: string; created_at: string; from_admin: boolean }[]),
    db().from('attendance').select('id, clock_in, clock_out, adj_in, adj_out, note, paid').eq('job_id', jobId).eq('user_id', userId).eq('work_date', date).maybeSingle(),
  ])
  const att = data as Pick<Attendance, 'id' | 'clock_in' | 'clock_out' | 'adj_in' | 'adj_out' | 'note' | 'paid'> | null
  const req = pendingFix(msgs, date)
  const fix = req && parseFix(req.body)
  if (!fix || !att?.clock_out) back(path, '답할 정정 요청이 없어요.')
  if (accept && att.paid) back(path, '이미 지급 완료한 기록은 고칠 수 없어요.')
  const word = fix.field === 'in' ? '출근' : '종료'
  const day = fmtDate(date)
  // 일찍 끝났지만 근로조건대로 인정해 달라는 요청 (같은 흐름 · 문구만 다르게)
  const full = isFullTimeAsk(req.body) && fix.field === 'out'
  if (!accept) {
    await tellWorkers([userId], {
      senderId: admin.id,
      companyId: admin.companyId,
      jobId,
      title: SIGNAL.fixNo,
      text: full
        ? `${job.title} · ${day} 근무는 근로조건대로 인정하지 않고 실제 종료 시각대로 계산해요. 궁금한 점은 문의함으로 물어봐 주세요.`
        : `${job.title} · ${day} 근무를 요청한 ${word} ${fix.time}(으)로 고치지 않고 그대로 두었어요. 궁금한 점은 문의함으로 물어봐 주세요.`,
      tag: `fix-${jobId}`,
    })
    revalidatePath(`/admin/jobs/${jobId}`)
    back(path, full ? '실제 종료 시각대로 두고 근무자에게 알렸어요.' : '정정하지 않고 근무자에게 알렸어요.')
  }
  const inAt = new Date(att.adj_in ?? att.clock_in)
  const outAt = new Date(att.adj_out ?? att.clock_out)
  const want = fixTime(date, fix, inAt)
  if (fix.field === 'in' ? want >= outAt : want <= inAt) back(path, '요청한 시각이 출근·종료 순서와 맞지 않아요. 아래 ‘수정’에서 직접 고쳐 주세요.')
  const memo = full ? `일찍 종료 · 근로조건대로 ${fix.time}까지 인정` : `근무자 요청으로 ${word} ${fix.time} 정정`
  must(
    await db()
      .from('attendance')
      .update({
        [fix.field === 'in' ? 'adj_in' : 'adj_out']: want.toISOString(),
        note: (att.note ? `${att.note} · ${memo}` : memo).slice(0, 300),
      })
      .eq('id', att.id),
  )
  await audit(admin.id, full ? 'attendance.full_time_ok' : 'attendance.fix_ok', userId, `${date} ${word} ${fix.time}`, admin.companyId)
  await tellWorkers([userId], {
    senderId: admin.id,
    companyId: admin.companyId,
    jobId,
    title: SIGNAL.fixDone,
    text: full
      ? `${job.title} · ${day} 근무를 근로조건대로 ${fix.time}까지 인정했어요. 정산에 그대로 들어가요.`
      : `${job.title} · ${day} 근무의 ${word} 시각을 ${fix.time}(으)로 고쳤어요.`,
    tag: `fix-${jobId}`,
  })
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/me')
  back(path, full ? `근로조건대로 ${fix.time}까지 인정했어요. 근무자에게 알렸어요.` : `${word} 시각을 ${fix.time}(으)로 고쳤어요.`)
}

/**
 * 근무시간 변경 (퇴근 연장 등): 그날만(scope=날짜) 또는 전체 일정(scope=all).
 * 근무자마다 '계속하시겠습니까' 동의를 받고, 동의한 사람만 바뀐 시간으로 급여를 계산
 */
export async function changeShift(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return { error: '공고를 찾을 수 없습니다.' }
  if (['done', 'cancelled', 'draft'].includes(job.status)) return { error: '진행 중인 공고만 근무시간을 바꿀 수 있어요.' }
  const today = kstDate()
  const scope = str(form, 'scope')
  const start = str(form, 'start_time')
  const end = str(form, 'end_time')
  const reason = optStr(form, 'reason', 100)
  if (!isTime(start) || !isTime(end)) return { error: '시작·종료 시각을 확인해 주세요.' }
  if (hhmm(start) === hhmm(end)) return { error: '시작과 종료 시각이 같아요.' }
  const approved = must(
    await db().from('applications').select('user_id, available_dates').eq('job_id', jobId).eq('status', 'approved'),
  ) as { user_id: string; available_dates: string[] | null }[]
  let n = 0
  if (scope === 'all') {
    if (job.end_date < today) return { error: '이미 끝난 행사예요.' }
    if (hhmm(start) === hhmm(job.start_time) && hhmm(end) === hhmm(job.end_time)) return { error: '지금 시간과 같아요.' }
    await freezeAttendance(jobId, job.start_time, job.end_time)
    must(await db().from('jobs').update({ start_time: start, end_time: end }).eq('id', jobId))
    n = await requestShiftChange({
      job,
      adminId: admin.id,
      userIds: approved.map((a) => a.user_id),
      workDate: null,
      start,
      end,
      reason,
      prevOf: () => ({ start: job.start_time, end: job.end_time }),
    })
    revalidatePath('/')
  } else {
    if (!isDate(scope) || !dateList(job.start_date, job.end_date).includes(scope)) return { error: '날짜를 확인해 주세요.' }
    if (scope < today) return { error: '지난 날짜는 출퇴근 기록에서 직접 고쳐 주세요.' }
    const picked = new Set(form.getAll('uid').map(String))
    const targets = approved.filter((a) => (!a.available_dates || a.available_dates.includes(scope)) && picked.has(a.user_id)).map((a) => a.user_id)
    if (!targets.length) return { error: '변경할 근무자를 골라 주세요.' }
    // 사람마다 지금 그날 시간 (이미 바꾼 시간이 있으면 그것)
    const [atts, agreed] = await Promise.all([
      db().from('attendance').select('user_id, sched_start, sched_end').eq('job_id', jobId).eq('work_date', scope),
      db().from('shift_changes').select('user_id, work_date, start_time, end_time, status, created_at').eq('job_id', jobId).eq('work_date', scope).eq('status', 'agreed'),
    ])
    const attOf = new Map((must(atts) as { user_id: string; sched_start: string | null; sched_end: string | null }[]).map((a) => [a.user_id, a]))
    const agreedOf = new Map<string, Pick<ShiftChange, 'start_time' | 'end_time'>>()
    for (const c of (must(agreed) as ShiftChange[]).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (c.work_date === scope && c.status === 'agreed') agreedOf.set(c.user_id, c)
    }
    n = await requestShiftChange({
      job,
      adminId: admin.id,
      userIds: targets,
      workDate: scope,
      start,
      end,
      reason,
      prevOf: (uid) => {
        const a = attOf.get(uid)
        if (a?.sched_start && a.sched_end) return { start: a.sched_start, end: a.sched_end }
        const c = agreedOf.get(uid)
        return c ? { start: c.start_time, end: c.end_time } : { start: job.start_time, end: job.end_time }
      },
    })
  }
  if (!n) return { error: '바뀌는 사람이 없어요. 이미 그 시간이에요.' }
  await audit(admin.id, 'shift.change', null, `${jobId} ${scope} ${start}~${end} ${n}명`, admin.companyId)
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin/chat')
  const date = scope === 'all' ? (dateList(job.start_date, job.end_date).includes(today) ? today : job.start_date) : scope
  redirect(`/admin/jobs/${jobId}?tab=att&date=${date}&m=${encodeURIComponent(`${n}명에게 근무시간 변경 동의를 요청했어요.`)}`)
}

/** 근무자가 앱을 못 쓸 때: 현장에서 말로 동의받은 것을 관리자가 기록 (누가 기록했는지 남음) */
export async function answerShiftByAdmin(changeId: string) {
  const admin = await requireAdmin()
  const c = await companyRow<ShiftChange>(admin, 'shift_changes', changeId)
  if (!c || c.status !== 'pending') return
  must(
    await db()
      .from('shift_changes')
      .update({ status: 'agreed', answered_at: new Date().toISOString(), answered_by: admin.id, answer_ip: 'admin' })
      .eq('id', changeId)
      .eq('status', 'pending'),
  )
  await applyAgreedShift(c)
  await audit(admin.id, 'shift.agree_onsite', c.user_id, `${c.job_id} ${c.work_date ?? 'all'} ${c.start_time}~${c.end_time}`, admin.companyId)
  revalidatePath(`/admin/jobs/${c.job_id}`)
}

/**
 * 불성실 근무자 귀가 조치 (근로계약서의 '근로계약의 해지' 조항): 지금 시각으로 근무 종료 처리하고 사유를 기록·알림.
 * 일한 시간까지의 급여는 그대로 계산됨. 여러 날 행사면 남은 날 근무도 취소할 수 있음
 */
export async function dismissWorker(attId: string, form: FormData) {
  const admin = await requireAdmin()
  if (!isUuid(attId)) return
  const { data } = await db().from('attendance').select('*, job:jobs(*)').eq('id', attId).maybeSingle()
  const att = data as (Attendance & { job: Job | null }) | null
  if (!att || !att.job || att.company_id !== admin.companyId) return
  const path = `/admin/jobs/${att.job_id}?tab=att&date=${att.work_date}`
  if (att.clock_out) back(path, '이미 근무가 끝난 기록이에요.')
  const reason = DISMISS_REASONS.find((r) => r === str(form, 'reason'))
  if (!reason) back(path, '귀가 조치 사유를 골라 주세요.')
  const memo = optStr(form, 'memo', 200)
  const now = new Date()
  must(
    await db()
      .from('attendance')
      .update({ clock_out: now.toISOString(), note: `${DISMISS_NOTE}(${reason})${memo ? ` · ${memo}` : ''}`.slice(0, 300) })
      .eq('id', attId)
      .is('clock_out', null),
  )
  // 여러 날 행사: 남은 날 근무도 취소 (확정 취소)
  const restCancelled = bool(form, 'cancel_rest') && att.job.end_date > att.work_date
  if (restCancelled) {
    must(
      await db()
        .from('applications')
        .update({ status: 'cancelled', admin_memo: `${DISMISS_NOTE}(${reason}) ${att.work_date}`.slice(0, 300) })
        .eq('job_id', att.job_id)
        .eq('user_id', att.user_id),
    )
  }
  await audit(admin.id, 'attendance.dismiss', att.user_id, `${att.job_id} ${att.work_date} ${reason}${restCancelled ? ' +남은 날 취소' : ''}`, admin.companyId)
  await tellWorkers([att.user_id], {
    senderId: admin.id,
    companyId: admin.companyId,
    jobId: att.job_id,
    title: '🏠 귀가 조치 안내',
    text: [
      `${att.job.title} · 오늘 근무는 ${kstTime(now)}에 종료 처리됐어요.`,
      `사유: ${reason}${memo ? ` (${memo})` : ''}`,
      restCancelled && '남은 날짜의 근무도 취소됐어요.',
      `${kstTime(att.adj_in ?? att.clock_in)}부터 ${kstTime(now)}까지 일한 시간의 급여는 지급돼요. 이의가 있으면 문의함으로 남겨 주세요.`,
    ]
      .filter(Boolean)
      .join('\n'),
    tag: `dismiss-${att.job_id}`,
  })
  const finished = await finishIfAllOut(att.job_id, att.work_date)
  revalidatePath(`/admin/jobs/${att.job_id}`)
  revalidatePath('/admin/chat')
  back(path, `귀가 조치했어요. ${kstTime(now)} 종료로 기록하고 근무자에게 알렸어요.${finished ? FINISHED_NOTE : ''}`)
}

export async function deleteAttendance(attId: string) {
  const admin = await requireAdmin()
  const att = await companyRow<Pick<Attendance, 'id' | 'job_id' | 'user_id' | 'work_date' | 'company_id'>>(admin, 'attendance', attId, 'id, job_id, user_id, work_date')
  if (!att) return
  must(await db().from('attendance').delete().eq('id', attId))
  await audit(admin.id, 'attendance.delete', att.user_id, att.work_date, admin.companyId)
  revalidatePath(`/admin/jobs/${att.job_id}`)
  back(`/admin/jobs/${att.job_id}?tab=att&date=${att.work_date}`, '근무 기록을 삭제했습니다.')
}

/** 아직 종료를 안 누른 사람들을 공고 종료 시각(이미 지났다면)이나 지금 시각으로 일괄 종료 */
export async function bulkClockOut(jobId: string, date: string) {
  const admin = await requireAdmin()
  const job = isDate(date) ? await companyJob(admin, jobId) : null
  if (!job) return
  const open = must(
    await db().from('attendance').select('id, clock_in, sched_start, sched_end').eq('job_id', jobId).eq('work_date', date).is('clock_out', null),
  ) as { id: string; clock_in: string; sched_start: string | null; sched_end: string | null }[]
  for (const a of open) {
    // 사람마다 그날 종료 시각 (연장에 동의했으면 그 시각)이 지났으면 그 시각, 아니면 지금
    const end = scheduledEnd(shiftOf(job, a), date)
    const out = end < new Date() ? end : new Date()
    const t = new Date(a.clock_in) < out ? out : new Date()
    await db().from('attendance').update({ clock_out: t.toISOString(), note: '관리자 일괄 종료' }).eq('id', a.id)
  }
  const finished = open.length > 0 && (await finishIfAllOut(jobId, date))
  revalidatePath(`/admin/jobs/${jobId}`)
  back(`/admin/jobs/${jobId}?tab=att&date=${date}`, `${open.length}명을 근무 종료 처리했습니다.${finished ? FINISHED_NOTE : ''}`)
}

/** 출석 체크로 고른 사람 (form의 user_ids · 중복·이상한 값 빼고 최대 500명) */
const pickedIds = (form: FormData) => [...new Set(form.getAll('user_ids').map(String).filter(isUuid))].slice(0, 500)

/**
 * 출석 체크 → 고른 사람들 한 번에 근무 시작 (오늘만).
 * 이 공고에 확정되고 그날 근무하는 사람만 · 이미 기록이 있으면 건너뜀 · 시각은 지금 또는 (이미 지났으면) 그 사람의 근무 시작 시각.
 * 근무자 문의함·휴대폰으로 '출근 처리됐어요' 알림 (일이 끝나면 근무자가 직접 종료하거나 관리자가 일괄 종료)
 */
export async function bulkClockIn(jobId: string, date: string, form: FormData) {
  const admin = await requireAdmin()
  const job = isDate(date) ? await companyJob(admin, jobId) : null
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=att&date=${date}&view=check`
  if (date !== kstDate()) back(path, '출석 체크로 근무 시작은 오늘만 할 수 있어요. 다른 날은 기록 추가로 넣어 주세요.')
  if (job.status === 'cancelled' || job.status === 'draft') back(path, '취소됐거나 임시 저장인 공고예요.')
  const ids = pickedIds(form)
  if (!ids.length) back(path, '근무를 시작할 사람을 골라 주세요.')
  const [apps, have] = await Promise.all([
    db().from('applications').select('user_id, available_dates').eq('job_id', jobId).eq('status', 'approved').in('user_id', ids).then((r) => must(r) as { user_id: string; available_dates: string[] | null }[]),
    db().from('attendance').select('user_id').eq('job_id', jobId).eq('work_date', date).in('user_id', ids).then((r) => new Set((must(r) as { user_id: string }[]).map((a) => a.user_id))),
  ])
  // 이 공고 확정자 중 그날 근무하는 사람만 (아무 회원 id로 기록을 만들지 못하게)
  const todo = apps.filter((a) => (!a.available_dates || a.available_dates.includes(date)) && !have.has(a.user_id)).map((a) => a.user_id)
  if (!todo.length) back(path, have.size ? '고른 사람은 이미 근무를 시작했어요.' : '이날 근무하는 확정자를 골라 주세요.')
  const now = new Date()
  const atStart = form.get('at') === 'start'
  const rows = await Promise.all(
    todo.map(async (uid) => {
      const sched = await agreedShiftFor(jobId, uid, date)
      const start = kstAt(date, sched.sched_start ?? job.start_time)
      const at = atStart && start < now ? start : now
      return { job_id: jobId, user_id: uid, work_date: date, clock_in: at.toISOString(), source: 'admin', note: '관리자 출석 체크', ...sched }
    }),
  )
  // 한 번에 넣고, 그사이 누가 직접 시작해 겹치면 한 명씩 (겹친 사람만 건너뜀)
  let done = rows
  const { error } = await db().from('attendance').insert(rows)
  if (error) {
    const ok = await Promise.all(rows.map(async (r) => !(await db().from('attendance').insert(r)).error))
    done = rows.filter((_, i) => ok[i])
  }
  if (!done.length) back(path, '근무 시작으로 기록하지 못했어요. 잠시 뒤에 다시 해 주세요.')
  const atOf = new Map(done.map((r) => [r.user_id, kstTime(r.clock_in)]))
  await audit(admin.id, 'attendance.bulk_in', null, `${date} ${done.length}명${atStart ? ' (근무 시작 시각으로)' : ''}`, admin.companyId)
  await tellWorkers([...atOf.keys()], {
    senderId: admin.id,
    companyId: admin.companyId,
    jobId,
    title: '✅ 출근 처리됐어요',
    text: (uid) => `${job.title} · 담당자가 출석을 확인하고 ${atOf.get(uid)} 근무 시작으로 기록했어요. 일이 끝나면 앱에서 '근무 종료'를 눌러 주세요.`,
    tag: `clockin-${jobId}`,
  })
  revalidatePath(`/admin/jobs/${jobId}`)
  const skipped = ids.length - done.length
  back(path, `${done.length}명 근무 시작으로 기록했어요.${skipped ? ` (이미 시작했거나 이날 근무가 아닌 ${skipped}명은 건너뜀)` : ''}`)
}

/**
 * 출석 체크에서 고른 '근무 중'인 사람들만 한 번에 근무 종료.
 * 시각은 미종료 일괄 종료와 같게: 그 사람의 종료 시각(연장에 동의했으면 그 시각)이 지났으면 그 시각, 아니면 지금. 근무자에게 알림
 */
export async function bulkClockOutPicked(jobId: string, date: string, form: FormData) {
  const admin = await requireAdmin()
  const job = isDate(date) ? await companyJob(admin, jobId) : null
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=att&date=${date}&view=check`
  if (date > kstDate()) back(path, '아직 오지 않은 날이에요.')
  const ids = pickedIds(form)
  if (!ids.length) back(path, '근무를 종료할 사람을 골라 주세요.')
  const open = must(
    await db().from('attendance').select('id, user_id, clock_in, sched_start, sched_end, note').eq('job_id', jobId).eq('work_date', date).is('clock_out', null).in('user_id', ids),
  ) as { id: string; user_id: string; clock_in: string; sched_start: string | null; sched_end: string | null; note: string | null }[]
  if (!open.length) back(path, '고른 사람 중 근무 중인 사람이 없어요.')
  const now = new Date()
  const outOf = new Map<string, string>()
  await Promise.all(
    open.map(async (a) => {
      const end = scheduledEnd(shiftOf(job, a), date)
      const out = end < now ? end : now
      const t = new Date(a.clock_in) < out ? out : now
      const note = [a.note, '관리자 일괄 종료'].filter(Boolean).join(' · ').slice(0, 300)
      const { error } = await db().from('attendance').update({ clock_out: t.toISOString(), note }).eq('id', a.id).is('clock_out', null)
      if (!error) outOf.set(a.user_id, kstTime(t))
    }),
  )
  await audit(admin.id, 'attendance.bulk_out', null, `${date} ${outOf.size}명`, admin.companyId)
  await tellWorkers([...outOf.keys()], {
    senderId: admin.id,
    companyId: admin.companyId,
    jobId,
    title: '🏁 근무 종료로 기록했어요',
    text: (uid) => `${job.title} · 담당자가 ${outOf.get(uid)} 근무 종료로 기록했어요. 시각이 다르면 앱에서 기록 정정을 요청해 주세요.`,
    tag: `clockout-${jobId}`,
  })
  const finished = outOf.size > 0 && (await finishIfAllOut(jobId, date))
  // 고르지 않은 사람 중 종료 시각이 지났는데 아직 근무 중인 사람에게 '근무 종료를 눌러 주세요'
  if (!finished && outOf.size > 0) after(() => remindOthersToClockOut(jobId, date, null).then(() => null, () => null))
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, `${outOf.size}명 근무 종료로 기록했어요.${finished ? FINISHED_NOTE : ''}`)
}

export async function confirmDay(jobId: string, date: string) {
  const admin = await requireAdmin()
  if (!isDate(date) || !(await companyJob(admin, jobId))) return
  must(
    await db().from('attendance').update({ confirmed: true }).eq('job_id', jobId).eq('work_date', date).not('clock_out', 'is', null),
  )
  revalidatePath(`/admin/jobs/${jobId}`)
  back(`/admin/jobs/${jobId}?tab=att&date=${date}`, '퇴근 기록이 있는 근무를 모두 확정했습니다.')
}

/** 지급 완료로 바꾼 근무자에게 이 공고 실지급액과 함께 알림 (급여 들어왔는지 묻지 않아도 되게) */
async function tellPaid(adminId: string, jobId: string, userIds: string[]) {
  const job = userIds.length ? await getJob(jobId) : null
  if (!job) return
  // 주휴수당까지 넣은 실지급액 (정산 탭과 같은 금액)
  const rows = await withWeeklyPay(
    must(await db().from('attendance').select('*').eq('job_id', jobId).in('user_id', userIds).not('clock_out', 'is', null)) as Attendance[],
    job.company_id,
  )
  const net = new Map(userIds.map((u) => [u, settle(job, rows.filter((r) => r.user_id === u).map((r) => calcDay(job, r))).net]))
  await tellWorkers(userIds, {
    senderId: adminId,
    companyId: job.company_id,
    jobId,
    title: SIGNAL.paid,
    text: (uid) => {
      const n = net.get(uid) ?? 0
      return `${job.title} 급여${n > 0 ? ` ${n.toLocaleString()}원(세금 뗀 실지급액)` : ''}을 등록한 계좌로 보냈어요. '근무 내역'에서 명세서를 볼 수 있어요.`
    },
    url: '/me/history',
    tag: `paid-${jobId}`,
  })
}

export async function setPaid(jobId: string, userId: string, paid: boolean) {
  const admin = await requireAdmin()
  if (!isUuid(userId) || !(await companyJob(admin, jobId))) return
  // 이번에 새로 지급 완료가 되는 근무가 있을 때만 알림 (눌렀다 풀었다 해도 한 번만)
  const { count: newlyPaid } = paid
    ? await db()
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('user_id', userId)
        .eq('paid', false)
        .not('clock_out', 'is', null)
    : { count: 0 }
  must(
    await db()
      .from('attendance')
      .update({ paid, paid_at: paid ? new Date().toISOString() : null, ...(paid ? { confirmed: true } : {}) })
      .eq('job_id', jobId)
      .eq('user_id', userId)
      .not('clock_out', 'is', null),
  )
  await audit(admin.id, paid ? 'pay.mark_paid' : 'pay.unmark_paid', userId, jobId, admin.companyId)
  if (newlyPaid) await tellPaid(admin.id, jobId, [userId])
  revalidatePath(`/admin/jobs/${jobId}`)
}

/**
 * 계약 종료 시각 이후 근무(연장) 결정. approve: 근무자가 요청했으면 확정, 아니면 인정 제안(근무자가 확인해야 확정)
 * reject: 인정하지 않음 (계약 종료 시각까지만 계산)
 */
export async function decideOvertime(attendanceId: string, decision: 'approve' | 'reject') {
  const admin = await requireAdmin()
  if (!isUuid(attendanceId) || !['approve', 'reject'].includes(decision)) return
  const { data } = await db().from('attendance').select('*, job:jobs(*)').eq('id', attendanceId).maybeSingle()
  const att = data as (Attendance & { job: Job | null }) | null
  if (!att || !att.job || att.paid || att.company_id !== admin.companyId) return
  const { afterMin } = calcDay(att.job, att)
  if (afterMin < OT_ASK_MIN) return
  const patch =
    decision === 'reject'
      ? { ot_by: 'admin', ot_status: 'rejected' }
      : att.ot_status === 'pending' && att.ot_by === 'worker'
        ? { ot_status: 'agreed' }
        : { ot_minutes: afterMin, ot_by: 'admin', ot_status: 'pending' }
  must(await db().from('attendance').update(patch).eq('id', attendanceId))
  await audit(admin.id, `overtime.${decision}`, att.user_id, `${att.work_date} ${afterMin}분`, admin.companyId)
  const msg =
    decision === 'reject'
      ? '담당자가 계약 시간 이후 근무를 인정하지 않았어요.'
      : patch.ot_status === 'agreed'
        ? '연장 근무가 확정돼 급여에 들어갔어요.'
        : '담당자가 연장 근무를 인정했어요. 맞으면 앱에서 확인해 주세요.'
  after(() => sendPush([att.user_id], { title: '⏱ 연장 근무', body: msg, url: '/me', tag: `ot-${attendanceId}` }))
  revalidatePath(`/admin/jobs/${att.job_id}`)
}

/**
 * 근무자에게 할 일 알림 (각자 문의함 + 휴대폰 알림). 받을 사람은 서버에서 다시 셈
 * sign: 서명 안 한 서류가 있는 사람 / clockin: 그날 근무인데 출근 기록 없음 / clockout: 근무 종료를 안 누름
 */
export async function nudgeWorkers(jobId: string, kind: 'sign' | 'clockin' | 'clockout' | 'account' | 'contract', date: string | null) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job || !['sign', 'clockin', 'clockout', 'account', 'contract'].includes(kind)) return
  if ((kind === 'clockin' || kind === 'clockout') && (!date || !isDate(date))) return
  let to: string[] = []
  if (kind === 'contract') {
    // 종이·다른 서비스로 받는 근로계약서를 아직 안 받은 확정자
    const rows = must(
      await db().from('applications').select('user_id, contract_received_at').eq('job_id', jobId).eq('status', 'approved'),
    ) as { user_id: string; contract_received_at: string | null }[]
    to = job.contract_method === 'app' ? [] : rows.filter((r) => !r.contract_received_at).map((r) => r.user_id)
  } else if (kind === 'account') {
    // 이 행사에서 일한 사람 중 계좌가 없는 사람 (정산 탭의 '계좌 미등록'과 같은 기준)
    const atts = must(await db().from('attendance').select('user_id').eq('job_id', jobId)) as { user_id: string }[]
    const ids = [...new Set(atts.map((r) => r.user_id))]
    if (ids.length) {
      const rows = must(await db().from('users').select('id').in('id', ids).is('bank_account_enc', null)) as { id: string }[]
      to = rows.map((r) => r.id)
    }
  } else if (kind === 'sign') {
    const rows = must(await db().from('signed_docs').select('user_id').eq('job_id', jobId).eq('status', 'pending')) as { user_id: string }[]
    to = rows.map((r) => r.user_id)
  } else {
    const atts = must(await db().from('attendance').select('user_id, clock_out').eq('job_id', jobId).eq('work_date', date!)) as {
      user_id: string
      clock_out: string | null
    }[]
    if (kind === 'clockout') to = atts.filter((a) => !a.clock_out).map((a) => a.user_id)
    else {
      const came = new Set(atts.map((a) => a.user_id))
      const apps = must(await db().from('applications').select('user_id, available_dates').eq('job_id', jobId).eq('status', 'approved')) as {
        user_id: string
        available_dates: string[] | null
      }[]
      // 늦는다고 알렸거나 출근 확인을 요청한 사람은 빼고
      const told = new Set(
        (
          must(
            await db()
              .from('messages')
              .select('thread_user_id, body, created_at')
              .eq('job_id', jobId)
              .eq('from_admin', false)
              .gte('created_at', kstAt(date!, '00:00').toISOString())
              .limit(500),
          ) as { thread_user_id: string; body: string; created_at: string }[]
        )
          .filter((m) => kstDate(m.created_at) === date && ['late', 'arrive'].includes(signalOf(m.body) ?? ''))
          .map((m) => m.thread_user_id),
      )
      to = apps
        .filter((a) => (!a.available_dates || a.available_dates.includes(date!)) && !came.has(a.user_id) && !told.has(a.user_id))
        .map((a) => a.user_id)
    }
  }
  to = [...new Set(to)]
  const backTo =
    kind === 'sign' || kind === 'contract'
      ? `/admin/jobs/${jobId}?tab=docs`
      : kind === 'account'
        ? `/admin/jobs/${jobId}?tab=pay`
        : `/admin/jobs/${jobId}?tab=att&date=${date}`
  if (!to.length) redirect(`${backTo}&m=${encodeURIComponent('알릴 사람이 없어요.')}`)
  const [title, text] = {
    sign: ['✍️ 서류 서명 요청', `${job.title} ${job.audience === 'expert' ? '시작' : '근무'} 전에 앱 '${myWorkTab(job.audience)}'에서 서류에 서명해 주세요. 서명해야 근무 시작 버튼이 열려요.`],
    clockin: ['⏰ 출근 확인', `${job.title} · 근무 시작 시각(${hhmm(job.start_time)})이 지났어요. 현장에 도착했으면 앱에서 '근무 시작'을 눌러 주세요.`],
    clockout: ['🏁 근무 종료 확인', `${job.title} · 일이 끝났으면 앱에서 '근무 종료'를 눌러 주세요. 계약 시간 이후는 서로 확인한 뒤에만 급여에 들어가요.`],
    account: [SIGNAL.account, `${job.title} 급여를 보내 드리려면 계좌가 필요해요. 앱 '내 정보'에서 은행·계좌번호·예금주를 등록해 주세요.`],
    contract: [
      `📝 ${contractNameOf(job.audience)} 작성 안내`,
      job.contract_method === 'paper'
        ? `${job.title} ${contractNameOf(job.audience)}는 종이로 작성해요. ${job.audience === 'expert' ? '시작' : '근무 시작'} 전에 현장 담당자에게 받아 서명해 주세요.`
        : `${job.title} ${contractNameOf(job.audience)}는 전자계약(모두싸인 등)으로 받아요. ${job.contract_url ? `아래 링크에서 서명해 주세요.\n${job.contract_url}` : '문자·카카오톡으로 온 서명 링크를 확인해 서명해 주세요.'}`,
    ],
  }[kind]
  must(
    await db()
      .from('messages')
      .insert(to.map((uid) => ({ thread_user_id: uid, sender_id: admin.id, from_admin: true, company_id: job.company_id, job_id: jobId, body: `${title}\n${text}` }))),
  )
  await audit(admin.id, `nudge.${kind}`, null, `${jobId} ${date ?? ''} ${to.length}명`, admin.companyId)
  after(() => sendPush(to, { title, body: text, url: kind === 'account' ? '/me/profile' : '/me', tag: `${kind}-${jobId}` }))
  revalidatePath('/admin/chat')
  redirect(`${backTo}&m=${encodeURIComponent(`${to.length}명에게 앱 알림을 보냈어요.`)}`)
}

/**
 * 근무자 화면에서 한 사람에게 계좌 등록 요청 (앱 문의함 + 휴대폰 알림 · 누르면 계좌번호 칸으로).
 * 우리 회사에 지원한 사람에게만 (정산 탭의 '계좌 등록 요청'과 같은 문구)
 */
export async function requestAccount(userId: string) {
  const admin = await requireAdmin()
  if (!isUuid(userId) || !(await workerInCompany(admin.companyId, userId))) return
  const back = `/admin/workers/${userId}`
  const u = must(await db().from('users').select('id, bank_account_enc').eq('id', userId).maybeSingle()) as {
    id: string
    bank_account_enc: string | null
  } | null
  if (!u) return
  if (u.bank_account_enc) redirect(`${back}?m=${encodeURIComponent('이미 계좌가 등록돼 있어요.')}`)
  if (await overLimit(`account-ask:${admin.id}`, 60, 3600)) redirect(`${back}?m=${encodeURIComponent('요청을 너무 자주 보냈어요. 잠시 뒤에 다시 보내 주세요.')}`)
  const text = `급여를 보내 드리려면 계좌가 필요해요. 앱 '내 정보'에서 은행·계좌번호·예금주를 등록해 주세요.`
  must(
    await db()
      .from('messages')
      .insert({ thread_user_id: userId, sender_id: admin.id, from_admin: true, company_id: admin.companyId, job_id: null, body: `${SIGNAL.account}\n${text}` }),
  )
  await audit(admin.id, 'nudge.account', userId, '1명', admin.companyId)
  after(() => sendPush([userId], { title: SIGNAL.account, body: text, url: '/me/profile#bank_account', tag: `account-${userId}` }))
  revalidatePath('/admin/chat')
  redirect(`${back}?m=${encodeURIComponent('계좌 등록 요청을 보냈어요.')}`)
}

/**
 * 은행 앱으로 이체할 목록 (미지급 근무자의 은행·계좌·예금주·실지급액). 화면에는 계좌를 가려 두고,
 * 누를 때만 서버에서 꺼내 복사하며 기록을 남김
 */
export async function transferList(jobId: string): Promise<{ ok?: string; error?: string; n?: number }> {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return { error: '공고를 찾을 수 없습니다.' }
  if (await overLimit(`export:${admin.id}`, 30, 3600)) return { error: '내려받기가 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.' }
  // 이체 금액도 주휴수당까지 (정산 탭과 같은 금액)
  const rows = await withWeeklyPay(
    must(await db().from('attendance').select('*').eq('job_id', jobId).eq('paid', false).not('clock_out', 'is', null)) as Attendance[],
    job.company_id,
  )
  const ids = [...new Set(rows.map((r) => r.user_id))]
  if (!ids.length) return { error: '지급할 근무가 없어요.' }
  const users = must(await db().from('users').select('id, name, bank_name, bank_account_enc, account_holder').in('id', ids)) as {
    id: string
    name: string
    bank_name: string | null
    bank_account_enc: string | null
    account_holder: string | null
  }[]
  const lines = users
    .map((u) => {
      const net = settle(job, rows.filter((r) => r.user_id === u.id).map((r) => calcDay(job, r))).net
      const acc = decrypt(u.bank_account_enc)
      // 칸(탭)·줄을 바꾸는 글자나 엑셀 수식으로 이체 목록을 조작하지 못하게 한 줄 글자로
      const cell = (v: string) => oneLine(v).replace(/^[=+\-@]/, "'$&")
      return { u, net, line: [cell(u.bank_name ?? '은행 미등록'), cell(acc ?? '계좌 미등록'), cell(u.account_holder || u.name), String(net)].join('\t') }
    })
    .filter((x) => x.net > 0)
    .sort((a, b) => a.u.name.localeCompare(b.u.name, 'ko'))
  if (!lines.length) return { error: '지급할 금액이 없어요.' }
  await audit(admin.id, 'pay.transfer_list', null, `${jobId} ${lines.length}명`, admin.companyId)
  return { ok: ['은행\t계좌번호\t예금주\t금액', ...lines.map((x) => x.line)].join('\n'), n: lines.length }
}

/** 입금을 마친 뒤 한 번에: 이 공고의 퇴근까지 기록된 미지급 근무를 모두 지급 완료로 */
export async function setAllPaid(jobId: string) {
  const admin = await requireAdmin()
  if (!(await companyJob(admin, jobId))) return
  const unpaid = must(
    await db().from('attendance').select('user_id').eq('job_id', jobId).eq('paid', false).not('clock_out', 'is', null),
  ) as { user_id: string }[]
  must(
    await db()
      .from('attendance')
      .update({ paid: true, paid_at: new Date().toISOString(), confirmed: true })
      .eq('job_id', jobId)
      .eq('paid', false)
      .not('clock_out', 'is', null),
  )
  await audit(admin.id, 'pay.mark_paid_all', null, jobId, admin.companyId)
  const paidTo = [...new Set(unpaid.map((r) => r.user_id))]
  await tellPaid(admin.id, jobId, paidTo)
  revalidatePath(`/admin/jobs/${jobId}`)
  if (paidTo.length) back(`/admin/jobs/${jobId}?tab=pay`, `${paidTo.length}명을 지급 완료로 바꾸고 알렸어요.`)
}

// ───────────── 서류 ─────────────

export async function voidDoc(docId: string) {
  const admin = await requireAdmin()
  const doc = await companyRow<{ id: string; job_id: string; user_id: string; status: string; company_id: string }>(admin, 'signed_docs', docId, 'id, job_id, user_id, status')
  if (!doc) return
  if (doc.status === 'pending') must(await db().from('signed_docs').delete().eq('id', docId))
  else must(await db().from('signed_docs').update({ status: 'void' }).eq('id', docId))
  await audit(admin.id, 'doc.void', doc.user_id, docId, admin.companyId)
  revalidatePath(`/admin/jobs/${doc.job_id}`)
}

/** 종이·다른 서비스(모두싸인 등)로 받은 근로계약서를 받았다고 표시하거나 취소 */
export async function setContractReceived(appId: string, received: boolean) {
  const admin = await requireAdmin()
  const app = await companyRow<{ id: string; job_id: string; user_id: string; company_id: string }>(admin, 'applications', appId, 'id, job_id, user_id')
  if (!app) return
  must(await db().from('applications').update({ contract_received_at: received ? new Date().toISOString() : null }).eq('id', appId))
  await audit(admin.id, received ? 'contract.received' : 'contract.unreceived', app.user_id, app.job_id, admin.companyId)
  revalidatePath(`/admin/jobs/${app.job_id}`)
}

/** 무효 처리 후 같은 서식으로 다시 서명 요청 */
export async function rerequestDoc(docId: string) {
  const admin = await requireAdmin()
  const doc = await companyRow<SignedDoc>(admin, 'signed_docs', docId)
  if (!doc || doc.status !== 'signed') return
  must(await db().from('signed_docs').update({ status: 'void' }).eq('id', docId))
  must(
    await db()
      .from('signed_docs')
      .insert({ company_id: doc.company_id, job_id: doc.job_id, user_id: doc.user_id, template_id: doc.template_id, kind: doc.kind, title: doc.title }),
  )
  await audit(admin.id, 'doc.rerequest', doc.user_id, docId, admin.companyId)
  revalidatePath(`/admin/jobs/${doc.job_id}`)
}

export async function saveTemplate(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const title = str(form, 'title', 100)
  const body = str(form, 'body', 20_000).replace(/\r\n?/g, '\n')
  if (!title || !body) return { error: '제목과 내용을 입력해 주세요.' }
  const kind = (['contract', 'service', 'pledge', 'consent', 'other'] as const).find((k) => k === str(form, 'kind')) ?? 'other'
  const row = { title, body, kind, is_default: bool(form, 'is_default'), active: !bool(form, 'inactive') }
  if (id && isUuid(id)) {
    if (!(await companyRow(admin, 'doc_templates', id, 'id'))) return { error: '서식을 찾을 수 없습니다.' }
    must(await db().from('doc_templates').update(row).eq('id', id).eq('company_id', admin.companyId))
  } else {
    const created = must(await db().from('doc_templates').insert({ ...row, company_id: admin.companyId }).select('id').single()) as { id: string }
    id = created.id
  }
  revalidatePath('/admin/docs')
  redirect(`/admin/docs/${id}?m=${encodeURIComponent('저장했습니다. 이미 서명된 서류는 서명 당시 내용 그대로 보관됩니다.')}`)
}

export async function restoreDefaultTemplates() {
  const admin = await requireAdmin()
  const existing = must(await db().from('doc_templates').select('title').eq('company_id', admin.companyId)) as { title: string }[]
  const titles = new Set(existing.map((t) => t.title))
  const missing = DEFAULT_TEMPLATES.filter((t) => !titles.has(t.title))
  if (missing.length) must(await db().from('doc_templates').insert(missing.map((t) => ({ ...t, company_id: admin.companyId }))))
  revalidatePath('/admin/docs')
  back('/admin/docs?tab=tpl', missing.length ? `기본 서식 ${missing.length}개를 추가했습니다.` : '기본 서식이 이미 모두 있습니다.')
}

// ───────────── 근무자 ─────────────

/**
 * 이 회사와 실제로 일하는(확정됐거나 출퇴근 기록이 있는) 근무자 계정인지.
 * 주민번호 보기·비밀번호 초기화처럼 민감한 일은 '지원만 한' 사람이나 관리자·최고 관리자 계정에는 못 하게
 */
async function workingWorker(companyId: string, userId: string, adminToo = false): Promise<{ role: string; is_super: boolean; member_type: string | null } | null> {
  if (!isUuid(userId)) return null
  const [{ data: u }, { count: apps }, { count: atts }, { count: member }] = await Promise.all([
    db().from('users').select('role, is_super, member_type').eq('id', userId).maybeSingle(),
    db().from('applications').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('user_id', userId).eq('status', 'approved'),
    db().from('attendance').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('user_id', userId),
    db().from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', companyId).eq('user_id', userId),
  ])
  const user = u as { role: string; is_super: boolean; member_type: string | null } | null
  // 관리자 계정은 기본으로 안 됨 (비밀번호 초기화 등으로 다른 회사 관리자 계정을 가로채지 못하게).
  // adminToo(주민번호 신고용 열람만): 우리 회사에서 근무자로 일한 다른 회사 관리자 계정까지 — 이 회사 동료 관리자·운영자 계정은 안 됨
  if (!user || user.is_super || ((apps ?? 0) === 0 && (atts ?? 0) === 0)) return null
  if (user.role !== 'worker' && !(adminToo && user.role === 'admin' && (member ?? 0) === 0)) return null
  return user
}

export async function revealRrn(userId: string, _: FormState): Promise<FormState> {
  const admin = await requireAdmin()
  // 근무자 명단 잠금을 푼 관리자만 (명단 화면을 거치지 않은 요청도 막음)
  if (!(await rosterUnlockedFor(admin.id))) return { error: '근무자 명단 잠금이 풀려 있지 않아요. 근무자 화면에서 비밀번호를 넣어 주세요.' }
  // 주민번호는 신고용: 이 회사에서 출퇴근 기록이 있는 근무자만 (지원만 했거나 관리자 계정이면 안 됨)
  const { count: worked } = await db().from('attendance').select('id', { count: 'exact', head: true }).eq('company_id', admin.companyId).eq('user_id', userId)
  if (!(await workingWorker(admin.companyId, userId, true)) || !worked) return { error: '이 회사에서 근무한 기록이 있는 근무자만 볼 수 있어요.' }
  // 관리자 계정이 털려도 주민번호를 한꺼번에 빼 가지 못하게 열람 횟수 제한
  if (await overLimit(`rrn-view:${admin.id}`, 30, 3600)) return { error: '주민등록번호 열람이 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.' }
  const { data } = await db().from('users').select('rrn_enc').eq('id', userId).maybeSingle()
  const rrn = decrypt(data?.rrn_enc)
  if (!rrn) return { error: '등록된 주민등록번호가 없습니다.' }
  await audit(admin.id, 'rrn.view', userId, '관리자 화면 열람', admin.companyId)
  return { ok: formatRrn(rrn) }
}

/** 전체 보기로 볼 수 있는 근무자 정보 (주민번호는 revealRrn) */
export type RevealField = 'phone' | 'address' | 'account' | 'emergency'
const REVEAL_LABEL: Record<RevealField, string> = { phone: '휴대폰 번호', address: '주소', account: '계좌', emergency: '비상연락처' }

/**
 * 보안: 근무자 상세의 휴대폰·주소·계좌·비상연락처는 가려 두고, '전체 보기'를 눌렀을 때만 보여 주며 누가 언제 봤는지 기록.
 * 명단 잠금을 푼 관리자만 · 주소·계좌·비상연락처는 이 회사에 지원한 근무자만 (휴대폰은 확인된 회사면 회원 누구나) · 열람 횟수 제한
 */
export async function revealWorkerField(userId: string, field: RevealField): Promise<{ ok?: string; error?: string }> {
  const admin = await requireAdmin()
  if (!isUuid(userId) || !(field in REVEAL_LABEL)) return { error: '잘못된 요청입니다.' }
  if (!(await rosterUnlockedFor(admin.id))) return { error: '근무자 명단 잠금이 풀려 있지 않아요. 근무자 화면에서 비밀번호를 넣어 주세요.' }
  const related = await workerInCompany(admin.companyId, userId)
  if (field === 'phone' ? !related && !admin.companyVerified : !related) return { error: '이 회사에 지원한 근무자만 볼 수 있어요.' }
  if (await overLimit(`contact-view:${admin.id}`, 120, 3600)) return { error: '열람이 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.' }
  const { data } = await db().from('users').select('name, phone, address, bank_name, bank_account_enc, account_holder, emergency_phone').eq('id', userId).maybeSingle()
  const u = data as { name: string; phone: string; address: string | null; bank_name: string | null; bank_account_enc: string | null; account_holder: string | null; emergency_phone: string | null } | null
  if (!u) return { error: '근무자를 찾을 수 없어요.' }
  let value: string | null = null
  if (field === 'phone') value = phoneFmt(u.phone)
  else if (field === 'address') value = u.address
  else if (field === 'emergency') value = u.emergency_phone ? phoneFmt(u.emergency_phone) : null
  else {
    const acc = decrypt(u.bank_account_enc)
    value = acc ? `${u.bank_name ?? ''} ${acc} (예금주 ${u.account_holder ?? u.name})`.trim() : null
  }
  if (!value) return { error: `등록된 ${REVEAL_LABEL[field]}가 없어요.` }
  await audit(admin.id, `${field}.view`, userId, `관리자 화면 열람 · ${REVEAL_LABEL[field]}`, admin.companyId)
  return { ok: value }
}

export async function resetPin(userId: string, _: FormState): Promise<FormState> {
  const admin = await requireAdmin()
  // 계정 가로채기 막기: 확인된 회사만, 이 회사에 확정됐거나 일한 '근무자' 계정만 (관리자·최고 관리자 계정은 최고 관리자만)
  if (!admin.isSuper) {
    if (!admin.companyVerified) return { error: '회사 확인을 마치면 비밀번호를 초기화할 수 있어요.' }
    if (!(await workingWorker(admin.companyId, userId))) return { error: '이 회사에 확정됐거나 근무한 근무자만 초기화할 수 있어요.' }
  } else if (userId === admin.id) {
    return { error: '내 비밀번호는 내 정보에서 바꿔 주세요.' }
  }
  const { data } = await db().from('users').select('session_version').eq('id', userId).maybeSingle()
  if (!data) return { error: '근무자를 찾을 수 없습니다.' }
  // 임시 비밀번호도 추측하기 쉬운 번호는 피함
  let temp = String(randomInt(0, 1_000_000)).padStart(6, '0')
  while (weakPin(temp)) temp = String(randomInt(0, 1_000_000)).padStart(6, '0')
  must(
    await db()
      .from('users')
      .update({ pin_hash: await hashPin(temp), session_version: data.session_version + 1, failed_logins: 0, locked_until: null })
      .eq('id', userId),
  )
  await audit(admin.id, 'pin.reset', userId, null, admin.companyId)
  return { ok: temp }
}

/**
 * 근무자 정보 고치기 (이 회사에 지원한 근무자만). 근무자 계정은 모든 회사 공용이라
 * · 관리자 체크 = 이 회사의 관리자로 추가/해제 (다른 회사 소속은 그대로)
 * · 메모 = 이 회사에만 보이는 메모
 * · 계정 정지는 모든 회사에 영향을 주므로 최고 관리자만
 */
export async function updateWorker(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!(await workerInCompany(admin.companyId, userId))) return { error: '이 회사에 지원한 근무자가 아닙니다.' }
  const name = line(form, 'name', 30)
  const { data: cur } = await db().from('users').select('role, active, is_super, name, phone, session_version').eq('id', userId).maybeSingle()
  if (!cur) return { error: '근무자를 찾을 수 없습니다.' }
  // 휴대폰 칸은 최고 관리자에게만 보냄 (다른 관리자 화면에는 가린 번호만) → 칸이 없으면 지금 번호 그대로
  const phoneIn = form.has('phone') ? str(form, 'phone') : null
  const phone = phoneIn === null ? cur.phone : normalizePhone(phoneIn)
  if (name.length < 2 || !phone) return { error: '이름과 휴대폰 번호를 확인해 주세요.' }
  const { data: dup } = await db().from('users').select('id').eq('phone', phone).neq('id', userId).maybeSingle()
  if (dup) return { error: '다른 계정이 쓰는 휴대폰 번호입니다.' }
  const makeAdmin = str(form, 'role') === 'admin'
  if (userId === admin.id && !makeAdmin) return { error: '자기 자신의 관리자 권한은 해제할 수 없습니다.' }
  if (cur.is_super && !makeAdmin) return { error: '최고 관리자의 관리자 권한은 해제할 수 없습니다.' }
  // 계정은 모든 회사 공용: 최고 관리자가 아니면 관리자·최고 관리자 계정은 못 고치고, 로그인 번호(휴대폰)는 바꿀 수 없음
  if (!admin.isSuper) {
    const nameChanged = name !== oneLine(cur.name ?? '')
    if ((cur.is_super || cur.role === 'admin') && userId !== admin.id) {
      if (nameChanged || phone !== cur.phone) return { error: '관리자 계정의 이름·번호는 최고 관리자만 바꿀 수 있어요.' }
    }
    if (phone !== cur.phone) return { error: '휴대폰 번호(로그인 번호)는 본인이 내 정보에서 바꾸거나 최고 관리자에게 요청해 주세요.' }
    if (nameChanged && !admin.companyVerified) return { error: '회사 확인을 마치면 이름을 고칠 수 있어요.' }
  }
  // 이 회사 관리자 추가·해제: 최고 관리자나 확인된 회사의 대표 관리자만 (일반 관리자는 그대로 둠)
  const canGrant = admin.isSuper || (admin.companyVerified && admin.companies.find((c) => c.id === admin.companyId)?.role === 'owner')
  const { data: curMember } = await db().from('company_members').select('role').eq('company_id', admin.companyId).eq('user_id', userId).maybeSingle()
  if (!canGrant && makeAdmin !== !!curMember) return { error: '관리자 추가·해제는 대표 관리자만 할 수 있어요.' }
  if (!canGrant) {
    // 권한 변경 없음
  } else if (makeAdmin) {
    if (!curMember) must(await db().from('company_members').insert({ company_id: admin.companyId, user_id: userId, role: 'admin' }))
  } else if (curMember) {
    must(await db().from('company_members').delete().eq('company_id', admin.companyId).eq('user_id', userId))
  }
  const { count: left } = await db().from('company_members').select('user_id', { count: 'exact', head: true }).eq('user_id', userId)
  const role = makeAdmin || (left ?? 0) > 0 || cur.is_super ? 'admin' : 'worker'
  must(
    await db()
      .from('users')
      // 권한이 바뀌면 다시 로그인하게 (근무자 로그인 30일이 관리자 권한으로 이어지지 않게)
      .update({ name, phone, role, ...(role !== cur.role ? { session_version: cur.session_version + 1 } : {}), ...(admin.isSuper ? { active: !bool(form, 'inactive') } : {}) })
      .eq('id', userId),
  )
  // 이 회사에만 보이는 메모
  must(
    await db()
      .from('company_worker_notes')
      .upsert({ company_id: admin.companyId, user_id: userId, memo: optStr(form, 'admin_memo', 1000), updated_at: new Date().toISOString() }, { onConflict: 'company_id,user_id' }),
  )
  await audit(admin.id, 'user.edit', userId, makeAdmin ? 'admin' : 'worker', admin.companyId)
  revalidatePath(`/admin/workers/${userId}`)
  return { ok: '저장했습니다.' }
}

// ───────────── 회사 설정 ─────────────

const SEAL_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export async function saveSettings(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const company_name = line(form, 'company_name', 100)
  if (!company_name) return { error: '상호를 입력해 주세요.' }
  const update: Record<string, unknown> = {
    company_name,
    ceo_name: optLine(form, 'ceo_name', 30),
    business_no: optStr(form, 'business_no', 20),
    company_address: optStr(form, 'company_address', 200),
    company_phone: optStr(form, 'company_phone', 30),
    contact_name: optLine(form, 'contact_name', 30),
    contact_phone: normalizePhone(str(form, 'contact_phone')) ?? optStr(form, 'contact_phone', 20),
    default_hourly_wage: Math.max(MIN_WAGE_2026, int(form, 'default_hourly_wage', MIN_WAGE_2026)),
    workplace_5plus: bool(form, 'workplace_5plus'),
  }
  // 화면에서 줄여 보낸 직인 (data URL). 예전 방식(파일 그대로)도 받음
  const sealData = str(form, 'seal_data', 600_000)
  const seal = form.get('seal')
  if (sealData) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(sealData)) return { error: '직인 이미지를 다시 골라 주세요.' }
    if (sealData.length > 560_000) return { error: '직인 이미지가 너무 커요. 다른 사진으로 골라 주세요.' }
    update.seal_image = sealData
  } else if (seal instanceof File && seal.size > 0) {
    if (!SEAL_TYPES.includes(seal.type)) return { error: '직인은 PNG·JPG·WEBP 이미지로 올려 주세요.' }
    if (seal.size > 400_000) return { error: '직인 이미지는 400KB 이하로 올려 주세요.' }
    update.seal_image = `data:${seal.type};base64,${Buffer.from(await seal.arrayBuffer()).toString('base64')}`
  } else if (bool(form, 'remove_seal')) {
    update.seal_image = null
  }
  must(await db().from('companies').update(update).eq('id', admin.companyId))
  await audit(admin.id, 'company.settings', null, company_name, admin.companyId)
  revalidatePath('/admin/settings')
  return { ok: '저장했습니다.' }
}

// ───────────── 관리자 평점 (근무자에게는 보이지 않음) ─────────────

const SCORE_RANGE = (n: number) => n >= 1 && n <= 5

/** 출퇴근 화면에서 별 하나 눌러 바로 매기기 (같은 공고·같은 관리자는 다시 누르면 바뀜, 메모는 그대로) */
export async function rateQuick(userId: string, jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const score = int(form, 'score', 0)
  if (!isUuid(userId) || !SCORE_RANGE(score) || !(await companyJob(admin, jobId))) return
  // 이 공고에 지원했거나 일한 사람만 평가
  const [{ count: a1 }, { count: a2 }] = await Promise.all([
    db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('user_id', userId),
    db().from('attendance').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('user_id', userId),
  ])
  if (!a1 && !a2) return
  must(
    await db()
      .from('worker_ratings')
      .upsert({ company_id: admin.companyId, user_id: userId, job_id: jobId, rater_id: admin.id, score }, { onConflict: 'user_id,job_id,rater_id' }),
  )
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath(`/admin/workers/${userId}`)
}

/** 근무자 정보 화면에서 별점·메모 저장 (공고를 고르지 않으면 일반 메모로 새로 추가) */
export async function rateWorker(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!(await workerInCompany(admin.companyId, userId))) return { error: '이 회사에 지원한 근무자가 아닙니다.' }
  const score = int(form, 'score', 0)
  if (!SCORE_RANGE(score)) return { error: '별점을 골라 주세요.' }
  const jobId = str(form, 'job_id')
  const job = jobId ? await companyJob(admin, jobId) : null
  if (jobId && !job) return { error: '공고를 찾을 수 없습니다.' }
  must(
    await db()
      .from('worker_ratings')
      .upsert(
        { company_id: admin.companyId, user_id: userId, job_id: job?.id ?? null, rater_id: admin.id, score, comment: optStr(form, 'comment', 500) },
        { onConflict: 'user_id,job_id,rater_id' },
      ),
  )
  revalidatePath(`/admin/workers/${userId}`)
  return { ok: '평가를 저장했습니다.' }
}

/** 내가 쓴 평가만 지울 수 있음 */
export async function deleteRating(ratingId: string, userId: string) {
  const admin = await requireAdmin()
  if (!isUuid(ratingId)) return
  must(await db().from('worker_ratings').delete().eq('id', ratingId).eq('rater_id', admin.id).eq('company_id', admin.companyId))
  revalidatePath(`/admin/workers/${userId}`)
}

/** 확정 근무자의 현장 배치 (빈칸이면 미배치) */
export async function setPosition(appId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(appId)) return { error: '잘못된 요청입니다.' }
  const position = str(form, 'position', 30) || null
  const app = must(await db().from('applications').update({ position }).eq('id', appId).eq('company_id', admin.companyId).select('job_id').maybeSingle()) as {
    job_id: string
  } | null
  if (!app) return { error: '지원 내역을 찾을 수 없습니다.' }
  revalidatePath(`/admin/jobs/${app.job_id}`)
  return { ok: position ? '배치했어요' : '배치를 비웠어요' }
}
