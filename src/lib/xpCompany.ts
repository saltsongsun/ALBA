import 'server-only'
import { db } from './db'
import { kstAt } from './time'
import { computeXp, shiftFacts, type XpState } from './xp'

/** 레벨을 셀 근무자 (내 정보 채움 여부만 봄 · 값 자체는 쓰지 않음) */
export type LevelUser = {
  id: string
  photo_at: string | null
  bank_account_enc: string | null
  emergency_phone?: string | null
  address?: string | null
  careers?: unknown
}

type Att = { user_id: string; job_id: string; work_date: string; clock_in: string; clock_out: string | null; note: string | null; sched_start: string | null }

const CHUNK = 100 // 한 번에 묻는 사람 수 (주소가 너무 길어지지 않게)
const PAGE = 1000 // 한 번에 받는 줄 수 (Supabase 기본 상한)

/** 상한(1000줄)에 걸려 잘리지 않게 끝까지 나눠 받기 */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ids.slice(i * CHUNK, (i + 1) * CHUNK))

/**
 * 관리자 근무자 명단의 병아리 레벨 (사용자 요청 2026-11-13 "레벨도 근무자명단에 표기").
 * 근무자 본인 화면과 같은 점수 규칙이지만 **이 회사 기록만** 셈: 이 회사 출퇴근 · 이 회사 서류 서명 · 이 회사 후기 + 내 정보 채움.
 * 다른 회사에서 일한 기록은 넣지 않음 (회사별 자료 분리 — 레벨 숫자로 다른 회사 근무량이 드러나지 않게).
 * 저장하지 않고 그때그때 계산 (DB를 바꾸지 않음) · 급여·확정에는 쓰지 않음.
 */
export async function companyLevels(companyId: string, users: LevelUser[]): Promise<Map<string, XpState>> {
  const out = new Map<string, XpState>()
  if (!users.length) return out
  const groups = chunks(users.map((u) => u.id))
  const [atts, docs, reviews] = await Promise.all([
    Promise.all(
      groups.map((ids) =>
        all<Att>((a, b) =>
          db()
            .from('attendance')
            .select('user_id, job_id, work_date, clock_in, clock_out, note, sched_start')
            .eq('company_id', companyId)
            .in('user_id', ids)
            .order('id')
            .range(a, b),
        ),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      groups.map((ids) =>
        all<{ user_id: string; status: string }>((a, b) =>
          db().from('signed_docs').select('user_id, status').eq('company_id', companyId).eq('status', 'signed').in('user_id', ids).order('id').range(a, b),
        ),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      groups.map((ids) =>
        all<{ author_id: string; job_id: string; company_id: string }>((a, b) =>
          db().from('company_reviews').select('author_id, job_id, company_id').eq('company_id', companyId).in('author_id', ids).order('id').range(a, b),
        ),
      ),
    ).then((r) => r.flat()),
  ])
  // 정시 출근은 예정 시작 시각으로 봄 (출퇴근 기록에 따로 정한 시작이 없으면 공고 시작)
  const jobIds = [...new Set(atts.filter((a) => !a.sched_start).map((a) => a.job_id))]
  const starts = new Map<string, string>()
  for (const ids of chunks(jobIds)) {
    const { data } = await db().from('jobs').select('id, start_time').eq('company_id', companyId).in('id', ids)
    for (const j of (data ?? []) as { id: string; start_time: string }[]) starts.set(j.id, j.start_time)
  }
  const attsBy = new Map<string, Att[]>()
  for (const a of atts) (attsBy.get(a.user_id) ?? attsBy.set(a.user_id, []).get(a.user_id)!).push(a)
  const docsBy = new Map<string, number>()
  for (const d of docs) if (d.status === 'signed') docsBy.set(d.user_id, (docsBy.get(d.user_id) ?? 0) + 1)
  // 후기는 공고마다 한 번 (근무자 화면과 같게) · 다른 회사 후기는 세지 않음
  const reviewsBy = new Map<string, Set<string>>()
  for (const r of reviews) if (r.company_id === companyId) (reviewsBy.get(r.author_id) ?? reviewsBy.set(r.author_id, new Set()).get(r.author_id)!).add(r.job_id)
  for (const u of users) {
    out.set(
      u.id,
      computeXp({
        shifts: (attsBy.get(u.id) ?? []).map((a) => {
          const start = a.sched_start ?? starts.get(a.job_id)
          return shiftFacts(a, start ? kstAt(a.work_date, start) : null)
        }),
        signedDocs: docsBy.get(u.id) ?? 0,
        reviews: reviewsBy.get(u.id)?.size ?? 0,
        profileComplete: !!(u.photo_at && u.bank_account_enc && u.emergency_phone && u.address && Array.isArray(u.careers) && u.careers.length > 0),
      }),
    )
  }
  return out
}
