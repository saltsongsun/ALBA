import 'server-only'
import { createHmac, createSign } from 'node:crypto'

/**
 * 구글 시트 (거래장부 연동) — 두 가지 방법 중 하나로 접속
 * 1) 시트 안의 연결 다리(Apps Script 웹 앱 · lib/ledger-script.ts): LEDGER_PROXY_URL 하나만 넣으면 됨
 *    (구글 클라우드 설정 없이 · '이 시트 하나만' 권한 · 비밀값은 서버가 SESSION_SECRET에서 만들어 회사 설정의 '연결 코드 복사'로만 꺼냄
 *     · 따로 정하려면 LEDGER_PROXY_SECRET)
 * 2) 서비스 계정 키: GOOGLE_SA_EMAIL · GOOGLE_SA_KEY (JSON 키의 private_key, 줄바꿈은 \n 그대로 넣어도 됨) · LEDGER_SHEET_ID
 * (테스트용으로 GOOGLE_TOKEN_URL · GOOGLE_SHEETS_BASE를 바꿀 수 있음)
 */
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const BASE = () => (process.env.GOOGLE_SHEETS_BASE || 'https://sheets.googleapis.com').replace(/\/$/, '')

const PROXY = () => process.env.LEDGER_PROXY_URL || null

/** 연결 다리 비밀값 (LEDGER_PROXY_SECRET이 없으면 SESSION_SECRET에서 늘 같은 값으로 만듦 · 화면·기록에 남기지 않음) */
export function proxySecret(): string {
  if (process.env.LEDGER_PROXY_SECRET) return process.env.LEDGER_PROXY_SECRET
  const base = process.env.SESSION_SECRET
  if (!base || base.length < 32) throw new Error('SESSION_SECRET 환경변수(32자 이상)가 필요합니다.')
  return createHmac('sha256', base).update('ledger-proxy:v1').digest('base64url').slice(0, 32)
}

export function sheetsConfigured(): boolean {
  return !!(PROXY() || (process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_KEY && process.env.LEDGER_SHEET_ID))
}

let cached: { token: string; exp: number } | null = null

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({ iss: process.env.GOOGLE_SA_EMAIL, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: TOKEN_URL(), iat: now, exp: now + 3600 }),
  )
  const key = (process.env.GOOGLE_SA_KEY ?? '').replace(/\\n/g, '\n')
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key).toString('base64url')
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  })
  if (!res.ok) throw new Error(`구글 로그인 실패 (${res.status})`)
  const j = (await res.json()) as { access_token: string; expires_in?: number }
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
  return j.access_token
}

/** 연결 다리에 한 가지 일 시키기 ({비밀값, op, …} → {ok} 또는 {error}) */
async function bridge<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(PROXY()!, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: proxySecret(), ...body }),
    cache: 'no-store',
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`시트 연결 응답 없음 (${res.status})`)
  const j = (await res.json().catch(() => ({ error: '응답을 읽지 못함 — 웹 앱 배포·권한을 확인해 주세요' }))) as { ok?: T; error?: string }
  if (j.error) throw new Error(`시트 연결 거절 (${j.error})`)
  return j.ok as T
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE()}/v4/spreadsheets/${process.env.LEDGER_SHEET_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`구글 시트 요청 실패 (${res.status})`)
  return (await res.json()) as T
}

const enc = (range: string) => encodeURIComponent(range)

/** 범위의 값 (보이는 글자 그대로 · formula면 수식 글자) — 끝의 빈 줄·칸은 빠짐 */
export async function sheetGet(range: string, render: 'FORMATTED_VALUE' | 'FORMULA' = 'FORMATTED_VALUE'): Promise<string[][]> {
  if (PROXY()) return (await sheetBatchGet([range], render))[0] ?? []
  const j = await call<{ values?: unknown[][] }>(`/values/${enc(range)}?valueRenderOption=${render}`)
  return (j.values ?? []).map((r) => r.map((c) => (c == null ? '' : String(c))))
}

/** 범위에 값 쓰기 (사람이 입력한 것처럼: 날짜·수식·체크박스가 그대로 인식됨) — 새 줄에만 씀 */
export async function sheetWrite(range: string, values: (string | number | boolean)[][]): Promise<void> {
  if (PROXY()) return void (await bridge({ op: 'put', range, values }))
  await call(`/values/${enc(range)}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ range, majorDimension: 'ROWS', values }) })
}

/** 여러 범위를 한 번에 (범위마다 값 목록 · 순서 그대로) */
export async function sheetBatchGet(ranges: string[], render: 'FORMATTED_VALUE' | 'FORMULA' = 'FORMATTED_VALUE'): Promise<string[][][]> {
  if (PROXY()) {
    const got = await bridge<unknown[][][]>({ op: 'get', ranges, render })
    return ranges.map((_, i) => (got?.[i] ?? []).map((r) => r.map((c) => (c == null ? '' : String(c)))))
  }
  const q = ranges.map((r) => `ranges=${enc(r)}`).join('&')
  const j = await call<{ valueRanges?: { values?: unknown[][] }[] }>(`/values:batchGet?${q}&valueRenderOption=${render}`)
  return ranges.map((_, i) => (j.valueRanges?.[i]?.values ?? []).map((r) => r.map((c) => (c == null ? '' : String(c)))))
}

export type SheetTab = { id: number; rows: number; cols: number }
/** 탭 이름 → 탭 번호·줄 수 (서식 복사·배경색·줄 늘리기에 필요) */
export async function sheetTabs(): Promise<Map<string, SheetTab>> {
  if (PROXY()) return new Map((await bridge<{ title: string; id: number; rows: number; cols: number }[]>({ op: 'meta' })).map((t) => [t.title, { id: t.id, rows: t.rows, cols: t.cols }]))
  const j = await call<{ sheets?: { properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[] }>(
    `?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`,
  )
  return new Map(
    (j.sheets ?? []).map((s) => [s.properties.title, { id: s.properties.sheetId, rows: s.properties.gridProperties?.rowCount ?? 0, cols: s.properties.gridProperties?.columnCount ?? 0 }]),
  )
}

export async function sheetBatch(requests: unknown[]): Promise<void> {
  if (requests.length && PROXY()) return void (await bridge({ op: 'batch', requests }))
  if (requests.length) await call(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) })
}
