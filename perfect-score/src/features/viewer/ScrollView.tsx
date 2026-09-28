import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import type { PageSize, ScoreSource } from '@/core/document/types';
import type { RenderCache } from '@/core/render/renderCache';
import { CanvasHost } from './CanvasHost';
import { InkLayer } from '@/features/ink/InkLayer';
import { renderDpr } from './frame';

export interface ScrollViewHandle {
  next(): void;
  prev(): void;
  goTo(page: number, smooth?: boolean): void;
}

interface Props {
  ref?: Ref<ScrollViewHandle>;
  source: ScoreSource;
  cache: RenderCache;
  direction: 'horizontal' | 'vertical';
  width: number;
  height: number;
  initialPage: number;
  onPageChange: (page: number) => void;
  onEdge?: (edge: 'start' | 'end') => void;
  /** 악보 색 테마(CSS filter) */
  pageFilter?: string;
}

const GAP = 12;
/** 세로 스크롤에서 한 번에 이동할 화면 비율 — 윗부분 일부를 남겨 시선이 이어지게 한다 */
const V_STEP = 0.85;

interface Placed { page: number; x: number; y: number; w: number; h: number }

/**
 * 가로/세로 부드러운 스크롤 보기.
 * 보이는 범위(+앞뒤 여유) 페이지만 렌더링해 긴 악보에서도 메모리를 아낀다.
 */
