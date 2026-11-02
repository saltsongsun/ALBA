import { decideJoin, removeTeamAdmin, renewJoinCode } from '@/app/actions/team'
import { ConfirmSubmit, CopyButton, ShareButton } from '@/components/ui'
import { db } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { fmtJoinCode, joinCodeOf } from '@/lib/joinCode'
import type { AdminUser } from '@/lib/session'
import { fmtDate, kstTime } from '@/lib/time'

type Person = { id: string; name: string; phone: string }

/**
 * 회사 설정 맨 위 '관리자' 칸.
 * 대표 관리자: 초대 코드(복사·공유·바꾸기) + 가입 신청 승인·거절 + 관리자 빼기 / 일반 관리자: 관리자 목록만
 */
export default async function Team({ admin }: { admin: AdminUser }) {
  const owner = admin.isSuper || admin.companies.find((c) => c.id === admin.companyId)?.role === 'owner'
  const [members, reqs, code] = await Promise.all([
    db()
      .from('company_members')
      .select('user_id, role, created_at')
      .eq('company_id', admin.companyId)
      .order('created_at')
      .then((r) => (r.data ?? []) as { user_id: string; role: 'owner' | 'admin'; created_at: string }[]),
    owner
      ? db()
          .from('company_join_requests')
          .select('user_id, created_at')
          .eq('company_id', admin.companyId)
          .order('created_at')
          .then((r) => (r.data ?? []) as { user_id: string; created_at: string }[])
      : [],
    owner ? joinCodeOf(admin.companyId) : null,
  ])
  const ids = [...members.map((m) => m.user_id), ...reqs.map((r) => r.user_id)]
  const people = new Map(
    ids.length
      ? (((await db().from('users').select('id, name, phone').in('id', ids)).data ?? []) as Person[]).map((p) => [p.id, p])
      : [],
  )
  const ownerNames = members.filter((m) => m.role === 'owner').map((m) => people.get(m.user_id)?.name).filter(Boolean)
  // 대표 관리자 먼저
  const sorted = [...members].sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1))

  return (
    <section id="admins" className="card scroll-mt-20 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">👥 관리자</h2>
        <span className="text-sm text-mute">{members.length}명</span>
      </div>

      {/* 가입 신청: 아는 사람만 승인 (승인하면 우리 회사 근무자 정보를 봄) */}
      {reqs.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-3">
          <p className="font-bold text-amber-900">🧑‍💼 가입 신청 {reqs.length}명</p>
          {reqs.map((r) => {
            const p = people.get(r.user_id)
            return (
              <div key={r.user_id} className="flex items-center gap-2 rounded-xl bg-white p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p?.name ?? '회원'}</span>
                  <span className="block text-sm text-sub">{phoneFmt(p?.phone)}</span>
                  <span className="block text-xs text-mute">
                    {fmtDate(r.created_at.slice(0, 10))} {kstTime(r.created_at)} 신청
                  </span>
                </span>
                <form action={decideJoin.bind(null, r.user_id, false)} className="shrink-0">
                  <ConfirmSubmit className="btn-gray btn-sm" confirmText="거절?">
                    거절
                  </ConfirmSubmit>
                </form>
                <form action={decideJoin.bind(null, r.user_id, true)} className="shrink-0">
                  <ConfirmSubmit className="btn-primary btn-sm" confirmText="승인?">
                    승인
                  </ConfirmSubmit>
                </form>
              </div>
            )
          })}
          <p className="text-xs text-amber-800">승인하면 우리 회사 근무자 연락처·계좌를 볼 수 있어요. 아는 사람만 승인해 주세요.</p>
        </div>
      )}

      {owner && code ? (
        <div className="space-y-2.5 rounded-2xl p-4 ring-1 ring-line">
          <p className="text-sm font-semibold text-sub">관리자 초대 코드</p>
          <p className="font-mono text-3xl font-extrabold tracking-[0.15em]" data-join-code>
            {fmtJoinCode(code)}
          </p>
          <p className="text-sm text-sub">직원에게 이 코드를 알려 주세요</p>
          <div className="flex flex-wrap gap-2">
            <ShareButton
              title={`${admin.companyName} 관리자 초대`}
              text={`해피워크에서 ${admin.companyName} 관리자로 가입해 주세요.\n회사 코드: ${fmtJoinCode(code)}`}
              path={`/start?tab=join&code=${code}`}
              className="btn-soft btn-sm"
            />
            <CopyButton text={fmtJoinCode(code)} label="코드 복사" />
            <form action={renewJoinCode}>
              <ConfirmSubmit className="btn-gray btn-sm" confirmText="예전 코드는 막혀요">
                새 코드로 바꾸기
              </ConfirmSubmit>
            </form>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-bg p-3 text-sm text-sub">관리자 초대·승인은 대표 관리자{ownerNames.length ? `(${ownerNames.join(', ')})` : ''}가 할 수 있어요.</p>
      )}

      <ul className="divide-y divide-line">
        {sorted.map((m) => {
          const p = people.get(m.user_id)
          const me = m.user_id === admin.id
          return (
            <li key={m.user_id} className="flex items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <b className="truncate">{p?.name ?? '관리자'}</b>
                  {me && <span className="shrink-0 text-sm text-mute">(나)</span>}
                  <span className={`badge shrink-0 ${m.role === 'owner' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-sub'}`}>{m.role === 'owner' ? '대표' : '관리자'}</span>
                </span>
                <span className="block text-sm text-sub">{phoneFmt(p?.phone)}</span>
              </span>
              {owner && !me && (m.role === 'admin' || admin.isSuper) && (
                <form action={removeTeamAdmin.bind(null, m.user_id)} className="shrink-0">
                  <ConfirmSubmit className="btn-gray btn-sm" confirmText="뺄까요?">
                    빼기
                  </ConfirmSubmit>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
