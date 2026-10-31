'use server'

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { decrypt, hashPin } from '@/lib/crypto'
import { audit, ensurePendingDocs, getJob, releaseDocs } from '@/lib/data'
import { db, must } from '@/lib/db'
import { DEFAULT_TEMPLATES } from '@/lib/default-templates'
import { scheduleSummary, wageText } from '@/lib/docs'
import { hiddenFromForm } from '@/lib/jobFields'
import { calcDay, estimateDay, MIN_WAGE_2026, OT_ASK_MIN, scheduledEnd, settle, shiftOf } from '@/lib/pay'
import { tellWorkers } from '@/lib/notify'
import { overLimit } from '@/lib/ratelimit'
import { sendPush } from '@/lib/push'
import { agreedShiftFor, applyAgreedShift, freezeAttendance, requestShiftChange } from '@/lib/shift'
import { DISMISS_NOTE, DISMISS_REASONS, SIGNAL, signalOf } from '@/lib/signals'
import { requireAdmin } from '@/lib/session'
import { dateList, fmtDateRange, fromKstInput, hhmm, kstAt, kstDate, kstTime } from '@/lib/time'
import type { Attendance, Job, JobCondition, ShiftChange } from '@/lib/types'
import {
  bool,
  formatRrn,
  int,
  isDate,
  isTime,
  isUuid,
  normalizePhone,
  optStr,
  str,
  weakPin,
} from '@/lib/validate'
import type { FormState } from './auth'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// ───────────── 공고 ─────────────

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

function parseJob(form: FormData): { row?: Omit<Job, 'id' | 'created_at'>; error?: string } {
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
  const tax_type = (['daily', 'business', 'none'] as const).find((m) => m === str(form, 'tax_type')) ?? 'daily'
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
    address: optStr(form, 'address', 200),
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
    employment_insurance: bool(form, 'employment_insurance'),
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
  } satisfies Omit<Job, 'id' | 'created_at'>

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
  let id = jobId
  let note = ''
  if (id) {
    if (!isUuid(id)) return { error: '잘못된 요청입니다.' }
    const before = await getJob(id)
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
          jobId: id,
          title: SIGNAL.change,
          text: `${job.title}의 내용이 바뀌었어요.\n${changes.join('\n')}\n${timeChanged ? "확정된 분은 앱 '내 근무'에서 계속 근무할지 알려 주세요." : '못 오게 되면 앱에서 담당자에게 알려 주세요.'}`,
          url: `/jobs/${id}`,
          tag: `change-${id}`,
        },
      )
      await audit(admin.id, 'job.change_notice', null, `${id} ${n}명 ${changes.map((c) => c.split(':')[0]).join(',')}`)
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
    const created = must(await db().from('jobs').insert({ ...row, created_by: admin.id }).select('id').single()) as { id: string }
    id = created.id
  }
  revalidatePath('/admin/jobs')
  revalidatePath('/')
  redirect(`/admin/jobs/${id}?m=${encodeURIComponent(`저장했습니다.${note}`)}`)
}

export async function setJobStatus(jobId: string, status: Job['status']) {
  await requireAdmin()
  if (!isUuid(jobId) || !['draft', 'open', 'closed', 'done'].includes(status)) return
  // 취소한 행사는 되돌리지 않음 (지원이 모두 취소됨 → 복사해서 새 공고로)
  must(await db().from('jobs').update({ status }).eq('id', jobId).neq('status', 'cancelled'))
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/')
}

export async function duplicateJob(jobId: string) {
  const admin = await requireAdmin()
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job) back('/admin/jobs', '공고를 찾을 수 없습니다.')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, ...rest } = job as Job & { updated_at?: string }
  const created = must(
    await db()
      .from('jobs')
      .insert({ ...rest, title: `${job.title} (복사)`, status: 'draft', created_by: admin.id })
      .select('id')
      .single(),
  ) as { id: string }
  redirect(`/admin/jobs/${created.id}/edit?m=${encodeURIComponent('복사본을 만들었습니다. 날짜를 바꾸고 공개로 저장하세요.')}`)
}

