import * as db from './db.js';
import { loadPdf, renderPage, releaseCanvas } from './pdf.js';
import {
  drawStrokes, drawStroke, hitStrokes, round,
  PEN_COLORS, HIGHLIGHTER_COLORS, PEN_SIZES, HIGHLIGHTER_SIZES, ERASER_SIZES,
} from './ink.js';
import { toast, prefs } from './util.js';

const $ = (id) => document.getElementById(id);
const viewerEl = $('viewer');
const stage = $('stage');
const spreadEl = $('spread');
const titleEl = $('viewer-title');
const indicator = $('page-indicator');
const slider = $('page-slider');
const layoutBtn = $('layout-btn');
const annotateBtn = $('annotate-btn');
const inkBar = $('ink-bar');
const undoBtn = $('undo');
const redoBtn = $('redo');
const fingerDrawBox = $('finger-draw');

const LAYOUT_LABELS = { auto: '▯▯ 자동', single: '▯ 한 쪽', double: '▯▯ 두 쪽' };
const LAYOUT_ORDER = ['auto', 'single', 'double'];
const CACHE_SIZE = 6; // 현재 + 다음 + 이전 화면(두 쪽 보기 기준)
const PALM_GUARD_MS = 600;

const tools = {
  pen: { colors: PEN_COLORS, sizes: PEN_SIZES },
  highlighter: { colors: HIGHLIGHTER_COLORS, sizes: HIGHLIGHTER_SIZES },
  eraser: { colors: [], sizes: ERASER_SIZES },
};

let onClose = () => {};

// 현재 연 악보 상태
let score = null;
let pdf = null;
let current = 1;            // 현재 화면의 첫 페이지(1부터)
let visible = [];           // [{ page, el, pdfCanvas, inkCanvas, cssW, cssH }]
let showToken = 0;
const pageSizes = new Map(); // page -> { w, h } (PDF 기본 크기)
const cache = new Map();      // `${page}|${cssW}` -> Promise<canvas>
let ink = new Map();          // page -> strokes[]
let undoStack = [];
let redoStack = [];

// 설정
let layout = prefs.get('layout', 'auto');
let annotating = false;
let tool = prefs.get('tool', 'pen');
const toolColor = prefs.get('toolColor', { pen: 0, highlighter: 0 });
const toolSize = prefs.get('toolSize', { pen: 1, highlighter: 1, eraser: 1 });
let fingerDraw = prefs.get('fingerDraw', false);

// 입력 상태
const liveCanvas = document.createElement('canvas');
let stroke = null;            // 그리는 중인 스트로크 { slot, data, before }
let lastPenAt = 0;
const gestures = new Map();   // pointerId -> { x, y, t }
let indicatorTimer;
let saveTimer;
let wakeLock = null;

export function initViewer(close) {
  onClose = close;
  $('back').addEventListener('click', closeViewer);
  layoutBtn.addEventListener('click', cycleLayout);
  annotateBtn.addEventListener('click', () => setAnnotating(!annotating));
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  $('clear-page').addEventListener('click', clearVisiblePages);
  fingerDrawBox.checked = fingerDraw;
  fingerDrawBox.addEventListener('change', () => { fingerDraw = fingerDrawBox.checked; prefs.set('fingerDraw', fingerDraw); });
  for (const b of inkBar.querySelectorAll('.tool')) b.addEventListener('click', () => setTool(b.dataset.tool));

  slider.addEventListener('input', () => showIndicator(Number(slider.value)));
  slider.addEventListener('change', () => { goTo(Number(slider.value)); slider.blur(); });

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerCancel);
  // iOS 사파리의 길게 누르기/더블탭 확대 방지
  stage.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', onKey);
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (!score) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { clearCache(); alignCurrent(); show(); }, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (score && document.visibilityState === 'visible') keepAwake();
    if (score && document.visibilityState === 'hidden') saveProgress();
  });

  liveCanvas.style.pointerEvents = 'none';
  liveCanvas.style.mixBlendMode = 'multiply';
  updateLayoutButton();
  updateToolUI();
}

