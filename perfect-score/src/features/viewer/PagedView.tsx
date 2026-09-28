import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ScoreSource } from '@/core/document/types';
import type { RenderCache } from '@/core/render/renderCache';
import type { PagedView as View } from '@/core/navigation/navigator';
import { CanvasHost } from './CanvasHost';
import { InkLayer } from '@/features/ink/InkLayer';
import { layoutFrame, renderDpr, resolveFrame, type Frame } from './frame';

interface Props {
  source: ScoreSource;
  cache: RenderCache;
  view: View;
  /** 페달을 밟았을 때 보여줄 다음/이전 화면 — 미리 렌더링해 둔다 */
  neighbors: View[];
  width: number;
  height: number;
  split: number;
}

/**
 * 즉시 전환 / 반 페이지 넘김 화면.
 * 새 화면의 캔버스가 모두 준비된 뒤에 한 번에 교체하므로 깜빡임이 없고,
 * 미리 렌더링된 경우 페달 입력과 같은 프레임에 교체된다.
 */
export function PagedView({ source, cache, view, neighbors, width, height, split }: Props) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!width || !height) return;
    let cancelled = false;
    const dpr = renderDpr();
    const slow = setTimeout(() => !cancelled && setLoading(true), 200);

    (async () => {
      const next = await resolveFrame(await layoutFrame(source, view, width, height, split), cache, dpr);
      if (cancelled) return;
      clearTimeout(slow);
      setLoading(false);
      setFrame(next);
      // 현재 화면이 뜬 뒤 다음/이전 화면을 순서대로 미리 렌더링한다.
      for (const n of neighbors) {
        if (cancelled) return;
        await resolveFrame(await layoutFrame(source, n, width, height, split), cache, dpr).catch(() => {});
      }
    })().catch((err) => {
      console.error(err);
      clearTimeout(slow);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
    // neighbors 는 view 에서 파생되므로 view 변경만 감지하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, cache, JSON.stringify(view), width, height, split]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {frame?.slots.map((slot) => (
        <div
          key={slot.key}
          className="relative shrink-0 overflow-hidden bg-white shadow-2xl shadow-black/60"
          style={{ width: slot.width, height: slot.height, visibility: slot.layers.length ? 'visible' : 'hidden' }}
        >
          {slot.layers.map((l) => (
            <div key={l.key} className="absolute inset-x-0 overflow-hidden" style={{ top: l.top, height: l.height }}>
              {l.canvas && <CanvasHost canvas={l.canvas} className="absolute inset-x-0" style={l.align === 'top' ? { top: 0 } : { bottom: 0 }} />}
              {/* 필기 레이어도 페이지와 같은 위치·크기로 맞춰, 반 페이지 넘김 중에도 각 페이지의 필기가 제자리에 보인다 */}
              <div
                key={`ink-${l.page}`}
                className="absolute inset-x-0"
                style={{ height: l.pageH, ...(l.align === 'top' ? { top: 0 } : { bottom: 0 }) }}
              >
                <InkLayer page={l.page} width={l.cssW} height={l.pageH} raster={l.canvas} />
              </div>
            </div>
          ))}
          {slot.divider != null && <HalfDivider y={slot.divider} upper={slot.layers[0].page} lower={slot.layers[1].page} />}
        </div>
      ))}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-white/60" />
        </div>
      )}
    </div>
  );
}

function HalfDivider({ y, upper, lower }: { y: number; upper: number; lower: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0" style={{ top: y }}>
      <div className="h-[3px] -translate-y-1/2 bg-gradient-to-r from-transparent via-amber-500/80 to-transparent shadow-[0_0_8px_rgba(0,0,0,0.35)]" />
      <div className="absolute right-2 -translate-y-full rounded-t-md bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-black">▲ {upper}쪽</div>
      <div className="absolute right-2 rounded-b-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">▼ {lower}쪽</div>
    </div>
  );
}
