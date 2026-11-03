/**
 * 화면을 불러오는 동안 보여 주는 회색 자리 (실제 화면과 같은 모양이라, 눌렀을 때 바로 넘어간 것처럼 느껴짐).
 * 깜빡임(animate-pulse)은 '움직임 줄이기' 설정이면 globals.css에서 꺼짐
 */
const bar = 'rounded bg-line/70'

export default function Skeleton({ cards = 3, hero = false }: { cards?: number; hero?: boolean }) {
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="animate-pulse space-y-4">
      {hero && <div className="h-36 rounded-3xl bg-line/70" />}
      <div className={`h-6 w-40 ${bar}`} />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="card space-y-3">
          <div className={`h-4 w-24 ${bar}`} />
          <div className={`h-5 w-3/4 ${bar}`} />
          <div className="h-4 w-1/2 rounded bg-line/60" />
        </div>
      ))}
    </div>
  )
}

/** 공고 목록 (홈): 인사 카드 · 날짜 칩 · 공고 카드 */
export function JobListSkeleton() {
  return (
    <div aria-busy="true" aria-label="공고 불러오는 중" className="animate-pulse space-y-4" data-skeleton="jobs">
      <div className="card flex items-center gap-3 py-3.5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`h-5 w-36 ${bar}`} />
          <div className={`h-4 w-52 max-w-full ${bar}`} />
        </div>
      </div>
      <div className={`h-6 w-32 ${bar}`} />
      <div className="flex gap-1.5 overflow-hidden">
        {[16, 20, 16, 22].map((w, i) => (
          <div key={i} className="h-8 shrink-0 rounded-full bg-line/70" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-2.5">
          <div className="flex gap-1.5">
            <div className="h-5 w-12 rounded-full bg-line/70" />
            <div className={`h-5 w-28 ${bar}`} />
          </div>
          <div className={`h-5 w-4/5 ${bar}`} />
          <div className={`h-3.5 w-28 ${bar}`} />
          <div className={`h-4 w-3/5 ${bar}`} />
          <div className="flex items-end justify-between pt-1">
            <div className={`h-6 w-32 ${bar}`} />
            <div className={`h-4 w-16 ${bar}`} />
          </div>
          <div className="h-1.5 rounded-full bg-line/60" />
        </div>
      ))}
    </div>
  )
}

/** 공고 화면: 제목 카드 · 급여 상자 · 항목 줄 · 지도 */
export function JobDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="공고 불러오는 중" className="animate-pulse space-y-4" data-skeleton="job">
      <div className="card space-y-3">
        <div className="flex gap-1.5">
          <div className="h-5 w-12 rounded-full bg-line/70" />
          <div className={`h-5 w-36 ${bar}`} />
        </div>
        <div className={`h-7 w-11/12 ${bar}`} />
        <div className={`h-7 w-2/3 ${bar}`} />
        <div className={`h-4 w-32 ${bar}`} />
        <div className="space-y-2 rounded-2xl bg-bg p-4">
          <div className={`h-4 w-24 ${bar}`} />
          <div className={`h-7 w-44 ${bar}`} />
          <div className={`h-3.5 w-56 max-w-full ${bar}`} />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-6 border-b border-line py-2.5 last:border-0">
            <div className={`h-4 w-10 shrink-0 ${bar}`} />
            <div className={`h-4 flex-1 ${bar}`} />
          </div>
        ))}
        <div className="h-52 rounded-2xl bg-line/60" />
      </div>
    </div>
  )
}

/** 문의 대화: 말풍선이 왼쪽·오른쪽으로 번갈아 */
export function ChatSkeleton() {
  return (
    <div aria-busy="true" aria-label="대화 불러오는 중" className="animate-pulse space-y-4" data-skeleton="chat">
      <div className="flex items-center justify-between">
        <div className={`h-7 w-16 ${bar}`} />
        <div className="h-9 w-24 rounded-full bg-line/70" />
      </div>
      <div className={`h-4 w-64 max-w-full ${bar}`} />
      <div className="space-y-3 pt-2">
        {['w-48', 'w-40', 'w-56', 'w-32'].map((w, i) => (
          <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
            <div className={`h-11 ${w} max-w-[78%] rounded-2xl bg-line/70`} />
          </div>
        ))}
      </div>
      <div className="h-14 rounded-3xl bg-line/60" />
    </div>
  )
}

/** 지난 근무: 합계 숫자 · 월별 카드 */
export function HistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="지난 근무 불러오는 중" className="animate-pulse space-y-4" data-skeleton="history">
      <div className={`h-4 w-16 ${bar}`} />
      <div className={`h-7 w-28 ${bar}`} />
      <div className="card grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className={`h-3.5 w-10 ${bar}`} />
            <div className={`h-6 w-16 ${bar}`} />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card space-y-3">
          <div className="flex justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`h-5 w-3/4 ${bar}`} />
              <div className={`h-4 w-1/2 ${bar}`} />
            </div>
            <div className={`h-6 w-20 ${bar}`} />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded-xl bg-line/60" />
            <div className="h-8 w-20 rounded-xl bg-line/60" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 커뮤니티 글 목록: 제목 · 검색 · 말머리 칩 · 글 카드 */
export function CommunitySkeleton() {
  return (
    <div aria-busy="true" aria-label="커뮤니티 불러오는 중" className="animate-pulse space-y-4" data-skeleton="community">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className={`h-7 w-28 ${bar}`} />
          <div className={`h-4 w-44 ${bar}`} />
        </div>
        <div className="h-9 w-20 rounded-xl bg-line/70" />
      </div>
      <div className="h-11 rounded-xl bg-line/60" />
      <div className="flex gap-2 overflow-hidden">
        {[14, 16, 16, 16, 22].map((w, i) => (
          <div key={i} className="h-9 shrink-0 rounded-full bg-line/70" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-2.5 p-4">
          <div className="h-5 w-14 rounded-full bg-line/70" />
          <div className={`h-5 w-3/4 ${bar}`} />
          <div className={`h-4 w-full ${bar}`} />
          <div className="flex justify-between">
            <div className={`h-3.5 w-24 ${bar}`} />
            <div className={`h-3.5 w-14 ${bar}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 커뮤니티 글 하나: 말머리 · 제목 · 내용 · 좋아요 줄 · 댓글 */
export function PostSkeleton() {
  return (
    <div aria-busy="true" aria-label="글 불러오는 중" className="animate-pulse space-y-4" data-skeleton="post">
      <div className={`h-4 w-16 ${bar}`} />
      <div className="card space-y-3">
        <div className="h-5 w-14 rounded-full bg-line/70" />
        <div className={`h-6 w-4/5 ${bar}`} />
        <div className={`h-4 w-28 ${bar}`} />
        <div className="space-y-2 pt-1">
          <div className={`h-4 w-full ${bar}`} />
          <div className={`h-4 w-11/12 ${bar}`} />
          <div className={`h-4 w-2/3 ${bar}`} />
        </div>
        <div className="flex justify-between border-t border-line pt-3">
          <div className="h-9 w-24 rounded-full bg-line/70" />
          <div className={`h-4 w-16 ${bar}`} />
        </div>
      </div>
      <div className={`h-5 w-16 ${bar}`} />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
          <div className={`h-3.5 w-24 ${bar}`} />
          <div className={`h-4 w-3/4 ${bar}`} />
        </div>
      ))}
    </div>
  )
}
