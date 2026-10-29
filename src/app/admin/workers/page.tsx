import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactButtons } from '@/components/Contact'
import { StarAvg } from '@/components/Stars'
import { db, must } from '@/lib/db'
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
  attendance: { work_date: string }[] | null
  ratings: { score: number }[] | null
}

export default async function WorkersPage(props: PageProps<'/admin/workers'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 30) : ''
  // 근무일수·최근 근무를 세기 위해 출퇴근 날짜도 같이 읽음
  let query = db()
    .from('users')
    .select('id, name, phone, role, birth_date, active, bank_account_enc, created_at, attendance(work_date), ratings:worker_ratings!worker_ratings_user_id_fkey(score)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (q) {
    const digits = q.replace(/\D/g, '')
    const safe = q.replace(/[%,()]/g, '')
    query = digits.length >= 3 ? query.like('phone', `%${digits}%`) : query.ilike('name', `%${safe}%`)
  }
  const users = must(await query) as Row[]
  const stat: Record<string, { days: number; last: string }> = {}
  for (const u of users) {
    for (const a of u.attendance ?? []) {
      const s = (stat[u.id] ??= { days: 0, last: '' })
      s.days++
      if (a.work_date > s.last) s.last = a.work_date
    }
  }
  const today = kstDate()

  const ageBadges = (u: Row) => {
    if (!u.birth_date) return null
    const age = ageOn(u.birth_date, today)
    return (
      <>
        <span className="text-sm text-mute">{age}세</span>
        {age < 18 && <span className="badge bg-rose-50 text-rose-600">연소자</span>}
      </>
    )
  }
  const roleBadges = (u: Row) => (
    <>
      <StarAvg scores={(u.ratings ?? []).map((r) => r.score)} />
      {u.role === 'admin' && <span className="badge bg-ink text-white">관리자</span>}
      {!u.active && <span className="badge bg-gray-100 text-mute">탈퇴·정지</span>}
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">근무자 {users.length}명</h1>
        <div className="flex w-full gap-2 sm:w-auto">
          <form className="flex min-w-0 flex-1 gap-1 sm:flex-none">
            <input name="q" defaultValue={q} className="input py-2 text-sm sm:w-48" placeholder="이름 또는 번호 검색" />
            <button className="btn-gray btn-sm">검색</button>
          </form>
          <a href="/admin/export/workers" className="btn-soft btn-sm">
            명부 CSV
          </a>
        </div>
      </div>

      {/* 휴대폰: 카드 목록 */}
      <div className="stagger space-y-2 sm:hidden">
        {users.map((u) => (
          <div key={u.id} className={`card p-4 ${u.active ? '' : 'opacity-50'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/admin/workers/${u.id}`} className="text-[17px] font-bold">
                {u.name}
              </Link>
              {ageBadges(u)}
              {roleBadges(u)}
            </div>
            <div className="mt-2">
              <ContactButtons phone={u.phone} name={u.name} />
            </div>
            <p className="mt-2 text-xs text-mute">
              근무 {stat[u.id]?.days ?? 0}일{stat[u.id]?.last && ` · 최근 ${fmtDate(stat[u.id].last)}`} · 계좌{' '}
              {u.bank_account_enc ? '등록' : <span className="text-rose-500">미등록</span>} · 가입 {fmtDate(kstDate(u.created_at))}
            </p>
          </div>
        ))}
      </div>

      {/* 넓은 화면: 표 */}
      <div className="card hidden overflow-x-auto p-0 sm:block">
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
                  <div className="flex items-center gap-1">
                    <Link href={`/admin/workers/${u.id}`} className="font-semibold hover:text-brand-600">
                      {u.name}
                    </Link>
                    {roleBadges(u)}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-1 whitespace-nowrap">{ageBadges(u) ?? '-'}</div>
                </td>
                <td className="whitespace-nowrap">
                  <ContactButtons phone={u.phone} name={u.name} />
                </td>
                <td className="whitespace-nowrap">{stat[u.id]?.days ?? 0}일</td>
                <td className="whitespace-nowrap">{stat[u.id]?.last ? fmtDate(stat[u.id].last) : '-'}</td>
                <td className="whitespace-nowrap">{u.bank_account_enc ? '등록' : <span className="text-rose-500">미등록</span>}</td>
                <td className="whitespace-nowrap text-mute">{fmtDate(kstDate(u.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
