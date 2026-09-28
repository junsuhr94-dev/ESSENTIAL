import { normalizeKey, resolveAction, type Keymap, type PedalAction } from './keymap';

export interface PageTurnerOptions {
  keymap: Keymap;
  onAction: (action: PedalAction, key: string) => void;
  /** 매핑되지 않은 키까지 포함한 모든 입력(페달 설정 화면의 키 확인용) */
  onRawKey?: (key: string) => void;
  /**
   * 같은 동작이 이 시간(ms) 안에 다시 들어오면 무시한다.
   * 일부 페달은 한 번 밟을 때 keydown 을 두 번 보내거나 접점이 튀어(bounce) 두 장이 넘어가는 문제가 있다.
   */
  debounceMs?: number;
}

export interface KeyEventLike {
  key: string;
  code?: string;
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  timeStamp: number;
  target?: EventTarget | null;
  preventDefault(): void;
}

/** 입력 중인 텍스트 필드·슬라이더에서는 페달 키를 가로채지 않는다. */
export function isEditableTarget(target: EventTarget | null | undefined) {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return !!el.closest('input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [role=slider], [role=textbox]');
}

/**
 * 키보드/블루투스 페달 입력을 페이지 넘김 동작으로 바꾸는 순수 로직.
 * DOM 리스너 연결은 attach() 로 하고, 판정 로직은 handle() 로 테스트한다.
 */
export class PageTurner {
  private opts: Required<Omit<PageTurnerOptions, 'onRawKey'>> & Pick<PageTurnerOptions, 'onRawKey'>;
  private last = new Map<PedalAction, number>();
  enabled = true;

  constructor(opts: PageTurnerOptions) {
    this.opts = { debounceMs: 150, ...opts };
  }

  setKeymap(keymap: Keymap) {
    this.opts.keymap = keymap;
  }

  /** 처리했으면 동작을, 아니면 null 을 반환한다. */
  handle(e: KeyEventLike): PedalAction | null {
    if (!this.enabled || isEditableTarget(e.target)) return null;
    this.opts.onRawKey?.(normalizeKey(e));
    const action = resolveAction(e, this.opts.keymap);
    if (!action) return null;

    // 페달 키의 기본 동작(스페이스 스크롤, Enter 로 버튼 클릭 등)을 막는다.
    e.preventDefault();

    // 페달을 누르고 있으면 OS 자동 반복이 발생하는데, 공연 중 여러 장이 넘어가면 치명적이므로 무시한다.
    if (e.repeat) return null;

    const prev = this.last.get(action);
    if (prev != null && e.timeStamp - prev >= 0 && e.timeStamp - prev < this.opts.debounceMs) return null;
    this.last.set(action, e.timeStamp);

    this.opts.onAction(action, normalizeKey(e));
    return action;
  }

  attach(target: Window | Document = window) {
    const listener = (e: Event) => this.handle(e as KeyboardEvent);
    // capture 단계에서 받아 포커스된 버튼 등이 스페이스/Enter 를 먼저 처리하지 못하게 한다.
    target.addEventListener('keydown', listener, { capture: true });
    return () => target.removeEventListener('keydown', listener, { capture: true });
  }
}
