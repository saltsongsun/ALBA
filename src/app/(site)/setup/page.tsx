import type { Metadata } from 'next'
import Link from 'next/link'
import { SetupForm } from '@/components/AuthForms'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: '처음 설정' }

export default async function SetupPage() {
  const { count } = await db().from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin')
  if ((count ?? 0) > 0) {
    return (
      <div className="card mt-6 text-center">
        <p className="font-semibold">이미 관리자 계정이 있습니다.</p>
        <Link href="/login?next=/admin" className="btn-primary mt-4">
          관리자 로그인
        </Link>
      </div>
    )
  }
  return (
    <div className="pt-4">
      <h1 className="mb-1 text-2xl font-extrabold">처음 설정</h1>
      <p className="mb-5 text-sub">첫 관리자 계정을 만들고 기본 근로계약서 서식을 준비합니다.</p>
      <SetupForm />
    </div>
  )
}
