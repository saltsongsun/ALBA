/** 해피워크 로고 (웃는 얼굴 + 반짝임). 아이콘 파일과 같은 모양 */
export default function Logo({ className = 'size-7', mono = false }: { className?: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="hw-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B7BFF" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={mono ? '#191f28' : 'url(#hw-logo-bg)'} />
      <circle cx="22.5" cy="27" r="3.8" fill="#fff" />
      <circle cx="41.5" cy="27" r="3.8" fill="#fff" />
      <path d="M18.5 36.5c3.2 6.6 8.2 9.8 13.5 9.8s10.3-3.2 13.5-9.8" fill="none" stroke="#fff" strokeWidth="5.4" strokeLinecap="round" />
      <path d="M50.5 8.5l1.7 4.3 4.3 1.7-4.3 1.7-1.7 4.3-1.7-4.3-4.3-1.7 4.3-1.7z" fill="#FFD43B" />
    </svg>
  )
}
