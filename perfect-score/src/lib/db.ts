import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PageInk } from '@/core/ink/types';
import type { CropBox } from '@/core/render/autoCrop';

// 악보 저장소 (IndexedDB)
//   scores   : 목록에 필요한 가벼운 메타데이터 + 썸네일 + 곡별 설정(템포, 북마크, 여백 자르기)
//   files    : 원본(PDF 1개 또는 이미지 여러 장) — 목록 조회 시 읽지 않도록 분리
//   ink      : 페이지별 필기(손글씨 획, 변환된 음악 기호, 코드 네임)   (v2)
//   setlists : 공연 순서대로 묶은 곡 목록                                 (v3)

export type ScoreKind = 'pdf' | 'images';

export interface Bookmark {
  id: string;
  label: string;
  page: number;
  /** 이 북마크가 시작하는 마디 번호(선택). 마디 번호로 이동할 때 기준점이 된다. */
  measure?: number;
}

export interface ScoreMeta {
  id: string;
  title: string;
  kind: ScoreKind;
  pageCount: number;
  addedAt: number;
  openedAt: number;
  lastPage: number;
  thumb?: Blob;
  /** 메트로놈 템포·박자 */
  bpm?: number;
  beats?: number;
  bookmarks?: Bookmark[];
  /** 악보 바깥 흰 여백 자동 자르기 */
  autoCrop?: boolean;
  /** 페이지별 내용 영역(페이지 비율) — 한 번 계산해 저장 */
  crops?: Record<number, CropBox>;
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

export interface Setlist {
  id: string;
  name: string;
  scoreIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface PerfectScoreDB extends DBSchema {
  scores: { key: string; value: ScoreMeta };
  files: { key: string; value: ScoreFiles };
  ink: { key: string; value: InkRecord; indexes: { scoreId: string } };
  setlists: { key: string; value: Setlist };
}

const DB_NAME = 'perfect-score';
const DB_VERSION = 3;

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
      if (oldVersion < 3) {
        database.createObjectStore('setlists', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

// ---------------- 악보 ----------------

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

/** 악보와 필기를 지우고, 이 곡이 들어 있는 세트리스트에서도 뺀다. */
export async function deleteScore(id: string) {
  const tx = (await db()).transaction(['scores', 'files', 'ink', 'setlists'], 'readwrite');
  const inkKeys = await tx.objectStore('ink').index('scoreId').getAllKeys(id);
  const setlists = await tx.objectStore('setlists').getAll();
  await Promise.all([
    tx.objectStore('scores').delete(id),
    tx.objectStore('files').delete(id),
    ...inkKeys.map((k) => tx.objectStore('ink').delete(k)),
    ...setlists
      .filter((s) => s.scoreIds.includes(id))
      .map((s) => tx.objectStore('setlists').put({ ...s, scoreIds: s.scoreIds.filter((x) => x !== id), updatedAt: Date.now() })),
    tx.done,
  ]);
}

// ---------------- 필기 ----------------

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

export async function deleteInkOf(scoreId: string) {
  const tx = (await db()).transaction('ink', 'readwrite');
  const keys = await tx.store.index('scoreId').getAllKeys(scoreId);
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}

export async function listAllInk() {
  return (await db()).getAll('ink');
}

// ---------------- 세트리스트 ----------------

export async function listSetlists() {
  return (await db()).getAll('setlists');
}

export async function getSetlist(id: string) {
  return (await db()).get('setlists', id);
}

export async function putSetlist(setlist: Setlist) {
  await (await db()).put('setlists', { ...setlist, updatedAt: Date.now() });
}

export async function deleteSetlist(id: string) {
  await (await db()).delete('setlists', id);
}

// iPadOS 가 저장 공간 부족 시 데이터를 지우지 않도록 요청한다(설치된 PWA에서 효과적).
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
