import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cancelJoin, nudgeJoin } from '@/app/actions/team'
import ApplySteps from '@/components/ApplySteps'
import AutoRefresh from '@/components/AutoRefresh'
import Flash from '@/components/Flash'
import Icon from '@/components/Icon'
import PushToggle from '@/components/PushToggle'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { db } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { JOIN_NUDGE_SEC, joinNudgeKey } from '@/lib/joinCode'
import { pushPublicKey } from '@/lib/push'
import { adminCompanies, getUser } from '@/lib/session'
import { fmtDate, kstDate, kstTime, waitedText } from '@/lib/time'


export const metadata: Metadata = { title: '관리자 승인 대기' }

/**
 * 관리자 가입 신청 뒤 기다리는 화면 (소속 회사가 없는 관리자도 여기로).
 * 대표 관리자가 승인하면 '관리자 화면으로'가 나타남 (30초마다 새로 확인)
 */
export default async function WaitPage(props: PageProps<'/start/wait'>) {
  const sp = await props.searchParams
  const user = await getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/start/wait')}`)
  const [reqs, companies] = await Promise.all([
    db()
      .from('company_join_requests')
      .select('company_id, created_at')
      .eq('user_id', user.id)
      .order('created_at')
      .then((r) => (r.data ?? []) as { company_id: string; created_at: string }[]),
    user.role === 'admin' ? adminCompanies(user.id, user.isSuper) : [],
  ])
  type Co = { id: string; company_name: string; contact_phone: string | null; company_phone: string | null }
  const [cos, nudges] = reqs.length
    ? await Promise.all([
        db()
          .from('companies')
          .select('id, company_name, contact_phone, company_phone')
          .in('id', reqs.map((r) => r.company_id))
          .then((r) => (r.data ?? []) as Co[]),
        // 내가 '다시 알리기'를 누른 때 (회사마다 마지막 한 번)
        db()
          .from('rate_events')
          .select('bucket, created_at')
          .in('bucket', reqs.map((r) => joinNudgeKey(user.id, r.company_id)))
          .gte('created_at', new Date(Date.now() - JOIN_NUDGE_SEC * 1000).toISOString())
          .then((r) => (r.data ?? []) as { bucket: string; created_at: string }[]),
      ])
    : [[] as Co[], [] as { bucket: string; created_at: string }[]]
  const coById = new Map(cos.map((c) => [c.id, c]))
  const now = Date.now()
  const today = kstDate(now)
  /** 다시 알릴 수 있는 때: 신청(그때도 알림이 감)이나 마지막 '다시 알리기'에서 30분 뒤 */
  const nextNudgeAt = (r: { company_id: string; created_at: string }) => {
    const key = joinNudgeKey(user.id, r.company_id)
    const last = Math.max(Date.parse(r.created_at), ...nudges.filter((n) => n.bucket === key).map((n) => Date.parse(n.created_at)))
    return last + JOIN_NUDGE_SEC * 1000
  }

  return (
    <div className="space-y-5 pt-4">
      <Flash m={sp.m} />
      {reqs.length > 0 && <AutoRefresh seconds={30} quiet />}
      {companies.length > 0 && (
        <Link href="/admin" className="card-link flex animate-pop items-center gap-3 p-4 ring-2 ring-emerald-200">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-xl text-white">
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-emerald-700">관리자로 승인됐어요</span>
            <span className="block truncate text-sm text-sub">{companies.map((c) => c.name).join(', ')}</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-emerald-700">관리자 화면 →</span>
        </Link>
      )}

      {reqs.length > 0 ? (
        <>
          <div>
            <h1 className="text-2xl font-extrabold">⏳ 승인을 기다리고 있어요</h1>
            <p className="mt-1 text-sub">대표 관리자가 승인하면 관리자 화면이 열려요.</p>
          </div>
          <div className="space-y-2">
            {reqs.map((r) => {
              const co = coById.get(r.company_id)
              const phone = co?.contact_phone || co?.company_phone || null
              const waitLeft = Math.ceil((nextNudgeAt(r) - now) / 60_000)
              return (
                <div key={r.company_id} className="card space-y-3 p-4" data-join-wait={r.company_id}>
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-50 text-xl">
                      🏢
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{co?.company_name ?? '회사'}</span>
                      {/* 한 줄로: 기다린 시간이 먼저 · 오늘 신청이면 시각, 아니면 날짜 */}
                      <span className="block truncate text-sm text-sub">
                        <b className="font-semibold text-amber-700" data-join-waited>
                          {waitedText(now - Date.parse(r.created_at))}
                        </b>{' '}
                        · {kstDate(r.created_at) === today ? kstTime(r.created_at) : fmtDate(kstDate(r.created_at)).replace(/\(.\)$/, '')} 신청
                      </span>
                    </span>
                    <form action={cancelJoin.bind(null, r.company_id)} className="shrink-0">
                      <ConfirmSubmit className="btn-gray btn-sm" confirmText="취소할까요?">
                        신청 취소
                      </ConfirmSubmit>
                    </form>
                  </div>
                  {/* 어디까지 왔는지: 신청 ✓ → 대표 승인(지금) → 관리자 화면 */}
                  <ApplySteps step={2} labels={['신청', '승인', '시작']} />
                  {/* 늦어질 때: 대표 관리자에게 한 번 더 알리기 (30분에 한 번) · 회사 대표 번호로 전화 */}
                  <div className="flex flex-wrap gap-2">
                    {waitLeft > 0 ? (
                      <span key="sent" className="chip animate-pop gap-1 py-1 text-xs text-sub" data-join-nudged={waitLeft}>
                        <span aria-hidden className="text-emerald-600">✓</span> 알렸어요 · {waitLeft}분 뒤 다시
                      </span>
                    ) : (
                      <form action={nudgeJoin.bind(null, r.company_id)}>
                        <SubmitButton className="chip gap-1 py-1 text-xs font-bold text-brand-700" pendingText="알리는 중…">
                          <Icon name="bell" /> 대표에게 다시 알리기
                        </SubmitButton>
                      </form>
                    )}
                    {phone && (
                      <a href={`tel:${phone.replace(/\D/g, '')}`} className="chip gap-1 py-1 text-xs" aria-label={`회사 전화 ${phoneFmt(phone)}`} data-join-call>
                        <Icon name="phone" className="text-emerald-600" /> 회사 전화
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* 승인 소식을 바로 받게 */}
          <PushToggle publicKey={pushPublicKey()} variant="card" reason="승인되면 바로 알려 드려요" />
        </>
      ) : (
        companies.length === 0 && (
          <div className="card space-y-3 text-center">
            <p className="text-3xl" aria-hidden>
              🏢
            </p>
            <p className="font-bold">아직 소속된 회사가 없어요</p>
            <p className="text-sm text-sub">대표 관리자에게 받은 회사 코드로 신청하거나, 새 회사를 등록해 주세요.</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/start?tab=join" className="btn-primary">
                회사 코드 넣기
              </Link>
              <Link href="/start" className="btn-gray">
                새 회사 등록
              </Link>
            </div>
          </div>
        )
      )}
      {reqs.length > 0 && (
        <p className="text-center text-sm text-sub">
          다른 회사에도 합류하나요?{' '}
          <Link href="/start?tab=join" className="font-semibold text-brand-600">
            회사 코드 넣기
          </Link>
        </p>
      )}
    </div>
  )
}
