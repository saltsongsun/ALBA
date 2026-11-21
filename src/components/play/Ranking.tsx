import { setRanking } from '@/app/actions/community'
import { RANK_CAPS, RANK_POINTS } from '@/lib/communityShared'
import type { RankRow } from '@/lib/community2'
import { SubmitButton } from '@/components/ui'

const MEDAL = ['🥇', '🥈', '🥉']

/**
 * 놀이터 '이번 주 랭킹' (커뮤니티 2단계 · 사용자 요청 2026-11-21): '참여하기'를 누른 사람만 별명과 점수로.
 * 월요일마다 새로 · 그만하면 바로 빠짐 · 점수 막대는 1등 점수 기준으로 0.3초에 걸쳐 채워짐 (움직임 줄이기면 바로)
 */
export default function Ranking({ joined, members, top, me, canJoin, weekLabel }: { joined: boolean; members: number; top: RankRow[]; me: RankRow | null; canJoin: boolean; weekLabel: string }) {
  const best = Math.max(1, ...top.map((r) => r.points))
  const meOutside = joined && me && !top.some((r) => r.me)
  const Row = ({ r }: { r: RankRow }) => (
    <li className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${r.me ? 'bg-brand-50 ring-1 ring-brand-200' : ''}`} data-rank-row={r.rank} data-rank-me={r.me ? '' : undefined}>
      <span className="w-7 shrink-0 text-center text-sm font-bold text-sub tabular-nums">{r.rank <= 3 && r.points > 0 ? MEDAL[r.rank - 1] : `${r.rank}`}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm">
          <b className="min-w-0 truncate">{r.nick}</b>
          {r.me && <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">나</span>}
        </span>
        <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg">
          <span className="block h-full origin-left animate-[grow_0.3s_ease-out_both] rounded-full bg-brand-400" style={{ width: `${Math.round((r.points / best) * 100)}%` }} />
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums" data-rank-points>
        {r.points}점
      </span>
    </li>
  )
  return (
    <section id="rank" className="card scroll-mt-20 space-y-3" aria-label="이번 주 랭킹" data-rank data-rank-joined={joined ? '' : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold">🏆 이번 주 랭킹</h2>
          <p className="text-xs text-mute">
            {weekLabel} · <span className="tabular-nums">{members}</span>명 참여
          </p>
        </div>
        {joined && (
          <form action={setRanking.bind(null, false)} data-rank-leave>
            <SubmitButton className="tap shrink-0 text-xs font-semibold text-mute" pendingText="빼는 중…">
              그만하기
            </SubmitButton>
          </form>
        )}
      </div>
      {top.length > 0 ? (
        <ol className="space-y-1" data-rank-list>
          {top.map((r) => (
            <Row key={r.userId} r={r} />
          ))}
          {meOutside && (
            <>
              <li aria-hidden className="text-center text-xs leading-none text-mute">
                ⋮
              </li>
              <Row r={me!} />
            </>
          )}
        </ol>
      ) : (
        <p className="rounded-xl bg-bg px-3 py-3 text-center text-sm text-sub" data-rank-empty>
          아직 이번 주 점수가 없어요. 출석부터 해 보세요!
        </p>
      )}
      {!joined &&
        (canJoin ? (
          <form action={setRanking.bind(null, true)} className="space-y-1.5" data-rank-join>
            <SubmitButton className="btn-primary w-full py-3" pendingText="참여하는 중…">
              🏆 나도 참여하기
            </SubmitButton>
            <p className="text-center text-xs break-keep text-mute">별명과 이번 주 점수만 보여요 · 언제든 그만할 수 있어요</p>
          </form>
        ) : (
          <p className="text-xs text-mute">근무자 계정만 참여할 수 있어요.</p>
        ))}
      <p className="border-t border-line pt-2.5 text-xs break-keep text-mute" data-rank-rules>
        출석 {RANK_POINTS.checkin} · 근무 마침 {RANK_POINTS.shift} · 글 {RANK_POINTS.post} · 댓글 {RANK_POINTS.comment}점 (글 {RANK_CAPS.post}개 · 댓글 {RANK_CAPS.comment}개까지) · 월요일에 새로 시작
      </p>
    </section>
  )
}
