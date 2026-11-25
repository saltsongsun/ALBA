import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/Icon'
import Flash from '@/components/Flash'
import Fold from '@/components/Fold'
import JobForm from '@/components/JobForm'
import OneAtATime from '@/components/OneAtATime'
import { SubmitButton } from '@/components/ui'
import { importJobFromCompany } from '@/app/actions/admin'
import { fmtDate } from '@/lib/time'
import { getSettings, hasSeal } from '@/lib/data'
import { db, must } from '@/lib/db'
import { contactLabel } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { otherCompanyContracts } from '@/lib/otherTemplates'
import { missingSetup } from '@/lib/setup'
import { recentJobValues } from '@/lib/recent-job'

export const metadata: Metadata = { title: '새 공고' }

export default async function NewJobPage(props: PageProps<'/admin/jobs/new'>) {
  const admin = await requireAdmin()
  const sp = await props.searchParams
  // 내가 대표·관리자로 있는 다른 회사 (최고 관리자 권한으로만 보이는 회사는 빼고) — 그 회사 공고로 시작할 수 있게
  const mine = admin.companies.filter((c) => c.id !== admin.companyId && c.role !== 'super')
  const [settings, sealSet, templates, recent, others, otherTpls] = await Promise.all([
    getSettings(admin.companyId),
    hasSeal(admin.companyId),
    db()
      .from('doc_templates')
      .select('id, title, kind, is_default').eq('company_id', admin.companyId)
      .eq('active', true)
      .order('created_at')
      .then((r) => must(r) as { id: string; title: string; kind: string; is_default: boolean }[]),
    // 이 회사가 지난 공고에 쓴 장소·지급일 안내·현장 담당자·추가 조건 (다시 치지 않고 눌러서 넣게 · 못 읽어도 등록은 그대로)
    db()
      .from('jobs')
      .select('location_name, address, lat, lng, gps_radius_m, pay_day, manager_name, manager_phone, conditions, created_at').eq('company_id', admin.companyId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(
        (r) => recentJobValues((r.data ?? []) as Parameters<typeof recentJobValues>[0]),
        () => recentJobValues([]),
      ),
    // 내 다른 회사의 최근 공고 6개 (취소한 공고 빼고 · 못 읽어도 화면은 그대로)
    mine.length
      ? db()
          .from('jobs')
          .select('id, title, company_id, start_date, end_date, status, created_at')
          .in('company_id', mine.map((c) => c.id))
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(6)
          .then(
            (r) => ((r.data ?? []) as { id: string; title: string; company_id: string; start_date: string; end_date: string; status: string }[]).filter((j) => j.status !== 'cancelled' && mine.some((c) => c.id === j.company_id)),
            () => [],
          )
      : Promise.resolve([] as { id: string; title: string; company_id: string; start_date: string; end_date: string; status: string }[]),
    // 내 다른 회사의 계약서 서식 (이 회사에 계약서 서식이 없을 때 공고 쓰기에서 바로 가져오게 · 정기 개선 2026-11-25 12:35)
    otherCompanyContracts(admin),
  ])
  // 이 회사의 계약서·명세서에 들어갈 정보가 비어 있으면 올리기 전에 알려 줌 (막지는 않음)
  const missing = missingSetup(settings, sealSet)
  const multi = admin.companies.length > 1
  return (
    <div className="mx-auto max-w-3xl">
      <Flash m={sp.m} />
      <Link href="/admin/jobs" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 공고 목록
      </Link>
      <h1 className={`mt-2 text-2xl font-extrabold ${multi ? 'mb-1' : 'mb-4'}`}>새 공고 등록</h1>
      {/* 여러 회사를 맡은 관리자: 어느 회사 공고로 올라가는지 (다른 회사면 위에서 바꾸면 이 화면에 그대로 남음) */}
      {multi && (
        <p className="mb-4 flex min-w-0 items-center gap-1.5 text-sm text-sub" data-job-company>
          <Icon name="building" className="shrink-0 text-brand-600" />
          <b className="min-w-0 truncate font-semibold text-ink">{admin.companyName}</b>
          <span className="shrink-0">공고로 올라가요</span>
        </p>
      )}
      {/* 내 다른 회사 공고로 시작 (정기 개선 2026-11-24 13:35): 내용을 이 회사로 가져와 임시 저장 → 고치기에서 날짜만 바꿈 · 서버가 회사를 다시 확인 */}
      {others.length > 0 && (
        <div className="mb-4" data-import-jobs>
          <Fold
            title="내 다른 회사 공고로 시작"
            badge={<span className="text-xs font-semibold text-mute">· {others.length}개</span>}
            summary="내용을 가져와 날짜만 바꿔요"
            className="space-y-1"
          >
            <OneAtATime className="divide-y divide-line">
              {others.map((j, i) => (
                <form
                  key={j.id}
                  action={importJobFromCompany}
                  className="flex animate-[rise_0.25s_var(--ease-spring)_both] items-center gap-3 py-2.5 transition-opacity duration-200"
                  style={{ animationDelay: `${i * 40}ms` }}
                  data-import-job={j.id}
                >
                  <input type="hidden" name="job" value={j.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-mute">
                      {mine.find((c) => c.id === j.company_id)?.name} · {fmtDate(j.start_date)}
                    </span>
                    <span className="block truncate text-sm font-semibold">{j.title}</span>
                  </span>
                  <SubmitButton className="btn-soft btn-sm shrink-0 whitespace-nowrap" pendingText="가져오는 중…" track="다른 회사 공고 가져오기">
                    가져오기
                  </SubmitButton>
                </form>
              ))}
            </OneAtATime>
            <p className="text-xs text-mute">원래 공고는 그대로예요 · 지원자·출퇴근은 안 가져와요</p>
          </Fold>
        </div>
      )}
      {missing.length > 0 && (
        <div data-setup-missing className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200/70">
          <p className="font-bold">계약서에 들어갈 회사 정보가 비어 있어요</p>
          <p className="mt-1">
            비어 있는 것: <b>{missing.map((it) => it.label).join(' · ')}</b>
          </p>
          <p className="mt-0.5 text-amber-800">공고는 올릴 수 있지만, 근로계약서·임금명세서에 빈칸으로 나가요.</p>
          {/* 회사 설정의 첫 빈 칸으로 바로 (커서까지) */}
          <Link href={`/admin/settings#${missing[0].key}`} className="mt-2 inline-block font-bold whitespace-nowrap underline underline-offset-2">
            회사 설정에서 채우기 →
          </Link>
        </div>
      )}
      <JobForm
        job={null}
        templates={templates}
        otherTpls={otherTpls}
        defaults={{ hourly_wage: settings.default_hourly_wage, premium: settings.workplace_5plus }}
        recent={recent}
        company={multi ? admin.companyName : undefined}
        fallbackContact={contactLabel(settings)}
      />
    </div>
  )
}
