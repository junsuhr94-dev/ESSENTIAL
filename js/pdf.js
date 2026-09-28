import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

// iOS Safari는 캔버스 하나당 약 16.7M 픽셀 제한이 있어 여유 있게 자른다.
const MAX_CANVAS_PIXELS = 12_000_000;

export async function loadPdf(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
}

// page 를 cssWidth x cssHeight 크기로 dpr 배율 캔버스에 렌더링한다.
export async function renderPage(page, canvas, cssWidth, dpr) {
  const base = page.getViewport({ scale: 1 });
  let scale = (cssWidth / base.width) * dpr;
  const pixels = base.width * base.height * scale * scale;
  if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// 악보함 썸네일용 첫 페이지 JPEG.
export async function makeThumbnail(pdf, width = 360) {
  const page = await pdf.getPage(1);
  const canvas = document.createElement('canvas');
  await renderPage(page, canvas, width, 1);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  releaseCanvas(canvas);
  return blob;
}

// iOS에서 캔버스 메모리를 즉시 돌려받으려면 크기를 0으로 만들어야 한다.
export function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}
