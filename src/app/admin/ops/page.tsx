import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Icon, { type IconName } from '@/components/Icon'
import { ago } from '@/lib/community'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { kstDate } from '@/lib/time'
import { ROLE_LABEL, screenName } from '@/lib/usage'

export const metadata: Metadata = { title: '운영 센터' }

type Ev = {
  session: string
  role: string
  path: string
  kind: string
  label: string | null
  at: string
}
type Co = {
  id: string
  company_name: string
  verified?: boolean | null
  active: boolean
  created_at: string
}

const DAY = 86_400_000
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** 숫자 칸 (이름 한 줄 · 큰 숫자 · 작은 설명) — 누르면 자세한 화면으로 */
function Tile({ label, value, sub, href, icon, tone }: { label: string; value: number; sub?: string; href: string; icon: IconName; tone: string }) {
  return (
    <Link href={href} className="card-link block min-w-0 px-4 py-3" data-ops-tile>
      <p className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-mute">{label}</span>
        <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full text-sm ${tone}`}>
          <Icon name={icon} />
        </span>
      </p>
      <p className="mt-0.5 text-[26px] leading-tight font-extrabold tabular-nums">{value.toLocaleString('ko-KR')}</p>
      {sub && <p className="truncate text-xs text-sub">{sub}</p>}
    </Link>
  )
}

/**
 * 운영 센터 (최상위 관리자만 · 사용자 요청 2026-11-07 "회사들 관리하는 별도 메뉴 · 이용통계 · 오류").
 * 회사 현황(확인 전·새 회사·회사별 활동) · 이용 통계(7일 방문·가입·지원·출근) · 화면 오류와 답답한 곳 · 처리할 신고를 한 화면에.
 * 자세한 것은 회사 관리·인사이트·커뮤니티 관리로 이어짐 · 이름·연락처는 보여 주지 않음
 */
export default async function OpsPage() {
  const admin = await requireAdmin()
  if (!admin.isSuper) notFound()
  const now = Date.now()
  const today = kstDate()
  const since7 = new Date(now - 7 * DAY).toISOString()
  const days = Array.from({ length: 7 }, (_, i) => kstDate(new Date(now - (6 - i) * DAY)))
  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) => Promise.resolve(q).then((r) => (r.error ? 0 : (r.count ?? 0)))
  const rows = <T,>(q: PromiseLike<{ data: unknown; error: unknown }>) => Promise.resolve(q).then((r) => (r.error ? [] : ((r.data ?? []) as T[])))

  const [companies, members, signups, apps, atts, openJobs, reports, events] = await Promise.all([
    rows<Co>(db().from('companies').select('id, company_name, verified, active, created_at').order('created_at')),
    count(db().from('users').select('id', { count: 'exact', head: true }).eq('role', 'worker').eq('active', true)),
    rows<{ created_at: string; member_type: string | null }>(db().from('users').select('created_at, member_type').eq('role', 'worker').gte('created_at', since7).limit(5000)),
    rows<{ company_id: string; created_at: string }>(db().from('applications').select('company_id, created_at').gte('created_at', since7).limit(20000)),
    rows<{ company_id: string; work_date: string; user_id: string }>(db().from('attendance').select('company_id, work_date, user_id').gte('work_date', days[0]).limit(20000)),
    rows<{ company_id: string; end_date: string; status: string }>(db().from('jobs').select('company_id, end_date, status').eq('status', 'open').gte('end_date', today).limit(5000)),
    count(db().from('community_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null)),
    rows<Ev>(db().from('usage_events').select('session, role, path, kind, label, at').gte('at', since7).order('at', { ascending: false }).limit(50000)),
  ])

  // ── 회사 ── (사용 중인 회사만)
  const cos = companies.filter((c) => c.active)
  const waiting = cos.filter((c) => c.verified === false)
  const fresh = cos.filter((c) => c.created_at >= since7)
  const by = <T extends { company_id: string }>(list: T[]) => list.reduce((m, x) => m.set(x.company_id, (m.get(x.company_id) ?? 0) + 1), new Map<string, number>())
  const appsBy = by(apps.filter((a) => a.created_at >= since7))
  const attsBy = by(atts.filter((a) => a.work_date >= days[0]))
  const jobsBy = by(openJobs.filter((j) => j.status === 'open' && j.end_date >= today))
  const busy = cos
    .map((c) => ({
      c,
      jobs: jobsBy.get(c.id) ?? 0,
      apps: appsBy.get(c.id) ?? 0,
      shifts: attsBy.get(c.id) ?? 0,
    }))
    .filter((x) => x.jobs + x.apps + x.shifts > 0)
    .sort((a, b) => b.shifts + b.apps - (a.shifts + a.apps) || b.jobs - a.jobs)
    .slice(0, 8)
  const idle = cos.length - cos.filter((c) => (jobsBy.get(c.id) ?? 0) + (appsBy.get(c.id) ?? 0) + (attsBy.get(c.id) ?? 0) > 0).length

  // ── 이용 ── (탭마다 바뀌는 무작위 값 = 방문 1번)
  const ev = events.filter((e) => e.at >= since7)
  const views = ev.filter((e) => e.kind === 'view')
  const dayOf = (iso: string) => kstDate(new Date(iso))
  const perDay = days.map((d) => new Set(views.filter((v) => dayOf(v.at) === d).map((v) => v.session)).size)
  const peak = Math.max(1, ...perDay)
  const visits7 = new Set(views.map((v) => v.session)).size
  const roleVisits = [...views.reduce((m, v) => m.set(v.role, (m.get(v.role) ?? new Set<string>()).add(v.session)), new Map<string, Set<string>>())]
    .map(([role, s]) => ({ role, n: s.size }))
    .sort((a, b) => b.n - a.n)
  const todayShifts = atts.filter((a) => a.work_date === today)
  const signupToday = signups.filter((u) => dayOf(u.created_at) === today).length

  // ── 문제 ── 화면에 뜬 오류 · 같은 곳을 연달아 누른 곳 (답답함)
  const spots = (kind: 'error' | 'rage') => {
    const m = new Map<
      string,
      {
        label: string
        path: string
        n: number
        sessions: Set<string>
        last: string
      }
    >()
    for (const e of ev) {
      if (e.kind !== kind || !e.label) continue
      const k = `${e.path}|${e.label}`
      const r = m.get(k) ?? {
        label: e.label,
        path: e.path,
        n: 0,
        sessions: new Set<string>(),
        last: e.at,
      }
      r.n++
      r.sessions.add(e.session)
      if (e.at > r.last) r.last = e.at
      m.set(k, r)
    }
    return [...m.values()].sort((a, b) => b.sessions.size - a.sessions.size || b.n - a.n)
  }
  const errors = spots('error')
  const rage = spots('rage')
  const errorsToday = ev.filter((e) => e.kind === 'error' && dayOf(e.at) === today).length

  const todo = [
    waiting.length > 0 && {
      href: '/admin/companies',
      text: `확인 기다리는 회사 ${waiting.length}곳`,
      tone: 'amber',
    },
    reports > 0 && {
      href: '/admin/community',
      text: `처리 안 한 커뮤니티 신고 ${reports}건`,
      tone: 'rose',
    },
    errors.length > 0 && {
      href: '#ops-errors',
      text: `7일 동안 화면 오류 ${errors.length}가지`,
      tone: 'rose',
    },
  ].filter((x): x is { href: string; text: string; tone: string } => !!x)

  return (
    <div className="space-y-4" data-ops>
      <div>
        <h1 className="text-2xl font-extrabold">운영 센터</h1>
        <p className="text-sm text-sub">최상위 관리자만 보는 전체 현황 · 최근 7일</p>
      </div>

      {/* 지금 할 일 (없으면 '괜찮아요') */}
      <section className="card p-0" data-ops-todo>
        {todo.length ? (
          <ul className="divide-y divide-line">
            {todo.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold active:bg-bg">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${t.tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                  <span className="min-w-0 flex-1 truncate">{t.text}</span>
                  <span className="shrink-0 text-xs text-mute">보기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-emerald-700">
            <Icon name="check" /> 지금 처리할 일이 없어요
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-ops-tiles>
        <Tile
          label="회사"
          value={cos.length}
          sub={waiting.length ? `확인 전 ${waiting.length} · 새 회사 ${fresh.length}` : `새 회사 ${fresh.length}곳 (7일)`}
          href="/admin/companies"
          icon="building"
          tone="bg-brand-50 text-brand-600"
        />
        <Tile label="방문 (7일)" value={visits7} sub={`오늘 ${perDay[6].toLocaleString('ko-KR')}번`} href="/admin/insights?d=7" icon="eye" tone="bg-sky-50 text-sky-600" />
        <Tile label="근무자 회원" value={members} sub={`새 가입 ${signups.length}명 · 오늘 ${signupToday}`} href="/admin/workers" icon="users" tone="bg-emerald-50 text-emerald-600" />
        <Tile label="오늘 출근" value={todayShifts.length} sub={`지원 ${apps.length.toLocaleString('ko-KR')}건 (7일)`} href="/admin/insights?d=7" icon="clock" tone="bg-amber-50 text-amber-600" />
      </div>

      {/* 날마다 방문 (막대) */}
      <section className="card space-y-3 p-4" data-ops-visits>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-bold">날마다 방문</h2>
          <Link href="/admin/insights?d=7" className="shrink-0 text-xs font-semibold text-brand-600">
            인사이트 →
          </Link>
        </div>
        <ol className="grid h-28 grid-cols-7 items-end gap-1.5" aria-label="최근 7일 방문 수">
          {days.map((d, i) => (
            <li key={d} className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
              <span className="text-[11px] font-semibold text-sub tabular-nums">{perDay[i]}</span>
              <span
                className={`w-full rounded-t-md ${i === 6 ? 'bg-brand-500' : 'bg-brand-200'}`}
                style={{
                  height: `${Math.max(4, Math.round((perDay[i] / peak) * 72))}px`,
                }}
              />
              <span className={`text-[11px] ${i === 6 ? 'font-bold text-ink' : 'text-mute'}`}>{i === 6 ? '오늘' : WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
            </li>
          ))}
        </ol>
        {roleVisits.length > 0 && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-sub" data-ops-roles>
            {roleVisits.map((r) => (
              <span key={r.role} className="whitespace-nowrap">
                {ROLE_LABEL[r.role] ?? r.role} <b className="text-ink tabular-nums">{r.n}</b>
              </span>
            ))}
          </p>
        )}
      </section>

      {/* 화면 오류 · 답답한 곳 */}
      <section id="ops-errors" className="card scroll-mt-20 p-0" data-ops-errors>
        <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
          <h2 className="font-bold">화면 오류</h2>
          <span className="shrink-0 text-xs text-mute">오늘 {errorsToday}번</span>
        </div>
        {errors.length === 0 ? (
          <p className="px-4 pb-3.5 text-sm text-sub">7일 동안 화면에 뜬 오류가 없어요</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {errors.slice(0, 8).map((e) => (
              <li key={`${e.path}|${e.label}`} className="px-4 py-2.5 text-sm" data-ops-error>
                <p className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 font-semibold break-words select-all">{e.label}</span>
                  <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 tabular-nums">{e.sessions.size}명</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-mute">
                  {screenName(e.path)} · {e.n}번 · 마지막 {ago(e.last, now)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {rage.length > 0 && (
          <div className="border-t border-line px-4 py-3" data-ops-rage>
            <p className="text-xs font-semibold text-sub">답답한 곳 (같은 곳을 연달아 누름)</p>
            <ul className="mt-1.5 space-y-1 text-sm">
              {rage.slice(0, 5).map((r) => (
                <li key={`${r.path}|${r.label}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {r.label} <span className="text-xs text-mute">· {screenName(r.path)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-amber-700 tabular-nums">{r.sessions.size}명</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 회사별 활동 */}
      <section className="card p-0" data-ops-companies>
        <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
          <h2 className="font-bold">회사별 활동</h2>
          <Link href="/admin/companies" className="shrink-0 text-xs font-semibold text-brand-600">
            회사 관리 →
          </Link>
        </div>
        {busy.length === 0 ? (
          <p className="px-4 pb-3.5 text-sm text-sub">7일 동안 활동한 회사가 없어요</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {busy.map(({ c, jobs, apps: n, shifts }) => (
              <li key={c.id} className="flex items-center gap-2 px-4 py-2.5 text-sm" data-ops-company>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {c.company_name}
                  {c.verified === false && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 align-[1px] text-[10px] font-bold text-amber-700">확인 전</span>}
                </span>
                <span className="shrink-0 text-xs text-sub tabular-nums">
                  모집 <b className="text-ink">{jobs}</b> · 지원 <b className="text-ink">{n}</b> · 출근 <b className="text-ink">{shifts}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
        {idle > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-mute">7일 동안 조용한 회사 {idle}곳</p>}
      </section>

      <nav className="grid grid-cols-3 gap-2" aria-label="운영 메뉴" data-ops-links>
        {(
          [
            ['/admin/companies', 'building', '회사 관리'],
            ['/admin/insights', 'eye', '인사이트'],
            ['/admin/community', 'shield', '커뮤니티'],
          ] as const
        ).map(([href, icon, label]) => (
          <Link key={href} href={href} className="flex min-w-0 flex-col items-center gap-1 rounded-xl bg-white px-1 py-2.5 text-xs font-semibold text-sub ring-1 ring-line active:scale-95">
            <Icon name={icon} className="text-lg text-ink" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
      </nav>
      <p className="text-xs text-mute">방문은 탭을 연 횟수예요 (이름·연락처 없이 모은 기록). 운영자 본인의 이동은 세지 않아요.</p>
    </div>
  )
}
