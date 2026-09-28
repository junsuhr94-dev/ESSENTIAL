import type { PageInk } from '@/core/ink/types';
import { openSource } from '@/core/document/openSource';
import type { ScoreSource } from '@/core/document/types';
import { RenderCache } from '@/core/render/renderCache';
import { getScore, getScoreFiles, loadInk, type ScoreMeta } from '@/lib/db';
import { CropStore } from './cropStore';

const CACHE_CAPACITY = 8;

/** 뷰어가 쓰는 열린 악보 한 곡 */
export interface LoadedScore {
  meta: ScoreMeta;
  source: ScoreSource;
  cache: RenderCache;
  crops: CropStore;
  ink: Map<number, PageInk>;
}

export async function loadScore(scoreId: string): Promise<LoadedScore> {
  const [meta, blobs, ink] = await Promise.all([getScore(scoreId), getScoreFiles(scoreId), loadInk(scoreId)]);
  if (!meta || !blobs?.length) throw new Error('missing score');
  const source = await openSource(meta.kind, blobs);
  return { meta, source, cache: new RenderCache(source, CACHE_CAPACITY), crops: new CropStore(source, scoreId, meta.crops), ink };
}

export function disposeScore({ source, cache }: LoadedScore) {
  cache.destroy();
  source.destroy();
}

// ---------------- 세트리스트 다음 곡 미리 불러오기 ----------------
// 공연 중 곡을 바꿀 때 PDF 를 여는 시간(수백 ms)과 첫 화면 렌더링을 없애기 위해
// 현재 곡을 보는 동안 다음 곡을 한 곡만 미리 열어 둔다.

let slot: { id: string; promise: Promise<LoadedScore> } | null = null;

/** 다음 곡을 미리 연다. warm 에서 첫 화면을 렌더 캐시에 그려 둘 수 있다. */
export function preloadScore(scoreId: string, warm?: (score: LoadedScore) => Promise<void>) {
  if (slot?.id === scoreId) return;
  clearPreloaded();
  const promise = loadScore(scoreId).then(async (score) => {
    await warm?.(score).catch(() => {});
    return score;
  });
  promise.catch(() => { if (slot?.promise === promise) slot = null; });
  slot = { id: scoreId, promise };
}

/** 미리 연 곡이 있으면 넘겨받는다(한 번만). */
export function takePreloaded(scoreId: string): Promise<LoadedScore> | null {
  if (slot?.id !== scoreId) return null;
  const { promise } = slot;
  slot = null;
  return promise;
}

export function clearPreloaded() {
  if (!slot) return;
  const { promise } = slot;
  slot = null;
  promise.then(disposeScore, () => {});
}
