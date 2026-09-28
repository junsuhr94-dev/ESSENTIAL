/**
 * 블루투스 페달 / 페이지 터너 키 매핑.
 *
 * AirTurn, PageFlip, Donner 등 대부분의 페달은 블루투스 키보드(HID)로 동작하며
 * 모드에 따라 아래 키 중 하나를 보낸다.
 *   - ←/→ 방향키 (가장 흔한 기본값)
 *   - ↑/↓ 방향키
 *   - PageUp / PageDown
 *   - Space / Enter
 * 제조사 전용 모드(미디어 키 등)는 브라우저로 전달되지 않으므로 페달을 위 모드 중 하나로 설정해야 한다.
 */

export type PedalAction = 'next' | 'prev' | 'first' | 'last' | 'toggleChrome' | 'nextSong' | 'prevSong';

export type Keymap = Record<PedalAction, string[]>;

export const DEFAULT_KEYMAP: Keymap = {
  next: ['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'Enter'],
  prev: ['ArrowLeft', 'ArrowUp', 'PageUp'],
  first: ['Home'],
  last: ['End'],
  toggleChrome: [],
  // 세트리스트: 4페달 페이지 터너의 3·4번 페달 등에 지정해 쓴다. 키보드는 ] / [
  nextSong: ['BracketRight'],
  prevSong: ['BracketLeft'],
};

export const ACTION_LABELS: Record<PedalAction, string> = {
  next: '다음',
  prev: '이전',
  first: '처음으로',
  last: '끝으로',
  toggleChrome: '메뉴 표시/숨기기',
  nextSong: '다음 곡',
  prevSong: '이전 곡',
};

export interface KeyLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * 키 이벤트를 매핑용 이름으로 정규화한다.
 * 스페이스는 key 가 ' ' 이므로 'Space' 로, 구형 사파리의 'Right'/'Spacebar' 등도 표준 이름으로 바꾼다.
 */
export function normalizeKey(e: KeyLike): string {
  const legacy: Record<string, string> = {
    ' ': 'Space',
    Spacebar: 'Space',
    Right: 'ArrowRight',
    Left: 'ArrowLeft',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    UIKeyInputRightArrow: 'ArrowRight',
    UIKeyInputLeftArrow: 'ArrowLeft',
    UIKeyInputUpArrow: 'ArrowUp',
    UIKeyInputDownArrow: 'ArrowDown',
    UIKeyInputPageUp: 'PageUp',
    UIKeyInputPageDown: 'PageDown',
  };
  if (legacy[e.key]) return legacy[e.key];
  if (e.key === 'Unidentified' && e.code) return e.code;
  // 글자 키는 대소문자·한/영 상태와 무관하게 물리 키(code)로 매핑한다. 예: 'KeyJ'
  if (e.key.length === 1 && e.code) return e.code;
  return e.key;
}

export function resolveAction(e: KeyLike, keymap: Keymap): PedalAction | null {
  // Cmd/Ctrl/Alt 조합(실행 취소 등 단축키)은 페달 입력이 아니다.
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const key = normalizeKey(e);
  for (const action of Object.keys(keymap) as PedalAction[]) {
    if (keymap[action]?.includes(key)) return action;
  }
  return null;
}

/** 한 키를 하나의 동작에만 묶는다(다른 동작의 같은 키는 제거). */
export function bindKey(keymap: Keymap, action: PedalAction, key: string): Keymap {
  const out = {} as Keymap;
  for (const a of Object.keys(keymap) as PedalAction[]) {
    out[a] = (keymap[a] ?? []).filter((k) => k !== key);
  }
  out[action] = [...(out[action] ?? []), key];
  return out;
}

export function unbindKey(keymap: Keymap, action: PedalAction, key: string): Keymap {
  return { ...keymap, [action]: (keymap[action] ?? []).filter((k) => k !== key) };
}

const KEY_LABELS: Record<string, string> = {
  BracketRight: ']',
  BracketLeft: '[',
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Space: 'Space',
  Enter: 'Enter',
};

export function keyLabel(key: string) {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  if (/^Key[A-Z]$/.test(key)) return key.slice(3);
  if (/^Digit\d$/.test(key)) return key.slice(5);
  return key;
}