export function ScrollView({ ref, source, cache, direction, width, height, initialPage, onPageChange, onEdge, pageFilter }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<PageSize[] | null>(null);
  const [range, setRange] = useState<[number, number]>([1, 1]);
  const [canvases, setCanvases] = useState<Map<string, HTMLCanvasElement>>(new Map());
  const currentPage = useRef(initialPage);
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const pages = Array.from({ length: source.pageCount }, (_, i) => i + 1);
    Promise.all(pages.map((p) => source.getPageSize(p))).then((s) => !cancelled && setSizes(s));
    return () => { cancelled = true; };
  }, [source]);

  // 페이지 배치 계산
  const placed = useMemo<Placed[]>(() => {
    if (!sizes || !width || !height) return [];
    let offset = 0;
    return sizes.map((s, i) => {
      if (direction === 'vertical') {
        const w = Math.floor(width);
        const h = Math.floor((s.height / s.width) * w);
        const p = { page: i + 1, x: 0, y: offset, w, h };
        offset += h + GAP;
        return p;
      }
      // 가로: 한 페이지가 한 화면을 차지하고 가운데 정렬
      const scale = Math.min(width / s.width, height / s.height);
      const w = Math.floor(s.width * scale);
      const h = Math.floor(s.height * scale);
      return { page: i + 1, x: i * width + (width - w) / 2, y: (height - h) / 2, w, h };
    });
  }, [sizes, width, height, direction]);

  const total = useMemo(() => {
    if (!placed.length) return 0;
    const last = placed[placed.length - 1];
    return direction === 'vertical' ? last.y + last.h : placed.length * width;
  }, [placed, direction, width]);

  const pageAt = useCallback(
    (pos: number) => {
      if (!placed.length) return 1;
      if (direction === 'horizontal') return Math.min(placed.length, Math.max(1, Math.round(pos / width) + 1));
      const probe = pos + height * 0.3;
      const hit = placed.find((p) => probe >= p.y && probe < p.y + p.h + GAP);
      return hit ? hit.page : placed[placed.length - 1].page;
    },
    [placed, direction, width, height],
  );

  const offsetOf = useCallback(
    (page: number) => {
      const p = placed[page - 1];
      if (!p) return 0;
      return direction === 'vertical' ? p.y : (page - 1) * width;
    },
    [placed, direction, width],
  );

  const updateRange = useCallback(() => {
    const el = scroller.current;
    if (!el || !placed.length) return;
    const pos = direction === 'vertical' ? el.scrollTop : el.scrollLeft;
    const span = direction === 'vertical' ? height : width;
    const first = pageAt(pos - span);
    const last = pageAt(pos + span * 2);
    setRange((r) => (r[0] === first && r[1] === last ? r : [first, last]));
    const page = pageAt(pos);
    if (page !== currentPage.current) {
      currentPage.current = page;
      onPageChange(page);
    }
  }, [placed, direction, width, height, pageAt, onPageChange]);

  // 처음 열 때와 크기가 바뀔 때 보던 페이지로 이동
  useEffect(() => {
    const el = scroller.current;
    if (!el || !placed.length) return;
    const target = offsetOf(initialized.current ? currentPage.current : initialPage);
    if (direction === 'vertical') el.scrollTop = target; else el.scrollLeft = target;
    initialized.current = true;
    updateRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  // 보이는 범위의 페이지 렌더링
  useEffect(() => {
    if (!placed.length) return;
    let cancelled = false;
    const dpr = renderDpr();
    const wanted = placed.slice(range[0] - 1, range[1]);
    (async () => {
      for (const p of wanted) {
        const key = `${p.page}@${p.w}`;
        const canvas = await cache.get(p.page, p.w, dpr).catch(() => null);
        if (cancelled) return;
        if (canvas) setCanvases((m) => (m.get(key) === canvas ? m : new Map(m).set(key, canvas)));
      }
      // 범위 밖 캔버스는 DOM 에서 떼어 캐시가 메모리를 회수할 수 있게 한다.
      setCanvases((m) => {
        const keep = new Set(wanted.map((p) => `${p.page}@${p.w}`));
        const next = new Map([...m].filter(([k]) => keep.has(k)));
        return next.size === m.size ? m : next;
      });
    })();
    return () => { cancelled = true; };
  }, [range, placed, cache]);

  useImperativeHandle(ref, () => ({
    next() {
      const el = scroller.current;
      if (!el) return;
      if (direction === 'vertical') {
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) return onEdge?.('end');
        el.scrollBy({ top: el.clientHeight * V_STEP, behavior: 'smooth' });
      } else {
        const page = pageAt(el.scrollLeft);
        if (page >= placed.length) return onEdge?.('end');
        el.scrollTo({ left: offsetOf(page + 1), behavior: 'smooth' });
      }
    },
    prev() {
      const el = scroller.current;
      if (!el) return;
      if (direction === 'vertical') {
        if (el.scrollTop <= 0) return onEdge?.('start');
        el.scrollBy({ top: -el.clientHeight * V_STEP, behavior: 'smooth' });
      } else {
        const page = pageAt(el.scrollLeft);
        if (page <= 1) return onEdge?.('start');
        el.scrollTo({ left: offsetOf(page - 1), behavior: 'smooth' });
      }
    },
    goTo(page, smooth = false) {
      const el = scroller.current;
      if (!el) return;
      const pos = offsetOf(page);
      el.scrollTo(direction === 'vertical' ? { top: pos, behavior: smooth ? 'smooth' : 'auto' } : { left: pos, behavior: smooth ? 'smooth' : 'auto' });
    },
  }), [direction, placed, pageAt, offsetOf, onEdge]);

  return (
    <div
      ref={scroller}
      onScroll={() => requestAnimationFrame(updateRange)}
      className="absolute inset-0 overscroll-contain"
      style={{
        overflowX: direction === 'horizontal' ? 'auto' : 'hidden',
        overflowY: direction === 'vertical' ? 'auto' : 'hidden',
        scrollSnapType: direction === 'horizontal' ? 'x mandatory' : undefined,
        touchAction: direction === 'horizontal' ? 'pan-x' : 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="relative" style={direction === 'vertical' ? { height: total, width } : { width: total, height }}>
        {placed.map((p) => {
          const canvas = canvases.get(`${p.page}@${p.w}`);
          return (
            <div
              key={p.page}
              className="absolute overflow-hidden bg-white shadow-xl shadow-black/50"
              style={{ left: p.x, top: p.y, width: p.w, height: p.h, filter: pageFilter, scrollSnapAlign: direction === 'horizontal' ? 'center' : undefined }}
            >
              {canvas && <CanvasHost canvas={canvas} />}
              {canvas && <InkLayer page={p.page} width={p.w} height={p.h} raster={canvas} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
