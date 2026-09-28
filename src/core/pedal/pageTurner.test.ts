import { describe, expect, it, vi } from 'vitest';
import { bindKey, DEFAULT_KEYMAP, normalizeKey, resolveAction } from './keymap';
import { PageTurner, type KeyEventLike } from './pageTurner';

function key(k: string, extra: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key: k, timeStamp: 0, preventDefault: vi.fn(), ...extra };
}

describe('keymap', () => {
  it('표준 페달 키를 인식한다', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) expect(resolveAction(key(k), DEFAULT_KEYMAP)).toBe('next');
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp']) expect(resolveAction(key(k), DEFAULT_KEYMAP)).toBe('prev');
  });

  it('구형 키 이름과 글자 키를 정규화한다', () => {
    expect(normalizeKey({ key: 'Spacebar' })).toBe('Space');
    expect(normalizeKey({ key: 'UIKeyInputRightArrow' })).toBe('ArrowRight');
    expect(normalizeKey({ key: 'ㅓ', code: 'KeyJ' })).toBe('KeyJ');
  });

  it('단축키 조합은 무시한다', () => {
    expect(resolveAction(key('ArrowRight', { metaKey: true }), DEFAULT_KEYMAP)).toBeNull();
  });

  it('bindKey 는 키를 한 동작에만 연결한다', () => {
    const km = bindKey(DEFAULT_KEYMAP, 'prev', 'ArrowDown');
    expect(km.prev).toContain('ArrowDown');
    expect(km.next).not.toContain('ArrowDown');
  });
});

describe('PageTurner', () => {
  it('동작을 전달하고 기본 동작을 막는다', () => {
    const onAction = vi.fn();
    const t = new PageTurner({ keymap: DEFAULT_KEYMAP, onAction });
    const e = key('PageDown', { timeStamp: 1000 });
    expect(t.handle(e)).toBe('next');
    expect(onAction).toHaveBeenCalledWith('next', 'PageDown');
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('자동 반복(길게 누름)과 접점 튐(debounce)을 무시한다', () => {
    const onAction = vi.fn();
    const t = new PageTurner({ keymap: DEFAULT_KEYMAP, onAction, debounceMs: 150 });
    t.handle(key('ArrowRight', { timeStamp: 1000 }));
    t.handle(key('ArrowRight', { timeStamp: 1050, repeat: true }));
    t.handle(key('ArrowRight', { timeStamp: 1100 }));
    t.handle(key('ArrowRight', { timeStamp: 1300 }));
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it('비활성화되면 아무것도 하지 않는다', () => {
    const onAction = vi.fn();
    const t = new PageTurner({ keymap: DEFAULT_KEYMAP, onAction });
    t.enabled = false;
    expect(t.handle(key('ArrowRight', { timeStamp: 1 }))).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });
});
