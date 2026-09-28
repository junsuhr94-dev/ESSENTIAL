export interface PageSize {
  /** PDF 포인트(또는 이미지 픽셀) 단위의 원본 크기 */
  width: number;
  height: number;
}

/**
 * 악보 원본(PDF, 이미지 묶음)을 뷰어가 동일하게 다루기 위한 추상화.
 * 페이지 번호는 1부터 시작한다.
 */
export interface ScoreSource {
  readonly pageCount: number;
  getPageSize(page: number): Promise<PageSize>;
  /** cssWidth(CSS px) 폭으로, dpr 배율의 해상도로 canvas 에 그린다. */
  renderPage(page: number, canvas: HTMLCanvasElement, cssWidth: number, dpr: number): Promise<void>;
  destroy(): void;
}

// iOS Safari 는 캔버스 1개당 약 16.7M 픽셀 제한이 있어 여유 있게 제한한다.
export const MAX_CANVAS_PIXELS = 12_000_000;

/** 캔버스 픽셀 크기 계산(메모리 상한 적용). */
export function canvasPixelSize(size: PageSize, cssWidth: number, dpr: number) {
  let scale = (cssWidth / size.width) * dpr;
  const pixels = size.width * size.height * scale * scale;
  if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
  return { scale, width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)) };
}

/** iOS 에서 캔버스 메모리를 즉시 반환하려면 크기를 0 으로 만들어야 한다. */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}
