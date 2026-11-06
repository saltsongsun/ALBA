import type { Metadata } from 'next'
import Link from 'next/link'
import { linkCoworker, unlinkCoworker } from '@/app/actions/coworkers'
import Empty from '@/components/Empty'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { canWrite } from '@/lib/community'
import { coworkers, jobsWithCoworkers } from '@/lib/coworkers'
import { requireUser } from '@/lib/session'
import { fmtDate, fmtDateRange } from '@/lib/time'

export const metadata: Metadata = { title: '함께 일한 사람' }

/**
 * 함께 일한 사람: 같은 행사에서 함께 출근한 근무자(별명).
 * '내 지원 공고 보여 주기'는 한쪽으로만: 내가 고른 사람에게만 내 지원이 보이고, 남의 지원은 그 사람이 나를 골랐을 때만 보임 (요청·알림 없음)
 */
export default async function CoworkersPage() {
  const user = await requireUser('/community/coworkers')
  const [list, palJobs] = canWrite(user) ? await Promise.all([coworkers(user.id), jobsWithCoworkers(user.id)]) : [[], []]
  const sharing = list.filter((c) => c.mine).length

  return (
    <div className="space-y-4">
      <Link href="/community" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 커뮤니티
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold">함께 일한 사람</h1>
        <p className="mt-1 text-sm text-sub">같은 행사에서 함께 출근한 사람이에요. 고른 사람에게만 내가 지원한 공고가 보여요(별명으로). 상대에게 알림은 가지 않아요.</p>
      </div>
      {list.length > 0 && (
        <p className="flex gap-3 text-sm font-semibold" data-coworker-summary>
          <span>
            함께한 사람 <b className="text-brand-700 tabular-nums">{list.length}</b>명
          </span>
          <span>
            내 지원을 보여 주는 사람 <b className="text-brand-700 tabular-nums">{sharing}</b>명
          </span>
        </p>
      )}
      {/* 동료가 지원한 공고: 같이 일하러 가기 */}
      {palJobs.length > 0 && (
        <section className="space-y-2" data-pal-jobs>
          <h2 className="font-bold">🤝 나에게 보여 준 동료의 지원 공고</h2>
          <ul className="space-y-2">
            {palJobs.map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="card-link flex items-center gap-3 p-3.5">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px]">{j.title}</b>
                    <span className="block truncate text-xs text-sub">
                      {fmtDateRange(j.start_date, j.end_date)} · {j.nicks.slice(0, 3).join(', ')}
                      {j.nicks.length > 3 && ` 외 ${j.nicks.length - 3}명`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-brand-600">보기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
            <li key={c.id} className="card flex items-center gap-3 p-4" data-coworker={c.mine ? 'sharing' : 'none'}>
              <span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-full text-xl ${c.mine ? 'bg-brand-600 text-white' : 'bg-brand-50'}`}>
                {c.mine ? '🤝' : '🐥'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.nick}</p>
                <p className="truncate text-xs text-sub">
                  함께 {c.together}번 · {fmtDate(c.lastDate)} {c.lastTitle}
                </p>
                {/* 상대가 나를 고른 경우만 (상대의 선택) */}
                {c.theirs && <p className="text-xs font-semibold text-brand-700" data-shares-with-me>나에게 지원 공고를 보여 줘요</p>}
              </div>
              {c.mine ? (
                <form action={unlinkCoworker.bind(null, c.id)} className="shrink-0">
                  <ConfirmSubmit className="btn-soft btn-sm" confirmText="그만 보여 줄까요?" track="그만 보여 주기">
                    ✓ 보여 주는 중
                  </ConfirmSubmit>
                </form>
              ) : (
                <form action={linkCoworker.bind(null, c.id)} className="shrink-0">
                  <SubmitButton className="btn-gray btn-sm" pendingText="…" track="내 지원 보여 주기">
                    내 지원 보여 주기
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-xs text-balance text-mute">실명·연락처·사진은 보이지 않아요. 내가 보여 줘도 상대의 지원은 보이지 않고, 언제든 그만 보여 줄 수 있어요(알림 없음).</p>
    </div>
  )
}
