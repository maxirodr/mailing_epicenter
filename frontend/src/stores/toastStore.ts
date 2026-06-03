import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'undo';
  undoFn?: () => void;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], undoFn?: () => void, duration?: number) => string;
  removeToast: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'success', undoFn, duration) => {
    const id = `toast-${++counter}`;
    const toast: Toast = {
      id,
      message,
      type: undoFn ? 'undo' : type,
      undoFn,
      duration: duration ?? (undoFn ? 15000 : 5000),
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    return id;
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
