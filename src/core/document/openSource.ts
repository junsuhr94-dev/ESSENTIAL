import type { ScoreKind } from '@/lib/db';
import type { ScoreSource } from './types';

export async function openSource(kind: ScoreKind, blobs: Blob[]): Promise<ScoreSource> {
  if (kind === 'pdf') {
    const { openPdfSource } = await import('./pdfSource');
    return openPdfSource(blobs[0]);
  }
  const { openImageSource } = await import('./imageSource');
  return openImageSource(blobs);
}

/** 악보함 썸네일용 첫 페이지 JPEG */
export async function renderThumbnail(source: ScoreSource, width = 360): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas');
  await source.renderPage(1, canvas, width, 1);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  canvas.width = canvas.height = 0;
  return blob ?? undefined;
}
