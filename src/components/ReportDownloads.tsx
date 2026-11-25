'use client'

import { useEffect, useState } from 'react'
import Icon from './Icon'

export type ReportFile = { key: string; href: string; label: string; note?: string; count?: number }

/**
 * 정산·신고자료: 신고 파일 내려받기 목록 (같은 모양 한 줄씩 · 기한은 그 줄에 작게).
 * 실수 막기: 이 달에 아직 안 끝난 근무(퇴근 기록 없음·오늘 근무 중)가 있으면 처음 누를 땐 멈추고
 * '파일에 빠져요' 안내 (4초 안에 한 번 더 누르면 받음) — 정산 탭 정산표 엑셀과 같은 방식
 * 줄마다 파일에 들어가는 사람 수 (0명이면 흐리게 — 빈 파일을 받아 신고하지 않게) · 누르면 잠깐 '✓ 받는 중' (눌렸는지 알게)
 */
export default function ReportDownloads({ files, incomplete, locked = false }: { files: ReportFile[]; incomplete: number; locked?: boolean }) {
  const [armed, setArmed] = useState<string | null>(null)
  const [got, setGot] = useState<string | null>(null)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(null), 4000)
    return () => window.clearTimeout(t)
  }, [armed])
  useEffect(() => {
    if (!got) return
    const t = window.setTimeout(() => setGot(null), 2500)
    return () => window.clearTimeout(t)
  }, [got])
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line" data-report-files>
        {files.map((f) => {
          const on = armed === f.key
          const done = got === f.key
          const empty = f.count === 0
          return (
            <li key={f.key}>
              <a
                href={f.href}
                className={`flex min-w-0 items-center gap-3 px-3 py-2.5 transition-colors active:bg-bg ${on ? 'bg-amber-50' : 'bg-white'}`}
                data-report-file={f.key}
                data-export-other={f.key === 'other' ? '' : undefined}
                data-report-count={f.count}
                data-report-locked={locked ? '' : undefined}
                onClick={(e) => {
                  // 잠겨 있으면 그대로 잠금 화면으로 (받는 중 표시·한 번 더 멈춤 없이 · 보안 점검 2026-11-25)
                  if (locked) return
                  if (!incomplete || on) {
                    setArmed(null)
                    setGot(f.key)
                    return
                  }
                  e.preventDefault()
                  setArmed(f.key)
                  navigator.vibrate?.(30)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${empty ? 'text-mute' : 'text-ink'}`}>{f.label}</span>
                  {f.note && <span className="block truncate text-xs text-mute">{f.note}</span>}
                </span>
                {f.count != null && (
                  <span className={`shrink-0 text-xs tabular-nums ${empty ? 'text-mute' : 'font-semibold text-sub'}`} data-report-n>
                    {f.count}명
                  </span>
                )}
                {done ? (
                  <span key="got" className="flex shrink-0 animate-pop items-center gap-0.5 text-xs font-bold text-emerald-600 motion-reduce:animate-none" role="status" data-report-got>
                    <Icon name="check" className="text-sm" />
                    받는 중
                  </span>
                ) : (
                  <span className={`flex shrink-0 items-center gap-1 text-xs font-bold ${on ? 'text-amber-700' : empty ? 'text-mute' : 'text-brand-600'}`}>
                    <Icon name={locked ? 'lock' : 'file'} className="text-sm" />
                    {on ? '한 번 더' : 'CSV'}
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
      {armed && (
        <p className="animate-pop rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status" data-report-file-warn>
          <b className="block">아직 안 끝난 근무 {incomplete}건은 파일에 빠져요</b>
          <span className="block">한 번 더 누르면 그대로 받아요</span>
        </p>
      )}
    </div>
  )
}
