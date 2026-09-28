import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PageInk } from '@/core/ink/types';

// 악보 저장소 (IndexedDB)
//   scores : 목록에 필요한 가벼운 메타데이터 + 썸네일
//   files  : 원본(PDF 1개 또는 이미지 여러 장) — 목록 조회 시 읽지 않도록 분리
//   ink    : 페이지별 필기(손글씨 획, 변환된 음악 기호, 코드 네임)   (v2)
// 3단계에서 setlists / bookmarks 스토어를 DB_VERSION 을 올리며 추가한다.

export type ScoreKind = 'pdf' | 'images';

export interface ScoreMeta {
  id: string;
  title: string;
  kind: ScoreKind;
  pageCount: number;
  addedAt: number;
  openedAt: number;
  lastPage: number;
  thumb?: Blob;
}

export interface ScoreFiles {
  id: string;
  blobs: Blob[];
}

export interface InkRecord {
  key: string;
  scoreId: string;
  page: number;
  ink: PageInk;
}

interface PerfectScoreDB extends DBSchema {
  scores: { key: string; value: ScoreMeta };
  files: { key: string; value: ScoreFiles };
  ink: { key: string; value: InkRecord; indexes: { scoreId: string } };
}

const DB_NAME = 'perfect-score';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<PerfectScoreDB>> | null = null;

function db() {
  dbPromise ??= openDB<PerfectScoreDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('scores', { keyPath: 'id' });
        database.createObjectStore('files', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        database.createObjectStore('ink', { keyPath: 'key' }).createIndex('scoreId', 'scoreId');
      }
    },
  });
  return dbPromise;
}

export async function listScores() {
  return (await db()).getAll('scores');
}

export async function getScore(id: string) {
  return (await db()).get('scores', id);
}

export async function getScoreFiles(id: string) {
  return (await (await db()).get('files', id))?.blobs;
}

export async function addScore(meta: ScoreMeta, blobs: Blob[]) {
  const tx = (await db()).transaction(['scores', 'files'], 'readwrite');
  await Promise.all([tx.objectStore('scores').put(meta), tx.objectStore('files').put({ id: meta.id, blobs }), tx.done]);
}

export async function updateScore(id: string, patch: Partial<Omit<ScoreMeta, 'id'>>) {
  const tx = (await db()).transaction('scores', 'readwrite');
  const cur = await tx.store.get(id);
  if (cur) await tx.store.put({ ...cur, ...patch });
  await tx.done;
}

export async function deleteScore(id: string) {
  const tx = (await db()).transaction(['scores', 'files', 'ink'], 'readwrite');
  const inkKeys = await tx.objectStore('ink').index('scoreId').getAllKeys(id);
  await Promise.all([
    tx.objectStore('scores').delete(id),
    tx.objectStore('files').delete(id),
    ...inkKeys.map((k) => tx.objectStore('ink').delete(k)),
    tx.done,
  ]);
}

export async function loadInk(scoreId: string): Promise<Map<number, PageInk>> {
  const recs = await (await db()).getAllFromIndex('ink', 'scoreId', scoreId);
  return new Map(recs.map((r) => [r.page, r.ink]));
}

export async function saveInk(scoreId: string, page: number, ink: PageInk | null) {
  const key = `${scoreId}:${page}`;
  const database = await db();
  if (ink) await database.put('ink', { key, scoreId, page, ink });
  else await database.delete('ink', key);
}

// iPadOS 가 저장 공간 부족 시 데이터를 지우지 않도록 요청한다(설치된 PWA에서 효과적).
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
