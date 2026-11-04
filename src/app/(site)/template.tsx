import PageTransition from '@/components/PageTransition'

// 화면을 옮길 때: 이전 내용은 흐려지고 새 내용이 살짝 떠오르며 나타남 (방향 링크는 옆으로 밀리듯)
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}