export async function deleteJob(jobId: string) {
  const admin = await requireAdmin()
  if (!isUuid(jobId)) return
  const [{ count: atts }, { count: signed }] = await Promise.all([
    db().from('attendance').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
    db().from('signed_docs').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('status', 'signed'),
  ])
  if (atts || signed) {
    back(`/admin/jobs/${jobId}`, '근무 기록이나 서명된 서류가 있어 삭제할 수 없습니다. 상태를 "종료"로 바꿔 주세요.')
  }
  must(await db().from('jobs').delete().eq('id', jobId))
  await audit(admin.id, 'job.delete', null, jobId)
  revalidatePath('/admin/jobs')
  back('/admin/jobs', '공고를 삭제했습니다.')
}

/**
 * 행사 취소 (우천·주최측 사정 등): 공고를 '행사 취소'로, 확정·대기 지원을 모두 취소하고 서명 대기 서류를 지움.
 * 확정자·지원자 각자에게 사유와 함께 알림. 이미 근무 기록이 있으면 (행사 도중) 종료로 처리하도록 막음
 */
export async function cancelEvent(jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const job = isUuid(jobId) ? await getJob(jobId) : null
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
  must(await db().from('jobs').update({ status: 'cancelled' }).eq('id', jobId))
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
      jobId,
      title: SIGNAL.cancel,
      text: `${job.title} (${fmtDateRange(job.start_date, job.end_date)} ${hhmm(job.start_time)}) 행사가 취소됐어요.\n사유: ${reason}\n지원·확정은 모두 취소 처리됐어요. 불편을 드려 죄송합니다.`,
      url: '/me/chat',
      tag: `cancel-${jobId}`,
    },
  )
  await audit(admin.id, 'job.cancel', null, `${jobId} ${n}명 ${reason}`.slice(0, 500))
  revalidatePath('/admin/jobs')
  revalidatePath('/admin')
  revalidatePath('/')
  back(path, `행사를 취소했어요.${n ? ` 확정·지원자 ${n}명에게 알렸어요.` : ''}`)
}

// ───────────── 지원자 ─────────────

/** 근무 확정 알림 (서류가 있으면 서명 안내) */
function approvedPush(job: Job) {
  return {
    title: '✅ 근무가 확정됐어요',
    body: `${job.title} · ${scheduleSummary(job)}${job.required_docs.length ? ' · 앱에서 서류에 서명해 주세요' : ''}`,
    url: '/me',
    tag: `approved-${job.id}`,
  }
}

export async function decideApplication(appId: string, status: 'approved' | 'rejected' | 'applied') {
  const admin = await requireAdmin()
  if (!isUuid(appId) || !['approved', 'rejected', 'applied'].includes(status)) return
  const { data: app } = await db().from('applications').select('id, job_id, user_id').eq('id', appId).maybeSingle()
  if (!app) return
  must(
    await db()
      .from('applications')
      .update({ status, decided_at: status === 'applied' ? null : new Date().toISOString() })
      .eq('id', appId),
  )
  if (status === 'approved') {
    const job = await getJob(app.job_id)
    if (job) {
      await ensurePendingDocs(job, app.user_id)
      after(() => sendPush([app.user_id], approvedPush(job)))
    }
  } else {
    // 되돌리면(대기로·미선발) 서명 대기 서류는 지우고, 이미 서명한 서류도 무효로 (다시 확정하면 새로 서명)
    const voided = await releaseDocs(app.job_id, app.user_id)
    if (voided) await audit(admin.id, 'doc.void_on_revert', app.user_id, `${app.job_id} ${voided}건`)
  }
  revalidatePath(`/admin/jobs/${app.job_id}`)
  revalidatePath('/admin')
}

