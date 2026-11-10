'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { blindIndex, decrypt, encrypt, hashPin, verifyPin } from '@/lib/crypto'
import { approvedCounts, audit, ensurePendingDocs, getJob, getSettings, releaseDocs } from '@/lib/data'
import { db, must } from '@/lib/db'
import { buildDocVars, renderTemplate } from '@/lib/docs'
import { calcDay, OT_ASK_MIN, scheduledEnd, shiftOf, workOver } from '@/lib/pay'
import { sendAdminPush } from '@/lib/push'
import { finishIfAllOut } from '@/lib/autoFinish'
import { remindOthersToClockOut } from '@/lib/remind'
import { parseCareers } from '@/lib/careers'
import { EMERGENCY_MEMO, joinOk } from '@/lib/emergency'
import { note, overLimit, recent } from '@/lib/ratelimit'
import { agreedShiftFor, applyAgreedShift, changeWord, span } from '@/lib/shift'
import { FULL_TIME_MARK, fixTime, isFullTimeAsk, pendingFix, SIGNAL, signalOf } from '@/lib/signals'
import { adminCompanies, clientInfo, createSession, destroySession, requireUser } from '@/lib/session'
import { ageOn, dateList, fmtDate, fmtDateRange, hhmm, kstAt, kstDate, kstTime, minutesText } from '@/lib/time'
import type { Application, Attendance, DocTemplate, Job, ShiftChange, SignedDoc, UserRow } from '@/lib/types'
import { isDate, isPin, isUuid, line, normalizePhone, optLine, optStr, parseRrn, str, weakPin } from '@/lib/validate'
import { canOpenJobDocs } from '@/lib/doc-access'
import { canApplyTo, myWorkTab, parseSpecialty } from '@/lib/members'
import { linkVendorAccount } from '@/lib/partners'
import type { FormState } from './auth'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

// ───────────── 지원 ─────────────

/** 이 회사를 맡은 관리자인지 (운영자의 '모든 회사'는 빼고 실제 소속만) */
async function adminOf(userId: string, companyId: string): Promise<boolean> {
  return (await adminCompanies(userId, false)).some((c) => c.id === companyId)
}

/**
 * 관리자 계정이 다른 회사 공고에 근무자로 지원하기 전, 근무자 정보를 처음 한 번 넣기 (사용자 요청 2026-11-07 '한 계정으로 두 역할').
 * 아르바이트 가입과 같은 확인: 주민번호 13자리 · 만 15세 이상 · 다른 계정과 겹치지 않음 · 제3자 제공·고유식별정보 동의.
 * 이미 넣었으면 바꾸지 않음 (바꾸는 건 담당자 문의로) · 운영자 계정은 지원하지 않아 넣지 않음
 */
