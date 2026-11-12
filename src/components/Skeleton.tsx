/**
 * 화면을 불러오는 동안 보여 주는 회색 자리 (실제 화면과 같은 모양이라, 눌렀을 때 바로 넘어간 것처럼 느껴짐).
 * 전체가 천천히 숨 쉬듯 밝아졌다 흐려짐(.skeleton, globals.css — 투명도만 바꿔 가벼움). '움직임 줄이기' 설정이면 멈춤
 */
const bar = 'rounded bg-line/70'

/** back: 위에 '← 돌아가기' 줄과 설명 두 줄이 있는 화면 (함께 일한 사람·회사 후기 등) */
export default function Skeleton({ cards = 3, hero = false, back = false }: { cards?: number; hero?: boolean; back?: boolean }) {
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="skeleton space-y-4">
      {back && <div className={`h-4 w-20 ${bar}`} />}
      {hero && <div className="h-36 rounded-3xl bg-line/70" />}
      {back ? (
        <div className="space-y-2">
          <div className={`h-7 w-36 ${bar}`} />
          <div className={`h-4 w-full ${bar}`} />
          <div className={`h-4 w-2/3 ${bar}`} />
        </div>
      ) : (
        <div className={`h-6 w-40 ${bar}`} />
      )}
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
    <div aria-busy="true" aria-label="공고 불러오는 중" className="skeleton space-y-4" data-skeleton="jobs">
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
    <div aria-busy="true" aria-label="공고 불러오는 중" className="skeleton space-y-4" data-skeleton="job">
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
    <div aria-busy="true" aria-label="대화 불러오는 중" className="skeleton space-y-4" data-skeleton="chat">
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

/** 문의 목록 (아래 탭 '문의'): 제목 · 대화방 줄 (동그란 그림 + 이름·마지막 메시지) */
export function InboxSkeleton() {
  return (
    <div aria-busy="true" aria-label="문의 불러오는 중" className="skeleton space-y-4" data-skeleton="inbox">
      <div className="space-y-2">
        <div className={`h-7 w-16 ${bar}`} />
        <div className={`h-4 w-64 max-w-full ${bar}`} />
      </div>
      <div className="card divide-y divide-line p-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="size-12 shrink-0 rounded-[18px] bg-line/70" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex justify-between gap-3">
                <div className={`h-4 w-32 ${bar}`} />
                <div className={`h-3.5 w-10 ${bar}`} />
              </div>
              <div className={`h-4 w-4/5 ${bar}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 지난 근무: 합계 숫자 · 월별 카드 */
export function HistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="지난 근무 불러오는 중" className="skeleton space-y-4" data-skeleton="history">
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
    <div aria-busy="true" aria-label="커뮤니티 불러오는 중" className="skeleton space-y-4" data-skeleton="community">
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
    <div aria-busy="true" aria-label="글 불러오는 중" className="skeleton space-y-4" data-skeleton="post">
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

/** 내 정보: '← 내 근무' · 정보 채우기 목록 · 사진·이름 카드 · 계좌·연락 정보 칸 */
export function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="내 정보 불러오는 중" className="skeleton space-y-4" data-skeleton="profile">
      <div className={`h-4 w-20 ${bar}`} />
      <div className="card space-y-3">
        <div className={`h-5 w-28 ${bar}`} />
        <div className="h-1.5 rounded-full bg-line/60" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-line/50" />
        ))}
      </div>
      <div className="card flex items-center gap-4">
        <div className="size-20 shrink-0 rounded-full bg-line/70" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`h-6 w-24 ${bar}`} />
          <div className={`h-4 w-40 max-w-full ${bar}`} />
          <div className="h-8 w-24 rounded-xl bg-line/60" />
        </div>
      </div>
      <div className="card space-y-3">
        <div className={`h-5 w-36 ${bar}`} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className={`h-3.5 w-14 ${bar}`} />
            <div className="h-11 rounded-[14px] bg-line/50" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 관리자 공고 화면: '← 공고 목록' · 제목 카드(상태·제목·일정·버튼) · 탭 · 지원자 카드 */
export function AdminJobSkeleton() {
  return (
    <div aria-busy="true" aria-label="공고 불러오는 중" className="skeleton space-y-4" data-skeleton="admin-job">
      <div className={`h-4 w-20 ${bar}`} />
      <div className="card space-y-3">
        <div className="flex gap-1.5">
          <div className="h-5 w-12 rounded-full bg-line/70" />
          <div className={`h-5 w-36 ${bar}`} />
        </div>
        <div className={`h-7 w-11/12 ${bar}`} />
        <div className={`h-7 w-2/3 ${bar}`} />
        <div className={`h-4 w-48 max-w-full ${bar}`} />
        <div className={`h-4 w-40 max-w-full ${bar}`} />
        <div className="flex flex-wrap gap-2 pt-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-20 rounded-xl bg-line/60" />
          ))}
        </div>
      </div>
      <div className="flex gap-4 border-b border-line pb-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-5 w-14 ${bar}`} />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card space-y-3">
          <div className="flex items-center gap-3">
            <div className="size-12 shrink-0 rounded-full bg-line/70" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`h-5 w-28 ${bar}`} />
              <div className={`h-4 w-40 max-w-full ${bar}`} />
            </div>
          </div>
          <div className="h-16 rounded-xl bg-line/50" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-11 rounded-2xl bg-line/60" />
            <div className="h-11 rounded-2xl bg-line/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 관리자 문의 목록: 제목 · 찾기 칸 · 단체방 카드 · 전체/안 읽음 칩 · 대화 줄 */
export function AdminInboxSkeleton() {
  return (
    <div aria-busy="true" aria-label="문의 불러오는 중" className="skeleton space-y-4" data-skeleton="admin-inbox">
      <div className="flex items-center justify-between">
        <div className={`h-7 w-16 ${bar}`} />
        <div className="h-8 w-28 rounded-full bg-line/70" />
      </div>
      <div className="h-11 rounded-2xl bg-line/60" />
      <div className="card flex items-center gap-3 py-3.5">
        <div className="size-11 shrink-0 rounded-full bg-line/70" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`h-4 w-3/4 ${bar}`} />
          <div className={`h-3.5 w-1/3 ${bar}`} />
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="h-8 w-16 rounded-full bg-line/70" />
        <div className="h-8 w-20 rounded-full bg-line/60" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card flex items-center gap-3 py-3.5">
            <div className="size-11 shrink-0 rounded-full bg-line/70" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex justify-between gap-3">
                <div className={`h-4 w-32 ${bar}`} />
                <div className={`h-3.5 w-10 ${bar}`} />
              </div>
              <div className={`h-4 w-4/5 ${bar}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 관리자 근무자 명단: 명단 탭 · 제목 · 찾기 칸 · 칩 · 사람 카드 (동그란 사진 + 이름·번호·한 줄) */
export function RosterSkeleton() {
  return (
    <div aria-busy="true" aria-label="명단 불러오는 중" className="skeleton space-y-4" data-skeleton="roster">
      <div className="h-12 rounded-2xl bg-line/60" />
      <div className={`h-7 w-28 ${bar}`} />
      <div className="flex gap-2">
        <div className="h-11 flex-1 rounded-2xl bg-line/60" />
        <div className="h-11 w-24 rounded-2xl bg-line/70" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {['w-14', 'w-20', 'w-28', 'w-14'].map((w, i) => (
          <div key={i} className={`h-8 ${w} shrink-0 rounded-full bg-line/70`} />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="flex items-center gap-3">
              <div className="size-14 shrink-0 rounded-full bg-line/70" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`h-5 w-28 ${bar}`} />
                <div className={`h-3.5 w-16 ${bar}`} />
              </div>
            </div>
            <div className="flex gap-2">
              <div className={`h-8 w-28 ${bar}`} />
              <div className="h-8 w-16 rounded-lg bg-line/60" />
              <div className="h-8 w-16 rounded-lg bg-line/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


/** 전문가·외주 홈: 보라색 큰 카드 자리 · 견적 요청 줄 */
export function ProHomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="skeleton space-y-5" data-skeleton="pro">
      <div className="h-44 rounded-3xl bg-line/70" />
      <div className={`h-6 w-36 ${bar}`} />
      {[0, 1].map((i) => (
        <div key={i} className="card flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`h-3.5 w-24 ${bar}`} />
            <div className={`h-5 w-3/5 ${bar}`} />
            <div className={`h-4 w-2/5 ${bar}`} />
          </div>
          <div className={`h-4 w-16 shrink-0 ${bar}`} />
        </div>
      ))}
    </div>
  )
}

/** 견적·대금: 제목 · 받을/받은 대금 두 칸 · 견적 요청 줄 · 대금 줄 */
export function ProMoneySkeleton() {
  const rows = (n: number) => (
    <div className="card divide-y divide-line py-1">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`h-3.5 w-20 ${bar}`} />
            <div className={`h-5 w-1/2 ${bar}`} />
            <div className={`h-3.5 w-3/5 ${bar}`} />
          </div>
          <div className="shrink-0 space-y-2">
            <div className={`ml-auto h-5 w-20 ${bar}`} />
            <div className="ml-auto h-5 w-14 rounded-full bg-line/70" />
          </div>
        </div>
      ))}
    </div>
  )
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="skeleton space-y-5" data-skeleton="pro-money">
      <div className="space-y-2">
        <div className={`h-7 w-32 ${bar}`} />
        <div className={`h-4 w-4/5 ${bar}`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-[68px] rounded-2xl bg-line/70" />
        <div className="h-[68px] rounded-2xl bg-line/60" />
      </div>
      <div className={`h-6 w-28 ${bar}`} />
      {rows(1)}
      <div className={`h-6 w-16 ${bar}`} />
      {rows(2)}
    </div>
  )
}

/** 서류(서명) 화면: 돌아가기·상태 줄 · 회사 · 공고 줄 · 서류 종이 · 서명 칸 (서명하러 들어갈 때 빈 화면 대신 같은 모양) */
export function DocSkeleton() {
  return (
    <div aria-busy="true" aria-label="서류 불러오는 중" className="skeleton space-y-4" data-skeleton="doc">
      <div className="flex items-center justify-between">
        <div className={`h-4 w-16 ${bar}`} />
        <div className="h-6 w-16 rounded-full bg-line/60" />
      </div>
      <div className={`h-4 w-3/5 ${bar}`} />
      <div className="card space-y-3 px-5 py-6">
        <div className={`mx-auto h-6 w-28 ${bar}`} />
        <div className={`mx-auto h-4 w-32 ${bar}`} />
        {[0.95, 0.8, 0.9, 0.7, 0.85, 0.6].map((w, i) => (
          <div key={i} className={`h-3.5 ${bar}`} style={{ width: `${w * 100}%` }} />
        ))}
      </div>
      <div className="card space-y-3">
        <div className={`h-5 w-24 ${bar}`} />
        <div className="h-36 rounded-2xl border-2 border-dashed border-line" />
        <div className={`h-4 w-4/5 ${bar}`} />
        <div className="h-12 rounded-2xl bg-line/60" />
      </div>
    </div>
  )
}

/** 회사 설정: 제목 · 관리자(초대 코드) · 회사 정보 칸들 · 직인 · 운영 기본값 (대시보드 모양 대신 같은 모양) */
export function SettingsSkeleton() {
  const field = (w = 'w-full') => (
    <div className="space-y-1.5">
      <div className={`h-3.5 w-16 ${bar}`} />
      <div className={`h-12 ${w} rounded-xl bg-line/50`} />
    </div>
  )
  return (
    <div aria-busy="true" aria-label="회사 설정 불러오는 중" className="skeleton space-y-4" data-skeleton="settings">
      <div className={`h-7 w-28 ${bar}`} />
      <div className="card space-y-3">
        <div className="flex justify-between">
          <div className={`h-5 w-16 ${bar}`} />
          <div className={`h-4 w-8 ${bar}`} />
        </div>
        <div className="h-28 rounded-2xl bg-line/40" />
      </div>
      <div className="card space-y-4">
        <div className="space-y-2">
          <div className={`h-5 w-32 ${bar}`} />
          <div className={`h-3.5 w-3/4 ${bar}`} />
        </div>
        {field()}
        <div className="grid grid-cols-2 gap-3">
          {field()}
          {field()}
        </div>
        {field()}
      </div>
      <div className="card flex items-center gap-4">
        <div className="size-24 shrink-0 rounded-2xl border-2 border-dashed border-line" />
        <div className="flex-1 space-y-2">
          <div className={`h-8 w-24 ${bar}`} />
          <div className={`h-3.5 w-full ${bar}`} />
          <div className={`h-3.5 w-2/3 ${bar}`} />
        </div>
      </div>
      <div className="h-12 w-28 rounded-2xl bg-line/60" />
    </div>
  )
}


/** 관리자 공고 목록: 제목 + 새 공고 버튼 · 공고 모음 링크 한 줄 · 탭 · 찾기 칸 · 공고 카드(배지 · 제목 · 일정 · 인원 막대) — 대시보드 모양 대신 */
export function AdminJobListSkeleton() {
  return (
    <div aria-busy="true" aria-label="공고 불러오는 중" className="skeleton space-y-4" data-skeleton="admin-jobs">
      <div className="flex items-center justify-between gap-3">
        <div className={`h-7 w-32 ${bar}`} />
        <div className="h-11 w-32 rounded-2xl bg-line/70" />
      </div>
      <div className="card flex items-center gap-2 px-4 py-3">
        <div className="size-5 shrink-0 rounded-md bg-line/70" />
        <div className="min-w-0 flex-1">
          <div className={`h-4 w-28 ${bar}`} />
        </div>
        <div className="h-8 w-11 shrink-0 rounded-full bg-line/60" />
        <div className="h-8 w-20 shrink-0 rounded-full bg-line/70" />
      </div>
      <div className="flex gap-1">
        {[20, 17, 17].map((w, i) => (
          <div key={i} className="h-8 rounded-lg bg-line/50" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="h-10 rounded-xl bg-line/50" />
      {/* 휴대폰: 공고 카드 · 넓은 화면: 표 한 장 */}
      <div className="space-y-2 sm:hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-2 p-4">
            <div className="flex gap-1.5">
              <div className="h-5 w-14 rounded-full bg-line/70" />
              <div className="h-5 w-12 rounded-full bg-line/50" />
            </div>
            <div className={`h-5 w-3/4 ${bar}`} />
            <div className={`h-4 w-1/2 ${bar}`} />
            <div className="flex items-center gap-2 pt-1">
              <div className="h-1.5 min-w-0 flex-1 rounded-full bg-line/70" />
              <div className={`h-3.5 w-16 ${bar}`} />
              <div className={`h-3.5 w-8 ${bar}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="card hidden space-y-4 sm:block">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className={`h-4 w-2/5 ${bar}`} />
            <div className={`h-4 w-1/5 ${bar}`} />
            <div className="h-1.5 flex-1 rounded-full bg-line/60" />
            <div className="h-5 w-14 rounded-full bg-line/70" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 공고 쓰기·고치기: 돌아가기 줄 · 제목 · 모집 대상 두 칸 · 펼친 '기본 정보' · 접힌 칸들 · 아래 등록 버튼 (대시보드 모양 대신 같은 모양) */
export function JobFormSkeleton() {
  return (
    <div aria-busy="true" aria-label="공고 불러오는 중" className="skeleton mx-auto max-w-3xl space-y-3" data-skeleton="job-form">
      <div className={`h-4 w-20 ${bar}`} />
      <div className={`mb-4 h-7 w-36 ${bar}`} />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1.5 rounded-2xl border-2 border-line px-4 py-3">
            <div className={`h-5 w-4/5 ${bar}`} />
            <div className={`h-3 w-3/5 ${bar}`} />
          </div>
        ))}
      </div>
      <div className="card space-y-4">
        <div className={`h-5 w-20 ${bar}`} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className={`h-3.5 w-16 ${bar}`} />
            <div className={`${i === 2 ? 'h-24' : 'h-12'} rounded-xl bg-line/50`} />
          </div>
        ))}
      </div>
      {[28, 20, 24, 32].map((w, i) => (
        <div key={i} className="card flex items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className={`h-5 ${bar}`} style={{ width: `${w * 4}px` }} />
            <div className={`h-3.5 w-2/3 ${bar}`} />
          </div>
          <div className="size-5 shrink-0 rounded-md bg-line/50" />
        </div>
      ))}
      <div className="h-[52px] rounded-2xl bg-line/70" />
    </div>
  )
}

