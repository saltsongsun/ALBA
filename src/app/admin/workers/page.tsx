import Icon from '@/components/Icon'
import RosterLock, { RosterOpenBar, RosterTooMany } from '@/components/RosterLock'
import { ROSTER_MINUTES, rosterUnlockedFor, rosterViewAllowed } from '@/lib/rosterLock'
import type { Metadata } from 'next'
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { ContactButtons } from '@/components/Contact'
import { StarAvg } from '@/components/Stars'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { companyWorkerIds } from '@/lib/company'
import { isMemberType, MEMBER_TYPES } from '@/lib/members'
import type { MemberType } from '@/lib/types'
import { ageOn, fmtDate, kstDate } from '@/lib/time'
import Flash from '@/components/Flash'
import { phoneFmt } from '@/lib/format'

export const metadata: Metadata = { title: '근무자' }

type Row = {
  id: string
  name: string
  phone: string
  role: string
  member_type?: MemberType
  birth_date: string | null
  active: boolean
  bank_account_enc: string | null
  photo_at: string | null
  created_at: string
  attendance: { work_date: string }[] | null
  ratings: { score: number }[] | null
}

export default async function WorkersPage(props: PageProps<'/admin/workers'>) {
  const admin = await requireAdmin()
  const sp = await props.searchParams
  // 보안: 명단은 관리자 본인 비밀번호를 한 번 더 넣어야 열림 (10분)
  const rosterLeft = await rosterUnlockedFor(admin.id)
  if (!rosterLeft) {
    const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' && k !== 'unlock' ? [[k, v]] : []))).toString()
    return <RosterLock next={`/admin/workers${qs ? `?${qs}` : ''}`} minutes={ROSTER_MINUTES} />
  }
  if (!(await rosterViewAllowed(admin, 'list'))) return <RosterTooMany />
  // 관리자는 근무자(알바) 명단과 따로: '관리자 명부'
  const { data: memberRows } = await db().from('company_members').select('user_id, role, created_at').eq('company_id', admin.companyId).order('created_at')
  const members = (memberRows ?? []) as { user_id: string; role: 'owner' | 'admin'; created_at: string }[]
  if (sp.view === 'admins') return <AdminRoster me={admin.id} members={members} m={typeof sp.m === 'string' ? sp.m : undefined} seconds={rosterLeft} />
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 30) : ''
  // 가입한 근무자는 모든 회사 공용 → 목록은 가입 회원 전체 (다른 회사 관리자·외주 업체 계정은 빼고).
  // 근무일수·평가는 이 회사 기록만, 주민번호·계좌 같은 민감 정보는 이 회사에 지원한 사람만 (근무자 화면에서)
  const f = sp.f === 'nophoto' || sp.f === 'noaccount' || sp.f === 'mine' || sp.f === 'new' ? sp.f : null
  // 최근 2일 안에 가입한 회원 (단체로 가입했을 때 사진·계좌 확인하고 공고에 확정하기 쉽게 · 오래 남으면 눈에 안 띄어서 2일만)
  const NEW_DAYS = 2
  const newSince = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString()
  const isNew = (u: { created_at: string }) => u.created_at >= newSince
  // 가입 유형으로 거르기: 아르바이트 / 전문가
  const t = isMemberType(sp.t) ? sp.t : null
  let query = db()
    .from('users')
    .select('id, name, phone, role, member_type, birth_date, active, bank_account_enc, photo_at, created_at, attendance(work_date), ratings:worker_ratings!worker_ratings_user_id_fkey(score)')
    .eq('attendance.company_id', admin.companyId)
    .eq('ratings.company_id', admin.companyId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (q) {
    const digits = q.replace(/\D/g, '')
    const safe = q.replace(/[%,()]/g, '')
    query = digits.length >= 3 ? query.like('phone', `%${digits}%`) : query.ilike('name', `%${safe}%`)
  }
  // 빠른 거르기: 사진 없음 · 계좌 없음
  if (f === 'nophoto') query = query.is('photo_at', null)
  if (f === 'noaccount') query = query.is('bank_account_enc', null)
  // 명단·우리 회사 지원자·관리자 목록을 한꺼번에 읽음 (차례로 기다리지 않게)
  const [workerIds, rowsRes] = await Promise.all([companyWorkerIds(admin.companyId), query])
  const applied = new Set(workerIds)
  const memberIds = new Set(members.map((m) => m.user_id))
  const users = (must(rowsRes) as Row[])
    // 관리자(우리 회사·다른 회사 모두)·외주 업체 계정은 근무자 목록에서 뺌 — 우리 회사 관리자는 '관리자 명부'에서
    .filter((u) => u.role !== 'admin' && !memberIds.has(u.id) && u.member_type !== 'vendor')
    // 직접 가입해 확인 전인 회사는 우리 회사에 지원한 회원만 (전체 회원 명단은 확인 뒤)
    .filter((u) => admin.companyVerified || applied.has(u.id))
    // 탈퇴·정지한 회원은 우리 회사와 관계있을 때만 (기록 보관 의무는 함께 일한 회사에만)
    .filter((u) => u.active || applied.has(u.id))
    .filter((u) =>
      f === 'nophoto' ? !u.photo_at : f === 'noaccount' ? !u.bank_account_enc : f === 'mine' ? applied.has(u.id) : f === 'new' ? isNew(u) : true,
    )
    .filter((u) => !t || (u.member_type ?? 'worker') === t)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 300)
  const stat: Record<string, { days: number; last: string }> = {}
  for (const u of users) {
    for (const a of u.attendance ?? []) {
      const s = (stat[u.id] ??= { days: 0, last: '' })
      s.days++
      if (a.work_date > s.last) s.last = a.work_date
    }
  }
  const today = kstDate()

  const ageBadges = (u: Row) => {
    if (!u.birth_date) return null
    const age = ageOn(u.birth_date, today)
    return (
      <>
        <span className="text-sm text-mute">{age}세</span>
        {age < 18 && <span className="badge bg-rose-50 text-rose-600">연소자</span>}
      </>
    )
  }
  const roleBadges = (u: Row) => (
    <>
      {isNew(u) && (
        <span className="badge bg-emerald-50 text-emerald-700">
          <Icon name="sparkle" /> 새 가입
        </span>
      )}
      <StarAvg scores={(u.ratings ?? []).map((r) => r.score)} />
      {u.member_type && u.member_type !== 'worker' && (
        <span className={`badge ${MEMBER_TYPES[u.member_type].badge}`}>
          {MEMBER_TYPES[u.member_type].emoji} {MEMBER_TYPES[u.member_type].short}
        </span>
      )}
      {!u.active && <span className="badge bg-gray-100 text-mute">탈퇴·정지</span>}
    </>
  )

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <RosterOpenBar seconds={rosterLeft} />
      <RosterTabs view="workers" admins={members.length} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">근무자 {users.length}명</h1>
        <div className="flex w-full gap-2 sm:w-auto">
          <form className="flex min-w-0 flex-1 gap-1 sm:flex-none">
            <input name="q" defaultValue={q} className="input py-2 text-sm sm:w-48" placeholder="이름 또는 번호 검색" />
            <button className="btn-gray btn-sm">검색</button>
          </form>
          <a href="/admin/export/workers" className="btn-soft btn-sm">
            명부 CSV
          </a>
        </div>
      </div>

      {!admin.companyVerified && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          🔒 지금은 <b>우리 회사에 지원한 회원</b>만 보여요. 해피워크 전체 회원 명단은 회사 확인을 마친 뒤에 열려요. 그동안은 공고 링크를 보내 지원을 받아 주세요.
        </p>
      )}
      <div className="fade-x flex gap-1.5 overflow-x-auto pb-1" data-filter-row>
        {(
          [
            [null, null, '전체'],
            [null, 'new', '새로 가입'],
            [null, 'mine', '우리 회사 지원자'],
            ['worker', null, '알바'],
            ['expert', null, '전문가'],
            [null, 'nophoto', '사진 없음'],
            [null, 'noaccount', '계좌 없음'],
          ] as const
        ).map(([tk, fk, label]) => (
          <Link
            key={label}
            href={`/admin/workers${tk ? `?t=${tk}` : fk ? `?f=${fk}` : ''}`}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${t === tk && f === fk ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* 휴대폰: 카드 목록 */}
      <div className="stagger space-y-2 sm:hidden">
        {users.map((u) => (
          <div key={u.id} className={`card p-4 ${u.active ? '' : 'opacity-50'}`}>
            <div className="flex items-center gap-3">
              <Avatar id={u.id} name={u.name} photoAt={u.photo_at} size="lg" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <Link href={`/admin/workers/${u.id}`} className="text-[17px] font-bold">
                  {u.name}
                </Link>
                {ageBadges(u)}
                {roleBadges(u)}
              </div>
            </div>
            <div className="mt-2">
              <ContactButtons phone={u.phone} name={u.name} />
            </div>
            <p className="mt-2 text-xs text-mute">
              근무 {stat[u.id]?.days ?? 0}일{stat[u.id]?.last && ` · 최근 ${fmtDate(stat[u.id].last)}`} · 계좌{' '}
              {u.bank_account_enc ? '등록' : <span className="text-rose-500">미등록</span>} · 가입 {fmtDate(kstDate(u.created_at))}
            </p>
          </div>
        ))}
      </div>

      {/* 넓은 화면: 표 */}
      <div className="card hidden overflow-x-auto p-0 sm:block">
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>나이</th>
              <th>연락처</th>
              <th>근무일수</th>
              <th>최근 근무</th>
              <th>계좌</th>
              <th>가입일</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                <td className="whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span className="mr-1">
                      <Avatar id={u.id} name={u.name} photoAt={u.photo_at} size="sm" />
                    </span>
                    <Link href={`/admin/workers/${u.id}`} className="font-semibold hover:text-brand-600">
                      {u.name}
                    </Link>
                    {roleBadges(u)}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-1 whitespace-nowrap">{ageBadges(u) ?? '-'}</div>
                </td>
                <td className="whitespace-nowrap">
                  <ContactButtons phone={u.phone} name={u.name} />
                </td>
                <td className="whitespace-nowrap">{stat[u.id]?.days ?? 0}일</td>
                <td className="whitespace-nowrap">{stat[u.id]?.last ? fmtDate(stat[u.id].last) : '-'}</td>
                <td className="whitespace-nowrap">{u.bank_account_enc ? '등록' : <span className="text-rose-500">미등록</span>}</td>
                <td className="whitespace-nowrap text-mute">{fmtDate(kstDate(u.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 근무자 명단 / 관리자 명부 고르기 (관리자는 알바 명단과 따로 관리) */
function RosterTabs({ view, admins }: { view: 'workers' | 'admins'; admins: number }) {
  return (
    <nav aria-label="명단 고르기" className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line" data-roster-tabs>
      {(
        [
          ['workers', '/admin/workers', '근무자 명단'],
          ['admins', '/admin/workers?view=admins', `관리자 명부 ${admins}`],
        ] as const
      ).map(([k, href, label]) => (
        <Link
          key={k}
          href={href}
          aria-current={view === k ? 'page' : undefined}
          className={`rounded-xl py-2 text-center text-sm font-bold transition active:scale-95 ${view === k ? 'bg-ink text-white' : 'text-sub'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

/** 관리자 명부: 이 회사 관리자만 (대표 관리자 먼저) · 초대·빼기는 회사 설정에서 */
async function AdminRoster({
  me,
  members,
  m,
  seconds,
}: {
  me: string
  members: { user_id: string; role: 'owner' | 'admin'; created_at: string }[]
  m?: string
  seconds: number
}) {
  const ids = members.map((x) => x.user_id)
  const people = new Map(
    ids.length
      ? (
          ((await db().from('users').select('id, name, phone, photo_at, active').in('id', ids)).data ?? []) as {
            id: string
            name: string
            phone: string
            photo_at: string | null
            active: boolean
          }[]
        ).map((p) => [p.id, p])
      : [],
  )
  const list = [...members].sort((a, b) => (a.role === b.role ? a.created_at.localeCompare(b.created_at) : a.role === 'owner' ? -1 : 1))
  return (
    <div className="space-y-4">
      <Flash m={m} />
      <RosterOpenBar seconds={seconds} />
      <RosterTabs view="admins" admins={members.length} />
      <div>
        <h1 className="text-2xl font-extrabold">관리자 {members.length}명</h1>
        <p className="mt-1 text-sm text-sub">우리 회사 관리자만 따로 모았어요. 근무자 명단·명부 CSV에는 들어가지 않아요.</p>
      </div>
      <div className="stagger space-y-2" data-admin-roster>
        {list.map((x) => {
          const p = people.get(x.user_id)
          if (!p) return null
          return (
            <div key={x.user_id} className={`card p-4 ${p.active ? '' : 'opacity-50'}`} data-admin-row={x.user_id}>
              <div className="flex items-center gap-3">
                <Avatar id={p.id} name={p.name} photoAt={p.photo_at} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <b className="text-[17px]">{p.name}</b>
                    {x.user_id === me && <span className="text-sm text-mute">(나)</span>}
                    <span className={`badge ${x.role === 'owner' ? 'bg-ink text-white' : 'bg-brand-50 text-brand-700'}`}>{x.role === 'owner' ? '대표 관리자' : '관리자'}</span>
                  </p>
                  <p className="text-xs text-mute">합류 {fmtDate(kstDate(x.created_at))}</p>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                <span className="block text-sm text-sub tabular-nums">{phoneFmt(p.phone)}</span>
                {x.user_id !== me && <ContactButtons phone={p.phone} name={p.name} showNumber={false} />}
              </div>
            </div>
          )
        })}
      </div>
      <Link href="/admin/settings#admins" className="block text-center text-sm font-semibold text-brand-600">
        관리자 초대·빼기는 회사 설정에서 →
      </Link>
    </div>
  )
}
