import type { Job } from './types'

/** 새 공고 등록에서 한 번에 넣을 수 있는 '최근 값' (이 회사의 지난 공고에서 — 장소·지급일 안내·현장 담당자) */
export type RecentJobValues = {
  places: { name: string; address: string; lat: number | null; lng: number | null; radius: number | null }[]
  payDays: string[]
  managers: { name: string; phone: string }[]
}

type Row = Pick<Job, 'location_name' | 'address' | 'lat' | 'lng' | 'gps_radius_m' | 'pay_day' | 'manager_name' | 'manager_phone'> & { created_at?: string | null }

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
  }
}
