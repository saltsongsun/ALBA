'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { decrypt, encrypt, hashPin, verifyPin } from '@/lib/crypto'
import { approvedCounts, ensurePendingDocs, getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { buildDocVars, renderTemplate } from '@/lib/docs'
import { calcDay, OT_ASK_MIN } from '@/lib/pay'
import { adminIds, sendPush } from '@/lib/push'
import { note, recent } from '@/lib/ratelimit'
import { SIGNAL, signalOf } from '@/lib/signals'
import { clientInfo, createSession, destroySession, requireUser } from '@/lib/session'
import { fmtDateRange, hhmm, kstAt, kstDate, kstTime, minutesText } from '@/lib/time'
import type { Application, Attendance, DocTemplate, Job, SignedDoc, UserRow } from '@/lib/types'
import { isDate, isPin, isUuid, normalizePhone, optStr, str, weakPin } from '@/lib/validate'
import type { FormState } from './auth'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

// ───────────── 지원 ─────────────

export async function applyJob(jobId: string, form: FormData) {
  const user = await requireUser(`/jobs/${jobId}`)
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job) back('/', '공고를 찾을 수 없습니다.')
  const path = `/jobs/${jobId}`
  if (job.status !== 'open') back(path, '모집이 마감된 공고입니다.')
  if (job.end_date < kstDate()) back(path, '이미 끝난 행사입니다.')

  const dates = form
    .getAll('dates')
    .map(String)
    .filter((d) => isDate(d) && d >= job.start_date && d <= job.end_date)
  const multiDay = job.start_date !== job.end_date
  if (multiDay && form.has('date_choice') && !dates.length) back(path, '근무 가능한 날짜를 하나 이상 골라 주세요.')

  const { data: existing } = await db()
    .from('applications')
    .select('id, status')
    .eq('job_id', jobId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing && existing.status !== 'cancelled') back(path, '이미 지원한 공고입니다.')

  let status: Application['status'] = 'applied'
  if (job.auto_approve) {
    const counts = await approvedCounts([jobId])
    if ((counts[jobId] ?? 0) < job.headcount) status = 'approved'
  }
  const row = {
    job_id: jobId,
    user_id: user.id,
    status,
    available_dates: multiDay && dates.length ? dates : null,
    message: optStr(form, 'message', 300),
    decided_at: status === 'approved' ? new Date().toISOString() : null,
  }
  if (existing) must(await db().from('applications').update(row).eq('id', existing.id))
  else must(await db().from('applications').insert(row))

  if (status === 'approved') await ensurePendingDocs(job, user.id)
  after(async () =>
    sendPush(await adminIds(), {
      title: status === 'approved' ? '✅ 자동 확정' : '🙋 새 지원',
      body: `${user.name} · ${job.title}`,
      url: `/admin/jobs/${jobId}?tab=apps`,
      tag: `apply-${jobId}`,
    }),
  )
  revalidatePath('/me')
  back(path, status === 'approved' ? '근무가 확정됐어요! 내 근무에서 서류에 서명해 주세요.' : '지원이 접수됐어요. 확정되면 내 근무에 표시됩니다.')
}

