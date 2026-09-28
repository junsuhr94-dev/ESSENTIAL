import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// 악보 저장소 (IndexedDB)
//   scores : 목록에 필요한 가벼운 메타데이터 + 썸네일
//   files  : 원본(PDF 1개 또는 이미지 여러 장) — 목록 조회 시 읽지 않도록 분리
// 2단계에서 ink(필기), 3단계에서 setlists / bookmarks 스토어를 DB_VERSION 을 올리며 추가한다.

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

interface PerfectScoreDB extends DBSchema {
  scores: { key: string; value: ScoreMeta };
  files: { key: string; value: ScoreFiles };
}

const DB_NAME = 'perfect-score';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PerfectScoreDB>> | null = null;

function db() {
  dbPromise ??= openDB<PerfectScoreDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('scores', { keyPath: 'id' });
        database.createObjectStore('files', { keyPath: 'id' });
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
  const tx = (await db()).transaction(['scores', 'files'], 'readwrite');
  await Promise.all([tx.objectStore('scores').delete(id), tx.objectStore('files').delete(id), tx.done]);
}

// iPadOS 가 저장 공간 부족 시 데이터를 지우지 않도록 요청한다(설치된 PWA에서 효과적).
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
