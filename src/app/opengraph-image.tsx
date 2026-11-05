import { ImageResponse } from 'next/og'
import { OG_HEADERS, OG_SIZE, OgFrame, ogFonts } from '@/lib/og'

/** 그 밖의 링크(첫 화면·가입 등)를 보낼 때 뜨는 기본 미리보기 그림 */
export const alt = '해피워크 · 행사 단기 알바'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 14 }}>
          <span style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1.5 }}>행사 단기 알바,</span>
          <span style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.15, letterSpacing: -1.5 }}>지원부터 정산까지 한 번에</span>
          <span style={{ fontSize: 32, fontWeight: 600, opacity: 0.9, marginTop: 10 }}>간편가입 · 출퇴근 버튼 · 근로계약서 · 급여명세서</span>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: OG_HEADERS },
  )
}
