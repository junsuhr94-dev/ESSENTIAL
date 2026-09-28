import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ saveInk: vi.fn(async () => {}) }));
const { useInk } = await import('./ink');

const stroke = (id: string) => ({ id, tool: 'pen' as const, color: '#000', width: 0.003, points: [0, 0, 0.5] });

describe('ink store', () => {
  beforeEach(() => useInk.getState().load('s1', new Map()));

  it('commit / undo / redo', () => {
    const { commit } = useInk.getState();
    commit(1, (ink) => ({ ...ink, strokes: [...ink.strokes, stroke('a')] }));
    commit(1, (ink) => ({ ...ink, strokes: [...ink.strokes, stroke('b')] }));
    expect(useInk.getState().pages[1].strokes).toHaveLength(2);
    expect(useInk.getState().undo()).toBe(1);
    expect(useInk.getState().pages[1].strokes.map((s) => s.id)).toEqual(['a']);
    useInk.getState().redo();
    expect(useInk.getState().pages[1].strokes).toHaveLength(2);
  });

  it('기호 변환은 한 번의 실행 취소로 손글씨로 되돌아간다', () => {
    const { commit } = useInk.getState();
    commit(2, (ink) => ({ ...ink, strokes: [stroke('x')] }));
    commit(2, (ink) => ({ ...ink, strokes: [], symbols: [{ id: 'g', glyph: 'accidentalSharp', x: 0, y: 0, size: 0.04, color: '#000' }] }));
    useInk.getState().undo();
    expect(useInk.getState().pages[2]).toMatchObject({ strokes: [{ id: 'x' }], symbols: [] });
  });

  it('mutate + recordHistory 는 지우개 한 번 문지름을 한 기록으로 남긴다', () => {
    const s = useInk.getState();
    s.commit(3, () => ({ strokes: [stroke('a'), stroke('b')], symbols: [], texts: [] }));
    const before = useInk.getState().pages[3];
    s.mutate(3, (ink) => ({ ...ink, strokes: ink.strokes.slice(1) }));
    s.mutate(3, (ink) => ({ ...ink, strokes: [] }));
    s.recordHistory(3, before);
    expect(useInk.getState().undoStack).toHaveLength(2);
    useInk.getState().undo();
    expect(useInk.getState().pages[3].strokes).toHaveLength(2);
  });
});
