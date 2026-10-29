import SiteHeader from '@/components/SiteHeader'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pt-5 pb-16">{children}</main>
    </>
  )
}
