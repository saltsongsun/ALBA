import { pushEnabledIds } from '@/lib/push'
import Icon from '@/components/Icon'
import RosterLock, { RosterOpenBar, RosterTooMany } from '@/components/RosterLock'
import { ROSTER_MINUTES, rosterUnlockedFor, rosterViewAllowed } from '@/lib/rosterLock'
import type { Metadata } from 'next'
import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { ContactButtons } from '@/components/Contact'
import { StarAvg } from '@/components/Stars'
import { db, must } from '@/lib/db'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { GroupContact } from '@/components/GroupContact'
import { companyWorkerIds } from '@/lib/company'
import { isMemberType, MEMBER_TYPES } from '@/lib/members'
import type { MemberType } from '@/lib/types'
import { ageOn, fmtDate, kstDate } from '@/lib/time'
import Flash from '@/components/Flash'
import { ONLINE_MS, phoneFmt } from '@/lib/format'
import Presence from '@/components/Presence'
import SearchInput from '@/components/SearchInput'
import SortSelect from '@/components/SortSelect'
import { companyLevels } from '@/lib/xpCompany'

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
  last_seen_at?: string | null
  // 레벨의 '내 정보 다 채우기' 점수만 봄 (화면에 그리지 않음)
  emergency_phone?: string | null
  address?: string | null
  careers?: unknown
}

