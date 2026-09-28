import { canvasPixelSize, type PageSize, type ScoreSource } from './types';

// 사진으로 찍은 악보 등 이미지 여러 장을 한 권의 악보로 다룬다.
export async function openImageSource(blobs: Blob[]): Promise<ScoreSource> {
  const sizes = await Promise.all(blobs.map(imageSize));
  const bitmaps = new Map<number, Promise<ImageBitmap>>();

  function bitmap(n: number) {
    let p = bitmaps.get(n);
    if (!p) {
      p = createImageBitmap(blobs[n - 1]);
      bitmaps.set(n, p);
      // 이미지 비트맵은 크기가 커서 최근 4장만 보관한다.
      if (bitmaps.size > 4) {
        const [oldest, old] = bitmaps.entries().next().value!;
        bitmaps.delete(oldest);
        old.then((b) => b.close()).catch(() => {});
      }
    }
    return p;
  }

  return {
    pageCount: blobs.length,
    async getPageSize(n) {
      return sizes[n - 1];
    },
    async renderPage(n, canvas, cssWidth, dpr) {
      const img = await bitmap(n);
      const { width, height } = canvasPixelSize(sizes[n - 1], cssWidth, dpr);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
    },
    destroy() {
      for (const p of bitmaps.values()) p.then((b) => b.close()).catch(() => {});
      bitmaps.clear();
    },
  };
}

async function imageSize(blob: Blob): Promise<PageSize> {
  const b = await createImageBitmap(blob);
  const size = { width: b.width, height: b.height };
  b.close();
  return size;
}