export async function addWorkerIdentity(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/me')
  if (user.role !== 'admin' || user.isSuper) return { error: '관리자 계정만 근무자 정보를 따로 넣어요.' }
  if (await overLimit(`worker-id:${user.id}`, 5, 3600)) return { error: '시도가 너무 많아요. 한 시간 뒤에 다시 시도해 주세요.' }
  const rrn = parseRrn(str(form, 'rrn1') + str(form, 'rrn2'))
  if (!rrn) return { error: '주민등록번호 13자리를 정확히 입력해 주세요.' }
  if (form.get('agree_third') !== 'on' || form.get('agree_rrn') !== 'on') return { error: '필수 동의 항목에 모두 체크해 주세요.' }
  if (ageOn(rrn.birthDate) < 15) return { error: '만 15세 미만은 근무할 수 없습니다. (근로기준법 제64조)' }
  const { data: cur } = await db().from('users').select('rrn_enc').eq('id', user.id).maybeSingle()
  if ((cur as { rrn_enc: string | null } | null)?.rrn_enc) return { ok: '이미 근무자 정보가 있어요. 바로 지원할 수 있어요.' }
  const rrnHash = blindIndex(rrn.digits)
  const { data: dup } = await db().from('users').select('id').eq('rrn_hash', rrnHash).neq('id', user.id).maybeSingle()
  // 어떤 주민번호가 가입돼 있는지 알려 주지 않도록 두루뭉술하게 (아르바이트 가입과 같은 말)
  if (dup) return { error: '이 정보로는 등록할 수 없어요. 예전에 근무자로 가입한 번호가 있으면 그 번호로 로그인하거나 담당자에게 문의해 주세요.' }
  const { error } = await db()
    .from('users')
    .update({
      rrn_enc: encrypt(rrn.digits),
      rrn_hash: rrnHash,
      rrn_masked: rrn.masked,
      birth_date: rrn.birthDate,
      gender: rrn.gender,
      is_foreigner: rrn.isForeigner,
    })
    .eq('id', user.id)
    .is('rrn_enc', null)
  if (error) return { error: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  await audit(user.id, 'worker.identity', user.id, '관리자 계정 근무자 정보 등록')
  revalidatePath('/me/profile')
  return { ok: '근무자 정보를 넣었어요. 이제 지원할 수 있어요.' }
}

export async function applyJob(jobId: string, form: FormData) {
  const user = await requireUser(`/jobs/${jobId}`)
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job) back('/', '공고를 찾을 수 없습니다.')
  const path = `/jobs/${jobId}`
  if (job.status !== 'open') back(path, '모집이 마감된 공고입니다.')
  if (job.end_date < kstDate()) back(path, '이미 끝난 행사입니다.')
  // 관리자 계정도 다른 회사 공고에는 근무자로 지원 (사용자 요청 2026-11-07 '한 계정으로 두 역할').
  // 맡은 회사 공고는 안 됨 (자기 지원을 스스로 확정·기록 수정하지 않게) · 운영자는 모든 회사를 맡아서 지원 안 함
  if (user.role === 'admin') {
    if (user.isSuper) back(path, '운영자 계정은 모든 회사를 관리해서 근무자로 지원할 수 없어요.')
    if (await adminOf(user.id, job.company_id)) back(path, '우리 회사 공고에는 근무자로 지원할 수 없어요. 관리자 화면에서 관리해 주세요.')
  }
  // 알바 공고는 아르바이트 회원, 전문가 의뢰는 전문가 회원만 (외주 업체는 견적 요청으로)
  if (!canApplyTo(user.memberType, job.audience)) {
    back(path, job.audience === 'expert' ? '전문가 회원만 지원할 수 있는 의뢰예요.' : '아르바이트 회원만 지원할 수 있는 공고예요.')
  }
  // 오늘이 마지막 날이고 근무 시간까지 끝났으면 받지 않음 (화면을 열어 둔 사이 끝난 경우)
  if (workOver(job, job.end_date)) back(path, `오늘 ${job.audience === 'expert' ? '일정이' : '근무가'} ${hhmm(job.end_time)}에 끝났어요. 다른 공고를 찾아 주세요.`)
  // 얼굴 사진이 있어야 지원 (현장 담당자가 알아볼 수 있게. 가입 때 사진을 안 올린 예전 회원 포함)
  const { data: me } = await db().from('users').select('photo_at, rrn_enc').eq('id', user.id).maybeSingle()
  if (!(me as { photo_at: string | null } | null)?.photo_at) back(path, '얼굴 사진을 먼저 올려 주세요. 현장에서 담당자가 알아볼 수 있게 필요해요.')
  // 관리자로 가입한 계정은 근무자 정보(주민등록번호)가 없음 → 처음 한 번 넣어야 지원 (근로계약·신고에 필요)
  if (user.role === 'admin' && !(me as { rrn_enc: string | null } | null)?.rrn_enc) back(path, '근무자 정보(주민등록번호)를 먼저 넣어 주세요. 근로계약과 신고에 필요해요.')

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
    company_id: job.company_id,
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
    sendAdminPush(job.company_id, {
      title: status === 'approved' ? '✅ 자동 확정' : '🙋 새 지원',
      body: `${user.name} · ${job.title}`,
      url: `/admin/jobs/${jobId}?tab=apps`,
      tag: `apply-${jobId}`,
    }, { optional: true }),
  )
  revalidatePath('/me')
  // 전문가 의뢰는 전문가 화면의 '내 일' 탭으로 안내
  const tab = myWorkTab(job.audience)
  back(
    path,
    status === 'approved'
      ? `${job.audience === 'expert' ? '의뢰가' : '근무가'} 확정됐어요! ${tab}에서 서류에 서명해 주세요.`
      : `지원이 접수됐어요. 확정되면 ${tab}에 표시됩니다.`,
  )
}