export async function openViewer(id) {
  const [meta, blob, inkMap] = await Promise.all([db.getScore(id), db.getFile(id), db.getInk(id)]);
  if (!meta || !blob) { toast('악보 파일을 찾을 수 없습니다.'); return false; }
  try {
    pdf = await loadPdf(blob);
  } catch (err) {
    console.error(err);
    toast('PDF를 열 수 없습니다.');
    return false;
  }
  score = meta;
  ink = inkMap;
  undoStack = [];
  redoStack = [];
  pageSizes.clear();
  titleEl.textContent = meta.title;
  slider.max = String(pdf.numPages);
  current = Math.min(Math.max(1, meta.lastPage || 1), pdf.numPages);
  viewerEl.hidden = false;
  viewerEl.classList.remove('chrome-hidden');
  setAnnotating(false);
  alignCurrent();
  await show();
  keepAwake();
  db.updateScore(id, { openedAt: Date.now() });
  return true;
}

async function closeViewer() {
  if (!score) return;
  finishStroke();
  await saveProgress();
  showToken++;
  clearCache();
  for (const v of visible) releaseCanvas(v.inkCanvas);
  visible = [];
  spreadEl.replaceChildren();
  pdf.destroy();
  pdf = null;
  score = null;
  releaseWakeLock();
  viewerEl.hidden = true;
  onClose();
}

// ---------- 페이지 배치와 렌더링 ----------

function isDouble() {
  if (layout === 'double') return true;
  if (layout === 'single') return false;
  return innerWidth > innerHeight;
}

function step() {
  return isDouble() ? 2 : 1;
}

// 두 쪽 보기에서는 1-2, 3-4 … 로 묶이도록 홀수 페이지에서 시작한다.
function alignCurrent() {
  if (isDouble() && current % 2 === 0) current -= 1;
}

function pagesAt(first) {
  const out = [first];
  if (isDouble() && first + 1 <= pdf.numPages) out.push(first + 1);
  return out;
}

async function pageSize(n) {
  if (!pageSizes.has(n)) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    pageSizes.set(n, { w: vp.width, h: vp.height });
  }
  return pageSizes.get(n);
}

async function computeLayout(pages) {
  const sizes = await Promise.all(pages.map(pageSize));
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const totalW = sizes.reduce((a, s) => a + s.w, 0);
  const maxH = Math.max(...sizes.map((s) => s.h));
  const scale = Math.min(W / totalW, H / maxH);
  return sizes.map((s) => ({ cssW: Math.floor(s.w * scale), cssH: Math.floor(s.h * scale) }));
}

function dpr() {
  return Math.min(window.devicePixelRatio || 1, 3);
}

function getRendered(page, cssW) {
  const key = `${page}|${cssW}`;
  if (cache.has(key)) {
    const p = cache.get(key);
    cache.delete(key); // LRU: 최근 사용으로 이동
    cache.set(key, p);
    return p;
  }
  const p = pdf.getPage(page).then((pg) => renderPage(pg, document.createElement('canvas'), cssW, dpr()));
  cache.set(key, p);
  trimCache();
  return p;
}

function trimCache() {
  const inUse = new Set(spreadEl.querySelectorAll('canvas'));
  for (const [key, p] of cache) {
    if (cache.size <= CACHE_SIZE) break;
    cache.delete(key);
    p.then((c) => { if (!inUse.has(c)) releaseCanvas(c); }).catch(() => {});
  }
}

function clearCache() {
  for (const p of cache.values()) p.then(releaseCanvas).catch(() => {});
  cache.clear();
}

