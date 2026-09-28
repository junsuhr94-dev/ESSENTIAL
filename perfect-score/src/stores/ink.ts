import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { EMPTY_INK, isEmptyInk, type InkTool, type PageInk } from '@/core/ink/types';
import { saveInk } from '@/lib/db';
import { safeStorage } from '@/lib/prefs';

// ---------------- 필기 도구 설정 (저장됨) ----------------

export const PEN_COLORS = ['#111111', '#d62828', '#1d4ed8', '#15803d', '#7c3aed'];
export const HIGHLIGHTER_COLORS = ['#ffd43b', '#8ce99a', '#74c0fc', '#ffa8a8'];
/** 굵기(u): 가늘게/보통/굵게 */
export const PEN_WIDTHS = [0.0018, 0.003, 0.005];
export const HIGHLIGHTER_WIDTHS = [0.01, 0.016, 0.024];
export const ERASER_RADII = [0.006, 0.012, 0.022];
export const TEXT_SIZES = [0.022, 0.03, 0.04];

interface InkSettings {
  tool: InkTool;
  penColor: number;
  highlighterColor: number;
  penWidth: number;
  highlighterWidth: number;
  eraserSize: number;
  textSize: number;
  /** 손글씨 음악 기호를 SMuFL 글리프로 자동 변환 */
  smartNotation: boolean;
  /** 필기 모드가 아니어도 Apple Pencil 로 바로 쓰기 */
  pencilAlwaysDraws: boolean;
  /** 필기 모드에서 손가락으로도 쓰기 */
  fingerDraw: boolean;
  set: (patch: Partial<Omit<InkSettings, 'set'>>) => void;
}

export const useInkSettings = create<InkSettings>()(
  persist(
    (set) => ({
      tool: 'pen',
      penColor: 0,
      highlighterColor: 0,
      penWidth: 1,
      highlighterWidth: 1,
      eraserSize: 1,
      textSize: 1,
      smartNotation: true,
      pencilAlwaysDraws: true,
      fingerDraw: false,
      set: (patch) => set(patch),
    }),
    { name: 'perfect-score.ink-settings', version: 1, storage: createJSONStorage(() => safeStorage), partialize: ({ set: _s, ...rest }) => rest },
  ),
);

// ---------------- 열린 악보의 필기 데이터 + 실행 취소 ----------------

interface HistoryEntry { page: number; before: PageInk; after: PageInk }

interface InkState {
  scoreId: string | null;
  pages: Record<number, PageInk>;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** 선택된 기호/텍스트 (select 도구) */
  selected: { page: number; id: string } | null;
  /** 필기 모드(도구 막대 표시, 손가락·마우스 입력을 필기로) */
  annotating: boolean;
  setAnnotating: (on: boolean) => void;
  load: (scoreId: string, pages: Map<number, PageInk>) => void;
  unload: () => void;
  /** 페이지 필기를 바꾸고 실행 취소 기록을 남긴다. */
  commit: (page: number, update: (ink: PageInk) => PageInk) => void;
  /** 실행 취소 기록 없이 바꾼다(지우개로 문지르는 동안 등). 끝나면 recordHistory 로 한 번에 기록. */
  mutate: (page: number, update: (ink: PageInk) => PageInk) => void;
  recordHistory: (page: number, before: PageInk) => void;
  undo: () => number | null;
  redo: () => number | null;
  select: (sel: InkState['selected']) => void;
}

const MAX_HISTORY = 300;
const saveTimers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleSave(scoreId: string, page: number, ink: PageInk) {
  clearTimeout(saveTimers.get(page));
  saveTimers.set(page, setTimeout(() => {
    saveTimers.delete(page);
    void saveInk(scoreId, page, isEmptyInk(ink) ? null : ink);
  }, 300));
}

export const useInk = create<InkState>((set, get) => {
  const write = (page: number, ink: PageInk) => {
    const { scoreId, pages } = get();
    set({ pages: { ...pages, [page]: ink } });
    if (scoreId) scheduleSave(scoreId, page, ink);
  };
  const push = (entry: HistoryEntry) => {
    const undoStack = [...get().undoStack, entry].slice(-MAX_HISTORY);
    set({ undoStack, redoStack: [] });
  };

  return {
    scoreId: null,
    pages: {},
    undoStack: [],
    redoStack: [],
    selected: null,
    annotating: false,
    setAnnotating: (annotating) => set({ annotating, selected: null }),
    load: (scoreId, pages) => set({ scoreId, pages: Object.fromEntries(pages), undoStack: [], redoStack: [], selected: null }),
    unload: () => set({ scoreId: null, pages: {}, undoStack: [], redoStack: [], selected: null, annotating: false }),
    commit(page, update) {
      const before = get().pages[page] ?? EMPTY_INK;
      const after = update(before);
      if (after === before) return;
      write(page, after);
      push({ page, before, after });
    },
    mutate(page, update) {
      const before = get().pages[page] ?? EMPTY_INK;
      const after = update(before);
      if (after !== before) write(page, after);
    },
    recordHistory(page, before) {
      const after = get().pages[page] ?? EMPTY_INK;
      if (after !== before) push({ page, before, after });
    },
    undo() {
      const e = get().undoStack.at(-1);
      if (!e) return null;
      set({ undoStack: get().undoStack.slice(0, -1), redoStack: [...get().redoStack, e], selected: null });
      write(e.page, e.before);
      return e.page;
    },
    redo() {
      const e = get().redoStack.at(-1);
      if (!e) return null;
      set({ redoStack: get().redoStack.slice(0, -1), undoStack: [...get().undoStack, e], selected: null });
      write(e.page, e.after);
      return e.page;
    },
    select: (selected) => set({ selected }),
  };
});

/** 저장 대기 중인 필기를 즉시 기록(악보 닫을 때) */
export async function flushInk() {
  const { scoreId, pages } = useInk.getState();
  const pending = [...saveTimers.keys()];
  for (const page of pending) clearTimeout(saveTimers.get(page));
  saveTimers.clear();
  if (!scoreId) return;
  await Promise.all(pending.map((page) => saveInk(scoreId, page, isEmptyInk(pages[page] ?? EMPTY_INK) ? null : pages[page])));
}
