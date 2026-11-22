import { decideJoin, removeTeamAdmin, renewJoinCode } from '@/app/actions/team'
import { ConfirmSubmit, CopyButton, ShareButton } from '@/components/ui'
import Icon from '@/components/Icon'
import { db } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { fmtJoinCode, joinCodeOf } from '@/lib/joinCode'
import type { AdminUser } from '@/lib/session'
import { fmtDate, kstDate, kstTime, waitedText } from '@/lib/time'

type Person = { id: string; name: string; phone: string }

/** 관리자 목록 '새로' 표시 기간 (관리자 홈 '○○ 관리자가 됐어요'와 같은 사흘 · 정기 개선 2026-11-23 01:35) */
const JOINED_DAYS = 3

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
  const now = Date.now()
  const today = kstDate(now)
  const ownerNames = members.filter((m) => m.role === 'owner').map((m) => people.get(m.user_id)?.name).filter(Boolean)
  // 대표 관리자 먼저
  const sorted = [...members].sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1))

  return (
    // 관리자 홈 '○○ 관리자가 됐어요 ›'·처음 시작 단계에서 #admins로 오면 테두리가 한 번 퍼짐 (어디인지 보이게 · 움직임 줄이기면 없음)
    <section id="admins" className="card scroll-mt-20 space-y-4" data-target-flash>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Icon name="users" className="text-brand-600" />
          관리자
        </h2>
        <span className="text-sm text-mute">{members.length}명</span>
      </div>

      {/* 가입 신청: 아는 사람만 승인 (승인하면 우리 회사 근무자 정보를 봄) */}
      {reqs.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-3">
          <p className="font-bold text-amber-900">가입 신청 {reqs.length}명</p>
          {reqs.map((r) => {
            const p = people.get(r.user_id)
            return (
              <div key={r.user_id} className="flex items-center gap-2 rounded-xl bg-white p-3" data-join-req={r.user_id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p?.name ?? '회원'}</span>
                  {/* 아는 사람인지 바로 전화로 확인 (번호를 누르면 전화) */}
                  {p?.phone ? (
                    <a href={`tel:${p.phone.replace(/\D/g, '')}`} className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-brand-700" data-join-req-call>
                      <Icon name="phone" className="text-emerald-600" />
                      {phoneFmt(p.phone)}
                    </a>
                  ) : null}
                  {/* 한 줄로: 기다린 시간 · 오늘 신청이면 시각, 아니면 날짜 */}
                  <span className="block truncate text-xs text-mute">
                    <b className="font-semibold text-amber-700" data-join-req-waited>
                      {waitedText(now - Date.parse(r.created_at))}
                    </b>{' '}
                    · {kstDate(r.created_at) === today ? kstTime(r.created_at) : fmtDate(kstDate(r.created_at)).replace(/\(.\)$/, '')} 신청
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
          <p className="text-xs text-amber-800">승인하면 우리 회사 근무자 연락처·계좌를 볼 수 있어요. 번호를 눌러 아는 사람인지 확인한 뒤 승인해 주세요.</p>
        </div>
      )}

      {owner && code ? (
        <div className="space-y-2.5 rounded-2xl p-4 ring-1 ring-line">
          <p className="text-sm font-semibold text-sub">관리자 초대 코드</p>
          <p className="font-mono text-3xl font-extrabold tracking-[0.15em]" data-join-code>
            {fmtJoinCode(code)}
          </p>
          <p className="text-sm text-sub">직원에게 이 코드를 알려 주세요</p>
          {/* 버튼 셋 한 줄 (360px에서 '새 코드로 바꾸기'가 아래 줄로 떨어지지 않게 짧게) */}
          <div className="flex flex-wrap gap-2" data-join-tools>
            <ShareButton
              title={`${admin.companyName} 관리자 초대`}
              text={`해피워크에서 ${admin.companyName} 관리자로 가입해 주세요.\n회사 코드: ${fmtJoinCode(code)}`}
              path={`/start?tab=join&code=${code}`}
              className="btn-soft btn-sm"
            />
            <CopyButton text={fmtJoinCode(code)} label="코드 복사" />
            <form action={renewJoinCode}>
              <ConfirmSubmit className="btn-gray btn-sm" confirmText="예전 코드는 막혀요">
                새 코드
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
          // 관리자(대표 아님)는 언제 합류했는지 · 사흘 안이면 '새로' (누가 우리 회사 자료를 보는지 한눈에)
          const joined = m.role === 'admin' && m.created_at ? kstDate(m.created_at) : null
          const fresh = !!joined && now - Date.parse(m.created_at) < JOINED_DAYS * 864e5
          return (
            <li key={m.user_id} className="flex items-center gap-2 py-2.5" data-admin-row={m.role}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <b className="truncate">{p?.name ?? '관리자'}</b>
                  {me && <span className="shrink-0 text-sm text-mute">(나)</span>}
                  <span className={`badge shrink-0 ${m.role === 'owner' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-sub'}`}>{m.role === 'owner' ? '대표' : '관리자'}</span>
                  {fresh && (
                    <span className="badge shrink-0 animate-[pop_0.25s_var(--ease-spring)_both] bg-emerald-50 text-emerald-700" data-admin-new>
                      새로
                    </span>
                  )}
                </span>
                <span className="block truncate text-sm text-sub">
                  {/* 다른 관리자 번호는 눌러서 바로 전화 (현장에서 서로 찾을 때) · 내 번호는 글자만 */}
                  {p?.phone && !me ? (
                    <a href={`tel:${p.phone}`} className="tabular-nums transition active:opacity-60" data-admin-tel>
                      {phoneFmt(p.phone)}
                    </a>
                  ) : (
                    <span className="tabular-nums">{phoneFmt(p?.phone)}</span>
                  )}
                  {joined && (
                    <span className="whitespace-nowrap text-mute" data-admin-joined>
                      {' '}
                      · {fmtDate(joined)} 합류
                    </span>
                  )}
                </span>
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