async function show() {
  const token = ++showToken;
  const pages = pagesAt(current);
  const dims = await computeLayout(pages);
  if (token !== showToken) return;

  const old = visible;
  visible = pages.map((page, i) => {
    const { cssW, cssH } = dims[i];
    const el = document.createElement('div');
    el.className = 'page-slot';
    el.style.width = `${cssW}px`;
    el.style.height = `${cssH}px`;
    const inkCanvas = document.createElement('canvas');
    inkCanvas.style.mixBlendMode = 'multiply';
    el.append(inkCanvas);
    return { page, el, pdfCanvas: null, inkCanvas, cssW, cssH };
  });
  for (const v of old) releaseCanvas(v.inkCanvas);

  // 이미 렌더링된 페이지는 즉시 교체하고, 아니면 다 그려질 때까지 이전 화면을 유지한다.
  const renders = visible.map((v) => getRendered(v.page, v.cssW));
  const ready = await Promise.race([
    Promise.all(renders).then(() => true),
    new Promise((r) => setTimeout(() => r(false), 250)),
  ]);
  if (token !== showToken) return;
  if (!ready) {
    for (const v of visible) {
      const l = document.createElement('div');
      l.className = 'loading';
      l.textContent = `${v.page}쪽 불러오는 중…`;
      v.el.prepend(l);
    }
    spreadEl.replaceChildren(...visible.map((v) => v.el));
    for (const v of visible) redrawInk(v);
  }

  let canvases;
  try {
    canvases = await Promise.all(renders);
  } catch (err) {
    console.error(err);
    toast('페이지를 그리는 중 오류가 발생했습니다.');
    return;
  }
  if (token !== showToken) return;
  visible.forEach((v, i) => {
    v.pdfCanvas = canvases[i];
    v.el.querySelector('.loading')?.remove();
    v.el.prepend(v.pdfCanvas);
  });
  if (ready) {
    spreadEl.replaceChildren(...visible.map((v) => v.el));
    for (const v of visible) redrawInk(v);
  }

  updatePageUI();
  prefetch(token);
}

// 다음/이전 화면을 미리 그려 페이지 넘김을 즉시 처리한다.
async function prefetch(token) {
  const targets = [current + step(), current - step()].filter((p) => p >= 1 && p <= pdf.numPages);
  for (const first of targets) {
    const pages = pagesAt(first);
    const dims = await computeLayout(pages);
    if (token !== showToken) return;
    for (let i = 0; i < pages.length; i++) {
      await getRendered(pages[i], dims[i].cssW).catch(() => {});
      if (token !== showToken) return;
    }
  }
}

function goTo(page) {
  if (!pdf) return;
  const target = Math.min(Math.max(1, page), pdf.numPages);
  const prev = current;
  current = target;
  alignCurrent();
  if (current === prev) return;
  finishStroke();
  show();
  scheduleSave();
}

function turn(dir) {
  if (!pdf) return;
  const next = current + dir * step();
  if (next < 1 || next > pdf.numPages) {
    showIndicator();
    return;
  }
  if (!annotating) viewerEl.classList.add('chrome-hidden');
  goTo(next);
}

function updatePageUI() {
  slider.value = String(current);
  showIndicator();
}

function showIndicator(page = current) {
  const pages = pdf ? pagesAt(page) : [page];
  const label = pages.length > 1 ? `${pages[0]}–${pages[1]}` : `${pages[0]}`;
  indicator.textContent = `${label} / ${pdf ? pdf.numPages : ''}`;
  indicator.classList.remove('faded');
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => {
    if (viewerEl.classList.contains('chrome-hidden')) indicator.classList.add('faded');
  }, 1500);
}

function toggleChrome() {
  viewerEl.classList.toggle('chrome-hidden');
  showIndicator();
}

function cycleLayout() {
  layout = LAYOUT_ORDER[(LAYOUT_ORDER.indexOf(layout) + 1) % LAYOUT_ORDER.length];
  prefs.set('layout', layout);
  updateLayoutButton();
  alignCurrent();
  show();
}

function updateLayoutButton() {
  layoutBtn.textContent = LAYOUT_LABELS[layout];
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProgress, 800);
}

async function saveProgress() {
  clearTimeout(saveTimer);
  if (score) await db.updateScore(score.id, { lastPage: current });
}

// ---------- 화면 꺼짐 방지 ----------

async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* 지원하지 않거나 거부됨 */ }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

// ---------- 키보드 / 블루투스 페달 ----------

function onKey(e) {
  if (!score) return;
  if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if (mod) return;
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
      e.preventDefault(); turn(1); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
      e.preventDefault(); turn(-1); break;
    case 'Home': e.preventDefault(); goTo(1); break;
    case 'End': e.preventDefault(); goTo(pdf.numPages); break;
    case 'Escape':
      if (annotating) setAnnotating(false); else closeViewer();
      break;
  }
}

// ---------- 터치 / Apple Pencil 입력 ----------

function wantsInk(e) {
  if (e.pointerType === 'pen') return true; // Apple Pencil은 언제나 바로 필기
  if (!annotating) return false;
  if (e.pointerType === 'mouse') return e.button === 0;
  return fingerDraw;
}

