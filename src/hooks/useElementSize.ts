import { useLayoutEffect, useState, type RefObject } from 'react';

/** 요소 크기(CSS px). 회전 시 연속 이벤트를 모아 한 번만 갱신한다. */
export function useElementSize(ref: RefObject<HTMLElement | null>, debounceMs = 120) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    read();
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(read, debounceMs); });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [ref, debounceMs]);
  return size;
}