/** 명단 정렬 (사용자 요청 2026-11-13 "명단도 정렬 여러가지로") · 처음은 최근 가입순 */
const SORTS = [
  { value: 'new', label: '최근 가입순' },
  { value: 'level', label: '레벨 높은 순' },
  { value: 'days', label: '근무 많은 순' },
  { value: 'recent', label: '최근 근무순' },
  { value: 'rating', label: '평점 높은 순' },
  { value: 'name', label: '이름순' },
] as const
type SortKey = (typeof SORTS)[number]['value']

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
  // '접속 중'(최근 5분 안에 앱을 보고 있던 사람)은 최고 관리자만 거르고 봄
  const f =
    sp.f === 'nophoto' || sp.f === 'noaccount' || sp.f === 'nopush' || sp.f === 'mine' || sp.f === 'new' || (sp.f === 'online' && admin.isSuper) ? sp.f : null
  // 최근 2일 안에 가입한 회원 (단체로 가입했을 때 사진·계좌 확인하고 공고에 확정하기 쉽게 · 오래 남으면 눈에 안 띄어서 2일만)
  const NEW_DAYS = 2
  const newSince = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString()
  const isNew = (u: { created_at: string }) => u.created_at >= newSince
  // 가입 유형으로 거르기: 아르바이트 / 전문가
  const t = isMemberType(sp.t) ? sp.t : null
  const sort: SortKey = SORTS.find((o) => o.value === sp.s)?.value ?? 'new'
  // 거르기·검색·정렬을 서로 지우지 않게 주소를 함께 만듦
  const listHref = (o: { t?: string | null; f?: string | null; q?: string; s?: SortKey }) => {
    const qs = new URLSearchParams()
    if (o.t) qs.set('t', o.t)
    if (o.f) qs.set('f', o.f)
    if (o.q) qs.set('q', o.q)
    if (o.s && o.s !== 'new') qs.set('s', o.s)
    const str = qs.toString()
    return `/admin/workers${str ? `?${str}` : ''}`
  }
  let query = db()
    .from('users')
    .select(
      `id, name, phone, role, member_type, birth_date, active, bank_account_enc, photo_at, created_at, emergency_phone, address, careers, attendance(work_date), ratings:worker_ratings!worker_ratings_user_id_fkey(score)${admin.isSuper ? ', last_seen_at' : ''}`,
    )
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
  const onlineSince = new Date(Date.now() - ONLINE_MS).toISOString()
  if (f === 'online') query = query.gte('last_seen_at', onlineSince)
  // 명단·우리 회사 지원자·관리자 목록을 한꺼번에 읽음 (차례로 기다리지 않게)
  const [workerIds, rowsRes] = await Promise.all([companyWorkerIds(admin.companyId), query])
  const applied = new Set(workerIds)
  const memberIds = new Set(members.map((m) => m.user_id))
  const listed = (must(rowsRes) as unknown as Row[])
    // 관리자·외주 업체 계정은 근무자 목록에서 뺌 — 우리 회사 관리자는 '관리자 명부'에서.
    // 다른 회사 관리자 계정이 우리 회사에 근무자로 지원했으면 근무자로 보임 (한 계정으로 두 역할)
    .filter((u) => (u.role !== 'admin' || applied.has(u.id)) && !memberIds.has(u.id) && u.member_type !== 'vendor')
    // 직접 가입해 확인 전인 회사는 우리 회사에 지원한 회원만 (전체 회원 명단은 확인 뒤)
    .filter((u) => admin.companyVerified || applied.has(u.id))
    // 탈퇴·정지한 회원은 우리 회사와 관계있을 때만 (기록 보관 의무는 함께 일한 회사에만)
    .filter((u) => u.active || applied.has(u.id))
    .filter((u) =>
      f === 'nophoto' ? !u.photo_at : f === 'noaccount' ? !u.bank_account_enc : f === 'mine' ? applied.has(u.id) : f === 'new' ? isNew(u) : f === 'online' ? !!u.last_seen_at && u.last_seen_at >= onlineSince : true,
    )
    .filter((u) => !t || (u.member_type ?? 'worker') === t)
  // 휴대폰 알림을 켰는지 (확정·전날 안내·단체방 알림을 받는지) → 꺼진 사람 표시 · '알림 꺼짐'으로 모아 보기
  const pushOn = await pushEnabledIds(listed.map((u) => u.id))
  const shown = listed.filter((u) => f !== 'nopush' || !pushOn.has(u.id))
  // 근무일수·최근 근무 (이 회사 기록만 · 위 읽기에서 이 회사 출퇴근만 붙여 옴)
  const stat: Record<string, { days: number; last: string }> = {}
  for (const u of shown) {
    for (const a of u.attendance ?? []) {
      const st = (stat[u.id] ??= { days: 0, last: '' })
      st.days++
      if (a.work_date > st.last) st.last = a.work_date
    }
  }
  // 레벨은 아르바이트만 (전문가는 레벨이 없음 · 근무자 본인 화면과 같게)
  const hasLevel = (u: Row) => (u.member_type ?? 'worker') === 'worker'
  const avg = (u: Row) => (u.ratings?.length ? u.ratings.reduce((n, r) => n + r.score, 0) / u.ratings.length : -1)
  const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, 'ko')
  // 레벨 순이면 거른 사람 전체의 레벨을 먼저 셈 (아니면 화면에 보일 사람만)
  const levelsAll = sort === 'level' ? await companyLevels(admin.companyId, shown.filter(hasLevel)) : null
  const lv = (u: Row) => levelsAll?.get(u.id)?.xp ?? -1
  const users = [...shown]
    .sort((a, b) =>
      sort === 'name'
        ? byName(a, b)
        : sort === 'level'
          ? lv(b) - lv(a) || byName(a, b)
          : sort === 'days'
            ? (stat[b.id]?.days ?? 0) - (stat[a.id]?.days ?? 0) || byName(a, b)
            : sort === 'recent'
              ? (stat[b.id]?.last ?? '').localeCompare(stat[a.id]?.last ?? '') || byName(a, b)
              : sort === 'rating'
                ? avg(b) - avg(a) || byName(a, b)
                : b.created_at.localeCompare(a.created_at),
    )
    .slice(0, 300)
  const levels = levelsAll ?? (await companyLevels(admin.companyId, users.filter(hasLevel)))
  const levelBadge = (u: Row) => {
    const x = hasLevel(u) ? levels.get(u.id) : null
    if (!x) return null
    return (
      <span
        className={`badge tabular-nums ${x.level >= 3 ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'}`}
        title={`${x.stage.name} · 우리 회사 기록으로 센 레벨`}
        aria-label={`레벨 ${x.level} ${x.stage.name}`}
        data-level={x.level}
      >
        Lv.{x.level}
      </span>
    )
  }
  // 할 일로 거른 목록(계좌·사진·알림)이면: 우리 회사 지원자에게 한 번에 문자로 요청 (해피워크 전체 회원에게 마구 보내지 않게 우리 회사 지원자만)
  const co = admin.companyName
  const ASK = {
    noaccount: { label: '계좌 등록 요청', body: `[${co}] 급여를 보내 드리려면 계좌가 필요해요. 앱의 내 정보에서 급여 계좌를 등록해 주세요.` },
    nophoto: { label: '사진 요청', body: `[${co}] 현장에서 알아볼 수 있게 얼굴 사진을 올려 주세요. 담당자만 볼 수 있어요.` },
    nopush: { label: '알림 켜기 요청', body: `[${co}] 확정·전날 안내를 놓치지 않게 앱 알림을 켜 주세요. 내 정보의 휴대폰 알림에서 켤 수 있어요.` },
  } as const
  const ask = f === 'noaccount' || f === 'nophoto' || f === 'nopush' ? ASK[f] : null
  const askTo = ask ? users.filter((u) => applied.has(u.id) && u.active && u.phone) : []
  const origin = ask && askTo.length > 0 ? await siteOrigin() : ''
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
      {admin.isSuper && <Presence iso={u.last_seen_at} />}
      {isNew(u) && (
        <span className="badge bg-emerald-50 text-emerald-700">
          <Icon name="sparkle" /> 새 가입
        </span>
      )}
      <StarAvg scores={(u.ratings ?? []).map((r) => r.score)} />
      {/* 알림을 안 켠 사람: 확정·전날 안내가 휴대폰으로 안 가서 문자·전화로 챙겨야 함 */}
      {!pushOn.has(u.id) && (
        <span className="badge bg-gray-100 text-mute" title="휴대폰 알림을 켜지 않았어요 (확정·전날 안내는 문자로 챙겨 주세요)" data-push-off>
          <Icon name="bell" /> 알림 꺼짐
        </span>
      )}
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
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
          <h1 className="text-2xl font-extrabold">근무자 {users.length}명</h1>
          {/* 정렬: 최근 가입 · 레벨 · 근무 많은 · 최근 근무 · 평점 · 이름 (거르기·검색은 그대로) */}
          <SortSelect value={sort} options={SORTS.map((o) => ({ value: o.value, label: o.label, href: listHref({ t, f, q, s: o.value }) }))} label="근무자 정렬" />
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <form className="flex min-w-0 flex-1 gap-1 sm:flex-none">
            {sort !== 'new' && <input type="hidden" name="s" value={sort} />}
            <SearchInput name="q" enterKeyHint="search" defaultValue={q} wrapClassName="min-w-0 flex-1 sm:w-56 sm:flex-none" className="input py-2 text-sm" placeholder="이름 또는 번호 검색" aria-label="근무자 찾기" />
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
            [null, 'nopush', '알림 꺼짐'],
            ...(admin.isSuper ? ([[null, 'online', '접속 중']] as const) : []),
          ] as const
        ).map(([tk, fk, label]) => (
          <Link
            key={label}
            href={listHref({ t: tk, f: fk, s: sort })}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${t === tk && f === fk ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {ask && askTo.length > 0 && (
        // 한 줄: '우리 회사 지원자 n명' + 문자로 요청 (받는 사람·문구를 채운 채 문자 앱이 열림)
        <div className="flex items-center gap-2 rounded-2xl bg-white py-1.5 pr-1.5 pl-3.5 ring-1 ring-line" data-bulk-ask={f}>
          <p className="min-w-0 flex-1 truncate text-sm text-sub">
            우리 회사 지원자 <b className="text-ink">{askTo.length}명</b>
          </p>
          <GroupContact copy={false} className="chip-primary shrink-0 whitespace-nowrap" phones={askTo.map((u) => u.phone)} label={`문자로 ${ask.label}`} body={`${ask.body}\n${origin}/me/profile`} />
        </div>
      )}

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
                {levelBadge(u)}
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
              <th>레벨</th>
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
                <td className="whitespace-nowrap">{levelBadge(u) ?? '-'}</td>
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
