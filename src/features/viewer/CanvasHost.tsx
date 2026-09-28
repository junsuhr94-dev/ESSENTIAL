import { useLayoutEffect, useRef, type CSSProperties } from 'react';

/**
 * 렌더 캐시가 만든 <canvas> DOM 노드를 그대로 붙인다.
 * 픽셀을 복사하지 않고 노드만 옮기므로 페이지 교체 비용이 거의 없다.
 */
export function CanvasHost({ canvas, className, style }: { canvas: HTMLCanvasElement; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.appendChild(canvas);
    return () => {
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  }, [canvas]);
  return <div ref={ref} className={className} style={style} />;
}
