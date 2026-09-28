import { releaseCanvas, type ScoreSource } from '../document/types';

/**
 * 렌더링된 페이지 캔버스의 LRU 캐시.
 * - 다음/이전 화면을 미리 그려 두면 페달을 밟는 즉시 캔버스를 교체만 하므로 지연이 없다.
 * - 화면에 붙어 있는(isConnected) 캔버스는 밀려나도 메모리를 해제하지 않는다.
 * - iOS 는 전체 캔버스 메모리 한도가 낮으므로 capacity 를 작게 유지한다.
 */
export class RenderCache {
  private entries = new Map<string, Promise<HTMLCanvasElement>>();
  private source: ScoreSource;
  private capacity: number;
  private createCanvas: () => HTMLCanvasElement;
  private destroyed = false;

  constructor(
    source: ScoreSource,
    capacity = 8,
    createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
  ) {
    this.source = source;
    this.capacity = capacity;
    this.createCanvas = createCanvas;
  }

  static key(page: number, cssWidth: number, dpr: number) {
    return `${page}@${cssWidth}x${dpr}`;
  }

  get(page: number, cssWidth: number, dpr: number): Promise<HTMLCanvasElement> {
    const key = RenderCache.key(page, cssWidth, dpr);
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.then((c) => (c.width === 0 ? this.rerender(key, page, cssWidth, dpr) : c));
    }
    return this.rerender(key, page, cssWidth, dpr);
  }

  has(page: number, cssWidth: number, dpr: number) {
    return this.entries.has(RenderCache.key(page, cssWidth, dpr));
  }

  get size() {
    return this.entries.size;
  }

  private rerender(key: string, page: number, cssWidth: number, dpr: number) {
    const canvas = this.createCanvas();
    canvas.className = 'score-canvas';
    const p = this.source.renderPage(page, canvas, cssWidth, dpr).then(() => canvas);
    p.catch(() => this.entries.delete(key));
    this.entries.set(key, p);
    this.trim();
    return p;
  }

  private trim() {
    for (const [key, p] of this.entries) {
      if (this.entries.size <= this.capacity) break;
      this.entries.delete(key);
      p.then((c) => { if (!c.isConnected) releaseCanvas(c); }).catch(() => {});
    }
  }

  clear() {
    for (const p of this.entries.values()) p.then((c) => { if (!c.isConnected) releaseCanvas(c); }).catch(() => {});
    this.entries.clear();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const p of this.entries.values()) p.then(releaseCanvas).catch(() => {});
    this.entries.clear();
  }
}
