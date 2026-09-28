const toastEl = document.getElementById('toast');
let toastTimer;

export function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// localStorage 는 사파리 개인 브라우징 등에서 실패할 수 있어 감싸 둔다.
export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`sm.${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`sm.${key}`, JSON.stringify(value)); } catch { /* 무시 */ }
  },
};
