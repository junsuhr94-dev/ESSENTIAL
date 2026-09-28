import type { Bookmark } from '@/lib/db';

/** 목록에서 from 위치의 항목을 to 위치로 옮긴다 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(Math.min(Math.max(0, to), out.length), 0, item);
  return out;
}

/**
 * 마디 번호 → 페이지.
 * 마디 번호가 적힌 북마크 중 목표 마디 이하에서 가장 가까운 것의 페이지로 간다.
 * (예: 1마디=1쪽, 17마디=2쪽, 33마디=3쪽 → 25마디는 2쪽)
 */
export function pageForMeasure(bookmarks: Bookmark[] | undefined, measure: number): Bookmark | null {
  let best: Bookmark | null = null;
  for (const b of bookmarks ?? []) {
    if (b.measure == null || b.measure > measure) continue;
    if (!best || b.measure > best.measure! || (b.measure === best.measure && b.page < best.page)) best = b;
  }
  return best;
}

export function sortBookmarks(bookmarks: Bookmark[] | undefined) {
  return [...(bookmarks ?? [])].sort((a, b) => a.page - b.page || (a.measure ?? 0) - (b.measure ?? 0));
}