export async function cancelApplication(appId: string, form?: FormData) {
  const user = await requireUser()
  const { data } = await db()
    .from('applications')
    .select('id, job_id, user_id, company_id, status, job:jobs(title, start_date, end_date, start_time)')
    .eq('id', appId)
    .maybeSingle()
  const app = data as {
    id: string
    job_id: string
    user_id: string
    company_id: string
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
  // 서명 대기는 지우고, 이미 서명한 서류도 무효로 (근무 기록이 없을 때만 취소할 수 있어서)
  await releaseDocs(app.job_id, user.id)
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
    await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: app.company_id, job_id: app.job_id, body })
    const title = app.job.title
    const jobId = app.job_id
    const companyId = app.company_id
    after(async () => {
      // 빈자리와 대기 인원을 함께 알려 바로 채울 수 있게
      const [job, { count: waiting }] = await Promise.all([
        getJob(jobId),
        db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('status', 'applied'),
      ])
      const left = job ? job.headcount - ((await approvedCounts([jobId]))[jobId] ?? 0) : 0
      await sendAdminPush(companyId, {
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

/**
 * 여러 날 행사: 근무 가능한 날 바꾸기.
 * 지원 중이면 자유롭게, 확정된 뒤에는 못 오는 날을 빼기만 (담당자에게 바로 알림 → 그날 빈자리를 채울 수 있게).
 * 지난 날은 그대로 둠
 */
export async function changeDates(appId: string, form: FormData) {
  const user = await requireUser()
  const { data } = isUuid(appId)
    ? await db()
        .from('applications')
        .select('id, user_id, job_id, company_id, status, available_dates, job:jobs(title, start_date, end_date, start_time)')
        .eq('id', appId)
        .maybeSingle()
    : { data: null }
  const app = data as
    | (Pick<Application, 'id' | 'user_id' | 'job_id' | 'company_id' | 'status' | 'available_dates'> & {
        job: Pick<Job, 'title' | 'start_date' | 'end_date' | 'start_time'> | null
      })
    | null
  if (!app || app.user_id !== user.id || !app.job) back('/me', '지원 내역을 찾을 수 없습니다.')
  const path = `/jobs/${app.job_id}`
  const job = app.job
  const today = kstDate()
  const all = dateList(job.start_date, job.end_date)
  if (all.length < 2 || job.end_date < today) back(path, '바꿀 수 있는 날이 없어요.')
  if (app.status !== 'applied' && app.status !== 'approved') back(path, '지원 중이거나 확정된 근무만 바꿀 수 있어요.')
  const approved = app.status === 'approved'
  const before = app.available_dates ?? all
  const picked = new Set(form.getAll('dates').map(String))
  const next = all.filter((d) => (d < today ? before.includes(d) : picked.has(d)))
  const added = next.filter((d) => !before.includes(d))
  const removed = before.filter((d) => d >= today && all.includes(d) && !next.includes(d))
  if (!next.some((d) => d >= today)) {
    back(path, approved ? '남은 날을 모두 빼려면 아래 ‘근무를 못 하게 됐어요’로 취소해 주세요.' : '근무 가능한 날을 하나 이상 골라 주세요.')
  }
  if (approved && added.length) back(path, '확정된 뒤에는 날을 더할 수 없어요. 담당자에게 문의해 주세요.')
  if (!added.length && !removed.length) back(path, '바뀐 날이 없어요.')
  if (approved) {
    const { count } = await db()
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', app.job_id)
      .eq('user_id', user.id)
      .in('work_date', removed)
    if (count) back(path, '이미 출근 기록이 있는 날은 뺄 수 없어요.')
  }
  const { data: done } = await db()
    .from('applications')
    .update({ available_dates: next.length === all.length ? null : next })
    .eq('id', app.id)
    .eq('status', app.status)
    .select('id')
  if (!(done as { id: string }[] | null)?.length) back(path, '지원 상태가 바뀌었어요. 화면을 새로 고쳐 주세요.')

  if (approved) {
    // 확정 근무에서 날을 뺐으면 담당자 문의함 + 휴대폰 알림 (그날 사람을 다시 구할 시간을 벌게)
    const reason = str(form, 'reason', 100)
    const hoursLeft = (kstAt(removed[0], job.start_time).getTime() - Date.now()) / 3_600_000
    const soon = hoursLeft < 24
    const days = removed.map(fmtDate).join(', ')
    const body = [
      `⚠️ 근무일 취소${soon ? ' (근무 24시간 안)' : ''}`,
      `${job.title} · ${days} 근무를 못 하게 됐어요. (남은 근무일: ${next.filter((d) => d >= today).map(fmtDate).join(', ')})`,
      reason && `사유: ${reason}`,
    ]
      .filter(Boolean)
      .join('\n')
    await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: app.company_id, job_id: app.job_id, body })
    const jobId = app.job_id
    const companyId = app.company_id
    after(async () =>
      sendAdminPush(companyId, {
        title: `⚠️ 근무일 취소${soon ? ' (24시간 안)' : ''}`,
        body: `${user.name} · ${job.title} · ${days}${reason ? ` · ${reason}` : ''}`,
        url: `/admin/jobs/${jobId}?tab=att&date=${removed[0]}`,
        tag: `days-${jobId}-${user.id}`,
      }),
    )
    revalidatePath('/admin/chat')
    revalidatePath(`/admin/jobs/${jobId}`)
  }
  revalidatePath('/me')
  revalidatePath(path)
  back(path, approved ? `${removed.map(fmtDate).join(', ')} 근무를 뺐어요. 담당자에게 알렸어요.` : '근무 가능한 날을 바꿨어요.')
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
    if (!pos) return { error: '현장 위치를 확인하지 못했어요. 이 행사는 현장에서만 근무 시작을 누를 수 있어요.', gps: true }
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
      // 이날 근무시간 변경에 동의했으면 그 시간으로
      ...(await agreedShiftFor(jobId, user.id, today)),
    })
  if (error) {
    return { error: error.code === '23505' ? '오늘은 이미 출근 기록이 있습니다.' : '출근 기록 중 문제가 생겼어요. 다시 시도해 주세요.' }
  }
  revalidatePath('/me')
  // 문의 채팅 안의 근무 버튼으로 눌렀어도 바로 '근무 중'으로 보이게
  revalidatePath('/me/chat')
  return { ok: '근무를 시작했어요. 일이 끝나면 꼭 ‘근무 종료’를 눌러 주세요!' }
}

