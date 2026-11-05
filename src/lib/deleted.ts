/**
 * 지운 메시지 (문의 messages · 단체방 job_chat). 표를 늘리지 않고 내용 칸을 이 표시로 바꿔 둠
 * → 대화 흐름은 그대로 두고(상대도 '삭제된 메시지'로 봄) 글은 남기지 않음
 */
export const DELETED = '::deleted::'
/** 단체방에서 담당자가 다른 사람 글을 지운 경우 */
export const DELETED_BY_ADMIN = '::deleted-admin::'
export const DELETED_BODIES = [DELETED, DELETED_BY_ADMIN]

export function isDeleted(body: string): boolean {
  return body === DELETED || body === DELETED_BY_ADMIN
}

export function deletedText(body: string): string {
  return body === DELETED_BY_ADMIN ? '담당자가 삭제한 메시지예요' : '삭제된 메시지예요'
}

/** 메시지 번호: 운영 DB는 숫자, 테스트용 가짜 DB는 uuid */
export function validMessageId(id: unknown): id is number | string {
  if (typeof id === 'number') return Number.isSafeInteger(id) && id > 0
  return typeof id === 'string' && (/^\d{1,18}$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}
