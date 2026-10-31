/** 근무자 경력 한 줄: 행사명 · 기간 · 역할 */
export type Career = { event: string; period: string; role: string }

/** 화면에서 보낸 JSON 경력 목록을 다듬음 (빈 줄 제외, 길이·개수 제한). 형식이 틀리면 null */
export function parseCareers(raw: string): Career[] | null {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  return data
    .map((c) => ({
      event: String(c?.event ?? '').trim().slice(0, 60),
      period: String(c?.period ?? '').trim().slice(0, 30),
      role: String(c?.role ?? '').trim().slice(0, 40),
    }))
    .filter((c) => c.event || c.role)
    .slice(0, 20)
}

/** '행사명 · 기간 · 역할' */
export const careerText = (c: Career) => [c.event, c.period, c.role].filter(Boolean).join(' · ')
