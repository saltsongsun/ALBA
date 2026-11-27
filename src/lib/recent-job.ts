import type { Job, JobCondition } from './types'

/** 새 공고 등록에서 한 번에 넣을 수 있는 '최근 값' (이 회사의 지난 공고에서 — 장소·지급일 안내·현장 담당자) */
export type RecentJobValues = {
  places: { name: string; address: string; lat: number | null; lng: number | null; radius: number | null }[]
  payDays: string[]
  managers: { name: string; phone: string }[]
  /** 가장 최근 공고의 추가 조건 (휴게 시간·식사·교통 등 — 회사마다 거의 같아 한 번에 불러옴) */
  conditions: JobCondition[]
  /** ✏️ 정기 개선 2026-11-27 13:36: 가장 최근 공고의 '일찍 누른 출근은 시작 시각부터 인정' (켰으면 true · 지난 공고가 없으면 null) — 새 공고에서 '똑같이 켜기' 칩만 띄움, 기본값은 그대로 */
  earlyClamp?: boolean | null
  /** ✏️ 정기 개선 2026-11-27 15:36: 가장 최근 공고의 '현장에서만 근무 시작' · '지원하면 바로 확정' (켰으면 true) — 같은 '똑같이 켜기' 칩만, 기본값은 그대로 */
  gpsRequired?: boolean | null
  autoApprove?: boolean | null
}

type Row = Pick<Job, 'location_name' | 'address' | 'lat' | 'lng' | 'gps_radius_m' | 'pay_day' | 'manager_name' | 'manager_phone'> & {
  created_at?: string | null
  conditions?: JobCondition[] | null
  /** ✏️ 정기 개선 2026-11-27 13:36 */
  early_clamp?: boolean | null
  /** ✏️ 정기 개선 2026-11-27 15:36 */
  gps_required?: boolean | null
  auto_approve?: boolean | null
}

function uniq<T>(list: T[], key: (t: T) => string, max: number): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of list) {
    const k = key(it)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(it)
    if (out.length >= max) break
  }
  return out
}

/** 최근 공고부터 훑어 겹치지 않는 값만 (장소 3 · 지급일 2 · 담당자 2) */
export function recentJobValues(rows: Row[]): RecentJobValues {
  const jobs = [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 20)
  const t = (s: string | null | undefined) => (s ?? '').trim()
  return {
    places: uniq(
      jobs.filter((j) => t(j.location_name) || t(j.address)),
      (j) => `${t(j.location_name)}|${t(j.address)}`,
      3,
    ).map((j) => ({ name: t(j.location_name), address: t(j.address), lat: j.lat ?? null, lng: j.lng ?? null, radius: j.gps_radius_m ?? null })),
    payDays: uniq(jobs.map((j) => t(j.pay_day)), (s) => s, 2),
    managers: uniq(
      jobs.filter((j) => t(j.manager_name) || t(j.manager_phone)),
      (j) => `${t(j.manager_name)}|${t(j.manager_phone).replace(/\D/g, '')}`,
      2,
    ).map((j) => ({ name: t(j.manager_name), phone: t(j.manager_phone) })),
    conditions:
      jobs
        .map((j) => (Array.isArray(j.conditions) ? j.conditions : []).filter((c) => t(c?.label) && t(c?.value)).map((c) => ({ label: t(c.label), value: t(c.value) })))
        .find((list) => list.length > 0)
        ?.slice(0, 10) ?? [],
    // ✏️ 정기 개선 2026-11-27 13:36: 가장 최근 공고 하나만 봄 (회사마다 보통 같게 씀)
    earlyClamp: jobs.length ? jobs[0].early_clamp === true : null,
    // ✏️ 정기 개선 2026-11-27 15:36: 같은 가장 최근 공고 하나에서
    gpsRequired: jobs.length ? jobs[0].gps_required === true : null,
    autoApprove: jobs.length ? jobs[0].auto_approve === true : null,
  }
}
