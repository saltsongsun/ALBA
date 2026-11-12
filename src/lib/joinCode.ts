import 'server-only'
import { randomInt } from 'node:crypto'
import { db } from './db'

/**
 * 관리자 초대 코드: 대표 관리자가 직원에게 알려 주면, 직원이 코드를 넣고 관리자 가입을 신청 (대표가 승인해야 관리자).
 * 헷갈리는 글자(0·O·1·I)는 빼고 8자리 (약 1조 가지, 시도 횟수도 제한)
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newJoinCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(0, ALPHABET.length)]
  return s
}

/** 화면에 보일 때: ABCD-EFGH */
export const fmtJoinCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`

/** 입력한 코드 정리: 대문자, 글자·숫자만 */
export const normJoinCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)

/** 새 코드로 바꾸기 (예전 코드는 바로 못 씀) */
export async function setJoinCode(companyId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newJoinCode()
    const { error } = await db().from('companies').update({ join_code: code }).eq('id', companyId)
    if (!error) return code
    if (error.code !== '23505') throw new Error(`초대 코드 저장 실패: ${error.message}`)
  }
  throw new Error('초대 코드를 만들지 못했어요. 다시 시도해 주세요.')
}

/** 회사의 초대 코드 (아직 없으면 만들어 넣음) */
export async function joinCodeOf(companyId: string): Promise<string> {
  const { data } = await db().from('companies').select('join_code').eq('id', companyId).maybeSingle()
  const cur = (data as { join_code: string | null } | null)?.join_code
  return cur || setJoinCode(companyId)
}

/** 코드로 회사 찾기 (사용 중인 회사만) */
export async function companyByJoinCode(code: string): Promise<{ id: string; company_name: string } | null> {
  if (code.length !== 8) return null
  const { data } = await db().from('companies').select('id, company_name, join_code, active').eq('join_code', code).eq('active', true).limit(5)
  const rows = (data ?? []) as { id: string; company_name: string; join_code: string | null; active: boolean }[]
  // 코드가 정확히 같은 회사만 (한 번 더 확인)
  const hit = rows.find((c) => c.join_code === code && c.active)
  return hit ? { id: hit.id, company_name: hit.company_name } : null
}

/** 관리자 합류 신청 '다시 알리기' 간격 (대표 관리자를 너무 자주 깨우지 않게 · 신청할 때 간 알림도 한 번으로 셈) */
export const JOIN_NUDGE_SEC = 30 * 60
export const joinNudgeKey = (userId: string, companyId: string) => `join-nudge:${userId}:${companyId}`
