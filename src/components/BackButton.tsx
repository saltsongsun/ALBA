'use client'

/** 바로 앞 화면으로 (앞 화면이 없으면 — 알림·링크로 바로 들어왔을 때 — fallback 주소로) */
export default function BackButton({ fallback, className = 'btn-gray', children }: { fallback: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      data-back
      onClick={() => {
        if (window.history.length > 1) window.history.back()
        else window.location.assign(fallback)
      }}
    >
      {children}
    </button>
  )
}
