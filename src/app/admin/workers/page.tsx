import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { ageOn, fmtDate, kstDate } from '@/lib/time'

export const metadata: Metadata = { title: '근무자' }

type Row = {
  id: string
  name: string
  phone: string
  role: string
  birth_date: string | null
  active: boolean
  bank_account_enc: string | null
  created_at: string
}

export default async function WorkersPage(props: PageProps<'/admin/workers'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 30) : ''
  let query = db()
    .from('users')
    .select('id, name, phone, role, birth_date, active, bank_account_enc, created_at')
    .order('created_at', { ascending: false })
    .limit(300)
  if (q) {
    const digits = q.replace(/\D/g, '')
    const safe = q.replace(/[%,()]/g, '')
    query = digits.length >= 3 ? query.like('phone', `%${digits}%`) : query.ilike('name', `%${safe}%`)
  }
  const users = must(await query) as Row[]
  const ids = users.map((u) => u.id)
  const atts = ids.length
    ? (must(await db().from('attendance').select('user_id, work_date').in('user_id', ids)) as { user_id: string; work_date: string }[])
    : []
  const stat: Record<string, { days: number; last: string }> = {}
  for (const a of atts) {
    const s = (stat[a.user_id] ??= { days: 0, last: '' })
    s.days++
    if (a.work_date > s.last) s.last = a.work_date
  }
  const today = kstDate()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">근무자 {users.length}명</h1>
        <div className="flex gap-2">
          <form className="flex gap-1">
            <input name="q" defaultValue={q} className="input w-48 py-2 text-sm" placeholder="이름 또는 번호 검색" />
            <button className="btn-gray btn-sm">검색</button>
          </form>
          <a href="/admin/export/workers" className="btn-soft btn-sm">
            근로자 명부 CSV
          </a>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>나이</th>
              <th>연락처</th>
              <th>근무일수</th>
              <th>최근 근무</th>
              <th>계좌</th>
              <th>가입일</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                <td className="whitespace-nowrap">
                  <Link href={`/admin/workers/${u.id}`} className="font-semibold hover:text-brand-600">
                    {u.name}
                  </Link>
                  {u.role === 'admin' && <span className="badge ml-1 bg-ink text-white">관리자</span>}
                  {!u.active && <span className="badge ml-1 bg-gray-100 text-mute">탈퇴·정지</span>}
                </td>
                <td>
                  {u.birth_date ? `${ageOn(u.birth_date, today)}세` : '-'}
                  {u.birth_date && ageOn(u.birth_date, today) < 18 && <span className="badge ml-1 bg-rose-50 text-rose-600">연소자</span>}
                </td>
                <td className="whitespace-nowrap">{phoneFmt(u.phone)}</td>
                <td>{stat[u.id]?.days ?? 0}일</td>
                <td className="whitespace-nowrap">{stat[u.id]?.last ? fmtDate(stat[u.id].last) : '-'}</td>
                <td>{u.bank_account_enc ? '등록' : <span className="text-rose-500">미등록</span>}</td>
                <td className="whitespace-nowrap text-mute">{fmtDate(kstDate(u.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
