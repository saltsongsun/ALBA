'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 서류 서식을 줄글 대신 항목(조항)별로 고치는 편집기.
 * 저장 형식은 그대로(# 제목 · ## 조항 · - 목록) 두고, 화면에서만 나눠서 보여 줌
 */

type Row = { id: number; text: string; bullet: boolean }
type Sec = { id: number; heading: string; rows: Row[] }
export type DocModel = { title: string; intro: Row[]; sections: Sec[]; numbered: boolean }

let seq = 0
const nid = () => ++seq

export function parseDoc(body: string): DocModel {
  let title = ''
  const intro: Row[] = []
  const sections: Sec[] = []
  let cur: Sec | null = null
  for (const raw of body.split('\n')) {
    const t = raw.trimEnd()
    if (!t.trim()) continue
    if (t.startsWith('# ') && !title && !cur && !intro.length) {
      title = t.slice(2).trim()
      continue
    }
    if (t.startsWith('## ')) {
      cur = { id: nid(), heading: t.slice(3).trim(), rows: [] }
      sections.push(cur)
      continue
    }
    const row = t.startsWith('- ') ? { id: nid(), text: t.slice(2), bullet: true } : { id: nid(), text: t, bullet: false }
    ;(cur ? cur.rows : intro).push(row)
  }
  // 모든 조항 제목이 '1. '처럼 번호로 시작하면 번호는 자동으로 매김 (순서를 바꿔도 맞게)
  const numbered = sections.length > 0 && sections.every((s) => /^\d+\.\s*/.test(s.heading))
  if (numbered) for (const s of sections) s.heading = s.heading.replace(/^\d+\.\s*/, '')
  return { title, intro, sections, numbered }
}

export function serializeDoc(m: DocModel): string {
  const line = (r: Row) => (r.bullet ? `- ${r.text}` : r.text)
  const out: string[] = []
  if (m.title.trim()) out.push(`# ${m.title.trim()}`, '')
  const intro = m.intro.filter((r) => r.text.trim())
  if (intro.length) out.push(...intro.map(line), '')
  m.sections.forEach((s, i) => {
    out.push(`## ${m.numbered ? `${i + 1}. ` : ''}${s.heading.trim()}`)
    out.push(...s.rows.filter((r) => r.text.trim()).map(line))
    out.push('')
  })
  return out.join('\n').trim()
}

/** 내용에 맞춰 높이가 늘어나는 한 줄 입력칸 */
function Grow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} className={`input min-w-0 flex-1 resize-none overflow-hidden py-2 text-sm leading-relaxed ${props.className ?? ''}`} />
}

const iconBtn = 'grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-white active:scale-90 disabled:opacity-30'

