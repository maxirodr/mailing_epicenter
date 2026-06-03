import { useEffect, useState } from 'react';
import { useToastStore, type Toast as ToastType } from '../../stores/toastStore';

function ToastItem({ toast, onDismiss }: { toast: ToastType; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting] = useState(false);
  const duration = toast.duration ?? 5000;

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [duration]);

  function handleDismiss() {
    setExiting(true);
    setTimeout(onDismiss, 200);
  }

  function handleUndo() {
    toast.undoFn?.();
    handleDismiss();
  }

  const bgColor = {
    success: 'rgba(52, 211, 153, 0.15)',
    error: 'rgba(248, 113, 113, 0.15)',
    info: 'rgba(124, 92, 252, 0.15)',
    undo: 'rgba(24, 24, 30, 0.95)',
  }[toast.type];

  const borderColor = {
    success: 'rgba(52, 211, 153, 0.3)',
    error: 'rgba(248, 113, 113, 0.3)',
    info: 'rgba(124, 92, 252, 0.3)',
    undo: 'var(--border-strong)',
  }[toast.type];

  const progressColor = {
    success: 'var(--accent-success)',
    error: 'var(--accent-danger)',
    info: 'var(--accent-primary)',
    undo: 'var(--accent-primary)',
  }[toast.type];

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg backdrop-blur-md transition-all duration-200 ${
        exiting ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'
      }`}
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        color: 'var(--text-primary)',
        minWidth: 280,
        maxWidth: 480,
      }}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.type === 'undo' && toast.undoFn && (
        <button
          onClick={handleUndo}
          className="shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/10"
          style={{ color: 'var(--accent-primary)' }}
        >
          Undo
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div
        className="absolute bottom-0 left-0 h-0.5 rounded-b-xl transition-all"
        style={{
          width: `${progress}%`,
          background: progressColor,
        }}
      />
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col-reverse gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}
