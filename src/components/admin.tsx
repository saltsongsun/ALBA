'use client'

import { useActionState, useMemo, useState } from 'react'
import { resetPin, revealRrn, saveSettings, saveTemplate, updateWorker } from '@/app/actions/admin'
import { renderTemplate } from '@/lib/docs'
import { PLACEHOLDERS } from '@/lib/default-templates'
import type { DocTemplate, Settings } from '@/lib/types'
import { DocBody } from './DocSheet'
import { FormMessage, SubmitButton } from './ui'

export function RevealRrn({ userId, masked }: { userId: string; masked: string | null }) {
  const [state, action] = useActionState(revealRrn.bind(null, userId), null)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <span className="font-mono">{state?.ok ?? masked ?? '미등록'}</span>
      {!state?.ok && masked && <SubmitButton className="btn-gray btn-sm">전체 보기 (기록됨)</SubmitButton>}
      {state?.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  )
}

export function ResetPin({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetPin.bind(null, userId), null)
  return (
    <form action={action} className="space-y-2">
      {state?.ok ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          임시 비밀번호 <b className="font-mono text-lg tracking-widest">{state.ok}</b> — 근무자에게 알려 주고 로그인 후 바꾸도록 안내하세요. (이 화면을 벗어나면 다시 볼 수 없습니다)
        </p>
      ) : (
        <SubmitButton className="btn-gray btn-sm">비밀번호 초기화</SubmitButton>
      )}
      {state?.error && <FormMessage state={state} />}
    </form>
  )
}

export function WorkerEditForm({
  userId,
  initial,
}: {
  userId: string
  initial: { name: string; phone: string; role: string; active: boolean; admin_memo: string }
}) {
  const [state, action] = useActionState(updateWorker.bind(null, userId), null)
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">이름</span>
          <input name="name" className="input" defaultValue={initial.name} />
        </label>
        <label>
          <span className="label">휴대폰 번호</span>
          <input name="phone" className="input" defaultValue={initial.phone} />
        </label>
      </div>
      <label className="block">
        <span className="label">관리자 메모 (근무자에게 보이지 않음)</span>
        <textarea name="admin_memo" rows={3} className="input" defaultValue={initial.admin_memo} placeholder="성실함, 무대 경험 있음 등" />
      </label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="role" value="admin" defaultChecked={initial.role === 'admin'} className="size-5 accent-brand-600" />
          관리자 권한
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="inactive" defaultChecked={!initial.active} className="size-5 accent-brand-600" />
          로그인 정지 (탈퇴 처리)
        </label>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary btn-sm">저장</SubmitButton>
    </form>
  )
}

const SAMPLE: Record<string, string> = {
  근로자명: '홍길동',
  생년월일: '2001년 3월 4일',
  연락처: '010-1234-5678',
  주소: '경남 진주시 ○○로 12',
  회사명: '주식회사 소켓씨앤씨',
  대표자: '대표자',
  사업자번호: '000-00-00000',
  회사주소: '경남 진주시',
  회사연락처: '055-000-0000',
  행사명: '2026 진주남강유등축제',
  공고명: '안내·질서 스태프',
  업무내용: '관람객 안내, 동선 통제',
  근무장소: '진주성 일원',
  근무기간: '2026년 10월 1일 ~ 2026년 10월 3일',
  근무시간: '09:00 ~ 18:00',
  휴게시간: '1시간 (근무 중 자유 이용)',
  임금: '시급 10,320원 (실제 근로시간 × 시급)',
  수당: '교통비 1일 10,000원',
  가산수당: '해당 없음',
  공제내역: '일용근로소득세 및 지방소득세 원천징수, 고용보험료 0.9%',
  지급일: '행사 종료 후 7일 이내',
  복장: '검정 바지, 운동화',
  준비물: '신분증',
  담당자: '김담당 010-0000-0000',
  작성일: '2026년 10월 1일',
}

