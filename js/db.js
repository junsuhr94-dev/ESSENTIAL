// IndexedDB 저장소: 악보 메타데이터, PDF 원본, 페이지별 필기 데이터.
//   scores : { id, title, pageCount, addedAt, openedAt, lastPage, thumb: Blob }
//   files  : { id, blob }                    — 목록을 가볍게 읽도록 원본은 분리
//   ink    : { key: "id:page", scoreId, page, strokes: [...] }

const DB_NAME = 'sheet-music';
const DB_VERSION = 1;

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('scores', { keyPath: 'id' });
        db.createObjectStore('files', { keyPath: 'id' });
        const ink = db.createObjectStore('ink', { keyPath: 'key' });
        ink.createIndex('scoreId', 'scoreId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function listScores() {
  return done((await store('scores')).getAll());
}

export async function getScore(id) {
  return done((await store('scores')).get(id));
}

export async function getFile(id) {
  const rec = await done((await store('files')).get(id));
  return rec && rec.blob;
}

export async function addScore(score, blob) {
  const db = await open();
  const tx = db.transaction(['scores', 'files'], 'readwrite');
  tx.objectStore('scores').put(score);
  tx.objectStore('files').put({ id: score.id, blob });
  await txDone(tx);
}

export async function updateScore(id, patch) {
  const db = await open();
  const tx = db.transaction('scores', 'readwrite');
  const s = tx.objectStore('scores');
  const cur = await done(s.get(id));
  if (cur) s.put({ ...cur, ...patch });
  await txDone(tx);
}

export async function deleteScore(id) {
  const db = await open();
  const tx = db.transaction(['scores', 'files', 'ink'], 'readwrite');
  tx.objectStore('scores').delete(id);
  tx.objectStore('files').delete(id);
  const idx = tx.objectStore('ink').index('scoreId');
  const keys = await done(idx.getAllKeys(id));
  for (const k of keys) tx.objectStore('ink').delete(k);
  await txDone(tx);
}

export async function getInk(scoreId) {
  const idx = (await store('ink')).index('scoreId');
  const recs = await done(idx.getAll(scoreId));
  const map = new Map();
  for (const r of recs) map.set(r.page, r.strokes);
  return map;
}

export async function putInk(scoreId, page, strokes) {
  const s = await store('ink', 'readwrite');
  const key = `${scoreId}:${page}`;
  await done(strokes.length ? s.put({ key, scoreId, page, strokes }) : s.delete(key));
}