export async function clockOut(attendanceId: string, lat: number | null, lng: number | null): Promise<ClockResult> {
  // 로그인 확인과 기록 조회(행사장 좌표 포함)를 함께 하고, 본인 기록인지는 아래에서 확인
  const [user, { data }] = await Promise.all([
    requireUser(),
    isUuid(attendanceId)
      ? db().from('attendance').select('user_id, clock_out, job_id, work_date, job:jobs(lat, lng)').eq('id', attendanceId).maybeSingle()
      : { data: null },
  ])
  if (!isUuid(attendanceId)) return { error: '잘못된 요청입니다.' }
  const att = data as { user_id: string; clock_out: string | null; job_id: string; work_date: string; job: { lat: number | null; lng: number | null } | null } | null
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
  // 마지막 날 마지막으로 퇴근한 사람이면 행사 종료 · 아니면 종료 시각이 지났는데 아직 안 누른 다른 사람에게 '근무 종료를 눌러 주세요'
  if (!(await finishIfAllOut(att.job_id, att.work_date))) {
    after(() => remindOthersToClockOut(att.job_id, att.work_date, user.id).then(() => null, () => null))
  }
  revalidatePath('/me')
  revalidatePath('/me/chat')
  return { ok: '근무를 종료했어요. 수고하셨습니다!' }
}

/**
 * 오늘 기록된 출근·종료 시각이 틀렸을 때 (종료를 실수로 일찍 누름 등): 담당자에게 정정 요청.
 * 담당자가 출퇴근 탭에서 한 번에 고치거나 그대로 둠 (근무자가 직접 고치지는 않음)
 */
export async function requestFix(attendanceId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  if (!isUuid(attendanceId)) return { error: '잘못된 요청입니다.' }
  const field = form.get('field') === 'in' ? 'in' : 'out'
  const time = str(form, 'time', 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: '실제 시각을 골라 주세요.' }
  const reason = optStr(form, 'reason', 100)
  const { data } = await db()
    .from('attendance')
    .select('id, user_id, job_id, company_id, work_date, clock_in, clock_out, adj_in, adj_out, paid, job:jobs(title)')
    .eq('id', attendanceId)
    .maybeSingle()
  const att = data as
    | (Pick<Attendance, 'id' | 'user_id' | 'job_id' | 'company_id' | 'work_date' | 'clock_in' | 'clock_out' | 'adj_in' | 'adj_out' | 'paid'> & {
        job: { title: string } | null
      })
    | null
  if (!att || att.user_id !== user.id || !att.job) return { error: '근무 기록을 찾을 수 없습니다.' }
  if (att.work_date !== kstDate()) return { error: '오늘 근무만 여기서 요청할 수 있어요. 지난 근무는 문의함으로 알려 주세요.' }
  if (!att.clock_out) return { error: '근무를 종료한 뒤에 요청할 수 있어요.' }
  if (att.paid) return { error: '이미 급여가 지급된 기록이에요. 문의함으로 알려 주세요.' }
  const curIn = new Date(att.adj_in ?? att.clock_in)
  const curOut = new Date(att.adj_out ?? att.clock_out)
  const want = fixTime(att.work_date, { field, time }, curIn)
  if (want.getTime() > Date.now() + 60_000) return { error: '아직 오지 않은 시각이에요.' }
  if (field === 'in' ? want >= curOut : want <= curIn) return { error: field === 'in' ? '출근 시각은 종료보다 앞이어야 해요.' : '종료 시각은 출근보다 뒤여야 해요.' }
  if (kstTime(field === 'in' ? curIn : curOut) === time) return { error: '지금 기록된 시각과 같아요.' }
  // 너무 자주 보내지 않게 (이날 3번까지)
  const { data: sent } = await db()
    .from('messages')
    .select('body, created_at')
    .eq('thread_user_id', user.id)
    .eq('job_id', att.job_id)
    .eq('from_admin', false)
    .gte('created_at', kstAt(att.work_date, '00:00').toISOString())
    .limit(50)
  const asked = ((sent ?? []) as { body: string; created_at: string }[]).filter((m) => kstDate(m.created_at) === att.work_date && signalOf(m.body) === 'fix')
  if (asked.length >= 3) return { error: '오늘은 이미 여러 번 요청했어요. 담당자에게 전화해 주세요.' }

  const word = field === 'in' ? '출근' : '종료'
  const body = [
    SIGNAL.fix,
    `${att.job.title} · ${fmtDate(att.work_date)} 근무`,
    `기록 ${kstTime(curIn)}~${kstTime(curOut)} → 실제 ${word} ${time}`,
    reason && `사유: ${reason}`,
  ]
    .filter(Boolean)
    .join('\n')
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: att.company_id, job_id: att.job_id, body }))
  const { job_id: jobId, work_date: date, company_id: companyId } = att
  const title = att.job.title
  after(async () =>
    sendAdminPush(companyId, {
      title: SIGNAL.fix,
      body: `${user.name} · ${title} · 실제 ${word} ${time}${reason ? ` · ${reason}` : ''}`,
      url: `/admin/jobs/${jobId}?tab=att&date=${date}`,
      tag: `fix-${jobId}-${user.id}`,
    }),
  )
  revalidatePath('/me')
  revalidatePath('/admin/chat')
  revalidatePath(`/admin/jobs/${jobId}`)
  return { ok: `담당자에게 ${word} ${time}(으)로 정정을 요청했어요. 고쳐지면 알려 드려요.` }
}

