import 'server-only'
import { plainBody } from './stickers'
import { kstDate, kstTime } from './time'

export type ExportLine = { at: string; who: string; body: string }

/** 대화를 글자 파일로: [2026-11-02 14:03] 이름: 내용 (여러 줄은 들여쓰기) */
export function chatText(title: string, lines: ExportLine[]): string {
  const now = new Date()
  const head = [`해피워크 대화 · ${title}`, `저장한 시각: ${kstDate(now)} ${kstTime(now)} · 메시지 ${lines.length}개`, '']
  const body = lines.map((l) => `[${kstDate(l.at)} ${kstTime(l.at)}] ${l.who}: ${plainBody(l.body).replace(/\r?\n/g, '\n    ')}`)
  return [...head, ...body, ''].join('\n')
}

/** 파일 이름에 못 쓰는 글자 빼기 */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '대화'

/** 내려받기 응답 (윈도우 메모장에서도 한글이 깨지지 않게 BOM) */
export function txtDownload(name: string, text: string): Response {
  const file = `${safeName(name)}_${kstDate()}.txt`
  return new Response('﻿' + text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
      'Cache-Control': 'no-store',
    },
  })
}

export const forbidden = () => new Response('권한이 없습니다.', { status: 403 })
