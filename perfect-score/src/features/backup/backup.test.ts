import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InkRecord, ScoreMeta, Setlist } from '@/lib/db';

// IndexedDB 대신 메모리 저장소
const mem = {
  scores: new Map<string, ScoreMeta>(),
  files: new Map<string, Blob[]>(),
  ink: new Map<string, InkRecord>(),
  setlists: new Map<string, Setlist>(),
};

vi.mock('@/lib/db', () => ({
  listScores: async () => [...mem.scores.values()],
  getScoreFiles: async (id: string) => mem.files.get(id),
  listAllInk: async () => [...mem.ink.values()],
  listSetlists: async () => [...mem.setlists.values()],
  addScore: async (meta: ScoreMeta, blobs: Blob[]) => { mem.scores.set(meta.id, meta); mem.files.set(meta.id, blobs); },
  deleteInkOf: async (id: string) => { for (const [k, r] of mem.ink) if (r.scoreId === id) mem.ink.delete(k); },
  saveInk: async (scoreId: string, page: number, ink: InkRecord['ink']) => { mem.ink.set(`${scoreId}:${page}`, { key: `${scoreId}:${page}`, scoreId, page, ink }); },
  putSetlist: async (s: Setlist) => { mem.setlists.set(s.id, s); },
  requestPersistentStorage: () => {},
}));

const { createBackup, restoreBackup } = await import('./backup');

const clear = () => Object.values(mem).forEach((m) => m.clear());
const ink = { strokes: [], symbols: [{ id: 'g', glyph: 'accidentalSharp' as const, x: 0.1, y: 0.2, size: 0.04, color: '#000' }], texts: [{ id: 't', text: 'C7', x: 0.1, y: 0.1, size: 0.03, color: '#000' }] };

describe('backup', () => {
  beforeEach(clear);

  it('악보·필기·세트리스트를 그대로 되살린다', async () => {
    const pdf = new Blob([new Uint8Array([37, 80, 68, 70, 1, 2, 3])], { type: 'application/pdf' });
    mem.scores.set('a', { id: 'a', title: '곡 A', kind: 'pdf', pageCount: 3, addedAt: 1, openedAt: 2, lastPage: 2, bpm: 96, bookmarks: [{ id: 'b', label: '코러스', page: 2, measure: 17 }], thumb: new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' }) });
    mem.files.set('a', [pdf]);
    mem.ink.set('a:1', { key: 'a:1', scoreId: 'a', page: 1, ink });
    mem.setlists.set('s', { id: 's', name: '토요일 공연', scoreIds: ['a', 'a'], createdAt: 1, updatedAt: 1 });

    const { blob, filename, scores } = await createBackup();
    expect(scores).toBe(1);
    expect(filename).toMatch(/\.psbackup$/);

    clear();
    mem.ink.set('a:3', { key: 'a:3', scoreId: 'a', page: 3, ink }); // 백업 이후 생긴 필기 → 복원 시 교체
    const r = await restoreBackup(blob);
    expect(r).toEqual({ scores: 1, inkPages: 1, setlists: 1 });
    expect(mem.scores.get('a')).toMatchObject({ title: '곡 A', bpm: 96, bookmarks: [{ label: '코러스', measure: 17 }] });
    expect(new Uint8Array(await mem.files.get('a')![0].arrayBuffer())).toEqual(new Uint8Array(await pdf.arrayBuffer()));
    expect(mem.scores.get('a')!.thumb!.size).toBe(2);
    expect([...mem.ink.keys()]).toEqual(['a:1']);
    expect(mem.setlists.get('s')!.scoreIds).toEqual(['a', 'a']);
  });

  it('다른 파일은 거부한다', async () => {
    await expect(restoreBackup(new Blob(['not a zip']))).rejects.toThrow();
  });
});