export async function approveAllApplied(jobId: string) {
  await requireAdmin()
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job) return
  const apps = must(
    await db().from('applications').select('id, user_id').eq('job_id', jobId).eq('status', 'applied'),
  ) as { id: string; user_id: string }[]
  if (!apps.length) return
  must(
    await db()
      .from('applications')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .in('id', apps.map((a) => a.id)),
  )
  for (const a of apps) await ensurePendingDocs(job, a.user_id)
  after(() => sendPush(apps.map((a) => a.user_id), approvedPush(job)))
  revalidatePath(`/admin/jobs/${jobId}`)
}

export async function addWorkerToJob(jobId: string, form: FormData) {
  await requireAdmin()
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job) return
  const path = `/admin/jobs/${jobId}?tab=apps`
  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) back(path, '휴대폰 번호를 확인해 주세요.')
  const { data: u } = await db().from('users').select('id, name, active').eq('phone', phone).maybeSingle()
  if (!u || !u.active) back(path, '가입된 근무자가 아닙니다. 먼저 앱에서 가입하도록 안내해 주세요.')
  must(
    await db()
      .from('applications')
      .upsert(
        { job_id: jobId, user_id: u.id, status: 'approved', decided_at: new Date().toISOString(), admin_memo: '관리자 직접 추가' },
        { onConflict: 'job_id,user_id' },
      ),
  )
  await ensurePendingDocs(job, u.id)
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, `${u.name}님을 확정 인원에 추가했습니다.`)
}

// ───────────── 출퇴근 ─────────────

export async function saveAttendance(attId: string, form: FormData) {
  const admin = await requireAdmin()
  if (!isUuid(attId)) return
  const { data: att } = await db()
    .from('attendance')
    .select('id, job_id, user_id, work_date, clock_in, clock_out')
    .eq('id', attId)
    .maybeSingle()
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
  await audit(admin.id, 'attendance.edit', att.user_id, `${att.work_date} ${inV || '-'}~${outV || '-'}`)
  revalidatePath(`/admin/jobs/${att.job_id}`)
  back(path, '근무 기록을 저장했습니다.')
}

export async function addAttendance(jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job) return
  const userId = str(form, 'user_id')
  const date = str(form, 'work_date')
  const path = `/admin/jobs/${jobId}?tab=att&date=${date}`
  if (!isUuid(userId) || !isDate(date)) back(path, '근무자와 날짜를 확인해 주세요.')
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
  await audit(admin.id, 'attendance.add', userId, `${date} ${inT}~${outT || '-'}`)
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, '근무 기록을 추가했습니다.')
}

/**
 * 현장 위치 확인이 안 돼 근무자가 보낸 '출근 확인 요청'을 받아들임: 요청한 시각으로 출근 기록 (근무자는 이후 앱에서 종료)
 * 그날 그 근무자의 가장 최근 요청을 서버에서 다시 찾음
 */
export async function approveArrival(jobId: string, userId: string, date: string) {
  const admin = await requireAdmin()
  const job = isUuid(jobId) && isUuid(userId) && isDate(date) ? await getJob(jobId) : null
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
  await audit(admin.id, 'attendance.arrive_ok', userId, `${date} ${kstTime(req.created_at)}`)
  await tellWorkers([userId], {
    senderId: admin.id,
    jobId,
    title: '✅ 출근 처리됐어요',
    text: `${job.title} · ${kstTime(req.created_at)} 출근으로 기록했어요. 일이 끝나면 앱에서 '근무 종료'를 눌러 주세요.`,
    tag: `arrive-ok-${jobId}`,
  })
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, `${kstTime(req.created_at)} 출근으로 처리했어요.`)
}

/**
 * 근무시간 변경 (퇴근 연장 등): 그날만(scope=날짜) 또는 전체 일정(scope=all).
 * 근무자마다 '계속하시겠습니까' 동의를 받고, 동의한 사람만 바뀐 시간으로 급여를 계산
 */
