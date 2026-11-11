import Icon from './Icon'
import { getJob } from '@/lib/data'
import { db } from '@/lib/db'
import type { Job } from '@/lib/types'

/**
 * 가입·로그인 뒤 돌아갈 주소(next)가 공고 화면이면 그 공고 (공개된 공고만 · 못 읽으면 없음).
 * 공고를 보다가 가입·로그인으로 넘어온 사람에게 '끝나면 이 공고로 돌아간다'를 보여 주려고
 */
export async function returnJob(next: string): Promise<Job | null> {
  const id = /^\/jobs\/([0-9a-f-]{36})(?:[?#]|$)/i.exec(next)?.[1]
  if (!id) return null
  return getJob(id).then(
    (j) => (j && j.status !== 'draft' ? j : null),
    () => null,
  )
}

/** 공고 제목 + 한 줄 ('가입하면 이 공고로 돌아가요') */
export function ReturnJobChip({ job, text, name }: { job: Pick<Job, 'id' | 'title'>; text: string; name: 'signup' | 'login' }) {
  return (
    <p className="mb-5 flex items-center gap-2.5 rounded-2xl bg-brand-50 px-3.5 py-2.5 text-brand-800" {...{ [`data-${name}-for`]: job.id }}>
      <Icon name="bag" className="shrink-0 text-brand-600" />
      <span className="min-w-0">
        <b className="block truncate text-sm">{job.title}</b>
        <span className="block text-xs text-brand-700">{text}</span>
      </span>
    </p>
  )
}

/**
 * 가입·로그인 뒤 돌아갈 주소(next)가 회사 공고 모음(/?co=회사)이면 그 회사 (쓰는 중인 회사만 · 못 읽으면 없음).
 * 회사가 단톡방에 올린 링크로 들어온 사람에게 '끝나면 이 회사 공고로 돌아간다'를 보여 주려고
 */
export async function returnCompany(next: string): Promise<{ id: string; name: string } | null> {
  const id = /^\/\?(?:[^#]*&)?co=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[&#]|$)/i.exec(next)?.[1]
  if (!id) return null
  return Promise.resolve(db().from('companies').select('id, company_name').eq('id', id).eq('active', true).maybeSingle()).then(
    (r) => {
      const c = r.data as { id: string; company_name: string | null } | null
      return c?.company_name ? { id: c.id, name: c.company_name } : null
    },
    () => null,
  )
}

/** 회사 이름 + 한 줄 ('가입하면 이 회사 공고로 돌아가요') */
export function ReturnCompanyChip({ company, text, name }: { company: { id: string; name: string }; text: string; name: 'signup' | 'login' }) {
  return (
    <p className="mb-5 flex items-center gap-2.5 rounded-2xl bg-brand-50 px-3.5 py-2.5 text-brand-800" {...{ [`data-${name}-co`]: company.id }}>
      <Icon name="building" className="shrink-0 text-brand-600" />
      <span className="min-w-0">
        <b className="block truncate text-sm">{company.name}</b>
        <span className="block text-xs text-brand-700">{text}</span>
      </span>
    </p>
  )
}
