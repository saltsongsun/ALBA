'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sheetsConfigured } from '@/lib/gsheets'
import { isLedgerCompany, runLedgerSync } from '@/lib/ledger'
import { overLimit } from '@/lib/ratelimit'
import { requireAdmin } from '@/lib/session'

/** 돌아갈 화면 (관리자 화면 안의 주소만) */
function backTo(form: FormData): string {
  const p = String(form.get('from') ?? '')
  return /^\/admin(\/[\w\-/]*)?(\?[\w=&\-]*)?(#[\w-]*)?$/.test(p) ? p : '/admin/settings'
}
function back(path: string, msg: string): never {
  const [base, hash] = path.split('#')
  redirect(`${base}${base.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`)
}

/** '대금 시트 연동' 버튼 — 장부 회사의 관리자만 (근무자에게는 알림을 보내지 않음) */
export async function syncLedgerNow(form: FormData) {
  const admin = await requireAdmin()
  const to = backTo(form)
  if (!(await isLedgerCompany(admin.companyId))) back(to, '이 회사는 대금 시트 연동 대상이 아니에요')
  if (!sheetsConfigured()) back(to, '대금 시트가 아직 연결되지 않았어요 · 회사 설정에서 연결 방법을 확인해 주세요')
  if (await overLimit(`ledger:${admin.companyId}`, 6, 600)) back(to, '방금 여러 번 맞췄어요 · 잠시 뒤에 다시 눌러 주세요')
  const r = await runLedgerSync(admin.companyId, admin.id, 'button')
  revalidatePath('/admin', 'layout')
  back(to, r.ok ? `📒 대금 시트 연동 · ${r.text}` : `대금 시트 연동 실패 · ${r.text}`)
}
