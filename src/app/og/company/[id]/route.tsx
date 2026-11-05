import { ImageResponse } from 'next/og'
import { db } from '@/lib/db'
import { won } from '@/lib/format'
import { clip, OG_BRAND, OG_HEADERS, OG_SIZE, OgFrame, OgIcon, ogFonts } from '@/lib/og'
import { fmtDateRange, kstDate } from '@/lib/time'
import { isUuid } from '@/lib/validate'

/**
 * '우리 회사 공고 모음' 링크(/?co=회사)를 보낼 때 뜨는 미리보기 그림:
 * 회사 이름 · 확인된 회사 · 모집 중 공고 수 · 가까운 공고 3개 (제목·날짜·급여)
 * 화면에 이미 공개된 내용(그 회사의 모집 공고)만
 */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const fontsP = ogFonts()
  const today = kstDate()
  const company = isUuid(id)
    ? ((await db().from('companies').select('id, company_name, verified').eq('id', id).eq('active', true).maybeSingle()).data as {
        id: string
        company_name: string
        verified: boolean | null
      } | null)
    : null
  const jobs = company
    ? (((
        await db()
          .from('jobs')
          .select('id, title, start_date, end_date, pay_type, hourly_wage, daily_wage')
          .eq('company_id', company.id)
          .eq('audience', 'worker')
          .eq('status', 'open')
          .gte('end_date', today)
          .order('start_date')
          .limit(20)
      ).data ?? []) as { id: string; title: string; start_date: string; end_date: string; pay_type: string; hourly_wage: number; daily_wage: number }[])
    : []

  return new ImageResponse(
    (
      <OgFrame tag={jobs.length ? `모집 중 ${jobs.length}개` : undefined}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 34 }}>
          <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>{clip(company?.company_name ?? '행사 단기 알바', 18)}</span>
          {company?.verified && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 24, fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '6px 16px' }}>
              <OgIcon name="check" size={24} /> 확인된 회사
            </span>
          )}
        </div>
        <span style={{ display: 'flex', marginTop: 8, fontSize: 30, fontWeight: 600, opacity: 0.9 }}>
          {jobs.length ? '지금 모집 중인 공고 · 눌러서 바로 지원' : '공고가 올라오면 여기에서 지원할 수 있어요'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 30 }}>
          {jobs.slice(0, 3).map((j) => (
            <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 16, backgroundColor: '#ffffff', color: '#191f28', borderRadius: 22, padding: '16px 24px' }}>
              <OgIcon name="calendar" size={28} color={OG_BRAND} />
              <span style={{ fontSize: 26, fontWeight: 700, color: '#4e5968', width: 170 }}>{fmtDateRange(j.start_date, j.end_date)}</span>
              <span style={{ fontSize: 28, fontWeight: 700, flex: 1 }}>{clip(j.title, 24)}</span>
              <span style={{ fontSize: 26, fontWeight: 700, color: OG_BRAND }}>{j.pay_type === 'daily' ? `일급 ${won(j.daily_wage)}` : `시급 ${won(j.hourly_wage)}`}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', fontSize: 28, fontWeight: 700 }}>
          <span style={{ opacity: 0.9 }}>{jobs.length > 3 ? `외 ${jobs.length - 3}개 더 · ` : ''}해피워크에서 확인하세요</span>
          <span style={{ marginLeft: 'auto', color: OG_BRAND, backgroundColor: '#ffffff', borderRadius: 999, padding: '14px 28px' }}>간편가입 후 바로 지원</span>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await fontsP, headers: OG_HEADERS },
  )
}
