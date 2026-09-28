import type { PageSize, ScoreSource } from '@/core/document/types';
import type { RenderCache } from '@/core/render/renderCache';
import type { PagedView } from '@/core/navigation/navigator';
import { cropSize, FULL_PAGE, type CropBox } from '@/core/render/autoCrop';

/**
 * 슬롯 안의 한 영역(region)에 페이지 하나를 보여준다.
 * 페이지 요소(캔버스 + 필기)는 항상 "페이지 전체" 크기로 두고, 위치만 옮겨서
 * 여백 자르기·반 페이지 넘김을 구현한다 → 필기 좌표는 자르기와 무관하게 그대로다.
 */
export interface Layer {
  key: string;
  page: number;
  /** 슬롯 안에서 이 영역의 세로 범위(px) */
  top: number;
  height: number;
  /** 페이지 전체의 CSS 크기 */
  fullW: number;
  fullH: number;
  /** 영역 기준 페이지 요소의 위치(px) — 자른 여백만큼 음수 */
  pageLeft: number;
  pageTop: number;
  canvas?: HTMLCanvasElement;
}

export interface Slot {
  key: string;
  width: number;
  height: number;
  layers: Layer[];
  /** 반 넘김 경계선 위치(px). 없으면 경계선 없음 */
  divider?: number;
}

export interface Frame {
  slots: Slot[];
}

/** 페이지별 여백 자르기 상자(끄면 항상 전체 페이지) */
export type CropLookup = (page: number) => Promise<CropBox>;
export const NO_CROP: CropLookup = async () => FULL_PAGE;

function fit(size: PageSize, maxW: number, maxH: number) {
  const scale = Math.min(maxW / size.width, maxH / size.height);
  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
}

/** 표시 폭(자른 영역의 폭)이 displayW 일 때 페이지 전체 크기와 오프셋 */
function pagePlacement(size: PageSize, box: CropBox, displayW: number) {
  const fullW = displayW / (box[2] - box[0]);
  const fullH = fullW * (size.height / size.width);
  return { fullW, fullH, left: -box[0] * fullW, top: -box[1] * fullH };
}

/** 화면 상태(view)를 슬롯/레이어 배치로 바꾼다(캔버스는 아직 없음). */
export async function layoutFrame(
  source: ScoreSource,
  view: PagedView,
  stageW: number,
  stageH: number,
  split: number,
  crop: CropLookup = NO_CROP,
): Promise<Frame> {
  const info = async (p: number) => {
    const [size, box] = await Promise.all([source.getPageSize(p), crop(p)]);
    return { size, box, vis: cropSize(size, box) };
  };

  if (view.layout === 'single') {
    if (view.kind === 'full') {
      const a = await info(view.page);
      const { width, height } = fit(a.vis, stageW, stageH);
      const pl = pagePlacement(a.size, a.box, width);
      return {
        slots: [{ key: 'single', width, height, layers: [{ key: 'full', page: view.page, top: 0, height, fullW: pl.fullW, fullH: pl.fullH, pageLeft: pl.left, pageTop: pl.top }] }],
      };
    }
    // 반 넘김: 새 페이지(top)의 크기에 맞춘 한 슬롯을 위/아래로 나눈다.
    const [up, low] = await Promise.all([info(view.top), info(view.bottom)]);
    const { width, height } = fit(up.vis, stageW, stageH);
    const cut = Math.round(height * split);
    const pu = pagePlacement(up.size, up.box, width);
    const pb = pagePlacement(low.size, low.box, width);
    const lowerH = height - cut;
    return {
      slots: [{
        key: 'single',
        width,
        height,
        divider: cut,
        layers: [
          // 위: 새 페이지의 윗부분
          { key: 'upper', page: view.top, top: 0, height: cut, fullW: pu.fullW, fullH: pu.fullH, pageLeft: pu.left, pageTop: pu.top },
          // 아래: 연주 중인 페이지의 아랫부분 — 내용의 아래 끝을 영역 아래에 맞춘다
          { key: 'lower', page: view.bottom, top: cut, height: lowerH, fullW: pb.fullW, fullH: pb.fullH, pageLeft: pb.left, pageTop: lowerH - low.box[3] * pb.fullH },
        ],
      }],
    };
  }

  // 두 쪽 보기: 같은 배율로 나란히 배치
  const pages = [view.left, view.right];
  const known = pages.find((p): p is number => p != null)!;
  const infos = await Promise.all(pages.map((p) => info(p ?? known)));
  const totalW = infos[0].vis.width + infos[1].vis.width;
  const maxH = Math.max(infos[0].vis.height, infos[1].vis.height);
  const scale = Math.min(stageW / totalW, stageH / maxH);
  return {
    slots: pages.map((page, i) => {
      const width = Math.floor(infos[i].vis.width * scale);
      const height = Math.floor(infos[i].vis.height * scale);
      const pl = pagePlacement(infos[i].size, infos[i].box, width);
      return {
        key: i === 0 ? 'left' : 'right',
        width,
        height,
        layers: page == null ? [] : [{ key: 'full', page, top: 0, height, fullW: pl.fullW, fullH: pl.fullH, pageLeft: pl.left, pageTop: pl.top }],
      };
    }),
  };
}

/** 배치에 필요한 캔버스를 모두 렌더링(또는 캐시에서 꺼내)서 채운다. */
export async function resolveFrame(frame: Frame, cache: RenderCache, dpr: number): Promise<Frame> {
  const slots = await Promise.all(
    frame.slots.map(async (slot) => ({
      ...slot,
      layers: await Promise.all(slot.layers.map(async (l) => ({ ...l, canvas: await cache.get(l.page, Math.round(l.fullW), dpr) }))),
    })),
  );
  return { slots };
}

export function renderDpr() {
  // 3배 해상도는 메모리 대비 체감 차이가 작아 2배로 제한한다.
  return Math.min(window.devicePixelRatio || 1, 2);
}
