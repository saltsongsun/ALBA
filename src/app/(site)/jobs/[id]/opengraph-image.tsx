import { ImageResponse } from 'next/og'
import { db } from '@/lib/db'
import { getJob } from '@/lib/data'
import { won } from '@/lib/format'
import { shows } from '@/lib/jobFields'
import { clip, OG_BRAND, OG_HEADERS, OG_SIZE, OgFrame, OgIcon, ogFonts } from '@/lib/og'
import { estimateDay, workOver } from '@/lib/pay'
import { fmtDateRange, hhmm, kstDate } from '@/lib/time'
import { isUuid } from '@/lib/validate'

/** 카카오톡·문자로 공고 링크를 보내면 뜨는 미리보기 그림: 제목 · 날짜·시간 · 장소 · 급여 · 회사 · 모집 상태 */
export const alt = '해피워크 공고'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fontsP = ogFonts()
  const job = isUuid(id) ? await getJob(id) : null
  // 없는 공고·임시 저장은 기본 그림
  if (!job || job.status === 'draft') {
    return new ImageResponse(
      (
        <OgFrame>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 16 }}>
            <span style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.2 }}>행사 단기 알바</span>
            <span style={{ fontSize: 34, fontWeight: 600, opacity: 0.9 }}>지원부터 출퇴근·정산까지 한 번에</span>
          </div>
        </OgFrame>
      ),
      { ...OG_SIZE, fonts: await fontsP, headers: OG_HEADERS },
    )
  }
  const { data: co } = await db().from('companies').select('company_name, verified').eq('id', job.company_id).maybeSingle()
  const company = co as { company_name: string; verified: boolean | null } | null
  const today = kstDate()
  const expert = job.audience === 'expert'
  const tag =
    job.status === 'cancelled'
      ? '행사 취소'
      : job.end_date < today || job.status !== 'open'
        ? '마감'
        : workOver(job, job.end_date)
          ? '오늘 종료'
          : expert
            ? '지원 받는 중'
            : '모집중'
  const pay = job.pay_type === 'daily' ? `일급 ${won(job.daily_wage)}` : `시급 ${won(job.hourly_wage)}`
  const est = shows(job, 'estimate') ? estimateDay(job) : null
  const when = `${fmtDateRange(job.start_date, job.end_date)} ${hhmm(job.start_time)}~${hhmm(job.end_time)}`
  const where = [job.location_name, job.address].filter(Boolean).join(' · ')
  const title = clip(job.title, 34)

  return new ImageResponse(
    (
      <OgFrame tag={tag}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 34, fontSize: 28, fontWeight: 600, opacity: 0.92 }}>
          <OgIcon name="building" size={30} />
          <span>{clip(company?.company_name ?? '해피워크', 22)}</span>
          {company?.verified && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6, fontSize: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '4px 14px' }}>
              <OgIcon name="check" size={22} /> 확인된 회사
            </span>
          )}
        </div>
        <div style={{ display: 'flex', marginTop: 16, fontSize: title.length > 16 ? 54 : 64, fontWeight: 700, lineHeight: 1.22, letterSpacing: -1 }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20, fontSize: 30, fontWeight: 600, opacity: 0.95 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <OgIcon name="calendar" size={30} />
            <span>{when}</span>
          </div>
          {where && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <OgIcon name="pin" size={30} />
              <span>{clip(where, 34)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', backgroundColor: '#ffffff', borderRadius: 28, padding: '22px 30px', color: '#191f28' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 44, fontWeight: 700, color: OG_BRAND, letterSpacing: -0.5 }}>{pay}</span>
            {est && <span style={{ fontSize: 26, fontWeight: 600, color: '#4e5968' }}>하루 약 {won(est.gross)} (세전)</span>}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 28, fontWeight: 700, color: '#ffffff', backgroundColor: OG_BRAND, borderRadius: 999, padding: '14px 28px' }}>
            {expert ? '간편가입 후 바로 의뢰 지원' : '간편가입 후 바로 지원'}
          </span>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await fontsP, headers: OG_HEADERS },
  )
}
