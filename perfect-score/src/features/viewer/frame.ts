import type { PageSize, ScoreSource } from '@/core/document/types';
import type { RenderCache } from '@/core/render/renderCache';
import type { PagedView } from '@/core/navigation/navigator';

/** 한 페이지 캔버스에서 보여줄 영역 */
export interface Layer {
  key: string;
  page: number;
  /** 슬롯 안에서 이 레이어가 차지하는 세로 범위(px) */
  top: number;
  height: number;
  /** 페이지의 윗부분(top) 또는 아랫부분(bottom)을 맞춰 보여준다 */
  align: 'top' | 'bottom';
  cssW: number;
  /** 페이지 전체 높이(CSS px) — 필기 레이어 크기 */
  pageH: number;
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

function fit(size: PageSize, maxW: number, maxH: number) {
  const scale = Math.min(maxW / size.width, maxH / size.height);
  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
}

/** 화면 상태(view)를 슬롯/레이어 배치로 바꾼다(캔버스는 아직 없음). */
export async function layoutFrame(source: ScoreSource, view: PagedView, stageW: number, stageH: number, split: number): Promise<Frame> {
  if (view.layout === 'single') {
    if (view.kind === 'full') {
      const { width, height } = fit(await source.getPageSize(view.page), stageW, stageH);
      return { slots: [{ key: 'single', width, height, layers: [{ key: 'full', page: view.page, top: 0, height, align: 'top', cssW: width, pageH: height }] }] };
    }
    // 반 넘김: 새 페이지(top)의 크기에 맞춘 한 슬롯을 위/아래로 나눈다.
    const { width, height } = fit(await source.getPageSize(view.top), stageW, stageH);
    const cut = Math.round(height * split);
    const lower = await source.getPageSize(view.bottom);
    const lowerH = Math.round((lower.height / lower.width) * width);
    return {
      slots: [{
        key: 'single',
        width,
        height,
        divider: cut,
        layers: [
          { key: 'upper', page: view.top, top: 0, height: cut, align: 'top', cssW: width, pageH: height },
          { key: 'lower', page: view.bottom, top: cut, height: height - cut, align: 'bottom', cssW: width, pageH: lowerH },
        ],
      }],
    };
  }

  // 두 쪽 보기: 같은 배율로 나란히 배치
  const pages = [view.left, view.right];
  const known = pages.find((p): p is number => p != null)!;
  const sizes = await Promise.all(pages.map((p) => source.getPageSize(p ?? known)));
  const totalW = sizes[0].width + sizes[1].width;
  const maxH = Math.max(sizes[0].height, sizes[1].height);
  const scale = Math.min(stageW / totalW, stageH / maxH);
  return {
    slots: pages.map((page, i) => {
      const width = Math.floor(sizes[i].width * scale);
      const height = Math.floor(sizes[i].height * scale);
      return {
        key: i === 0 ? 'left' : 'right',
        width,
        height,
        layers: page == null ? [] : [{ key: 'full', page, top: 0, height, align: 'top' as const, cssW: width, pageH: height }],
      };
    }),
  };
}

/** 배치에 필요한 캔버스를 모두 렌더링(또는 캐시에서 꺼내)서 채운다. */
export async function resolveFrame(frame: Frame, cache: RenderCache, dpr: number): Promise<Frame> {
  const slots = await Promise.all(
    frame.slots.map(async (slot) => ({
      ...slot,
      layers: await Promise.all(slot.layers.map(async (l) => ({ ...l, canvas: await cache.get(l.page, l.cssW, dpr) }))),
    })),
  );
  return { slots };
}

export function renderDpr() {
  // 3배 해상도는 메모리 대비 체감 차이가 작아 2배로 제한한다.
  return Math.min(window.devicePixelRatio || 1, 2);
}