/**
 * 일찍 끝났어도 시간 인정받기 (사용자 요청 2026-11-07 "일찍 퇴근해도 정상 지급할 때가 있어서 · 관리자 승인하면 근로조건대로 인정").
 * 오늘 근무를 예정 종료 시각보다 일찍 마쳤을 때: '예정 종료 시각까지 인정' 요청을 담당자에게 (기록 정정 요청과 같은 흐름).
 * 담당자가 승인하면 종료 시각을 예정 종료 시각으로 보정 → 정산에 근로조건대로 들어감
 */
export async function requestFullTime(attendanceId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  if (!isUuid(attendanceId)) return { error: '잘못된 요청입니다.' }
  const reason = optStr(form, 'reason', 100)
  const { data } = await db()
    .from('attendance')
    .select('id, user_id, job_id, company_id, work_date, clock_in, clock_out, adj_in, adj_out, paid, sched_start, sched_end, job:jobs(title, start_time, end_time)')
    .eq('id', attendanceId)
    .maybeSingle()
  const att = data as
    | (Pick<Attendance, 'id' | 'user_id' | 'job_id' | 'company_id' | 'work_date' | 'clock_in' | 'clock_out' | 'adj_in' | 'adj_out' | 'paid' | 'sched_start' | 'sched_end'> & {
        job: { title: string; start_time: string; end_time: string } | null
      })
    | null
  if (!att || att.user_id !== user.id || !att.job) return { error: '근무 기록을 찾을 수 없습니다.' }
  if (att.work_date !== kstDate()) return { error: '오늘 근무만 여기서 요청할 수 있어요. 지난 근무는 문의함으로 알려 주세요.' }
  if (!att.clock_out) return { error: '근무를 종료한 뒤에 요청할 수 있어요.' }
  if (att.paid) return { error: '이미 급여가 지급된 기록이에요. 문의함으로 알려 주세요.' }
  const end = scheduledEnd(shiftOf(att.job, att), att.work_date)
  const curIn = new Date(att.adj_in ?? att.clock_in)
  const curOut = new Date(att.adj_out ?? att.clock_out)
  if (curOut.getTime() >= end.getTime() - 60_000) return { error: '예정 종료 시각까지 일했어요. 따로 요청하지 않아도 돼요.' }
  // 이미 보내 놓고 답을 못 받은 요청 · 너무 자주 보내지 않게 (이날 정정·인정 요청 3번까지)
  const { data: msgs } = await db()
    .from('messages')
    .select('body, created_at, from_admin')
    .eq('thread_user_id', user.id)
    .eq('job_id', att.job_id)
    .gte('created_at', kstAt(att.work_date, '00:00').toISOString())
    .limit(100)
  const rows = (msgs ?? []) as { body: string; created_at: string; from_admin: boolean }[]
  const waiting = pendingFix(rows, att.work_date)
  if (waiting && isFullTimeAsk(waiting.body)) return { error: '이미 요청했어요. 담당자 확인을 기다려 주세요.' }
  if (rows.filter((m) => !m.from_admin && kstDate(m.created_at) === att.work_date && signalOf(m.body) === 'fix').length >= 3)
    return { error: '오늘은 이미 여러 번 요청했어요. 담당자에게 전화해 주세요.' }
  const endText = kstTime(end)
  const body = [
    SIGNAL.fix,
    `${att.job.title} · ${fmtDate(att.work_date)} 근무`,
    `기록 ${kstTime(curIn)}~${kstTime(curOut)} → 실제 종료 ${endText}`,
    `사유: ${FULL_TIME_MARK}${reason ? ` · ${reason}` : ''}`,
  ].join('\n')
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: att.company_id, job_id: att.job_id, body }))
  const { job_id: jobId, work_date: date, company_id: companyId } = att
  const title = att.job.title
  const outText = kstTime(curOut)
  after(async () =>
    sendAdminPush(companyId, {
      title: '🙏 시간 인정 요청',
      body: `${user.name} · ${title} · ${outText}에 끝남 → ${endText}까지 인정 요청${reason ? ` · ${reason}` : ''}`,
      url: `/admin/jobs/${jobId}?tab=att&date=${date}`,
      tag: `fix-${jobId}-${user.id}`,
    }),
  )
  revalidatePath('/me')
  revalidatePath('/admin/chat')
  revalidatePath(`/admin/jobs/${jobId}`)
  return { ok: `근로조건대로 ${endText}까지 인정해 달라고 요청했어요. 담당자가 승인하면 알려 드려요.` }
}

/**
 * 지난 근무의 종료를 깜빡했을 때 (다음 날 앱을 열면): 예정 종료 시각이나 직접 고른 시각으로 종료.
 * 지금 누르면 다음 날 시각이 찍혀 연장 확인이 잘못 뜨므로 끝난 시각을 따로 받음.
 * 예정 종료 시각 = 관리자 '일괄 종료'와 같은 기준, 그보다 늦은 시각은 기존처럼 서로 확인해야 급여에 들어감
 */
