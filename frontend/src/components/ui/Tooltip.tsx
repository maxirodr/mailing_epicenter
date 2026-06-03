import { useState, useRef, type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  shortcut?: string;
}

export default function Tooltip({ content, children, position = 'top', shortcut }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    timeout.current = setTimeout(() => setVisible(true), 400);
  }

  function hide() {
    if (timeout.current) clearTimeout(timeout.current);
    setVisible(false);
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position];

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          className={`absolute z-50 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium animate-fadeIn pointer-events-none ${positionClasses}`}
          style={{
            background: 'rgba(24, 24, 30, 0.95)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd
              className="ml-1.5 rounded px-1 py-0.5 text-[10px]"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)' }}
            >
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
}