export async function cancelApplication(appId: string, form?: FormData) {
  const user = await requireUser()
  const { data } = await db()
    .from('applications')
    .select('id, job_id, user_id, status, job:jobs(title, start_date, end_date, start_time)')
    .eq('id', appId)
    .maybeSingle()
  const app = data as {
    id: string
    job_id: string
    user_id: string
    status: string
    job: { title: string; start_date: string; end_date: string; start_time: string } | null
  } | null
  if (!app || app.user_id !== user.id) back('/me', '지원 내역을 찾을 수 없습니다.')
  const { count } = await db()
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', app.job_id)
    .eq('user_id', user.id)
  if (count) back('/me', '이미 근무 기록이 있어 취소할 수 없습니다. 담당자에게 문의해 주세요.')
  must(await db().from('applications').update({ status: 'cancelled' }).eq('id', appId))
  await db().from('signed_docs').delete().eq('job_id', app.job_id).eq('user_id', user.id).eq('status', 'pending')
  // 확정된 근무를 취소하면 담당자 문의함에 바로 알림 (안 읽음 표시) — 사람을 다시 구할 시간을 벌게
  if (app.status === 'approved' && app.job) {
    const reason = form ? str(form, 'reason', 100) : ''
    const hoursLeft = (kstAt(app.job.start_date, app.job.start_time).getTime() - Date.now()) / 3_600_000
    const body = [
      `⚠️ 확정 취소${hoursLeft < 24 ? ' (근무 24시간 안)' : ''}`,
      `${app.job.title} · ${fmtDateRange(app.job.start_date, app.job.end_date)} ${hhmm(app.job.start_time)} 근무를 취소했어요.`,
      reason && `사유: ${reason}`,
    ]
      .filter(Boolean)
      .join('\n')
    await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, job_id: app.job_id, body })
    const title = app.job.title
    const jobId = app.job_id
    after(async () => {
      // 빈자리와 대기 인원을 함께 알려 바로 채울 수 있게
      const [job, { count: waiting }] = await Promise.all([
        getJob(jobId),
        db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('status', 'applied'),
      ])
      const left = job ? job.headcount - ((await approvedCounts([jobId]))[jobId] ?? 0) : 0
      await sendPush(await adminIds(), {
        title: `⚠️ 확정 취소${hoursLeft < 24 ? ' (24시간 안)' : ''}`,
        body: `${user.name} · ${title}${reason ? ` · ${reason}` : ''}${left > 0 ? ` · 빈자리 ${left}명, 대기 ${waiting ?? 0}명` : ''}`,
        url: `/admin/jobs/${jobId}?tab=apps`,
      })
    })
    revalidatePath('/admin/chat')
  }
  revalidatePath('/me')
  back(`/jobs/${app.job_id}`, '지원을 취소했어요.')
}

// ───────────── 출퇴근 ─────────────

/** gps: 현장 위치 확인에 막힘 → 담당자에게 출근 확인을 요청할 수 있게 */
export type ClockResult = { ok?: string; error?: string; gps?: boolean }

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

function coords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat)
  const b = Number(lng)
  if (lat == null || lng == null || !Number.isFinite(a) || !Number.isFinite(b)) return null
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null
  return { lat: a, lng: b }
}

export async function clockIn(jobId: string, lat: number | null, lng: number | null): Promise<ClockResult> {
  const [user, job] = await Promise.all([requireUser(), isUuid(jobId) ? getJob(jobId) : null])
  if (!isUuid(jobId)) return { error: '잘못된 요청입니다.' }
  if (!job) return { error: '공고를 찾을 수 없습니다.' }
  const today = kstDate()
  if (today < job.start_date || today > job.end_date) return { error: '오늘은 이 행사의 근무일이 아닙니다.' }

  const [{ data: app }, { count: pendingDocs }, { data: open }] = await Promise.all([
    db().from('applications').select('status').eq('job_id', jobId).eq('user_id', user.id).maybeSingle(),
    db()
      .from('signed_docs')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('user_id', user.id)
      .eq('status', 'pending'),
    db().from('attendance').select('id, job_id, work_date').eq('user_id', user.id).is('clock_out', null).limit(1),
  ])
  if (app?.status !== 'approved') return { error: '근무가 확정된 공고만 출근할 수 있습니다.' }
  if (pendingDocs) return { error: '근로계약서 등 서류에 먼저 서명해 주세요.' }
  if (open?.length) return { error: '아직 종료하지 않은 근무가 있습니다. 먼저 근무 종료를 눌러 주세요.' }

  const pos = coords(lat, lng)
  let distance: number | null = null
  if (pos && job.lat != null && job.lng != null) distance = distanceM(pos.lat, pos.lng, job.lat, job.lng)
  if (job.gps_required && job.lat != null && job.lng != null) {
    if (!pos) return { error: '이 행사는 현장 위치 확인이 필요합니다. 위치 권한을 허용하고 다시 눌러 주세요.', gps: true }
    if (distance! > job.gps_radius_m) {
      return { error: `행사장에서 약 ${distance!.toLocaleString()}m 떨어져 있어요. 현장(${job.gps_radius_m}m 이내)에서 눌러 주세요.`, gps: true }
    }
  }

  const { error } = await db()
    .from('attendance')
    .insert({
      job_id: jobId,
      user_id: user.id,
      work_date: today,
      clock_in: new Date().toISOString(),
      in_lat: pos?.lat ?? null,
      in_lng: pos?.lng ?? null,
      in_distance_m: distance,
    })
  if (error) {
    return { error: error.code === '23505' ? '오늘은 이미 출근 기록이 있습니다.' : '출근 기록 중 문제가 생겼어요. 다시 시도해 주세요.' }
  }
  revalidatePath('/me')
  return { ok: '근무를 시작했어요. 오늘도 안전하게!' }
}

