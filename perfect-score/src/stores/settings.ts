import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_KEYMAP, type Keymap } from '@/core/pedal/keymap';
import { safeStorage } from '@/lib/prefs';

export type LayoutPref = 'auto' | 'single' | 'double';
export type TurnMode = 'instant' | 'half' | 'scroll-h' | 'scroll-v';
export type PageTheme = 'paper' | 'sepia' | 'night';

export const TURN_MODE_LABELS: Record<TurnMode, { title: string; desc: string }> = {
  instant: { title: '즉시 전환', desc: '지연 없이 한 번에 교체 (공연 권장)' },
  half: { title: '반 페이지 넘김', desc: '연주가 끝난 부분부터 다음 페이지로 교체' },
  'scroll-h': { title: '가로 스크롤', desc: '페이지를 옆으로 부드럽게 이동' },
  'scroll-v': { title: '세로 스크롤', desc: '위아래로 이어서 부드럽게 이동' },
};

export const PAGE_THEMES: Record<PageTheme, { title: string; desc: string; stage: string; filter: string }> = {
  paper: { title: '기본', desc: '흰 종이', stage: '#0b0c10', filter: 'none' },
  sepia: { title: '아날로그', desc: '눈부심을 줄인 누런 종이색', stage: '#17130d', filter: 'sepia(0.45) brightness(0.93) contrast(1.05)' },
  night: { title: '야간', desc: '검은 바탕에 흰 음표 — 어두운 무대용', stage: '#000000', filter: 'invert(1) hue-rotate(180deg) brightness(0.9)' },
};

interface ViewerSettings {
  layout: LayoutPref;
  turnMode: TurnMode;
  /** 반 페이지 넘김의 경계 위치(위쪽 영역 비율) */
  halfSplit: number;
  keymap: Keymap;
  /** 화면 좌우 탭으로 페이지 넘기기 */
  tapToTurn: boolean;
  /** 악보 색 테마 */
  pageTheme: PageTheme;
  /** 화면 어둡게(0~0.8) — 조명이 어두운 무대에서 눈부심 방지 */
  dim: number;
  /** 공연 모드: 필기·메뉴를 잠그고 페달/가장자리 탭으로만 넘김 */
  performanceMode: boolean;
  set: (patch: Partial<Omit<ViewerSettings, 'set'>>) => void;
}

export const useSettings = create<ViewerSettings>()(
  persist(
    (set) => ({
      layout: 'auto',
      turnMode: 'instant',
      halfSplit: 0.5,
      keymap: DEFAULT_KEYMAP,
      tapToTurn: true,
      pageTheme: 'paper',
      dim: 0,
      performanceMode: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'perfect-score.settings',
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ set: _set, ...rest }) => rest,
      // v1 → v2: 새 페달 동작(다음 곡/이전 곡)의 기본 키를 채운다.
      migrate: (state) => {
        const s = (state ?? {}) as Partial<ViewerSettings>;
        return { ...s, keymap: { ...DEFAULT_KEYMAP, ...(s.keymap ?? {}) } } as ViewerSettings;
      },
    },
  ),
);
