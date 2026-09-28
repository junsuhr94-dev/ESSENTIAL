import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_KEYMAP, type Keymap } from '@/core/pedal/keymap';
import { safeStorage } from '@/lib/prefs';

export type LayoutPref = 'auto' | 'single' | 'double';
export type TurnMode = 'instant' | 'half' | 'scroll-h' | 'scroll-v';

export const TURN_MODE_LABELS: Record<TurnMode, { title: string; desc: string }> = {
  instant: { title: '즉시 전환', desc: '지연 없이 한 번에 교체 (공연 권장)' },
  half: { title: '반 페이지 넘김', desc: '연주가 끝난 부분부터 다음 페이지로 교체' },
  'scroll-h': { title: '가로 스크롤', desc: '페이지를 옆으로 부드럽게 이동' },
  'scroll-v': { title: '세로 스크롤', desc: '위아래로 이어서 부드럽게 이동' },
};

interface ViewerSettings {
  layout: LayoutPref;
  turnMode: TurnMode;
  /** 반 페이지 넘김의 경계 위치(위쪽 영역 비율) */
  halfSplit: number;
  keymap: Keymap;
  /** 화면 좌우 탭으로 페이지 넘기기 */
  tapToTurn: boolean;
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
      set: (patch) => set(patch),
    }),
    {
      name: 'perfect-score.settings',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
);
