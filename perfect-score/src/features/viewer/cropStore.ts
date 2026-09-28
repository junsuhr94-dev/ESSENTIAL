import type { ScoreSource } from '@/core/document/types';
import { releaseCanvas } from '@/core/document/types';
import { detectContentBox, FULL_PAGE, type CropBox } from '@/core/render/autoCrop';
import { updateScore } from '@/lib/db';

/** 여백 찾기용 저해상도 폭(px) — 페이지당 수십 ms */
const PROBE_WIDTH = 260;

/**
 * 페이지별 여백 자르기 상자를 계산·캐시하고 DB 에 저장한다.
 * 한 번 계산한 페이지는 다음에 열 때 바로 쓴다.
 */
export class CropStore {
  private boxes = new Map<number, Promise<CropBox>>();
  private saved: Record<number, CropBox>;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private source: ScoreSource;
  private scoreId: string;

  constructor(source: ScoreSource, scoreId: string, saved: Record<number, CropBox> = {}) {
    this.source = source;
    this.scoreId = scoreId;
    this.saved = { ...saved };
    for (const [page, box] of Object.entries(saved)) this.boxes.set(Number(page), Promise.resolve(box));
  }

  get = (page: number): Promise<CropBox> => {
    let p = this.boxes.get(page);
    if (!p) {
      p = this.detect(page).catch(() => FULL_PAGE);
      this.boxes.set(page, p);
    }
    return p;
  };

  /** 전체 페이지를 한가할 때 순서대로 미리 계산한다. */
  async warmUp(signal: { cancelled: boolean }) {
    for (let page = 1; page <= this.source.pageCount; page++) {
      if (signal.cancelled) return;
      await this.get(page);
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  private async detect(page: number): Promise<CropBox> {
    const canvas = document.createElement('canvas');
    try {
      await this.source.renderPage(page, canvas, PROBE_WIDTH, 1);
      const ctx = canvas.getContext('2d')!;
      const box = detectContentBox(ctx.getImageData(0, 0, canvas.width, canvas.height));
      this.saved[page] = box;
      this.scheduleSave();
      return box;
    } finally {
      releaseCanvas(canvas);
    }
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void updateScore(this.scoreId, { crops: this.saved }), 1000);
  }
}
