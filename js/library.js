import * as db from './db.js';
import { loadPdf, makeThumbnail } from './pdf.js';
import { toast, prefs } from './util.js';

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const sort = document.getElementById('sort');
const fileInput = document.getElementById('file-input');
const dropOverlay = document.getElementById('drop-overlay');

let scores = [];
const thumbUrls = new Map();
let onOpen = () => {};

export function initLibrary(openScore) {
  onOpen = openScore;
  sort.value = prefs.get('sort', 'recent');
  sort.addEventListener('change', () => { prefs.set('sort', sort.value); render(); });
  search.addEventListener('input', render);
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    await importFiles(files);
  });
  initDragDrop();
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.menu')) closeMenu();
  });
}

export async function refreshLibrary() {
  scores = await db.listScores();
  render();
}

async function importFiles(files) {
  const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!pdfs.length) { toast('PDF 파일만 가져올 수 있습니다.'); return; }
  requestPersistentStorage();
  let ok = 0;
  for (const [i, file] of pdfs.entries()) {
    toast(`가져오는 중… (${i + 1}/${pdfs.length}) ${file.name}`, 60000);
    try {
      const pdf = await loadPdf(file);
      const thumb = await makeThumbnail(pdf);
      const now = Date.now();
      await db.addScore({
        id: crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`,
        title: file.name.replace(/\.pdf$/i, ''),
        pageCount: pdf.numPages,
        addedAt: now,
        openedAt: 0,
        lastPage: 1,
        thumb,
      }, file);
      pdf.destroy();
      ok++;
    } catch (err) {
      console.error(err);
      toast(`“${file.name}”을(를) 열 수 없습니다.`);
    }
  }
  if (ok) toast(`악보 ${ok}개를 추가했습니다.`);
  await refreshLibrary();
}

function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function sorted(list) {
  const out = [...list];
  if (sort.value === 'title') out.sort((a, b) => a.title.localeCompare(b.title, 'ko', { numeric: true }));
  else if (sort.value === 'added') out.sort((a, b) => b.addedAt - a.addedAt);
  else out.sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt));
  return out;
}

function render() {
  const q = search.value.trim().toLowerCase();
  const list = sorted(scores).filter((s) => !q || s.title.toLowerCase().includes(q));
  empty.hidden = scores.length > 0;

  for (const [id, url] of thumbUrls) {
    if (!scores.some((s) => s.id === id)) { URL.revokeObjectURL(url); thumbUrls.delete(id); }
  }

  grid.replaceChildren(...list.map((s) => {
    let url = thumbUrls.get(s.id);
    if (!url && s.thumb) { url = URL.createObjectURL(s.thumb); thumbUrls.set(s.id, url); }

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb"></div>
      <div class="meta">
        <div class="title"></div>
        <button class="more" aria-label="더보기">⋯</button>
      </div>`;
    if (url) card.querySelector('.thumb').style.backgroundImage = `url("${url}")`;
    const title = card.querySelector('.title');
    title.textContent = s.title;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = s.lastPage > 1 ? `${s.pageCount}쪽 · ${s.lastPage}쪽까지 봄` : `${s.pageCount}쪽`;
    title.append(sub);

    card.addEventListener('click', (e) => {
      if (e.target.closest('.more')) return;
      onOpen(s.id);
    });
    card.querySelector('.more').addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu(e.currentTarget, s);
    });
    return card;
  }));
}

let menuEl = null;

function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}

function openMenu(anchor, score) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  const items = [
    ['이름 바꾸기', () => rename(score)],
    ['처음부터 보기', async () => { await db.updateScore(score.id, { lastPage: 1 }); onOpen(score.id); }],
    ['삭제', () => remove(score), 'danger'],
  ];
  for (const [label, fn, cls] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', () => { closeMenu(); fn(); });
    menuEl.append(b);
  }
  document.body.append(menuEl);
  const r = anchor.getBoundingClientRect();
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  menuEl.style.left = `${Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8))}px`;
  menuEl.style.top = `${r.bottom + mh + 8 > innerHeight ? r.top - mh - 4 : r.bottom + 4}px`;
}

async function rename(score) {
  const title = prompt('악보 이름', score.title);
  if (title == null || !title.trim()) return;
  await db.updateScore(score.id, { title: title.trim() });
  await refreshLibrary();
}

async function remove(score) {
  if (!confirm(`“${score.title}”을(를) 삭제할까요? 필기 내용도 함께 삭제됩니다.`)) return;
  await db.deleteScore(score.id);
  await refreshLibrary();
  toast('삭제했습니다.');
}

function initDragDrop() {
  let depth = 0;
  const lib = document.getElementById('library');
  lib.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; dropOverlay.hidden = false; });
  lib.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dropOverlay.hidden = true; } });
  lib.addEventListener('dragover', (e) => e.preventDefault());
  lib.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dropOverlay.hidden = true;
    importFiles([...e.dataTransfer.files]);
  });
}