export function TemplateEditor({ tpl }: { tpl: DocTemplate | null }) {
  const [state, action] = useActionState(saveTemplate.bind(null, tpl?.id ?? null), null)
  const [body, setBody] = useState(tpl?.body ?? '# 제목\n\n## 1. 항목\n- 내용')
  const preview = useMemo(() => renderTemplate(body, SAMPLE), [body])
  return (
    <form action={action} className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="card space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <input name="title" className="input" defaultValue={tpl?.title} placeholder="서식 이름 (예: 단기 근로계약서)" required />
            <select name="kind" className="input" defaultValue={tpl?.kind ?? 'contract'}>
              <option value="contract">근로계약서</option>
              <option value="pledge">서약서</option>
              <option value="consent">동의서</option>
              <option value="other">기타</option>
            </select>
          </div>
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={26}
            className="input font-mono text-[13px] leading-relaxed"
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_default" defaultChecked={tpl?.is_default} className="size-5 accent-brand-600" />새 공고에 기본 체크
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="inactive" defaultChecked={tpl ? !tpl.active : false} className="size-5 accent-brand-600" />
              사용 안 함
            </label>
          </div>
          <FormMessage state={state} />
          <SubmitButton>서식 저장</SubmitButton>
        </div>
        <div className="card text-xs text-sub">
          <p className="mb-2 font-semibold text-ink">쓰는 법: # 제목 · ## 소제목 · - 목록 · {'{{항목}}'} 자리채움</p>
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.desc}
                className="rounded-md bg-bg px-1.5 py-0.5 font-mono hover:bg-brand-50"
                onClick={() => setBody((b) => `${b}{{${p.key}}}`)}
              >
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <p className="mb-3 text-xs font-semibold text-mute">미리보기 (예시 값)</p>
        <DocBody text={preview} />
      </div>
    </form>
  )
}

export function SettingsForm({ s }: { s: Settings }) {
  const [state, action] = useActionState(saveSettings, null)
  return (
    <form action={action} className="space-y-5">
      <section className="card space-y-4">
        <h2 className="font-bold">사업주 정보 (근로계약서·임금명세서에 표시)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">상호 *</span>
            <input name="company_name" className="input" defaultValue={s.company_name} required />
          </label>
          <label>
            <span className="label">대표자</span>
            <input name="ceo_name" className="input" defaultValue={s.ceo_name ?? ''} />
          </label>
          <label>
            <span className="label">사업자등록번호</span>
            <input name="business_no" className="input" defaultValue={s.business_no ?? ''} placeholder="000-00-00000" />
          </label>
          <label>
            <span className="label">회사 전화</span>
            <input name="company_phone" className="input" defaultValue={s.company_phone ?? ''} />
          </label>
          <label className="sm:col-span-2">
            <span className="label">회사 주소</span>
            <input name="company_address" className="input" defaultValue={s.company_address ?? ''} />
          </label>
        </div>
      </section>
      <section className="card space-y-4">
        <h2 className="font-bold">직인</h2>
        <div className="flex flex-wrap items-center gap-4">
          {s.seal_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.seal_image} alt="직인" className="size-24 rounded-xl border border-line object-contain p-1" />
          ) : (
            <div className="grid size-24 place-items-center rounded-xl border-2 border-dashed border-line text-xs text-mute">없음</div>
          )}
          <div className="space-y-2 text-sm">
            <input type="file" name="seal" accept="image/png,image/jpeg,image/webp" className="block text-sm" />
            <p className="hint">배경이 투명한 PNG(400KB 이하)를 권장합니다. 서명 시점의 직인이 서류에 함께 보관됩니다.</p>
            {s.seal_image && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="remove_seal" className="size-4" /> 직인 삭제
              </label>
            )}
          </div>
        </div>
      </section>
      <section className="card space-y-4">
        <h2 className="font-bold">운영 기본값</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className="label">문의 담당자</span>
            <input name="contact_name" className="input" defaultValue={s.contact_name ?? ''} />
          </label>
          <label>
            <span className="label">문의 연락처</span>
            <input name="contact_phone" className="input" defaultValue={s.contact_phone ?? ''} />
            <span className="hint">로그인 화면 &lsquo;비밀번호 분실&rsquo; 안내에 표시</span>
          </label>
          <label>
            <span className="label">기본 시급(원)</span>
            <input type="number" name="default_hourly_wage" className="input" defaultValue={s.default_hourly_wage} step={10} />
          </label>
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="workplace_5plus" defaultChecked={s.workplace_5plus} className="mt-0.5 size-5 accent-brand-600" />
          <span>
            <b>상시 근로자 5인 이상 사업장</b>
            <span className="block text-xs text-mute">새 공고에 연장·야간 가산수당(50%)을 기본으로 켭니다.</span>
          </span>
        </label>
      </section>
      <FormMessage state={state} />
      <SubmitButton>설정 저장</SubmitButton>
    </form>
  )
}
