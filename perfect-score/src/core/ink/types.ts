import type { SmuflGlyph } from '@/lib/smufl';

/**
 * 필기 데이터 모델.
 * 모든 좌표·크기는 "페이지 폭 단위(u)" — 페이지 폭 = 1 — 로 저장한다.
 * 가로·세로를 같은 단위로 쓰므로 화면 크기나 회전이 바뀌어도 모양과 거리 계산이 그대로 맞는다.
 */

export type StrokeTool = 'pen' | 'highlighter';

export interface InkStroke {
  id: string;
  tool: StrokeTool;
  color: string;
  /** 기본 굵기(u) */
  width: number;
  /** [x, y, pressure, x, y, pressure, ...] */
  points: number[];
  /** 그린 시각(ms) — 기호 인식에서 연속 획을 묶을 때 사용 */
  t?: number;
}

/** 손글씨에서 변환된 SMuFL 음악 기호 */
export interface SymbolItem {
  id: string;
  glyph: SmuflGlyph;
  /** 글리프 기준점(SMuFL origin: 왼쪽, baseline) */
  x: number;
  y: number;
  /** 폰트 크기(u). SMuFL 에서 1em = 오선 높이(4칸) */
  size: number;
  color: string;
}

/** 코드 네임·텍스트. #, b 는 SMuFL 임시표로 표시된다. */
export interface TextItem {
  id: string;
  text: string;
  /** 왼쪽 baseline */
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface PageInk {
  strokes: InkStroke[];
  symbols: SymbolItem[];
  texts: TextItem[];
}

export const EMPTY_INK: PageInk = { strokes: [], symbols: [], texts: [] };

export function isEmptyInk(ink: PageInk) {
  return !ink.strokes.length && !ink.symbols.length && !ink.texts.length;
}

export type InkTool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'select';