export async function clockOut(attendanceId: string, lat: number | null, lng: number | null): Promise<ClockResult> {
  // 로그인 확인과 기록 조회(행사장 좌표 포함)를 함께 하고, 본인 기록인지는 아래에서 확인
  const [user, { data }] = await Promise.all([
    requireUser(),
    isUuid(attendanceId)
      ? db().from('attendance').select('user_id, clock_out, job:jobs(lat, lng)').eq('id', attendanceId).maybeSingle()
      : { data: null },
  ])
  if (!isUuid(attendanceId)) return { error: '잘못된 요청입니다.' }
  const att = data as { user_id: string; clock_out: string | null; job: { lat: number | null; lng: number | null } | null } | null
  if (!att || att.user_id !== user.id) return { error: '근무 기록을 찾을 수 없습니다.' }
  if (att.clock_out) return { error: '이미 종료된 근무입니다.' }
  const job = att.job
  const pos = coords(lat, lng)
  const distance = pos && job?.lat != null && job?.lng != null ? distanceM(pos.lat, pos.lng, job.lat, job.lng) : null
  must(
    await db()
      .from('attendance')
      .update({ clock_out: new Date().toISOString(), out_lat: pos?.lat ?? null, out_lng: pos?.lng ?? null, out_distance_m: distance })
      .eq('id', attendanceId)
      .is('clock_out', null),
  )
  revalidatePath('/me')
  return { ok: '근무를 종료했어요. 수고하셨습니다!' }
}

// ───────────── 현장 상황 알리기 (지각·위치 확인 실패) ─────────────

/** 오늘 이 공고에서 근무하기로 한 확정자이고 아직 출근 기록이 없는지 */
async function todayShift(userId: string, jobId: string) {
  if (!isUuid(jobId)) return { error: '잘못된 요청입니다.' }
  const today = kstDate()
  const [job, { data: app }, { data: att }, { data: sent }] = await Promise.all([
    getJob(jobId),
    db().from('applications').select('status, available_dates').eq('job_id', jobId).eq('user_id', userId).maybeSingle(),
    db().from('attendance').select('id').eq('job_id', jobId).eq('user_id', userId).eq('work_date', today).maybeSingle(),
    // 오늘 이미 보낸 알림 (너무 자주 보내지 않게)
    db()
      .from('messages')
      .select('body, created_at')
      .eq('thread_user_id', userId)
      .eq('job_id', jobId)
      .eq('from_admin', false)
      .gte('created_at', kstAt(today, '00:00').toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (!job || job.status === 'cancelled') return { error: '공고를 찾을 수 없습니다.' }
  if (today < job.start_date || today > job.end_date) return { error: '오늘은 이 행사의 근무일이 아닙니다.' }
  if (app?.status !== 'approved') return { error: '근무가 확정된 공고만 알릴 수 있어요.' }
  if (att) return { error: '이미 출근 기록이 있어요.' }
  const todaySent = ((sent ?? []) as { body: string; created_at: string }[]).filter((m) => kstDate(m.created_at) === today)
  return { job, today, todaySent }
}

/** 늦을 것 같을 때: 몇 분 늦는지 담당자에게 (문의함 + 휴대폰 알림) */
export async function notifyLate(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  const r = await todayShift(user.id, jobId)
  if (!r.job) return { error: r.error }
  const minutes = Number(str(form, 'minutes'))
  if (![10, 20, 30, 60].includes(minutes)) return { error: '얼마나 늦는지 골라 주세요.' }
  if (r.todaySent.filter((m) => signalOf(m.body) === 'late').length >= 3) return { error: '오늘은 이미 여러 번 알렸어요. 담당자에게 전화해 주세요.' }
  const reason = optStr(form, 'reason', 100)
  const start = kstAt(r.today, r.job.start_time)
  const eta = new Date(Math.max(Date.now(), start.getTime()) + minutes * 60_000)
  const body = [
    SIGNAL.late,
    `${r.job.title} · 약 ${minutes}분 늦어요 (도착 예정 ${kstTime(eta)})`,
    reason && `사유: ${reason}`,
  ]
    .filter(Boolean)
    .join('\n')
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, job_id: jobId, body }))
  const title = r.job.title
  after(async () =>
    sendPush(await adminIds(), {
      title: `${SIGNAL.late} · ${minutes}분`,
      body: `${user.name} · ${title} · ${kstTime(eta)} 도착 예정${reason ? ` · ${reason}` : ''}`,
      url: `/admin/jobs/${jobId}?tab=att&date=${r.today}`,
      tag: `late-${jobId}-${user.id}`,
    }),
  )
  revalidatePath('/me')
  revalidatePath('/admin/chat')
  return { ok: `담당자에게 약 ${minutes}분 늦는다고 알렸어요. 조심히 오세요!` }
}

