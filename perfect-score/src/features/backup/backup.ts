import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  addScore,
  deleteInkOf,
  getScoreFiles,
  listAllInk,
  listScores,
  listSetlists,
  putSetlist,
  requestPersistentStorage,
  saveInk,
  type InkRecord,
  type ScoreMeta,
  type Setlist,
} from '@/lib/db';

/**
 * 전체 백업 파일(.psbackup = ZIP)
 *   manifest.json            목록·메타데이터·필기·세트리스트
 *   files/<scoreId>/<n>      악보 원본(PDF / 이미지)
 *   thumbs/<scoreId>.jpg     썸네일
 * PDF·JPEG 는 이미 압축돼 있으므로 압축하지 않고(level 0) 빠르게 묶는다.
 */

const APP = 'perfect-score';
const FORMAT = 1;
export const BACKUP_EXT = '.psbackup';

interface ManifestScore {
  meta: Omit<ScoreMeta, 'thumb'>;
  files: { path: string; type: string }[];
  thumb?: string;
}

interface Manifest {
  app: typeof APP;
  format: number;
  exportedAt: string;
  scores: ManifestScore[];
  ink: InkRecord[];
  setlists: Setlist[];
}

export interface BackupResult {
  blob: Blob;
  filename: string;
  scores: number;
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

export async function createBackup(onProgress?: (done: number, total: number) => void): Promise<BackupResult> {
  const [scores, ink, setlists] = await Promise.all([listScores(), listAllInk(), listSetlists()]);
  const zip: Zippable = {};
  const manifest: Manifest = { app: APP, format: FORMAT, exportedAt: new Date().toISOString(), scores: [], ink, setlists };

  for (const [i, s] of scores.entries()) {
    onProgress?.(i, scores.length);
    const blobs = (await getScoreFiles(s.id)) ?? [];
    const { thumb, ...meta } = s;
    const entry: ManifestScore = { meta, files: [] };
    for (const [n, blob] of blobs.entries()) {
      const path = `files/${s.id}/${n}`;
      zip[path] = [await bytes(blob), { level: 0 }];
      entry.files.push({ path, type: blob.type || (s.kind === 'pdf' ? 'application/pdf' : 'image/jpeg') });
    }
    if (thumb) {
      entry.thumb = `thumbs/${s.id}.jpg`;
      zip[entry.thumb] = [await bytes(thumb), { level: 0 }];
    }
    manifest.scores.push(entry);
  }
  zip['manifest.json'] = strToU8(JSON.stringify(manifest));
  onProgress?.(scores.length, scores.length);

  const data = zipSync(zip);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return { blob: new Blob([data as BlobPart], { type: 'application/zip' }), filename: `perfect-score-backup-${date}${BACKUP_EXT}`, scores: scores.length };
}

export interface RestoreResult {
  scores: number;
  inkPages: number;
  setlists: number;
}

/**
 * 백업 파일을 복원한다. 같은 악보(같은 id)는 백업 내용으로 덮어쓰고, 나머지 악보는 그대로 둔다.
 */
export async function restoreBackup(file: Blob): Promise<RestoreResult> {
  const files = unzipSync(await bytes(file));
  const raw = files['manifest.json'];
  if (!raw) throw new Error('Perfect Score 백업 파일이 아닙니다.');
  const manifest = JSON.parse(strFromU8(raw)) as Manifest;
  if (manifest.app !== APP) throw new Error('Perfect Score 백업 파일이 아닙니다.');
  if (manifest.format > FORMAT) throw new Error('더 새로운 버전에서 만든 백업입니다. 앱을 업데이트해 주세요.');
  requestPersistentStorage();

  let scores = 0;
  for (const s of manifest.scores) {
    const blobs = s.files.map((f) => {
      const data = files[f.path];
      if (!data) throw new Error(`백업 파일이 손상되었습니다: ${f.path}`);
      return new Blob([data as BlobPart], { type: f.type });
    });
    const thumbData = s.thumb ? files[s.thumb] : undefined;
    await addScore({ ...s.meta, thumb: thumbData ? new Blob([thumbData as BlobPart], { type: 'image/jpeg' }) : undefined }, blobs);
    await deleteInkOf(s.meta.id); // 이 곡의 필기는 백업 내용으로 교체
    scores++;
  }
  const restored = new Set(manifest.scores.map((s) => s.meta.id));
  let inkPages = 0;
  for (const r of manifest.ink) {
    if (!restored.has(r.scoreId)) continue;
    await saveInk(r.scoreId, r.page, r.ink);
    inkPages++;
  }
  for (const sl of manifest.setlists) await putSetlist(sl);
  return { scores, inkPages, setlists: manifest.setlists.length };
}
