import type { Metadata } from 'next'
import Link from 'next/link'
import { linkCoworker, unlinkCoworker } from '@/app/actions/coworkers'
import Empty from '@/components/Empty'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { canWrite } from '@/lib/community'
import { coworkers } from '@/lib/coworkers'
import { requireUser } from '@/lib/session'
import { fmtDate } from '@/lib/time'

export const metadata: Metadata = { title: '함께 일한 사람' }

/** 함께 일한 사람: 같은 행사에서 함께 출근한 근무자(별명) + 동료 맺기 */
export default async function CoworkersPage() {
  const user = await requireUser('/community/coworkers')
  const list = canWrite(user) ? await coworkers(user.id) : []
  const received = list.filter((c) => c.state === 'received')
  const linked = list.filter((c) => c.state === 'linked').length

  return (
    <div className="space-y-4">
      <Link href="/community" className="text-sm font-semibold text-sub">
        ← 커뮤니티
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold">함께 일한 사람</h1>
        <p className="mt-1 text-sm text-sub">같은 행사에서 함께 출근한 사람이에요. 서로 &lsquo;동료 맺기&rsquo;를 하면 같은 공고에 지원했을 때 알 수 있어요.</p>
      </div>
      {list.length > 0 && (
        <p className="flex gap-3 text-sm font-semibold" data-coworker-summary>
          <span>
            함께한 사람 <b className="text-brand-700 tabular-nums">{list.length}</b>명
          </span>
          <span>
            🤝 동료 <b className="text-brand-700 tabular-nums">{linked}</b>명
          </span>
          {received.length > 0 && (
            <span className="text-amber-700">
              👋 받은 요청 <b className="tabular-nums">{received.length}</b>
            </span>
          )}
        </p>
      )}
      {!canWrite(user) ? (
        <p className="card text-sm text-sub">회사 관리자·외주 업체 계정은 쓸 수 없어요.</p>
      ) : list.length === 0 ? (
        <Empty icon="🤝" sticker="hi" title="아직 함께 출근한 사람이 없어요">
          행사에서 함께 일하면 여기에 보여요.{' '}
          <Link href="/" className="font-semibold text-brand-600">
            모집 중인 알바 보기 →
          </Link>
        </Empty>
      ) : (
        <ul className="stagger space-y-2" data-coworker-list>
          {list.map((c) => (
            <li key={c.id} className={`card flex items-center gap-3 p-4 ${c.state === 'received' ? 'ring-2 ring-amber-200' : ''}`} data-coworker={c.state}>
              <span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-full text-xl ${c.state === 'linked' ? 'animate-pop bg-brand-600 text-white' : 'bg-brand-50'}`}>
                {c.state === 'linked' ? '🤝' : '🐥'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.nick}</p>
                <p className="truncate text-xs text-sub">
                  함께 {c.together}번 · {fmtDate(c.lastDate)} {c.lastTitle}
                </p>
                {c.state === 'received' && <p className="text-xs font-semibold text-amber-700">동료 맺기를 원해요</p>}
              </div>
              {c.state === 'linked' ? (
                <form action={unlinkCoworker.bind(null, c.id)} className="shrink-0">
                  <ConfirmSubmit className="rounded-lg px-2 py-1.5 text-xs font-semibold text-mute" confirmText="끊을까요?">
                    🤝 동료
                  </ConfirmSubmit>
                </form>
              ) : c.state === 'sent' ? (
                <form action={unlinkCoworker.bind(null, c.id)} className="shrink-0">
                  <SubmitButton className="btn-gray btn-sm" pendingText="취소 중…">
                    요청 취소
                  </SubmitButton>
                </form>
              ) : (
                <form action={linkCoworker.bind(null, c.id)} className="shrink-0">
                  <SubmitButton className={`btn-sm ${c.state === 'received' ? 'btn-primary' : 'btn-soft'}`} pendingText="보내는 중…">
                    {c.state === 'received' ? '수락' : '👋 동료 맺기'}
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-xs text-balance text-mute">실명·연락처는 서로 보이지 않아요. 동료를 끊어도 상대에게 알리지 않아요.</p>
    </div>
  )
}