function slotAt(x, y) {
  for (const v of visible) {
    const r = v.el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { v, r };
  }
  return null;
}

function onPointerDown(e) {
  if (stroke) return;
  if (e.pointerType === 'pen') lastPenAt = e.timeStamp;

  if (wantsInk(e)) {
    const hit = slotAt(e.clientX, e.clientY);
    if (!hit) return;
    stage.setPointerCapture(e.pointerId);
    startStroke(e, hit);
    return;
  }
  // 펜을 쓰는 중에 닿은 손바닥은 무시한다.
  if (e.pointerType === 'touch' && e.timeStamp - lastPenAt < PALM_GUARD_MS) return;
  gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp, multi: gestures.size > 0 });
  for (const g of gestures.values()) if (gestures.size > 1) g.multi = true;
}

function onPointerMove(e) {
  if (stroke && e.pointerId === stroke.pointerId) {
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) extendStroke(ev);
    if (stroke.data) scheduleLiveDraw();
    if (e.pointerType === 'pen') lastPenAt = e.timeStamp;
  }
}

function onPointerUp(e) {
  if (stroke && e.pointerId === stroke.pointerId) {
    extendStroke(e);
    if (e.pointerType === 'pen') lastPenAt = e.timeStamp;
    finishStroke();
    return;
  }
  const g = gestures.get(e.pointerId);
  if (!g) return;
  gestures.delete(e.pointerId);
  if (g.multi) return;
  if (e.pointerType === 'touch' && e.timeStamp - lastPenAt < PALM_GUARD_MS) return;

  const dx = e.clientX - g.x;
  const dy = e.clientY - g.y;
  const dt = e.timeStamp - g.t;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 800) {
    turn(dx < 0 ? 1 : -1);
  } else if (Math.hypot(dx, dy) < 12 && dt < 500) {
    const fx = e.clientX / stage.clientWidth;
    if (fx < 0.3) turn(-1);
    else if (fx > 0.7) turn(1);
    else toggleChrome();
  }
}

function onPointerCancel(e) {
  gestures.delete(e.pointerId);
  if (stroke && e.pointerId === stroke.pointerId) finishStroke();
}

function toPagePoint(ev, r) {
  const x = (ev.clientX - r.left) / r.width;
  const y = (ev.clientY - r.top) / r.height;
  const pressure = ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5;
  // 페이지 밖으로 나간 부분은 캔버스에서 잘리므로 좌표를 자르지 않는다.
  return [round(x), round(y), round(pressure)];
}

function startStroke(e, { v, r }) {
  const strokes = ink.get(v.page) || [];
  const t = tool;
  stroke = {
    pointerId: e.pointerId,
    slot: v,
    rect: r,
    before: strokes.slice(),
    erased: false,
    data: t === 'eraser' ? null : {
      tool: t,
      color: tools[t].colors[toolColor[t]] || tools[t].colors[0],
      width: tools[t].sizes[toolSize[t]],
      points: [],
    },
  };
  if (stroke.data) {
    liveCanvas.width = v.inkCanvas.width;
    liveCanvas.height = v.inkCanvas.height;
    v.el.append(liveCanvas);
  }
  extendStroke(e);
  if (stroke.data) scheduleLiveDraw();
}

function extendStroke(ev) {
  const [x, y, p] = toPagePoint(ev, stroke.rect);
  if (stroke.data) {
    const pts = stroke.data.points;
    const n = pts.length;
    if (n >= 3 && pts[n - 3] === x && pts[n - 2] === y) return;
    pts.push(x, y, p);
  } else {
    const v = stroke.slot;
    const strokes = ink.get(v.page) || [];
    const hits = hitStrokes(strokes, x, y, ERASER_SIZES[toolSize.eraser] / 2, v.cssH / v.cssW);
    if (hits.length) {
      const hitSet = new Set(hits);
      ink.set(v.page, strokes.filter((_, i) => !hitSet.has(i)));
      stroke.erased = true;
      redrawInk(v);
    }
  }
}

