'use server'

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { decrypt, hashPin } from '@/lib/crypto'
import { audit, ensurePendingDocs, getJob } from '@/lib/data'
import { db, must } from '@/lib/db'
import { DEFAULT_TEMPLATES } from '@/lib/default-templates'
import { estimateDay, MIN_WAGE_2026 } from '@/lib/pay'
import { requireAdmin } from '@/lib/session'
import { fromKstInput, kstAt } from '@/lib/time'
import type { Job, JobCondition } from '@/lib/types'
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
  const status = (['draft', 'open', 'closed', 'done'] as const).find((m) => m === str(form, 'status')) ?? 'open'
  const conditions = parseConditions(str(form, 'conditions', 5000))
  if (!conditions) return { error: '근무 조건을 다시 입력해 주세요.' }

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
    auto_approve: bool(form, 'auto_approve'),
    status,
    conditions,
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

export async function saveJob(jobId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const { row, error } = parseJob(form)
  if (!row) return { error }
  let id = jobId
  if (id) {
    if (!isUuid(id)) return { error: '잘못된 요청입니다.' }
    must(await db().from('jobs').update(row).eq('id', id))
    // 서류 구성을 바꿨다면 이미 확정된 인원에게도 서명 요청
    const job = await getJob(id)
    const approved = must(
      await db().from('applications').select('user_id').eq('job_id', id).eq('status', 'approved'),
    ) as { user_id: string }[]
    if (job) for (const a of approved) await ensurePendingDocs(job, a.user_id)
  } else {
    const created = must(await db().from('jobs').insert({ ...row, created_by: admin.id }).select('id').single()) as { id: string }
    id = created.id
  }
  revalidatePath('/admin/jobs')
  revalidatePath('/')
  redirect(`/admin/jobs/${id}?m=${encodeURIComponent('저장했습니다.')}`)
}

export async function setJobStatus(jobId: string, status: Job['status']) {
  await requireAdmin()
  if (!isUuid(jobId) || !['draft', 'open', 'closed', 'done'].includes(status)) return
  must(await db().from('jobs').update({ status }).eq('id', jobId))
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

// ───────────── 지원자 ─────────────

export async function decideApplication(appId: string, status: 'approved' | 'rejected' | 'applied') {
  await requireAdmin()
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
    if (job) await ensurePendingDocs(job, app.user_id)
  } else {
    await db().from('signed_docs').delete().eq('job_id', app.job_id).eq('user_id', app.user_id).eq('status', 'pending')
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
  })
  if (error) back(path, error.code === '23505' ? '그날 이미 기록이 있습니다. 기존 기록을 고쳐 주세요.' : '등록하지 못했습니다.')
  await audit(admin.id, 'attendance.add', userId, `${date} ${inT}~${outT || '-'}`)
  revalidatePath(`/admin/jobs/${jobId}`)
  back(path, '근무 기록을 추가했습니다.')
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
  let end = kstAt(date, job.end_time)
  if (job.end_time <= job.start_time) end = new Date(end.getTime() + 24 * 3600_000)
  const out = end < new Date() ? end : new Date()
  const open = must(
    await db().from('attendance').select('id, clock_in').eq('job_id', jobId).eq('work_date', date).is('clock_out', null),
  ) as { id: string; clock_in: string }[]
  for (const a of open) {
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

export async function setPaid(jobId: string, userId: string, paid: boolean) {
  const admin = await requireAdmin()
  if (!isUuid(jobId) || !isUuid(userId)) return
  must(
    await db()
      .from('attendance')
      .update({ paid, paid_at: paid ? new Date().toISOString() : null, ...(paid ? { confirmed: true } : {}) })
      .eq('job_id', jobId)
      .eq('user_id', userId)
      .not('clock_out', 'is', null),
  )
  await audit(admin.id, paid ? 'pay.mark_paid' : 'pay.unmark_paid', userId, jobId)
  revalidatePath(`/admin/jobs/${jobId}`)
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
  const body = str(form, 'body', 20_000)
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
  const temp = String(randomInt(0, 1_000_000)).padStart(6, '0')
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
  const seal = form.get('seal')
  if (seal instanceof File && seal.size > 0) {
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
