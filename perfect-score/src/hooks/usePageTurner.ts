import { useEffect, useRef } from 'react';
import { PageTurner } from '@/core/pedal/pageTurner';
import type { Keymap, PedalAction } from '@/core/pedal/keymap';

/** 블루투스 페달/키보드 입력을 받아 onAction 을 호출한다. enabled=false 면 키를 가로채지 않는다. */
export function usePageTurner(keymap: Keymap, onAction: (action: PedalAction) => void, enabled = true) {
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const turnerRef = useRef<PageTurner | null>(null);

  useEffect(() => {
    const turner = new PageTurner({ keymap, onAction: (a) => actionRef.current(a) });
    turnerRef.current = turner;
    return turner.attach(window);
    // keymap 변경은 아래 effect 에서 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { turnerRef.current?.setKeymap(keymap); }, [keymap]);
  useEffect(() => { if (turnerRef.current) turnerRef.current.enabled = enabled; }, [enabled]);
}
