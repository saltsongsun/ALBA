'use server'

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/data'
import { db, must } from '@/lib/db'
import { photoBase64 } from '@/lib/photo'
import { requireAdmin, requireUser } from '@/lib/session'
import { workerInCompany } from '@/lib/company'
import type { FormState } from './auth'

/**
 * 얼굴 사진 올리기·지우기. target이 없으면 본인 사진, 있으면 관리자가 그 근무자 사진을 바꿈.
 * form: photo(data:image/jpeg;base64,…) 또는 remove=1
 */
export async function savePhoto(target: string | null, _: FormState, form: FormData): Promise<FormState> {
  let userId: string
  let byId: string
  if (target) {
    const admin = await requireAdmin()
    if (!(await workerInCompany(admin.companyId, target))) return { error: '이 회사에 지원한 근무자가 아닙니다.' }
    userId = target
    byId = admin.id
  } else {
    const user = await requireUser('/me/profile')
    userId = byId = user.id
  }

  if (form.get('remove') === '1') {
    must(await db().from('user_photos').delete().eq('user_id', userId))
    must(await db().from('users').update({ photo_at: null }).eq('id', userId))
    if (target) await audit(byId, 'photo.delete', userId)
  } else {
    const data = photoBase64(form.get('photo'))
    if (!data) return { error: '사진을 올리지 못했어요. 다른 사진으로 다시 해 주세요.' }
    const now = new Date().toISOString()
    must(await db().from('user_photos').upsert({ user_id: userId, data, updated_at: now, updated_by: byId }, { onConflict: 'user_id' }))
    must(await db().from('users').update({ photo_at: now }).eq('id', userId))
    if (target) await audit(byId, 'photo.update', userId)
  }
  revalidatePath(target ? `/admin/workers/${userId}` : '/me/profile')
  if (!target) {
    revalidatePath('/me')
    // 공고 화면에서 올렸으면 바로 지원 칸이 나오게
    revalidatePath('/jobs/[id]', 'page')
    revalidatePath('/pro')
  }
  return { ok: form.get('remove') === '1' ? '사진을 지웠어요' : '사진을 올렸어요' }
}