/** 현장에 왔는데 위치 확인이 안 될 때: 담당자에게 출근 확인 요청 (요청한 시각으로 출근 처리 가능) */
export async function requestClockIn(jobId: string, lat: number | null, lng: number | null): Promise<ClockResult> {
  const user = await requireUser()
  const r = await todayShift(user.id, jobId)
  if (!r.job) return { error: r.error }
  const { count: pendingDocs } = await db()
    .from('signed_docs')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
  if (pendingDocs) return { error: '근로계약서 등 서류에 먼저 서명해 주세요.' }
  const last = r.todaySent.find((m) => signalOf(m.body) === 'arrive')
  if (last && Date.now() - Date.parse(last.created_at) < 5 * 60_000) {
    return { ok: `${kstTime(last.created_at)}에 이미 요청했어요. 담당자가 확인하면 근무 중으로 바뀌어요.` }
  }
  const pos = coords(lat, lng)
  const distance = pos && r.job.lat != null && r.job.lng != null ? distanceM(pos.lat, pos.lng, r.job.lat, r.job.lng) : null
  const now = new Date()
  const body = [
    SIGNAL.arrive,
    `${r.job.title} · ${kstTime(now)}에 현장에 도착했는데 위치 확인이 안 돼요${distance != null ? ` (행사장에서 약 ${distance.toLocaleString()}m로 잡힘)` : ' (위치를 못 읽음)'}`,
  ].join('\n')
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, job_id: jobId, body }))
  const title = r.job.title
  after(async () =>
    sendPush(await adminIds(), {
      title: SIGNAL.arrive,
      body: `${user.name} · ${title} · ${kstTime(now)} 도착 · 앱에서 출근 처리해 주세요`,
      url: `/admin/jobs/${jobId}?tab=att&date=${r.today}`,
      tag: `arrive-${jobId}-${user.id}`,
    }),
  )
  revalidatePath('/me')
  revalidatePath('/admin/chat')
  return { ok: `담당자에게 출근 확인을 요청했어요. 확인되면 ${kstTime(now)} 출근으로 기록돼요.` }
}

/**
 * 계약 종료 시각 이후로 기록된 근무(연장) 답하기
 * request: 연장 근무했다고 담당자에게 확인 요청 / decline: 제시간에 끝남 / accept: 담당자가 인정한 연장이 맞음
 */
