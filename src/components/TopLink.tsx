'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 맨 위 로고 링크: 지금 그 화면이면 다시 불러오지 않고 맨 위로 (휴대폰 앱처럼).
 * 홈에서 로고를 여러 번 눌러도 아무 반응이 없던 것 (인사이트: 로고 연타)
 */
export default function TopLink({ href, className, children, ...rest }: { href: string; className?: string; children: React.ReactNode; 'aria-label'?: string }) {
  const path = usePathname()
  return (
    <Link
      href={href}
      className={className}
      {...rest}
      onClick={(e) => {
        if (path !== href || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
      }}
    >
      {children}
    </Link>
  )
}
