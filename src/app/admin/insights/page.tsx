import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Empty from '@/components/Empty'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { AGE_BANDS, ageBand, GENDER_LABEL, ROLE_LABEL, screenName } from '@/lib/usage'

export const metadata: Metadata = { title: '인사이트' }

type Ev = { session: string; role: string; gender: string | null; age_band: string | null; path: string; prev: string | null; kind: 'view' | 'leave'; ms: number | null; at: string }
type Dim = 'role' | 'gender' | 'age'

const DIMS: { id: Dim; label: string }[] = [
  { id: 'role', label: '근로자 · 관리자' },
  { id: 'gender', label: '남자 · 여자' },
  { id: 'age', label: '나이대' },
]

const segOf = (dim: Dim, e: Pick<Ev, 'role' | 'gender' | 'age_band'>) =>
  dim === 'role' ? (ROLE_LABEL[e.role] ?? e.role) : dim === 'gender' ? (e.gender ? GENDER_LABEL[e.gender] : '모름') : (e.age_band ?? '모름')

const ORDER: Record<Dim, string[]> = {
  role: ['근로자', '전문가', '관리자', '외주 업체', '비회원'],
  gender: ['남자', '여자', '모름'],
  age: [...AGE_BANDS, '모름'],
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const secText = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}분 ${Math.round((ms % 60_000) / 1000)}초` : `${Math.round(ms / 1000)}초`)

/** 100명씩 나눠 읽기 (주소가 너무 길어지지 않게) */
async function inChunks<T>(ids: string[], read: (chunk: string[]) => PromiseLike<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 100) out.push(...(await read(ids.slice(i, i + 100))))
  return out
}

/**
 * 인사이트 (최고 관리자만): 화면 이동 기록(자체 분석, 개인정보 없음) + 지원→확정→서명→출근 단계.
 * 근로자/관리자 · 남자/여자 · 나이대별로 어떤 화면을 많이 보고, 얼마나 머물고, 어디서 나가는지 비교
 */
export default async function InsightsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin()
  if (!admin.isSuper) notFound()
  const sp = await props.searchParams
  const days = sp.d === '7' ? 7 : sp.d === '90' ? 90 : 30
  const dim: Dim = sp.dim === 'gender' || sp.dim === 'age' ? sp.dim : 'role'
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await db().from('usage_events').select('session, role, gender, age_band, path, prev, kind, ms, at').gte('at', since).order('at', { ascending: false }).limit(50000)
  const ev = ((data ?? []) as Ev[]).filter((e) => e.at >= since)
  const views = ev.filter((e) => e.kind === 'view')
  const leaves = ev.filter((e) => e.kind === 'leave' && e.ms)
  const href = (o: { d?: number; dim?: Dim }) => `/admin/insights?d=${o.d ?? days}&dim=${o.dim ?? dim}`

  // 그룹 (지금 고른 기준: 역할·성별·나이대)
  const segs = ORDER[dim].filter((s) => views.some((v) => segOf(dim, v) === s))
  const bySeg = new Map(segs.map((s) => [s, { views: 0, sessions: new Set<string>(), ms: 0, leaves: 0 }]))
  for (const v of views) {
    const g = bySeg.get(segOf(dim, v))
    if (g) {
      g.views++
      g.sessions.add(v.session)
    }
  }
  for (const l of leaves) {
    const g = bySeg.get(segOf(dim, l))
    if (g) {
      g.ms += l.ms!
      g.leaves++
    }
  }

  // 화면별: 그룹마다 그 화면이 차지하는 비율 · 평균 머문 시간
  const screenTotals = new Map<string, number>()
  for (const v of views) screenTotals.set(v.path, (screenTotals.get(v.path) ?? 0) + 1)
  const topScreens = [...screenTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([p]) => p)
  const cell = new Map<string, { n: number; ms: number; l: number }>()
  const key = (p: string, s: string) => `${p}|${s}`
  for (const v of views) {
    const k = key(v.path, segOf(dim, v))
    const c = cell.get(k) ?? { n: 0, ms: 0, l: 0 }
    c.n++
    cell.set(k, c)
  }
  for (const l of leaves) {
    const k = key(l.path, segOf(dim, l))
    const c = cell.get(k) ?? { n: 0, ms: 0, l: 0 }
    c.ms += l.ms!
    c.l++
    cell.set(k, c)
  }

  // 이동 흐름: 바로 전 화면 → 다음 화면 (같은 그룹 안)
  const flows = new Map<string, number>()
  for (const v of views) if (v.prev && v.prev !== v.path) flows.set(`${v.prev}→${v.path}`, (flows.get(`${v.prev}→${v.path}`) ?? 0) + 1)
  const topFlows = [...flows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)

  // 나간 화면: 탭마다 마지막으로 본 화면
  const lastOf = new Map<string, Ev>()
  for (const v of views) if (!lastOf.has(v.session)) lastOf.set(v.session, v) // 최근 것부터 읽어서 처음 만난 것이 마지막
  const exits = new Map<string, number>()
  for (const v of lastOf.values()) exits.set(v.path, (exits.get(v.path) ?? 0) + 1)
  const topExits = [...exits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  // 단계: 이 기간에 지원한 근로자 → 확정 → 서명 → 출근 (성별·나이대별, 실제 기록 기준)
  const { data: appsData } = await db().from('applications').select('user_id, job_id, status, created_at').gte('created_at', since).limit(20000)
  const apps = ((appsData ?? []) as { user_id: string; job_id: string; status: string; created_at: string }[]).filter((a) => a.created_at >= since)
  const appUsers = [...new Set(apps.map((a) => a.user_id))]
  const [people, signed, worked] = await Promise.all([
    inChunks(appUsers, (c) => db().from('users').select('id, gender, birth_date, role, member_type').in('id', c).then((r) => (r.data ?? []) as { id: string; gender: string | null; birth_date: string | null; role: string; member_type: string | null }[])),
    inChunks(appUsers, (c) => db().from('signed_docs').select('user_id, job_id, status').in('user_id', c).eq('status', 'signed').then((r) => (r.data ?? []) as { user_id: string; job_id: string; status: string }[])),
    inChunks(appUsers, (c) => db().from('attendance').select('user_id, job_id, clock_in').in('user_id', c).not('clock_in', 'is', null).then((r) => (r.data ?? []) as { user_id: string; job_id: string; clock_in: string | null }[])),
  ])
  const personOf = new Map(people.map((p) => [p.id, p]))
  const funnelDim: Dim = dim === 'role' ? 'gender' : dim
  const stageNames = ['지원', '확정', '서명', '출근'] as const
  const funnel = new Map<string, [Set<string>, Set<string>, Set<string>, Set<string>]>()
  const signedSet = new Set(signed.filter((d) => d.status === 'signed').map((d) => `${d.user_id}|${d.job_id}`))
  const workedSet = new Set(worked.filter((a) => a.clock_in).map((a) => `${a.user_id}|${a.job_id}`))
  for (const a of apps) {
    const p = personOf.get(a.user_id)
    if (!p || p.role === 'admin') continue
    const seg = segOf(funnelDim, { role: p.member_type ?? 'worker', gender: p.gender, age_band: ageBand(p.birth_date) })
    const f = funnel.get(seg) ?? [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()]
    f[0].add(a.user_id)
    if (a.status === 'approved') f[1].add(a.user_id)
    if (signedSet.has(`${a.user_id}|${a.job_id}`)) f[2].add(a.user_id)
    if (workedSet.has(`${a.user_id}|${a.job_id}`)) f[3].add(a.user_id)
    funnel.set(seg, f)
  }
  const funnelSegs = ORDER[funnelDim].filter((s) => funnel.has(s))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">인사이트</h1>
          <p className="text-sm text-sub">어떤 사람이 어떤 화면을 보고, 얼마나 머물고, 어디서 나가는지 · 이름·연락처 없이 모은 기록</p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-white p-1 text-sm font-semibold ring-1 ring-line" aria-label="기간">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={href({ d })} className={`rounded-lg px-3 py-1.5 ${d === days ? 'bg-ink text-white' : 'text-sub'}`}>
              {d}일
            </Link>
          ))}
        </nav>
      </div>
      <nav className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-line" aria-label="비교 기준" data-insight-dims>
        {DIMS.map((d) => (
          <Link key={d.id} href={href({ dim: d.id })} aria-current={d.id === dim ? 'page' : undefined} className={`flex-1 rounded-xl px-2 py-2 text-center text-sm font-semibold ${d.id === dim ? 'bg-ink text-white' : 'text-sub'}`}>
            {d.label}
          </Link>
        ))}
      </nav>

      {views.length === 0 ? (
        <Empty icon="📊" title="아직 모인 기록이 없어요">
          사람들이 앱을 쓰기 시작하면 화면 이동 기록이 여기에 쌓여요.
        </Empty>
      ) : (
        <>
          {/* 1. 그룹 요약 */}
          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-insight-segs>
            {segs.map((s) => {
              const g = bySeg.get(s)!
              const share = pct(g.views, views.length)
              return (
                <div key={s} className="card space-y-2 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold">{s}</p>
                    <p className="text-xs text-mute tabular-nums">화면 보기 {share}%</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
                  </div>
                  <dl className="grid grid-cols-3 gap-1 text-center text-xs text-sub tabular-nums">
                    <div>
                      <dt>방문</dt>
                      <dd className="text-base font-extrabold text-ink">{g.sessions.size}</dd>
                    </div>
                    <div>
                      <dt>방문당 화면</dt>
                      <dd className="text-base font-extrabold text-ink">{g.sessions.size ? (g.views / g.sessions.size).toFixed(1) : '-'}</dd>
                    </div>
                    <div>
                      <dt>화면당 머문</dt>
                      <dd className="text-base font-extrabold text-ink">{g.leaves ? secText(g.ms / g.leaves) : '-'}</dd>
                    </div>
                  </dl>
                </div>
              )
            })}
          </section>

          {/* 2. 화면별 비교 */}
          <section className="card overflow-x-auto p-0" data-insight-screens>
            <h2 className="px-4 pt-4 font-bold">화면별로 비교</h2>
            <p className="px-4 pb-2 text-xs text-mute">그룹마다 그 화면이 차지하는 비율 · 평균 머문 시간</p>
            <table className="table">
              <thead>
                <tr>
                  <th>화면</th>
                  {segs.map((s) => (
                    <th key={s} className="text-right whitespace-nowrap">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topScreens.map((p) => {
                  const shares = segs.map((s) => pct(cell.get(key(p, s))?.n ?? 0, bySeg.get(s)!.views))
                  const best = Math.max(...shares)
                  return (
                    <tr key={p}>
                      <td className="whitespace-nowrap font-semibold">{screenName(p)}</td>
                      {segs.map((s, i) => {
                        const c = cell.get(key(p, s))
                        return (
                          <td key={s} className="text-right whitespace-nowrap tabular-nums">
                            <span className={shares[i] === best && best > 0 && segs.length > 1 ? 'font-extrabold text-brand-700' : ''}>{shares[i]}%</span>
                            <span className="block text-[11px] text-mute">{c?.l ? secText(c.ms / c.l) : '-'}</span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <div className="grid items-start gap-3 lg:grid-cols-2">
            {/* 3. 이동 흐름 */}
            <section className="card space-y-2 p-4" data-insight-flows>
              <h2 className="font-bold">많이 옮겨 간 길</h2>
              <ol className="space-y-1.5 text-sm">
                {topFlows.map(([k, n]) => {
                  const [a, b] = k.split('→')
                  return (
                    <li key={k} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">
                        {screenName(a)} <span className="text-mute">→</span> <b>{screenName(b)}</b>
                      </span>
                      <span className="shrink-0 text-xs text-mute tabular-nums">{n}번</span>
                    </li>
                  )
                })}
                {topFlows.length === 0 && <li className="text-mute">아직 없어요</li>}
              </ol>
            </section>
            {/* 4. 나간 화면 */}
            <section className="card space-y-2 p-4" data-insight-exits>
              <h2 className="font-bold">마지막으로 본 화면 (여기서 나감)</h2>
              <ol className="space-y-1.5 text-sm">
                {topExits.map(([p, n]) => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{screenName(p)}</span>
                    <span className="shrink-0 text-xs text-mute tabular-nums">{pct(n, lastOf.size)}%</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}

      {/* 5. 지원 → 확정 → 서명 → 출근 */}
      <section className="card overflow-x-auto p-0" data-insight-funnel>
        <h2 className="px-4 pt-4 font-bold">지원 → 확정 → 서명 → 출근 ({funnelDim === 'gender' ? '성별' : '나이대'})</h2>
        <p className="px-4 pb-2 text-xs text-mute">최근 {days}일 안에 지원한 근로자 기준 · 실제 기록으로 셈</p>
        {funnelSegs.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-mute">이 기간에 지원한 사람이 없어요.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>그룹</th>
                {stageNames.map((n) => (
                  <th key={n} className="text-right">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {funnelSegs.map((s) => {
                const f = funnel.get(s)!
                return (
                  <tr key={s}>
                    <td className="font-semibold whitespace-nowrap">{s}</td>
                    {f.map((set, i) => (
                      <td key={i} className="text-right whitespace-nowrap tabular-nums">
                        <b>{set.size}</b>
                        {i > 0 && <span className="block text-[11px] text-mute">{pct(set.size, f[0].size)}%</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-mute">
        기록에는 이름·연락처·회원 번호가 없고, 탭마다 바뀌는 무작위 값과 회원 유형·성별·나이대만 남아요. 최고 관리자(운영자)의 이동은 기록하지 않아요. 180일이 지나면 자동으로 지워져요.
      </p>
    </div>
  )
}
