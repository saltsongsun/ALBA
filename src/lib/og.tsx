import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 카카오톡·문자로 링크를 보낼 때 뜨는 미리보기 그림(1200×630) 공용 부품.
 * 그림 만드는 도구는 woff2를 못 읽어서 Pretendard OTF(src/fonts/og, OFL)를 씀
 */
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_BRAND = '#2557e8'
// 공고가 바뀌면 10분 안에 새 그림 (카카오톡은 자체로도 한동안 기억함)
export const OG_HEADERS = { 'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400' }

type OgFont = { name: string; data: Buffer; weight: 600 | 700; style: 'normal' }
let fonts: Promise<OgFont[]> | null = null
export function ogFonts(): Promise<OgFont[]> {
  fonts ??= Promise.all([
    readFile(join(process.cwd(), 'src/fonts/og/Pretendard-Bold.otf')),
    readFile(join(process.cwd(), 'src/fonts/og/Pretendard-SemiBold.otf')),
  ]).then(([bold, semi]) => [
    { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
    { name: 'Pretendard', data: semi, weight: 600, style: 'normal' },
  ])
  return fonts
}

/** 앱 아이콘 (웃는 얼굴 + 반짝임) */
export function OgLogo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#ffffff" />
      <circle cx="22.5" cy="27" r="3.8" fill={OG_BRAND} />
      <circle cx="41.5" cy="27" r="3.8" fill={OG_BRAND} />
      <path d="M18.5 36.5c3.2 6.6 8.2 9.8 13.5 9.8s10.3-3.2 13.5-9.8" fill="none" stroke={OG_BRAND} strokeWidth="5.4" strokeLinecap="round" />
      <path d="M50.5 8.5l1.7 4.3 4.3 1.7-4.3 1.7-1.7 4.3-1.7-4.3-4.3-1.7 4.3-1.7z" fill="#FFD43B" />
    </svg>
  )
}

/** 작은 선 아이콘 (달력·위치·건물·체크) — 이모지는 그림 도구에서 깨져서 직접 그림 */
export function OgIcon({ name, size = 30, color = '#ffffff' }: { name: 'calendar' | 'pin' | 'building' | 'check'; size?: number; color?: string }) {
  const p = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'calendar' && (
        <>
          <rect x="4" y="5" width="16" height="15.5" rx="2.5" {...p} />
          <path d="M8 3v4M16 3v4M4 10h16" {...p} />
        </>
      )}
      {name === 'pin' && (
        <>
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" {...p} />
          <circle cx="12" cy="10" r="2.3" {...p} />
        </>
      )}
      {name === 'building' && <path d="M5 20.5V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5v15M15 9.5h3.5a1.5 1.5 0 0 1 1.5 1.5v9.5M3.5 20.5h17M8.5 8h3M8.5 11.5h3M8.5 15h3" {...p} />}
      {name === 'check' && (
        <>
          <circle cx="12" cy="12" r="8.5" {...p} />
          <path d="M8.3 12.3l2.5 2.5 4.9-5" {...p} />
        </>
      )}
    </svg>
  )
}

/** 파란 바탕 + 위쪽 로고 줄 (모든 미리보기 그림의 틀) */
export function OgFrame({ tag, children }: { tag?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '56px 64px',
        fontFamily: 'Pretendard',
        color: '#ffffff',
        backgroundColor: OG_BRAND,
        backgroundImage: 'linear-gradient(135deg, #3b7bff 0%, #2557e8 45%, #1d3fb8 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <OgLogo size={64} />
        <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>해피워크</span>
        {tag && (
          <span style={{ marginLeft: 'auto', fontSize: 26, fontWeight: 700, color: OG_BRAND, backgroundColor: '#ffffff', borderRadius: 999, padding: '8px 22px' }}>
            {tag}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

/** 글자가 길면 잘라서 … (그림에서는 줄 수를 정확히 셀 수 없어 글자 수로) */
export function clip(s: string, n: number) {
  const t = s.trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
