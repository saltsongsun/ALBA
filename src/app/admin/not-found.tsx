import Link from 'next/link'
import BackButton from '@/components/BackButton'
import Icon from '@/components/Icon'
import { requireAdmin } from '@/lib/session'

/**
 * 관리자 화면 안의 없는 주소 (지워진 공고·다른 회사 자료): 메뉴와 회사 고르기는 그대로 두고 안내만.
 * (예전에는 근무자용 '모집 중인 알바 · 내 근무' 버튼만 있는 빈 화면이 떠서 관리자 화면으로 돌아오기 번거로웠음)
 */
export default async function AdminNotFound() {
  const admin = await requireAdmin()
  return (
    <div className="mx-auto max-w-md py-6" data-admin-404>
      {/* 흰 카드 안에 (회색 버튼이 화면 바탕과 같은 색이라 카드 밖에서는 버튼처럼 안 보임) */}
      <div className="card animate-pop text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl bg-bg text-xl text-mute">
          <Icon name="search" />
        </span>
        <h1 className="mt-4 text-lg font-extrabold">찾는 화면이 없어요</h1>
        <p className="mt-1 text-sm text-sub">지워졌거나 주소가 바뀌었을 수 있어요.</p>
        {/* 여러 회사를 맡은 관리자: 다른 회사 자료를 열었을 수 있음 → 위의 회사 고르기로 */}
        {admin.companies.length > 1 && (
          <p className="mt-1 text-sm text-sub" data-admin-404-hint>
            다른 회사 자료라면 위에서 회사를 바꿔 보세요.
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <BackButton fallback="/admin" className="btn-gray flex-1">
            ← 뒤로
          </BackButton>
          <Link href="/admin" className="btn-primary flex-1">
            관리자 홈
          </Link>
        </div>
      </div>
    </div>
  )
}