let liveFrame = 0;
function scheduleLiveDraw() {
  if (liveFrame) return;
  liveFrame = requestAnimationFrame(() => {
    liveFrame = 0;
    if (!stroke || !stroke.data) return;
    const ctx = liveCanvas.getContext('2d');
    ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    drawStroke(ctx, stroke.data, liveCanvas.width, liveCanvas.height);
  });
}

function finishStroke() {
  if (!stroke) return;
  const s = stroke;
  stroke = null;
  liveCanvas.remove();
  const page = s.slot.page;
  if (s.data && s.data.points.length) {
    const strokes = (ink.get(page) || []).slice();
    strokes.push(s.data);
    ink.set(page, strokes);
    redrawInk(s.slot);
  } else if (!s.erased) {
    return;
  }
  pushHistory(page, s.before, ink.get(page) || []);
  db.putInk(score.id, page, ink.get(page) || []);
}

function redrawInk(v) {
  const w = Math.round(v.cssW * Math.min(dpr(), 2));
  const h = Math.round(v.cssH * Math.min(dpr(), 2));
  if (v.inkCanvas.width !== w || v.inkCanvas.height !== h) {
    v.inkCanvas.width = w;
    v.inkCanvas.height = h;
  }
  drawStrokes(v.inkCanvas.getContext('2d'), ink.get(v.page) || [], w, h);
}

// ---------- 실행 취소 ----------

function pushHistory(page, before, after) {
  undoStack.push({ page, before, after });
  if (undoStack.length > 200) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function applyHistory(entry, strokes) {
  ink.set(entry.page, strokes);
  db.putInk(score.id, entry.page, strokes);
  const v = visible.find((x) => x.page === entry.page);
  if (v) redrawInk(v); else goTo(entry.page);
  updateHistoryButtons();
}

function undo() {
  if (!score || stroke) return;
  const e = undoStack.pop();
  if (!e) return;
  redoStack.push(e);
  applyHistory(e, e.before);
}

function redo() {
  if (!score || stroke) return;
  const e = redoStack.pop();
  if (!e) return;
  undoStack.push(e);
  applyHistory(e, e.after);
}

function updateHistoryButtons() {
  undoBtn.disabled = !undoStack.length;
  redoBtn.disabled = !redoStack.length;
}

function clearVisiblePages() {
  const targets = visible.filter((v) => (ink.get(v.page) || []).length);
  if (!targets.length) { toast('지울 필기가 없습니다.'); return; }
  if (!confirm('보이는 페이지의 필기를 모두 지울까요?')) return;
  for (const v of targets) {
    pushHistory(v.page, ink.get(v.page), []);
    ink.set(v.page, []);
    db.putInk(score.id, v.page, []);
    redrawInk(v);
  }
}

// ---------- 필기 도구 UI ----------

function setAnnotating(on) {
  annotating = on;
  annotateBtn.setAttribute('aria-pressed', String(on));
  inkBar.hidden = !on;
  if (on) viewerEl.classList.remove('chrome-hidden');
  updateHistoryButtons();
}

function setTool(t) {
  tool = t;
  prefs.set('tool', t);
  updateToolUI();
}

function updateToolUI() {
  for (const b of inkBar.querySelectorAll('.tool')) b.setAttribute('aria-checked', String(b.dataset.tool === tool));

  const colors = $('colors');
  colors.hidden = !tools[tool].colors.length;
  colors.replaceChildren(...tools[tool].colors.map((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c;
    b.setAttribute('aria-label', `색 ${i + 1}`);
    b.setAttribute('aria-checked', String(i === toolColor[tool]));
    b.addEventListener('click', () => { toolColor[tool] = i; prefs.set('toolColor', toolColor); updateToolUI(); });
    return b;
  }));

  const sizes = $('sizes');
  sizes.replaceChildren(...tools[tool].sizes.map((_, i) => {
    const b = document.createElement('button');
    b.className = 'size-btn';
    b.setAttribute('aria-label', ['가늘게', '보통', '굵게'][i]);
    b.setAttribute('aria-checked', String(i === toolSize[tool]));
    const dot = document.createElement('span');
    const d = 6 + i * 6;
    dot.style.width = dot.style.height = `${d}px`;
    b.append(dot);
    b.addEventListener('click', () => { toolSize[tool] = i; prefs.set('toolSize', toolSize); updateToolUI(); });
    return b;
  }));
}