export async function changeShift(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const job = isUuid(jobId) ? await getJob(jobId) : null
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
  await audit(admin.id, 'shift.change', null, `${jobId} ${scope} ${start}~${end} ${n}명`)
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin/chat')
  const date = scope === 'all' ? (dateList(job.start_date, job.end_date).includes(today) ? today : job.start_date) : scope
  redirect(`/admin/jobs/${jobId}?tab=att&date=${date}&m=${encodeURIComponent(`${n}명에게 근무시간 변경 동의를 요청했어요.`)}`)
}

/** 근무자가 앱을 못 쓸 때: 현장에서 말로 동의받은 것을 관리자가 기록 (누가 기록했는지 남음) */
export async function answerShiftByAdmin(changeId: string) {
  const admin = await requireAdmin()
  if (!isUuid(changeId)) return
  const { data } = await db().from('shift_changes').select('*').eq('id', changeId).maybeSingle()
  const c = data as ShiftChange | null
  if (!c || c.status !== 'pending') return
  must(
    await db()
      .from('shift_changes')
      .update({ status: 'agreed', answered_at: new Date().toISOString(), answered_by: admin.id, answer_ip: 'admin' })
      .eq('id', changeId)
      .eq('status', 'pending'),
  )
  await applyAgreedShift(c)
  await audit(admin.id, 'shift.agree_onsite', c.user_id, `${c.job_id} ${c.work_date ?? 'all'} ${c.start_time}~${c.end_time}`)
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
  if (!att || !att.job) return
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
  await audit(admin.id, 'attendance.dismiss', att.user_id, `${att.job_id} ${att.work_date} ${reason}${restCancelled ? ' +남은 날 취소' : ''}`)
  await tellWorkers([att.user_id], {
    senderId: admin.id,
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
  revalidatePath(`/admin/jobs/${att.job_id}`)
  revalidatePath('/admin/chat')
  back(path, `귀가 조치했어요. ${kstTime(now)} 종료로 기록하고 근무자에게 알렸어요.`)
}

export async function deleteAttendance(attId: string) {
  const admin = await requireAdmin()
  if (!isUuid(attId)) return
  const { data: att } = await db().from('attendance').select('id, job_id, user_id, work_date').eq('id', attId).maybeSingle()
  if (!att) return
  must(await db().from('attendance').delete().eq('id', attId))
  await audit(admin.id, 'attendance.delete', att.user_id, att.work_date)
  revalidatePath(`/admin/jobs/${att.job_id}`)
  back(`/admin/jobs/${att.job_id}?tab=att&date=${att.work_date}`, '근무 기록을 삭제했습니다.')
}

/** 아직 종료를 안 누른 사람들을 공고 종료 시각(이미 지났다면)이나 지금 시각으로 일괄 종료 */
export async function bulkClockOut(jobId: string, date: string) {
  await requireAdmin()
  const job = isUuid(jobId) && isDate(date) ? await getJob(jobId) : null
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
  revalidatePath(`/admin/jobs/${jobId}`)
  back(`/admin/jobs/${jobId}?tab=att&date=${date}`, `${open.length}명을 근무 종료 처리했습니다.`)
}

export async function confirmDay(jobId: string, date: string) {
  await requireAdmin()
  if (!isUuid(jobId) || !isDate(date)) return
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
  const rows = must(
    await db().from('attendance').select('*').eq('job_id', jobId).in('user_id', userIds).not('clock_out', 'is', null),
  ) as Attendance[]
  const net = new Map(userIds.map((u) => [u, settle(job, rows.filter((r) => r.user_id === u).map((r) => calcDay(job, r))).net]))
  await tellWorkers(userIds, {
    senderId: adminId,
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
  if (!isUuid(jobId) || !isUuid(userId)) return
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
  await audit(admin.id, paid ? 'pay.mark_paid' : 'pay.unmark_paid', userId, jobId)
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
  if (!att || !att.job || att.paid) return
  const { afterMin } = calcDay(att.job, att)
  if (afterMin < OT_ASK_MIN) return
  const patch =
    decision === 'reject'
      ? { ot_by: 'admin', ot_status: 'rejected' }
      : att.ot_status === 'pending' && att.ot_by === 'worker'
        ? { ot_status: 'agreed' }
        : { ot_minutes: afterMin, ot_by: 'admin', ot_status: 'pending' }
  must(await db().from('attendance').update(patch).eq('id', attendanceId))
  await audit(admin.id, `overtime.${decision}`, att.user_id, `${att.work_date} ${afterMin}분`)
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
  const job = isUuid(jobId) ? await getJob(jobId) : null
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
    sign: ['✍️ 서류 서명 요청', `${job.title} 근무 전에 앱 '내 근무'에서 서류에 서명해 주세요. 서명해야 근무 시작 버튼이 열려요.`],
    clockin: ['⏰ 출근 확인', `${job.title} · 근무 시작 시각(${hhmm(job.start_time)})이 지났어요. 현장에 도착했으면 앱에서 '근무 시작'을 눌러 주세요.`],
    clockout: ['🏁 근무 종료 확인', `${job.title} · 일이 끝났으면 앱에서 '근무 종료'를 눌러 주세요. 계약 시간 이후는 서로 확인한 뒤에만 급여에 들어가요.`],
    account: [SIGNAL.account, `${job.title} 급여를 보내 드리려면 계좌가 필요해요. 앱 '내 정보'에서 은행·계좌번호·예금주를 등록해 주세요.`],
    contract: [
      '📝 근로계약서 작성 안내',
      job.contract_method === 'paper'
        ? `${job.title} 근로계약서는 종이로 작성해요. 근무 시작 전에 현장 담당자에게 받아 서명해 주세요.`
        : `${job.title} 근로계약서는 전자계약(모두싸인 등)으로 받아요. ${job.contract_url ? `아래 링크에서 서명해 주세요.\n${job.contract_url}` : '문자·카카오톡으로 온 서명 링크를 확인해 서명해 주세요.'}`,
    ],
  }[kind]
  must(
    await db()
      .from('messages')
      .insert(to.map((uid) => ({ thread_user_id: uid, sender_id: admin.id, from_admin: true, job_id: jobId, body: `${title}\n${text}` }))),
  )
  await audit(admin.id, `nudge.${kind}`, null, `${jobId} ${date ?? ''} ${to.length}명`)
  after(() => sendPush(to, { title, body: text, url: kind === 'account' ? '/me/profile' : '/me', tag: `${kind}-${jobId}` }))
  revalidatePath('/admin/chat')
  redirect(`${backTo}&m=${encodeURIComponent(`${to.length}명에게 앱 알림을 보냈어요.`)}`)
}

/** 입금을 마친 뒤 한 번에: 이 공고의 퇴근까지 기록된 미지급 근무를 모두 지급 완료로 */
export async function setAllPaid(jobId: string) {
  const admin = await requireAdmin()
  if (!isUuid(jobId)) return
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
  await audit(admin.id, 'pay.mark_paid_all', null, jobId)
  const paidTo = [...new Set(unpaid.map((r) => r.user_id))]
  await tellPaid(admin.id, jobId, paidTo)
  revalidatePath(`/admin/jobs/${jobId}`)
  if (paidTo.length) back(`/admin/jobs/${jobId}?tab=pay`, `${paidTo.length}명을 지급 완료로 바꾸고 알렸어요.`)
}

// ───────────── 서류 ─────────────

export async function voidDoc(docId: string) {
  const admin = await requireAdmin()
  if (!isUuid(docId)) return
  const { data: doc } = await db().from('signed_docs').select('id, job_id, user_id, status').eq('id', docId).maybeSingle()
  if (!doc) return
  if (doc.status === 'pending') must(await db().from('signed_docs').delete().eq('id', docId))
  else must(await db().from('signed_docs').update({ status: 'void' }).eq('id', docId))
  await audit(admin.id, 'doc.void', doc.user_id, docId)
  revalidatePath(`/admin/jobs/${doc.job_id}`)
}

/** 종이·다른 서비스(모두싸인 등)로 받은 근로계약서를 받았다고 표시하거나 취소 */
export async function setContractReceived(appId: string, received: boolean) {
  const admin = await requireAdmin()
  if (!isUuid(appId)) return
  const { data: app } = await db().from('applications').select('id, job_id, user_id').eq('id', appId).maybeSingle()
  if (!app) return
  must(await db().from('applications').update({ contract_received_at: received ? new Date().toISOString() : null }).eq('id', appId))
  await audit(admin.id, received ? 'contract.received' : 'contract.unreceived', app.user_id, app.job_id)
  revalidatePath(`/admin/jobs/${app.job_id}`)
}

/** 무효 처리 후 같은 서식으로 다시 서명 요청 */
export async function rerequestDoc(docId: string) {
  const admin = await requireAdmin()
  if (!isUuid(docId)) return
  const { data: doc } = await db().from('signed_docs').select('*').eq('id', docId).maybeSingle()
  if (!doc || doc.status !== 'signed') return
  must(await db().from('signed_docs').update({ status: 'void' }).eq('id', docId))
  must(
    await db()
      .from('signed_docs')
      .insert({ job_id: doc.job_id, user_id: doc.user_id, template_id: doc.template_id, kind: doc.kind, title: doc.title }),
  )
  await audit(admin.id, 'doc.rerequest', doc.user_id, docId)
  revalidatePath(`/admin/jobs/${doc.job_id}`)
}

export async function saveTemplate(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const title = str(form, 'title', 100)
  const body = str(form, 'body', 20_000).replace(/\r\n?/g, '\n')
  if (!title || !body) return { error: '제목과 내용을 입력해 주세요.' }
  const kind = (['contract', 'pledge', 'consent', 'other'] as const).find((k) => k === str(form, 'kind')) ?? 'other'
  const row = { title, body, kind, is_default: bool(form, 'is_default'), active: !bool(form, 'inactive') }
  if (id && isUuid(id)) must(await db().from('doc_templates').update(row).eq('id', id))
  else {
    const created = must(await db().from('doc_templates').insert(row).select('id').single()) as { id: string }
    id = created.id
  }
  revalidatePath('/admin/docs')
  redirect(`/admin/docs/${id}?m=${encodeURIComponent('저장했습니다. 이미 서명된 서류는 서명 당시 내용 그대로 보관됩니다.')}`)
}

export async function restoreDefaultTemplates() {
  await requireAdmin()
  const existing = must(await db().from('doc_templates').select('title')) as { title: string }[]
  const titles = new Set(existing.map((t) => t.title))
  const missing = DEFAULT_TEMPLATES.filter((t) => !titles.has(t.title))
  if (missing.length) must(await db().from('doc_templates').insert(missing))
  revalidatePath('/admin/docs')
  back('/admin/docs', missing.length ? `기본 서식 ${missing.length}개를 추가했습니다.` : '기본 서식이 이미 모두 있습니다.')
}

// ───────────── 근무자 ─────────────

export async function revealRrn(userId: string, _: FormState): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(userId)) return { error: '잘못된 요청입니다.' }
  // 관리자 계정이 털려도 주민번호를 한꺼번에 빼 가지 못하게 열람 횟수 제한
  if (await overLimit(`rrn-view:${admin.id}`, 30, 3600)) return { error: '주민등록번호 열람이 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.' }
  const { data } = await db().from('users').select('rrn_enc').eq('id', userId).maybeSingle()
  const rrn = decrypt(data?.rrn_enc)
  if (!rrn) return { error: '등록된 주민등록번호가 없습니다.' }
  await audit(admin.id, 'rrn.view', userId, '관리자 화면 열람')
  return { ok: formatRrn(rrn) }
}

export async function resetPin(userId: string, _: FormState): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(userId)) return { error: '잘못된 요청입니다.' }
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
  await audit(admin.id, 'pin.reset', userId)
  return { ok: temp }
}

