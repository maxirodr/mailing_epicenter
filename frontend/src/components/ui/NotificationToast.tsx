import { useState, useEffect, useCallback } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  title: string;
  message: string;
  action?: ToastAction;
}

let addToastExternal: ((toast: Omit<Toast, 'id'>) => void) | null = null;

export function showNotificationToast(title: string, message: string, action?: ToastAction) {
  addToastExternal?.({ title, message, action });
}

export default function NotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    const duration = toast.action ? 10000 : 5000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  useEffect(() => {
    addToastExternal = addToast;
    return () => {
      addToastExternal = null;
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="w-80 glass-panel rounded-xl animate-slideInBottom"
          style={{ boxShadow: 'var(--shadow-lg)', position: 'relative', overflow: 'hidden' }}
        >
          <div className="flex items-start gap-3 p-4">
            <div className="mt-0.5 shrink-0 rounded-full p-1.5" style={{ background: 'rgba(124,92,252,0.15)' }}>
              <svg className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-200">{toast.title}</p>
              <p className="mt-0.5 truncate text-xs text-gray-400">{toast.message}</p>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action!.onClick();
                    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                  }}
                  className="mt-1.5 text-xs font-medium transition-colors hover:brightness-125"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="shrink-0 text-gray-500 hover:text-gray-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-xl">
            <div className="h-full rounded-full" style={{ background: 'var(--accent-primary)', animation: `progressBar ${toast.action ? '10s' : '5s'} linear forwards` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