export async function answerOvertime(attendanceId: string, choice: 'request' | 'decline' | 'accept') {
  const user = await requireUser()
  if (!isUuid(attendanceId) || !['request', 'decline', 'accept'].includes(choice)) return
  const { data } = await db().from('attendance').select('*, job:jobs(*)').eq('id', attendanceId).maybeSingle()
  const att = data as (Attendance & { job: Job | null }) | null
  if (!att || att.user_id !== user.id || !att.job || att.paid) return
  const { afterMin } = calcDay(att.job, att)
  if (afterMin < OT_ASK_MIN) return
  if (choice === 'accept' && !(att.ot_status === 'pending' && att.ot_by === 'admin')) return
  const patch =
    choice === 'request'
      ? { ot_minutes: afterMin, ot_by: 'worker', ot_status: 'pending' }
      : choice === 'decline'
        ? { ot_minutes: 0, ot_by: 'worker', ot_status: 'rejected' }
        : { ot_status: 'agreed' }
  must(await db().from('attendance').update(patch).eq('id', attendanceId))
  if (choice === 'request') {
    const job = att.job
    after(async () =>
      sendPush(await adminIds(), {
        title: '⏱ 연장 근무 확인 요청',
        body: `${user.name} · ${job.title} · ${minutesText(afterMin)}`,
        url: `/admin/jobs/${job.id}?tab=att&date=${att.work_date}`,
      }),
    )
  }
  revalidatePath('/me')
}

// ───────────── 전자서명 ─────────────

const MAX_SIGNATURE = 300_000

export async function signDocument(docId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  if (!isUuid(docId)) return { error: '잘못된 요청입니다.' }
  const signature = str(form, 'signature', MAX_SIGNATURE + 1)
  if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE) {
    return { error: '서명란에 서명해 주세요.' }
  }
  if (form.get('agree') !== 'on') return { error: '내용을 확인했다는 항목에 체크해 주세요.' }

  const { data: doc } = await db().from('signed_docs').select('*').eq('id', docId).maybeSingle()
  const d = doc as SignedDoc | null
  if (!d || d.user_id !== user.id) return { error: '서류를 찾을 수 없습니다.' }
  if (d.status !== 'pending') return { error: '이미 서명한 서류입니다.' }
  if (!d.template_id) return { error: '서식이 삭제된 서류입니다. 담당자에게 문의해 주세요.' }

  const [job, settings, { data: tpl }, { data: me }] = await Promise.all([
    getJob(d.job_id),
    getSettings({ seal: true }),
    db().from('doc_templates').select('*').eq('id', d.template_id).maybeSingle(),
    db().from('users').select('name, phone, birth_date, address').eq('id', user.id).single(),
  ])
  if (!job || !tpl || !me) return { error: '서식을 불러오지 못했습니다. 담당자에게 문의해 주세요.' }

  const today = kstDate()
  const body = renderTemplate((tpl as DocTemplate).body, buildDocVars(job, me, settings, today))
  const { ip, ua } = await clientInfo()
  must(
    await db()
      .from('signed_docs')
      .update({
        body,
        title: (tpl as DocTemplate).title,
        signature,
        seal_image: settings.seal_image,
        company_snapshot: {
          company_name: settings.company_name,
          ceo_name: settings.ceo_name,
          business_no: settings.business_no,
          company_address: settings.company_address,
          company_phone: settings.company_phone,
        },
        signed_at: new Date().toISOString(),
        signed_ip: ip,
        signed_ua: ua,
        status: 'signed',
      })
      .eq('id', docId)
      .eq('status', 'pending'),
  )
  revalidatePath('/me')
  revalidatePath(`/docs/${docId}`)
  // 서명할 서류가 더 있으면 (같은 공고 먼저) 바로 다음 서류로, 다 했으면 내 근무로
  const rest = must(
    await db().from('signed_docs').select('id, job_id').eq('user_id', user.id).eq('status', 'pending').order('created_at'),
  ) as { id: string; job_id: string }[]
  const next = rest.find((r) => r.job_id === d.job_id) ?? rest[0]
  if (next) redirect(`/docs/${next.id}?m=${encodeURIComponent(`서명했어요. 남은 서류 ${rest.length}건도 이어서 서명해 주세요.`)}`)
  redirect(`/me?m=${encodeURIComponent('서류 서명을 모두 마쳤어요.')}`)
}

