import { BlendMode, PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib';
import { isEmptyInk, type PageInk } from '@/core/ink/types';
import { openSource } from '@/core/document/openSource';
import { releaseCanvas, type ScoreSource } from '@/core/document/types';
import { getScore, getScoreFiles, loadInk } from '@/lib/db';
import { ensureMusicFont } from '@/lib/smufl';
import { renderInk } from '@/features/ink/renderInk';

/** 필기 이미지 해상도: PDF 1pt 당 3px(≈216dpi), 긴 변 최대 3000px */
const INK_SCALE = 3;
const MAX_PX = 3000;
/** 이미지 악보를 PDF 로 만들 때의 페이지 폭(A4, pt) */
const A4_WIDTH_PT = 595.28;

export interface ExportResult {
  blob: Blob;
  filename: string;
  annotatedPages: number;
}

/**
 * 필기를 포함한 PDF 를 만든다.
 * - PDF 악보: 원본 페이지(벡터)는 그대로 두고, 필기가 있는 페이지에만 투명 필기 이미지를
 *   곱하기(multiply) 모드로 얹는다 → 음표 선명도·용량을 유지한다.
 * - 회전된 페이지(드묾)는 필기 위치가 어긋나지 않도록 화면과 같은 방향의 이미지로 굽는다.
 * - 이미지 악보: 사진을 A4 폭 페이지로 묶고 필기를 얹는다.
 */
export async function exportAnnotatedPdf(scoreId: string): Promise<ExportResult> {
  const [meta, blobs, inkMap] = await Promise.all([getScore(scoreId), getScoreFiles(scoreId), loadInk(scoreId)]);
  if (!meta || !blobs?.length) throw new Error('missing score');
  await ensureMusicFont();

  const inkOf = (page: number) => {
    const ink = inkMap.get(page);
    return ink && !isEmptyInk(ink) ? ink : null;
  };
  let annotatedPages = 0;
  let out: PDFDocument;
  const source = await openSource(meta.kind, blobs);

  try {
    if (meta.kind === 'pdf') {
      out = await PDFDocument.load(await blobs[0].arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      const pages = out.getPages();
      for (let i = 0; i < pages.length; i++) {
        const ink = inkOf(i + 1);
        if (!ink) continue;
        annotatedPages++;
        const page = pages[i];
        if (page.getRotation().angle % 360 === 0) await overlayInk(out, page, ink);
        else await flattenPage(out, i, source, ink);
      }
    } else {
      out = await PDFDocument.create();
      for (let n = 1; n <= source.pageCount; n++) {
        const size = await source.getPageSize(n);
        const heightPt = (A4_WIDTH_PT * size.height) / size.width;
        const page = out.addPage([A4_WIDTH_PT, heightPt]);
        const img = await embedRendered(out, source, n, Math.min(size.width, 2400), 'jpeg');
        page.drawImage(img, { x: 0, y: 0, width: A4_WIDTH_PT, height: heightPt });
        const ink = inkOf(n);
        if (ink) {
          annotatedPages++;
          await overlayInk(out, page, ink);
        }
      }
    }
    out.setTitle(meta.title);
    out.setProducer('Perfect Score');
    const bytes = await out.save();
    return {
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      filename: `${safeFilename(meta.title)}${annotatedPages ? ' (필기)' : ''}.pdf`,
      annotatedPages,
    };
  } finally {
    source.destroy();
  }
}

/** 필기를 투명 PNG 로 그려 페이지의 보이는 영역(CropBox)에 얹는다. */
async function overlayInk(doc: PDFDocument, page: PDFPage, ink: PageInk) {
  const box = page.getCropBox();
  const scale = Math.min(INK_SCALE, MAX_PX / Math.max(box.width, box.height));
  const W = Math.round(box.width * scale);
  const H = Math.round(box.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  try {
    renderInk(canvas.getContext('2d')!, ink, W);
    const png = await doc.embedPng(await canvasBytes(canvas, 'image/png'));
    page.drawImage(png, { x: box.x, y: box.y, width: box.width, height: box.height, blendMode: BlendMode.Multiply });
  } finally {
    releaseCanvas(canvas);
  }
}

/** 회전된 페이지: 화면에 보이는 그대로(pdf.js 렌더 + 필기) 이미지 페이지로 교체한다. */
async function flattenPage(doc: PDFDocument, index: number, source: ScoreSource, ink: PageInk) {
  const size = await source.getPageSize(index + 1);
  const W = Math.round(Math.min(size.width * INK_SCALE, MAX_PX));
  const canvas = document.createElement('canvas');
  try {
    await source.renderPage(index + 1, canvas, W, 1);
    renderInk(canvas.getContext('2d')!, ink, canvas.width);
    const img = await doc.embedJpg(await canvasBytes(canvas, 'image/jpeg', 0.92));
    doc.removePage(index);
    const page = doc.insertPage(index, [size.width, size.height]);
    page.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
  } finally {
    releaseCanvas(canvas);
  }
}

async function embedRendered(doc: PDFDocument, source: ScoreSource, n: number, width: number, type: 'jpeg'): Promise<PDFImage> {
  const canvas = document.createElement('canvas');
  try {
    await source.renderPage(n, canvas, width, 1);
    return type === 'jpeg' ? doc.embedJpg(await canvasBytes(canvas, 'image/jpeg', 0.9)) : doc.embedPng(await canvasBytes(canvas, 'image/png'));
  } finally {
    releaseCanvas(canvas);
  }
}

async function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number) {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  if (!blob) throw new Error('canvas encode failed');
  return new Uint8Array(await blob.arrayBuffer());
}

export function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'score';
}
