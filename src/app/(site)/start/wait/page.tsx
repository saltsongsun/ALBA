import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cancelJoin } from '@/app/actions/team'
import AutoRefresh from '@/components/AutoRefresh'
import Flash from '@/components/Flash'
import PushToggle from '@/components/PushToggle'
import { ConfirmSubmit } from '@/components/ui'
import { db } from '@/lib/db'
import { pushPublicKey } from '@/lib/push'
import { adminCompanies, getUser } from '@/lib/session'
import { fmtDate, kstTime } from '@/lib/time'

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
  const names = reqs.length
    ? new Map(
        (((await db().from('companies').select('id, company_name').in('id', reqs.map((r) => r.company_id))).data ?? []) as { id: string; company_name: string }[]).map((c) => [
          c.id,
          c.company_name,
        ]),
      )
    : new Map<string, string>()

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
            {reqs.map((r) => (
              <div key={r.company_id} className="card flex items-center gap-3 p-4">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-50 text-xl">
                  🏢
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{names.get(r.company_id) ?? '회사'}</span>
                  <span className="block text-sm text-sub">
                    {fmtDate(r.created_at.slice(0, 10))} {kstTime(r.created_at)} 신청
                  </span>
                </span>
                <form action={cancelJoin.bind(null, r.company_id)} className="shrink-0">
                  <ConfirmSubmit className="btn-gray btn-sm" confirmText="취소할까요?">
                    신청 취소
                  </ConfirmSubmit>
                </form>
              </div>
            ))}
          </div>
          {/* 승인 소식을 바로 받게 */}
          <PushToggle publicKey={pushPublicKey()} variant="card" reason="승인되면 바로 알려 드려요" />
          <p className="hint">오래 걸리면 대표 관리자에게 승인을 부탁해 주세요</p>
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