// ───────────── 내 정보 ─────────────

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  const { data: cur } = await db().from('users').select('bank_name, bank_account_enc, account_holder').eq('id', user.id).single()
  const account = str(form, 'bank_account', 40).replace(/[^\d-]/g, '')
  const bankName = account ? optStr(form, 'bank_name', 30) : null
  const holder = account ? optStr(form, 'account_holder', 30) || user.name : null
  const prevAccount = decrypt(cur?.bank_account_enc)
  const bankChanged = (prevAccount ?? '') !== account || (cur?.bank_name ?? null) !== bankName || (cur?.account_holder ?? null) !== holder
  const emergency = str(form, 'emergency_phone')
  must(
    await db()
      .from('users')
      .update({
        address: optStr(form, 'address', 200),
        emergency_phone: emergency ? normalizePhone(emergency) ?? emergency.slice(0, 20) : null,
        bank_name: bankName,
        bank_account_enc: account ? encrypt(account) : null,
        account_holder: holder,
        ...(bankChanged ? { bank_changed_at: new Date().toISOString() } : {}),
      })
      .eq('id', user.id),
  )
  revalidatePath('/me/profile')
  return { ok: '저장했어요.' }
}

export async function changePin(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  const cur = str(form, 'current')
  const next = str(form, 'pin')
  if (!isPin(next)) return { error: '새 비밀번호는 숫자 6자리로 정해 주세요.' }
  if (next !== str(form, 'pin2')) return { error: '새 비밀번호 확인이 일치하지 않습니다.' }
  // 로그인된 휴대폰을 남이 쥐고 현재 비밀번호를 맞혀 보지 못하게
  const failKey = `pin-check-fail:${user.id}`
  if ((await recent(failKey, 15 * 60)) >= 5) return { error: '비밀번호를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.' }
  const { data } = await db().from('users').select('pin_hash, session_version, birth_date, phone').eq('id', user.id).single()
  const row = data as Pick<UserRow, 'pin_hash' | 'session_version' | 'birth_date' | 'phone'> | null
  if (!row || !(await verifyPin(cur, row.pin_hash))) {
    await note(failKey)
    return { error: '현재 비밀번호가 맞지 않습니다.' }
  }
  const weak = weakPin(next, { birthDate: row.birth_date, phone: row.phone })
  if (weak) return { error: weak }
  const version = row.session_version + 1
  must(await db().from('users').update({ pin_hash: await hashPin(next), session_version: version }).eq('id', user.id))
  await createSession(user.id, version, user.role)
  return { ok: '비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 합니다.' }
}

export async function withdraw(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  const failKey = `pin-check-fail:${user.id}`
  if ((await recent(failKey, 15 * 60)) >= 5) return { error: '비밀번호를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.' }
  const { data } = await db().from('users').select('pin_hash').eq('id', user.id).single()
  if (!data || !(await verifyPin(str(form, 'pin'), data.pin_hash))) {
    await note(failKey)
    return { error: '비밀번호가 맞지 않습니다.' }
  }

  const [{ count: worked }, { count: signed }] = await Promise.all([
    db().from('attendance').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    db().from('signed_docs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'signed'),
  ])
  if (!worked && !signed) {
    must(await db().from('users').delete().eq('id', user.id))
  } else {
    // 근로기준법상 3년 보존 대상이 있으면 계정만 막고 기록은 보관 (재가입은 관리자가 계정 복구)
    // 사진은 보존 대상이 아니므로 바로 지움
    must(await db().from('users').update({ active: false, photo_at: null }).eq('id', user.id))
    await db().from('user_photos').delete().eq('user_id', user.id)
    await db().from('applications').update({ status: 'cancelled' }).eq('user_id', user.id).in('status', ['applied'])
  }
  await destroySession()
  redirect('/?m=' + encodeURIComponent('탈퇴가 완료됐습니다.'))
}
