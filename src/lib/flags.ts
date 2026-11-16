import 'server-only'
import { cache } from 'react'
import { db } from './db'

/**
 * 운영자 전체 스위치 (최상위 관리자가 커뮤니티 관리에서 켜고 끔).
 * 켜고 끈 기록(audit_logs 'feature.<이름>', detail 'on'·'off')의 마지막 값 · 기록이 없거나 못 읽으면 기본값.
 * DB 구조를 늘리지 않고, 누가 언제 바꿨는지도 그대로 남음
 */
export const FEATURES = {
  /** 함께 일한 사람 · 내 지원 보여 주기 (사용자 요청: 운영자가 전체로 · 처음엔 꺼짐) */
  coworkers: { label: '함께 일한 사람', defaultOn: false },
  /** 근무자 화면의 공고에 회사 후기(별점·최근 후기) 보이기 (사용자 요청 2026-11-06 · 지금처럼 켜진 채로 시작) */
  job_reviews: { label: '공고에 회사 후기 보이기', defaultOn: true },
} as const
export type FeatureKey = keyof typeof FEATURES

// 서버가 1분 동안 기억 (근무자 화면을 열 때마다 기록 500줄을 읽지 않게 · 켜고 끄면 같은 서버는 바로, 다른 서버도 1분 안에 반영)
const TTL_MS = 60_000
let memo: { at: number; value: Record<string, boolean> } | null = null

/** 운영자가 켜고 끈 직후 (같은 서버에서는 바로 새 값으로) */
export function forgetFlags() {
  memo = null
}

const allFlags = cache(async (): Promise<Record<string, boolean>> => {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value
  const out: Record<string, boolean> = {}
  let ok = false
  try {
    const { data, error } = await db().from('audit_logs').select('action, detail, created_at').like('action', 'feature.%').order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    const rows = ((data ?? []) as { action: string; detail: string | null; created_at: string }[])
      .filter((r) => r.action.startsWith('feature.'))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    for (const r of rows) {
      const key = r.action.slice('feature.'.length)
      if (!(key in out)) out[key] = r.detail === 'on'
    }
    ok = true
  } catch {}
  // 읽기에 실패했으면 기억하지 않음 (다음 요청에서 다시 읽게)
  if (ok) memo = { at: Date.now(), value: out }
  return out
})

/** 이 기능이 지금 켜져 있는지 (같은 요청에서 한 번만 읽음) */
export async function featureOn(key: FeatureKey): Promise<boolean> {
  const flags = await allFlags()
  return key in flags ? flags[key] : FEATURES[key].defaultOn
}
