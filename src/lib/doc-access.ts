/**
 * 근무자가 공고 서류(근로계약서 등)를 열 수 있는지: 근무가 확정(approved)된 동안만.
 * 지원을 취소했거나, 담당자가 확정을 되돌렸거나(대기·미선발), 행사가 취소돼 지원이 취소되면
 * 이미 서명한 서류라도 근무자는 열 수 없고 담당자(관리자)에게 문의해서 받음. 관리자는 언제나 볼 수 있음.
 */
export function canOpenJobDocs(appStatus: string | null | undefined): boolean {
  return appStatus === 'approved'
}

/** 열 수 없는 서류 대신 보여 줄 문의 링크 (그 공고에 대한 문의로 바로) */
export function docInquiryHref(jobId: string): string {
  return `/me/chat?job=${jobId}`
}
