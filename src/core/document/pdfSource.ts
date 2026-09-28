// iPadOS 구버전 사파리 호환을 위해 legacy 빌드를 쓴다. 워커는 별도 파일로 번들되어 오프라인 프리캐시에 포함된다.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { canvasPixelSize, type PageSize, type ScoreSource } from './types';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdfSource(blob: Blob): Promise<ScoreSource> {
  const data = new Uint8Array(await blob.arrayBuffer());
  // enableHWA: 캔버스를 GPU 가속 모드로 만들어 렌더링·합성 속도를 높인다(요구사항: 하드웨어 가속).
  const task = getDocument({ data, enableHWA: true });
  const pdf: PDFDocumentProxy = await task.promise;
  const sizes = new Map<number, PageSize>();

  async function getPageSize(n: number) {
    let size = sizes.get(n);
    if (!size) {
      const vp = (await pdf.getPage(n)).getViewport({ scale: 1 });
      size = { width: vp.width, height: vp.height };
      sizes.set(n, size);
    }
    return size;
  }

  return {
    pageCount: pdf.numPages,
    getPageSize,
    async renderPage(n, canvas, cssWidth, dpr) {
      const page = await pdf.getPage(n);
      const { scale, width, height } = canvasPixelSize(await getPageSize(n), cssWidth, dpr);
      canvas.width = width;
      canvas.height = height;
      await page.render({ canvas, viewport: page.getViewport({ scale }), background: '#ffffff' }).promise;
    },
    destroy() {
      void task.destroy();
    },
  };
}
