// 화면을 옮길 때마다 새로 그려져, 내용이 살짝 떠오르며 나타남
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>
}
