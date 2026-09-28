import { create } from 'zustand';

interface ToastState {
  message: string | null;
  id: number;
  show: (message: string, ms?: number) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set, get) => ({
  message: null,
  id: 0,
  show(message, ms = 2200) {
    const id = get().id + 1;
    set({ message, id });
    clearTimeout(timer);
    timer = setTimeout(() => { if (get().id === id) set({ message: null }); }, ms);
  },
}));

export const toast = (message: string, ms?: number) => useToast.getState().show(message, ms);