/** 기간을 넘기는 줄 (‹ 이번 달 · 2026년 11월 ›) — 정산·주간 화면 맨 위 */
function PeriodNav() {
  return (
    <div className="card flex items-center justify-between py-3">
      <div className="size-6 rounded bg-line/50" />
      <div className="flex flex-col items-center gap-1.5">
        <div className={`h-3 w-12 ${bar}`} />
        <div className={`h-5 w-32 ${bar}`} />
      </div>
      <div className="size-6 rounded bg-line/50" />
    </div>
  )
}

/** 정산·신고자료: 제목 · 달 넘기기 · 지급총액 카드(큰 숫자 + 공제 3칸) · 신고자료 목록 — 대시보드 모양 대신 */
export function ReportsSkeleton() {
  return (
    <div aria-busy="true" aria-label="정산 불러오는 중" className="skeleton space-y-4" data-skeleton="reports">
      <div className={`h-7 w-36 ${bar}`} />
      <PeriodNav />
      <div className="card space-y-4">
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <div className={`h-3.5 w-14 ${bar}`} />
            <div className={`h-8 w-28 ${bar}`} />
          </div>
          <div className={`h-4 w-20 ${bar}`} />
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className={`h-3 w-12 ${bar}`} />
              <div className={`h-4 w-10 ${bar}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="card space-y-3">
        <div className={`h-5 w-28 ${bar}`} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-line/25 px-3 py-3">
            <div className="flex-1 space-y-1.5">
              <div className={`h-4 w-2/3 ${bar}`} />
              <div className={`h-3 w-1/3 ${bar}`} />
            </div>
            <div className={`h-4 w-10 ${bar}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 주간 근무·주휴: 제목 · 주 넘기기 · 예상 인건비/주휴수당 두 칸 · 근무자 줄(이름 · 시간 막대) — 대시보드 모양 대신 */
export function WeeklySkeleton() {
  return (
    <div aria-busy="true" aria-label="주간 근무 불러오는 중" className="skeleton space-y-4" data-skeleton="weekly">
      <div className={`h-7 w-36 ${bar}`} />
      <PeriodNav />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="card space-y-2">
            <div className={`h-3.5 w-16 ${bar}`} />
            <div className={`h-7 w-24 ${bar}`} />
          </div>
        ))}
      </div>
      <div className="card space-y-4">
        <div className={`h-5 w-20 ${bar}`} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <div className={`h-4 w-16 ${bar}`} />
              <div className="h-5 w-16 rounded-full bg-line/50" />
            </div>
            <div className={`h-3 w-1/2 ${bar}`} />
            <div className="h-1.5 w-full rounded-full bg-line/40" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 근무자 한 사람 (관리자): '← 근무자 목록' · 사진·이름·배지 카드 · 정보 줄(휴대폰·생년월일·주소·계좌) · 접힌 칸들 — 일반 카드 모양 대신 */
export function WorkerDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="근무자 불러오는 중" className="skeleton space-y-4" data-skeleton="worker">
      <div className={`h-4 w-24 ${bar}`} />
      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <div className="size-24 shrink-0 rounded-full bg-line/60" />
          <div className="flex-1 space-y-2.5">
            <div className={`h-6 w-28 ${bar}`} />
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-5 w-12 rounded-full bg-line/50" />
              ))}
            </div>
            <div className="h-8 w-24 rounded-xl bg-line/50" />
          </div>
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className={`h-4 w-16 shrink-0 ${bar}`} />
            <div className={`h-4 w-32 ${bar}`} />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card flex items-center justify-between">
          <div className="space-y-2">
            <div className={`h-5 w-20 ${bar}`} />
            <div className={`h-3.5 w-36 ${bar}`} />
          </div>
          <div className="size-5 rounded bg-line/50" />
        </div>
      ))}
    </div>
  )
}

/** 내 근무 (근무자): 날짜·인사 + '내 정보' · '오늘의 근무' 큰 카드(회사 · 제목 · 시간 · 버튼) · 이번 주 7칸 — 일반 카드 두 개 대신 */
export function MeSkeleton() {
  return (
    <div aria-busy="true" aria-label="내 근무 불러오는 중" className="skeleton space-y-4" data-skeleton="me">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className={`h-3.5 w-16 ${bar}`} />
          <div className={`h-7 w-44 ${bar}`} />
        </div>
        <div className="h-9 w-20 rounded-xl bg-line/50" />
      </div>
      <div className={`h-5 w-24 ${bar}`} />
      <div className="card space-y-3">
        <div className={`h-3.5 w-40 ${bar}`} />
        <div className={`h-6 w-3/4 ${bar}`} />
        <div className={`h-4 w-1/2 ${bar}`} />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-16 rounded-xl bg-line/50" />
          ))}
        </div>
        <div className="h-14 w-full rounded-2xl bg-line/60" />
      </div>
      <div className={`h-5 w-28 ${bar}`} />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-[62px] rounded-xl bg-line/40" />
        ))}
      </div>
    </div>
  )
}
