import NotFoundCard from '@/components/NotFoundCard'

/** 없는 주소·지워진 공고 (관리자 화면 안의 없는 주소는 admin/not-found.tsx — 메뉴를 그대로 둠 · 공고는 jobs/[id]/not-found.tsx) */
export default function NotFound() {
  return (
    // 근무자 화면 안에서 뜨면 머리글·아래 메뉴가 함께 보이므로 화면 높이를 다 쓰지 않음 (카드가 아래로 밀리지 않게)
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center text-center">
      <NotFoundCard />
    </main>
  )
}