export default function TemplateSections({
  model,
  onChange,
  insertRef,
}: {
  model: DocModel
  onChange: (m: DocModel) => void
  /** 자리채움({{항목}}) 단추가 마지막으로 누른 칸의 커서 위치에 넣을 수 있게 */
  insertRef: React.RefObject<((token: string) => void) | null>
}) {
  const focused = useRef<{ el: HTMLTextAreaElement | HTMLInputElement; apply: (v: string) => void } | null>(null)
  const [focusId, setFocusId] = useState<number | null>(null)
  // 자리채움 단추는 나중에 눌리므로 그때의 최신 내용을 기준으로 바꿈
  const latest = useRef(model)
  latest.current = model
  const setRowText = (secId: number | null, rowId: number, v: string) => {
    const m = latest.current
    const fix = (rows: Row[]) => rows.map((x) => (x.id === rowId ? { ...x, text: v } : x))
    onChange(secId == null ? { ...m, intro: fix(m.intro) } : { ...m, sections: m.sections.map((s) => (s.id === secId ? { ...s, rows: fix(s.rows) } : s)) })
  }
  const setHeading = (secId: number, v: string) => {
    const m = latest.current
    onChange({ ...m, sections: m.sections.map((s) => (s.id === secId ? { ...s, heading: v } : s)) })
  }

  useEffect(() => {
    insertRef.current = (token) => {
      const f = focused.current
      if (!f) return
      const { el } = f
      const at = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? at
      f.apply(el.value.slice(0, at) + token + el.value.slice(end))
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(at + token.length, at + token.length)
      })
    }
  }, [insertRef])

  // 방금 추가한 줄로 바로 커서 이동
  useEffect(() => {
    if (focusId == null) return
    document.querySelector<HTMLTextAreaElement>(`[data-row="${focusId}"]`)?.focus()
    setFocusId(null)
  }, [focusId])

  const track = (apply: (v: string) => void) => (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    focused.current = { el: e.currentTarget, apply }
  }
  const setSec = (id: number, fn: (s: Sec) => Sec) => onChange({ ...model, sections: model.sections.map((s) => (s.id === id ? fn(s) : s)) })
  const move = (i: number, d: -1 | 1) => {
    const next = [...model.sections]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange({ ...model, sections: next })
  }

  /** 한 줄 (목록·문장). Enter를 누르면 아래에 새 줄 */
  const rowEditor = (secId: number | null, rows: Row[], setRows: (r: Row[]) => void) =>
    rows.map((r, j) => {
      const update = (patch: Partial<Row>) => setRows(rows.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
      return (
        <div key={r.id} className="flex items-start gap-1.5">
          <button
            type="button"
            title={r.bullet ? '목록 줄 (눌러서 문장으로)' : '문장 (눌러서 목록으로)'}
            onClick={() => update({ bullet: !r.bullet })}
            className={`${iconBtn} mt-0.5 font-bold ${r.bullet ? 'text-brand-600' : ''}`}
          >
            {r.bullet ? '•' : '¶'}
          </button>
          <Grow
            data-row={r.id}
            value={r.text}
            placeholder="내용"
            onFocus={track((v) => setRowText(secId, r.id, v))}
            onChange={(e) => update({ text: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              e.preventDefault()
              const nr = { id: nid(), text: '', bullet: r.bullet }
              setRows([...rows.slice(0, j + 1), nr, ...rows.slice(j + 1)])
              setFocusId(nr.id)
            }}
          />
          <button type="button" aria-label="줄 지우기" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className={`${iconBtn} mt-0.5`}>
            ✕
          </button>
        </div>
      )
    })

  const addRow = (rows: Row[], setRows: (r: Row[]) => void) => (
    <button
      type="button"
      onClick={() => {
        const nr = { id: nid(), text: '', bullet: true }
        setRows([...rows, nr])
        setFocusId(nr.id)
      }}
      className="ml-9 text-sm font-semibold text-brand-600"
    >
      + 줄 추가
    </button>
  )

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">문서 제목</span>
        <input
          className="input font-bold"
          value={model.title}
          onFocus={track((v) => onChange({ ...latest.current, title: v }))}
          onChange={(e) => onChange({ ...model, title: e.target.value })}
          placeholder="예: 단기(일용) 근로계약서"
        />
      </label>
      <div className="space-y-1.5">
        <span className="label">첫 문단</span>
        {rowEditor(null, model.intro, (intro) => onChange({ ...model, intro }))}
        {addRow(model.intro, (intro) => onChange({ ...model, intro }))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="label mb-0">조항 {model.sections.length}개</p>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-sub">
          <input type="checkbox" checked={model.numbered} onChange={(e) => onChange({ ...model, numbered: e.target.checked })} className="size-4 accent-brand-600" />
          번호 자동으로 붙이기
        </label>
      </div>
      {model.sections.map((s, i) => (
        <section key={s.id} className="space-y-2 rounded-2xl bg-bg p-3">
          {/* 조항 머리: 번호 · 순서 바꾸기 · 지우기 (좁은 휴대폰에서도 제목 칸을 넓게 쓰도록 한 줄 위에) */}
          <div className="flex items-center gap-1">
            <span className="mr-auto text-xs font-bold text-mute">조항 {i + 1}</span>
            <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}>
              ↑
            </button>
            <button type="button" aria-label="아래로" disabled={i === model.sections.length - 1} onClick={() => move(i, 1)} className={iconBtn}>
              ↓
            </button>
            <button
              type="button"
              aria-label="조항 지우기"
              onClick={() => confirm(`'${s.heading || '이 조항'}'을 지울까요?`) && onChange({ ...model, sections: model.sections.filter((x) => x.id !== s.id) })}
              className={`${iconBtn} text-rose-500`}
            >
              🗑
            </button>
          </div>
          <input
            className="input py-2 text-sm font-bold"
            value={s.heading}
            placeholder="조항 제목 (예: 근로시간)"
            onFocus={track((v) => setHeading(s.id, v))}
            onChange={(e) => setSec(s.id, (x) => ({ ...x, heading: e.target.value }))}
          />
          {rowEditor(s.id, s.rows, (rows) => setSec(s.id, (x) => ({ ...x, rows })))}
          {addRow(s.rows, (rows) => setSec(s.id, (x) => ({ ...x, rows })))}
        </section>
      ))}
      <button
        type="button"
        onClick={() => {
          const sec = { id: nid(), heading: '', rows: [{ id: nid(), text: '', bullet: true }] }
          onChange({ ...model, sections: [...model.sections, sec] })
        }}
        className="btn-gray w-full"
      >
        + 조항 추가
      </button>
    </div>
  )
}
