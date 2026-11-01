import { watermarkStyle } from '@/lib/watermark'

/**
 * 서류 위에 옅게 덮는 워터마크 (표·칸 배경에 가려지지 않게 맨 위에, 눌러도 아래가 그대로 눌림).
 * 감싼 상자에 relative가 있어야 함. 화면·인쇄·PDF 모두 찍힘
 */
export default function Watermark({ text }: { text: string }) {
  return <div aria-hidden data-watermark={text} className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]" style={watermarkStyle(text)} />
}