export async function closeForgotten(attendanceId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  if (!isUuid(attendanceId)) return { error: '잘못된 요청입니다.' }
  const { data } = await db()
    .from('attendance')
    .select('id, user_id, job_id, work_date, clock_in, clock_out, sched_start, sched_end, note, job:jobs(title, start_time, end_time)')
    .eq('id', attendanceId)
    .maybeSingle()
  const att = data as
    | (Pick<Attendance, 'id' | 'user_id' | 'job_id' | 'work_date' | 'clock_in' | 'clock_out' | 'sched_start' | 'sched_end' | 'note'> & {
        job: Pick<Job, 'title' | 'start_time' | 'end_time'> | null
      })
    | null
  if (!att || att.user_id !== user.id || !att.job) return { error: '근무 기록을 찾을 수 없습니다.' }
  if (att.clock_out) return { error: '이미 종료된 근무입니다.' }
  const now = new Date()
  const planned = scheduledEnd(shiftOf(att.job, att), att.work_date)
  if (att.work_date >= kstDate() || now < planned) return { error: '아직 근무 시간이에요. 근무 종료 버튼을 눌러 주세요.' }

  const clockIn = new Date(att.clock_in)
  let end = planned
  const custom = form.get('end') === 'custom'
  if (custom) {
    const t = str(form, 'end_time', 5)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { error: '끝난 시각을 골라 주세요.' }
    end = kstAt(att.work_date, t)
    // 자정을 넘겨 끝난 경우 (예: 22:00 시작 → 02:00 종료)
    if (end <= clockIn) end = new Date(end.getTime() + 86_400_000)
    if (end > now) return { error: '아직 오지 않은 시각이에요. 끝난 시각을 다시 골라 주세요.' }
  }
  if (end <= clockIn) return { error: `시작(${kstTime(att.clock_in)})보다 앞선 시각이에요. 담당자에게 문의해 주세요.` }

  const memo = `근무자가 나중에 종료 입력 (${custom ? '직접 입력' : '예정 종료 시각'} ${kstTime(end.toISOString())})`
  const { data: done } = await db()
    .from('attendance')
    .update({ clock_out: end.toISOString(), note: (att.note ? `${att.note} · ${memo}` : memo).slice(0, 300) })
    .eq('id', att.id)
    .is('clock_out', null)
    .select('id')
  if (!(done as { id: string }[] | null)?.length) return { error: '이미 종료된 근무입니다.' }
  await finishIfAllOut(att.job_id, att.work_date)
  // 담당자가 문의함에서 확인할 수 있게 (안 읽음 표시)
  await db()
    .from('messages')
    .insert({
      thread_user_id: user.id,
      sender_id: user.id,
      from_admin: false,
      job_id: att.job_id,
      body: `🕒 근무 종료 늦게 입력\n${att.job.title} · ${fmtDate(att.work_date)} 근무 종료를 누르지 않아 ${kstTime(end.toISOString())} 종료로 입력했어요 (${custom ? '직접 입력' : '예정 종료 시각'}).`,
    })
  revalidatePath('/me')
  revalidatePath('/admin/chat')
  revalidatePath(`/admin/jobs/${att.job_id}`)
  back('/me', `${fmtDate(att.work_date)} 근무를 ${kstTime(end.toISOString())} 종료로 기록했어요.`)
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
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: r.job.company_id, job_id: jobId, body }))
  const title = r.job.title
  const companyId = r.job.company_id
  after(async () =>
    sendAdminPush(companyId, {
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
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: r.job.company_id, job_id: jobId, body }))
  const title = r.job.title
  const companyId = r.job.company_id
  after(async () =>
    sendAdminPush(companyId, {
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

// ───────────── 근무시간 변경 동의 ─────────────

/**
 * 담당자가 근무시간을 바꿨을 때 '계속하시겠습니까?'에 답하기.
 * agree: 바뀐 시간으로 근무 (그 시간까지 급여 계산) / decline: 그날만 바뀐 것은 원래 시간대로, 전체 일정이 바뀐 것은 근무 확정 취소
 */
export async function answerShift(changeId: string, choice: 'agree' | 'decline') {
  const user = await requireUser('/me')
  if (!isUuid(changeId) || !['agree', 'decline'].includes(choice)) return
  const { data } = await db().from('shift_changes').select('*').eq('id', changeId).maybeSingle()
  const c = data as ShiftChange | null
  if (!c || c.user_id !== user.id) back('/me', '요청을 찾을 수 없어요.')
  if (c.status !== 'pending') back('/me', '이미 답한 요청이에요.')
  const { ip } = await clientInfo()
  must(
    await db()
      .from('shift_changes')
      .update({ status: choice === 'agree' ? 'agreed' : 'declined', answered_at: new Date().toISOString(), answered_by: user.id, answer_ip: ip || null })
      .eq('id', changeId)
      .eq('status', 'pending'),
  )
  const job = await getJob(c.job_id)
  const title = job?.title ?? ''
  const when = c.work_date ? fmtDate(c.work_date) : '전체 일정'
  if (choice === 'agree') {
    await applyAgreedShift(c)
    revalidatePath('/me')
    revalidatePath(`/admin/jobs/${c.job_id}`)
    back('/me', `${when} ${span(c.start_time, c.end_time)}으로 계속 근무하기로 했어요. 고맙습니다!`)
  }
  // 어려워요: 담당자 문의함에 남기고 휴대폰 알림 (사람을 다시 구하거나 일정을 조정하게)
  let cancelled = false
  if (!c.work_date) {
    const { count: worked } = await db().from('attendance').select('id', { count: 'exact', head: true }).eq('job_id', c.job_id).eq('user_id', user.id)
    if (!worked) {
      must(await db().from('applications').update({ status: 'cancelled' }).eq('job_id', c.job_id).eq('user_id', user.id).eq('status', 'approved'))
      await releaseDocs(c.job_id, user.id)
      cancelled = true
    }
  }
  const body = [
    `⚠️ 근무시간 ${changeWord(c)} 어려움`,
    `${title} · ${when} ${span(c.prev_start, c.prev_end)} → ${span(c.start_time, c.end_time)} ${changeWord(c)}에 응하기 어려워요.`,
    c.work_date ? `원래 시간(${hhmm(c.prev_end)})에 마칠게요.` : cancelled ? '근무 확정이 취소됐어요.' : '남은 일정은 담당자와 상의할게요.',
  ].join('\n')
  await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: c.company_id, job_id: c.job_id, body })
  after(async () =>
    sendAdminPush(c.company_id, {
      title: `⚠️ 근무시간 ${changeWord(c)} 어려움${cancelled ? ' · 확정 취소' : ''}`,
      body: `${user.name} · ${title} · ${when} ${span(c.start_time, c.end_time)}`,
      url: `/admin/jobs/${c.job_id}?tab=att${c.work_date ? `&date=${c.work_date}` : ''}`,
    }),
  )
  revalidatePath('/me')
  revalidatePath('/admin/chat')
  revalidatePath(`/admin/jobs/${c.job_id}`)
  back('/me', cancelled ? '근무 확정을 취소했어요. 담당자에게 알렸어요.' : `원래 시간(${hhmm(c.prev_end)})에 마치는 걸로 담당자에게 알렸어요.`)
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
      sendAdminPush(job.company_id, {
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

  const [job, settings, { data: tpl }, { data: me }, { data: app }] = await Promise.all([
    getJob(d.job_id),
    getSettings(d.company_id, { seal: true }),
    db().from('doc_templates').select('*').eq('id', d.template_id).maybeSingle(),
    db().from('users').select('name, phone, birth_date, address').eq('id', user.id).single(),
    db().from('applications').select('status, available_dates').eq('job_id', d.job_id).eq('user_id', user.id).maybeSingle(),
  ])
  // 지원 취소·확정 되돌림 뒤에는 서명할 수 없음 (화면을 열어 둔 채로 취소된 경우)
  if (!canOpenJobDocs((app as { status: string } | null)?.status)) return { error: '근무가 취소된 서류예요. 관리자에게 문의해 주세요.' }
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
  // 오늘 이 공고 근무일이고 아직 시작 전이면: 바로 '근무 시작' 버튼으로 (현장에서 서명하고 위로 올라가 찾지 않게)
  const a2 = app as { status: string; available_dates?: string[] | null } | null
  const workToday = a2?.status === 'approved' && job.start_date <= today && job.end_date >= today && (!a2.available_dates?.length || a2.available_dates.includes(today))
  if (workToday) {
    const { data: att } = await db().from('attendance').select('id').eq('job_id', d.job_id).eq('user_id', user.id).eq('work_date', today).maybeSingle()
    if (!att) redirect(`/me?m=${encodeURIComponent('서명을 모두 마쳤어요. 이제 근무를 시작할 수 있어요.')}#clock`)
  }
  redirect(`/me?m=${encodeURIComponent('서류 서명을 모두 마쳤어요.')}`)
}

// ───────────── 내 정보 ─────────────

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser()
  const { data: cur } = await db().from('users').select('bank_name, bank_account_enc, account_holder').eq('id', user.id).single()
  const account = str(form, 'bank_account', 40).replace(/[^\d-]/g, '')
  const bankName = account ? optLine(form, 'bank_name', 30) : null
  const holder = account ? optLine(form, 'account_holder', 30) || user.name : null
  // 급여가 엉뚱한 곳으로 가거나 이체가 실패하지 않게: 은행·자리수 확인
  if (account) {
    const digits = account.replace(/\D/g, '').length
    if (!bankName) return { error: '계좌의 은행을 골라 주세요.' }
    if (digits < 10 || digits > 16) return { error: `계좌번호가 ${digits}자리예요. 숫자 10~16자리인지 다시 확인해 주세요.` }
  }
  const prevAccount = decrypt(cur?.bank_account_enc)
  const bankChanged = (prevAccount ?? '') !== account || (cur?.bank_name ?? null) !== bankName || (cur?.account_holder ?? null) !== holder
  const emergency = str(form, 'emergency_phone')
  must(
    await db()
      .from('users')
      .update({
        address: optLine(form, 'address', 200),
        emergency_phone: emergency ? normalizePhone(emergency) ?? emergency.slice(0, 20) : null,
        bank_name: bankName,
        bank_account_enc: account ? encrypt(account) : null,
        account_holder: holder,
        ...(bankChanged ? { bank_changed_at: new Date().toISOString() } : {}),
      })
      .eq('id', user.id),
  )
  revalidatePath('/me/profile')
  // 다른 사람 명의 계좌면 지급이 늦어질 수 있어 알려 줌 (저장은 그대로)
  if (holder && holder.replace(/\s/g, '') !== user.name.replace(/\s/g, '')) {
    return { ok: `저장했어요. 예금주(${holder})가 본인 이름과 달라요. 본인 명의 계좌가 아니면 지급이 늦어질 수 있어요.` }
  }
  return { ok: '저장했어요.' }
}

/**
 * 현장 긴급 투입: 담당자가 보여 준 QR(오늘만 쓸 수 있는 코드)로 들어온 사람을 바로 확정.
 * 모집 인원과 상관없이 확정하고, 서류 서명 요청을 만든 뒤 담당자에게 알림
 */
export async function joinNow(jobId: string, code: string) {
  const user = await requireUser(`/join/${jobId}?c=${encodeURIComponent(code)}`)
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job || !joinOk(job, code)) back(`/join/${jobId}?c=${encodeURIComponent(code)}`, 'QR이 만료됐어요. 담당자에게 새 QR을 요청해 주세요.')
  const now = new Date().toISOString()
  const { data: existing } = await db().from('applications').select('id, status').eq('job_id', jobId).eq('user_id', user.id).maybeSingle()
  if ((existing as { status: string } | null)?.status !== 'approved') {
    const row = { status: 'approved', decided_at: now, admin_memo: EMERGENCY_MEMO, available_dates: null }
    if (existing) must(await db().from('applications').update(row).eq('id', (existing as { id: string }).id))
    else must(await db().from('applications').insert({ company_id: job.company_id, job_id: jobId, user_id: user.id, ...row }))
    await ensurePendingDocs(job, user.id)
    const title = job.title
    const companyId = job.company_id
    after(async () =>
      sendAdminPush(companyId, {
        title: '🚨 긴급 투입 합류',
        body: `${user.name} · ${title} · QR로 합류했어요`,
        url: `/admin/jobs/${jobId}?tab=att`,
        tag: `join-${jobId}`,
      }),
    )
  }
  revalidatePath('/me')
  revalidatePath(`/admin/jobs/${jobId}`)
  back('/me', '합류했어요! 서류에 서명한 뒤 근무 시작을 눌러 주세요.')
}

/** 내 정보에서 행사 경력 고치기 */
export async function saveCareers(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/me/profile')
  const careers = parseCareers(str(form, 'careers', 8000))
  if (!careers) return { error: '경력을 다시 입력해 주세요.' }
  must(await db().from('users').update({ careers }).eq('id', user.id))
  revalidatePath('/me/profile')
  return { ok: careers.length ? `경력 ${careers.length}개를 저장했어요.` : '경력을 비웠어요.' }
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

// ───────────── 가입 유형 · 전문가 정보 ─────────────

/** 아르바이트 ↔ 전문가 바꾸기 (외주 업체는 사업자라 바꿀 수 없음). 화면·지원할 수 있는 공고가 바뀜 */
export async function changeMemberType(type: 'worker' | 'expert') {
  const user = await requireUser('/me/profile')
  if (user.memberType === 'vendor' || !['worker', 'expert'].includes(type)) back('/me/profile', '바꿀 수 없는 가입 유형이에요.')
  if (user.memberType === type) back('/me/profile', '이미 그 유형이에요.')
  must(await db().from('users').update({ member_type: type }).eq('id', user.id))
  // 전문가가 되면 회사들이 이 번호로 등록해 둔 외주사와 이어서 견적 요청도 받게
  if (type === 'expert') await linkVendorAccount(user.id, null, user.phone)
  revalidatePath('/', 'layout')
  redirect(type === 'expert' ? `/pro?m=${encodeURIComponent('전문가로 바꿨어요. 전문가 의뢰에 지원할 수 있어요.')}` : `/?m=${encodeURIComponent('아르바이트로 바꿨어요.')}`)
}

/** 전문 분야·소개·포트폴리오 (외주 업체는 상호·사업자등록번호도) */
export async function saveProInfo(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/me/profile')
  if (user.memberType === 'worker') return { error: '전문가·외주 업체만 쓸 수 있어요.' }
  const raw = str(form, 'portfolio_url', 300)
  const url = raw ? (/^https?:\/\//.test(raw) ? raw : `https://${raw}`).replace(/^http:/, 'https:') : null
  if (url && !/^https:\/\/[^\s<>"']+\.[^\s<>"']+$/.test(url)) return { error: '포트폴리오 주소를 확인해 주세요. (예: https://example.com)' }
  const row: Record<string, unknown> = {
    specialty: parseSpecialty(str(form, 'specialty', 300)),
    intro: optStr(form, 'intro', 100),
    portfolio_url: url,
  }
  if (user.memberType === 'vendor') {
    const bizName = line(form, 'biz_name', 60)
    const bizNo = str(form, 'biz_no', 20).replace(/\D/g, '')
    if (bizName.length < 2) return { error: '상호를 입력해 주세요.' }
    if (bizNo.length !== 10) return { error: '사업자등록번호 10자리를 입력해 주세요.' }
    row.biz_name = bizName
    row.biz_no = bizNo
  }
  must(await db().from('users').update(row).eq('id', user.id))
  if (user.memberType === 'vendor') await linkVendorAccount(user.id, row.biz_no as string, user.phone)
  revalidatePath('/me/profile')
  revalidatePath('/pro')
  return { ok: '저장했어요.' }
}
