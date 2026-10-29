/** 목록이 비었을 때: 둥실 떠 있는 그림과 안내 */
export default function Empty({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center py-10 text-center">
      <span aria-hidden className="mb-3 animate-float text-4xl">
        {icon}
      </span>
      <p className="font-semibold text-sub">{title}</p>
      {children && <div className="mt-1.5 text-sm text-mute">{children}</div>}
    </div>
  )
}
