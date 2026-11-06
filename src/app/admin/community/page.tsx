import type { Metadata } from 'next'
import Link from 'next/link'
import { moderate } from '@/app/actions/community'
import Empty from '@/components/Empty'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { AUTO_HIDE_REPORTS, ago, moderationQueue } from '@/lib/community'
import { requireSuper } from '@/lib/session'
import { FEATURES, featureOn, type FeatureKey } from '@/lib/flags'
import { setFeature } from '@/app/actions/coworkers'
import { plainBody } from '@/lib/stickers'
import Flash from '@/components/Flash'

export const metadata: Metadata = { title: '커뮤니티 관리' }

const TYPE = { post: '글', comment: '댓글', review: '후기' } as const

/** 최고 관리자: 신고 들어온 글·댓글·후기 확인 → 가리기 / 다시 보이기 (신고가 쌓이면 자동으로 가려져 있음) */
export default async function CommunityAdminPage(props: PageProps<'/admin/community'>) {
  await requireSuper()
  const sp = await props.searchParams
  const keys = Object.keys(FEATURES) as FeatureKey[]
  const [items, ...flags] = await Promise.all([moderationQueue(), ...keys.map((k) => featureOn(k))])
  const waiting = items.filter((i) => i.reports > 0).length
  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">커뮤니티 관리</h1>
          <p className="mt-0.5 text-sm text-sub">신고가 {AUTO_HIDE_REPORTS}번 쌓이면 자동으로 가려져요. 확인하고 다시 보이거나 그대로 가려 두세요.</p>
        </div>
        <Link href="/community" className="btn-gray btn-sm shrink-0">
          커뮤니티 보기
        </Link>
      </div>
      {/* 운영자 전체 스위치 (서비스 전체에 적용 · 켜고 끈 기록이 남음) */}
      <section className="card divide-y divide-line p-0" data-feature-switches>
        {keys.map((k, i) => {
          const on = flags[i]
          const desc =
            k === 'coworkers'
              ? '켜면 근무자가 함께 일한 사람 중 고른 사람에게만 자기 지원 공고를 보여 줄 수 있어요(별명, 한쪽으로만). 끄면 메뉴가 숨고 아무에게도 보이지 않아요.'
              : '켜면 근무자 화면의 공고·공고 목록에 회사 별점과 최근 후기가 보여요. 끄면 숨어요(커뮤니티의 회사 후기는 그대로).'
          return (
            <div key={k} className="flex flex-wrap items-center gap-3 p-4" data-feature={k} data-on={on ? 'on' : 'off'}>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {FEATURES[k].label}{' '}
                  <span className={`badge ml-1 ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-bg text-sub'}`}>{on ? '켜짐' : '꺼짐'}</span>
                </p>
                <p className="mt-0.5 text-xs text-sub">{desc}</p>
              </div>
              <form action={setFeature.bind(null, k, !on)} className="shrink-0">
                {on ? (
                  <ConfirmSubmit className="btn-gray btn-sm" confirmText="한 번 더 누르면 꺼요" track={`${FEATURES[k].label} 끄기`}>
                    끄기
                  </ConfirmSubmit>
                ) : (
                  <SubmitButton className="btn-primary btn-sm" pendingText="켜는 중…" track={`${FEATURES[k].label} 켜기`}>
                    켜기
                  </SubmitButton>
                )}
              </form>
            </div>
          )
        })}
      </section>
      <p className="text-sm font-semibold" data-mod-waiting>
        처리할 신고 <b className="text-rose-600 tabular-nums">{waiting}</b>건 · 가려진 것 <b className="tabular-nums">{items.filter((i) => i.hidden).length}</b>개
      </p>
      {items.length === 0 ? (
        <Empty icon="🧹" sticker="complete" title="처리할 신고가 없어요" />
      ) : (
        <ul className="space-y-2" data-mod-list>
          {items.map((it) => (
            <li key={`${it.type}:${it.id}`} className={`card space-y-2 ${it.hidden ? 'ring-2 ring-rose-200' : ''}`} data-mod-item={it.type}>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <span className="badge bg-gray-100 text-sub">{TYPE[it.type]}</span>
                {it.hidden && <span className="badge bg-rose-50 text-rose-700">가려짐</span>}
                {it.reports > 0 && <span className="badge bg-amber-50 text-amber-700">신고 {it.reports}</span>}
                <span className="ml-auto font-normal text-mute">
                  {it.nick} · {ago(it.created_at)}
                </span>
              </div>
              <p className="font-bold break-words">{it.title}</p>
              <p className="line-clamp-4 text-sm whitespace-pre-wrap break-words text-sub">{plainBody(it.body)}</p>
              {it.reasons.length > 0 && <p className="text-xs text-mute">사유: {[...new Set(it.reasons)].join(' · ')}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {it.hidden ? (
                  <form action={moderate.bind(null, it.type, it.id, 'show')}>
                    <ConfirmSubmit className="btn-soft btn-sm" confirmText="다시 보이게 할까요?">
                      다시 보이기
                    </ConfirmSubmit>
                  </form>
                ) : (
                  <form action={moderate.bind(null, it.type, it.id, 'hide')}>
                    <ConfirmSubmit className="btn-danger btn-sm" confirmText="한 번 더 누르면 가려져요">
                      가리기
                    </ConfirmSubmit>
                  </form>
                )}
                {!it.hidden && it.reports > 0 && (
                  <form action={moderate.bind(null, it.type, it.id, 'show')}>
                    <button type="submit" className="btn-gray btn-sm">
                      문제없음 (신고 닫기)
                    </button>
                  </form>
                )}
                {it.href && (
                  <Link href={it.href} className="ml-auto text-sm font-semibold text-brand-600">
                    열어 보기 →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
