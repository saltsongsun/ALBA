import type { CompanySettings, Job } from './types'
import { phoneFmt, won } from './format'
import { breakDescription, taxDescription } from './pay'
import { fmtDateLong, fmtDateRange, hhmm, kstDate } from './time'

export type DocPerson = {
  name: string
  phone: string
  birth_date: string | null
  address: string | null
}

export function wageText(job: Job): string {
  if (job.pay_type === 'daily') return `일급 ${won(job.daily_wage)}`
  return `시급 ${won(job.hourly_wage)} (실제 근로시간 × 시급)`
}

export function scheduleText(job: Job): string {
  const overnight = job.end_time <= job.start_time
  return `${hhmm(job.start_time)} ~ ${overnight ? '다음날 ' : ''}${hhmm(job.end_time)}`
}

export function buildDocVars(
  job: Job,
  person: DocPerson,
  settings: CompanySettings,
  signedOn: string = kstDate(),
): Record<string, string> {
  const place = [job.location_name, job.address].filter(Boolean).join(' / ')
  const manager = [job.manager_name, phoneFmt(job.manager_phone)].filter(Boolean).join(' ')
  return {
    근로자명: person.name,
    생년월일: person.birth_date ? fmtDateLong(person.birth_date) : '',
    연락처: phoneFmt(person.phone),
    주소: person.address ?? '',
    회사명: settings.company_name,
    대표자: settings.ceo_name ?? '',
    사업자번호: settings.business_no ?? '',
    회사주소: settings.company_address ?? '',
    회사연락처: settings.company_phone ?? '',
    행사명: job.event_name || job.title,
    공고명: job.title,
    업무내용: job.task || '행사 운영 보조',
    근무장소: place || '공고 참조',
    근무기간: `${fmtDateLong(job.start_date)}${job.end_date !== job.start_date ? ` ~ ${fmtDateLong(job.end_date)}` : ''}`,
    근무시간: scheduleText(job),
    휴게시간: breakDescription(job),
    임금: wageText(job),
    수당: job.allowance > 0 ? `${job.allowance_label || '수당'} 1일 ${won(job.allowance)}` : '없음',
    가산수당: job.premium_enabled
      ? '1일 8시간 초과 연장근로 및 22시~06시 야간근로에 대해 통상임금의 50% 가산 지급'
      : '해당 없음 (상시 4인 이하 사업장 또는 일급제)',
    공제내역: taxDescription(job),
    지급일: job.pay_day || '근무 종료 후 정산하여 지급',
    복장: job.dress_code || '공고 참조',
    준비물: job.supplies || '없음',
    담당자: manager || settings.contact_name || '현장 담당자',
    작성일: fmtDateLong(signedOn),
  }
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key] : m))
}

export function scheduleSummary(job: Job): string {
  return `${fmtDateRange(job.start_date, job.end_date)} ${scheduleText(job)}`
}

/** 단톡방에 붙여넣을 모집 문구 */
export function recruitText(job: Job, url: string, companyName: string): string {
  const pay =
    job.pay_type === 'daily' ? `일급 ${won(job.daily_wage)}` : `시급 ${won(job.hourly_wage)}`
  const lines = [
    `📢 [${companyName}] 행사 알바 모집`,
    '',
    `■ ${job.title}`,
    job.event_name ? `■ 행사: ${job.event_name}` : null,
    `■ 일정: ${scheduleSummary(job)}`,
    job.location_name ? `■ 장소: ${job.location_name}` : null,
    `■ 급여: ${pay}${job.allowance > 0 ? ` + ${job.allowance_label || '수당'} ${won(job.allowance)}` : ''}`,
    `■ 인원: ${job.headcount}명`,
    job.task ? `■ 업무: ${job.task}` : null,
    job.dress_code ? `■ 복장: ${job.dress_code}` : null,
    '',
    '👉 지원하기 (간편가입 후 바로 지원)',
    url,
  ]
  return lines.filter((l) => l !== null).join('\n')
}
