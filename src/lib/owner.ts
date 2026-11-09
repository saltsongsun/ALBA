/**
 * 운영센터(모든 회사를 한눈에 보는 화면 /ops)를 볼 수 있는 사람 — 최상위 관리자 송순민만 (사용자 요청 2026-11-09)
 * 다른 최고 관리자(is_super)가 생겨도 운영센터는 이 계정만 · 다른 사람에겐 화면이 없는 것처럼(404)
 * 가짜 데이터로 시험할 때만 OPS_OWNER_IDS(쉼표로 여러 id)로 바꿈
 */
const OWNER_IDS = ['51ea6c2f-7c32-4fa8-a541-0e441ab50744'] // 송순민

export function opsOwnerIds(): string[] {
  const fromEnv = (process.env.OPS_OWNER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return fromEnv.length ? fromEnv : OWNER_IDS
}

/** 최고 관리자이면서 운영센터 주인인지 (둘 다여야 함) */
export function isOpsOwner(user: { id: string; isSuper: boolean } | null | undefined): boolean {
  return !!user && user.isSuper && opsOwnerIds().includes(user.id)
}