export async function updateWorker(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(userId)) return { error: '잘못된 요청입니다.' }
  const name = str(form, 'name', 30)
  const phone = normalizePhone(str(form, 'phone'))
  if (name.length < 2 || !phone) return { error: '이름과 휴대폰 번호를 확인해 주세요.' }
  const { data: dup } = await db().from('users').select('id').eq('phone', phone).neq('id', userId).maybeSingle()
  if (dup) return { error: '다른 계정이 쓰는 휴대폰 번호입니다.' }
  const role = str(form, 'role') === 'admin' ? 'admin' : 'worker'
  if (userId === admin.id && role !== 'admin') return { error: '자기 자신의 관리자 권한은 해제할 수 없습니다.' }
  must(
    await db()
      .from('users')
      .update({ name, phone, role, active: !bool(form, 'inactive'), admin_memo: optStr(form, 'admin_memo', 1000) })
      .eq('id', userId),
  )
  await audit(admin.id, 'user.edit', userId, role)
  revalidatePath(`/admin/workers/${userId}`)
  return { ok: '저장했습니다.' }
}

// ───────────── 회사 설정 ─────────────

const SEAL_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export async function saveSettings(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const company_name = str(form, 'company_name', 100)
  if (!company_name) return { error: '상호를 입력해 주세요.' }
  const update: Record<string, unknown> = {
    company_name,
    ceo_name: optStr(form, 'ceo_name', 30),
    business_no: optStr(form, 'business_no', 20),
    company_address: optStr(form, 'company_address', 200),
    company_phone: optStr(form, 'company_phone', 30),
    contact_name: optStr(form, 'contact_name', 30),
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
  must(await db().from('settings').update(update).eq('id', 1))
  revalidatePath('/admin/settings')
  return { ok: '저장했습니다.' }
}

// ───────────── 관리자 평점 (근무자에게는 보이지 않음) ─────────────

const SCORE_RANGE = (n: number) => n >= 1 && n <= 5

/** 출퇴근 화면에서 별 하나 눌러 바로 매기기 (같은 공고·같은 관리자는 다시 누르면 바뀜, 메모는 그대로) */
export async function rateQuick(userId: string, jobId: string, form: FormData) {
  const admin = await requireAdmin()
  const score = int(form, 'score', 0)
  if (!isUuid(userId) || !isUuid(jobId) || !SCORE_RANGE(score)) return
  must(
    await db()
      .from('worker_ratings')
      .upsert({ user_id: userId, job_id: jobId, rater_id: admin.id, score }, { onConflict: 'user_id,job_id,rater_id' }),
  )
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath(`/admin/workers/${userId}`)
}

/** 근무자 정보 화면에서 별점·메모 저장 (공고를 고르지 않으면 일반 메모로 새로 추가) */
export async function rateWorker(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(userId)) return { error: '잘못된 요청입니다.' }
  const score = int(form, 'score', 0)
  if (!SCORE_RANGE(score)) return { error: '별점을 골라 주세요.' }
  const jobId = str(form, 'job_id')
  must(
    await db()
      .from('worker_ratings')
      .upsert(
        { user_id: userId, job_id: isUuid(jobId) ? jobId : null, rater_id: admin.id, score, comment: optStr(form, 'comment', 500) },
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
  must(await db().from('worker_ratings').delete().eq('id', ratingId).eq('rater_id', admin.id))
  revalidatePath(`/admin/workers/${userId}`)
}

/** 확정 근무자의 현장 배치 (빈칸이면 미배치) */
export async function setPosition(appId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  if (!isUuid(appId)) return { error: '잘못된 요청입니다.' }
  const position = str(form, 'position', 30) || null
  const app = must(await db().from('applications').update({ position }).eq('id', appId).select('job_id').maybeSingle()) as {
    job_id: string
  } | null
  if (!app) return { error: '지원 내역을 찾을 수 없습니다.' }
  revalidatePath(`/admin/jobs/${app.job_id}`)
  return { ok: position ? '배치했어요' : '배치를 비웠어요' }
}
