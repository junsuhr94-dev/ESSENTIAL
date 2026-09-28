// localStorage 는 사파리 개인 브라우징 등에서 예외가 날 수 있어 감싼다.
export const safeStorage = {
  getItem(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* 무시 */ }
  },
  removeItem(key: string) {
    try { localStorage.removeItem(key); } catch { /* 무시 */ }
  },
};
