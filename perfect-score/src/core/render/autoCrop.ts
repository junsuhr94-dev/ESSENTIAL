/**
 * 악보 외곽의 흰 여백 자동 자르기.
 * 저해상도로 그린 페이지에서 잉크(어두운 픽셀)가 있는 영역을 찾아 페이지 비율 좌표로 돌려준다.
 */

/** [x0, y0, x1, y1] — 페이지 폭/높이에 대한 비율(0~1) */
export type CropBox = [number, number, number, number];

export const FULL_PAGE: CropBox = [0, 0, 1, 1];

export interface CropOptions {
  /** 이 밝기보다 어두우면 잉크로 본다 */
  threshold?: number;
  /** 잘라낸 뒤 남길 여백(비율) */
  padding?: number;
  /** 한 행/열에 잉크 픽셀이 이만큼 이상 있어야 내용으로 본다(스캔 얼룩·먼지 무시) */
  minInk?: number;
}

export function detectContentBox(
  img: { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  { threshold = 200, padding = 0.015, minInk = 2 }: CropOptions = {},
): CropBox {
  const { width, height, data } = img;
  const rows = new Uint32Array(height);
  const cols = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < threshold) { rows[y]++; cols[x]++; }
    }
  }
  const first = (arr: Uint32Array) => arr.findIndex((v) => v >= minInk);
  const last = (arr: Uint32Array) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= minInk) return i;
    return -1;
  };
  const y0 = first(rows), y1 = last(rows), x0 = first(cols), x1 = last(cols);
  if (y0 < 0 || x0 < 0) return FULL_PAGE; // 빈 페이지

  const box: CropBox = [
    Math.max(0, x0 / width - padding),
    Math.max(0, y0 / height - padding),
    Math.min(1, (x1 + 1) / width + padding),
    Math.min(1, (y1 + 1) / height + padding),
  ];
  // 내용이 너무 작으면(표지의 작은 로고 등) 확대가 과해지므로 자르지 않는다.
  if (box[2] - box[0] < 0.3 || box[3] - box[1] < 0.3) return FULL_PAGE;
  return box.map((v) => Math.round(v * 1000) / 1000) as CropBox;
}

export function cropSize(size: { width: number; height: number }, box: CropBox) {
  return { width: size.width * (box[2] - box[0]), height: size.height * (box[3] - box[1]) };
}
