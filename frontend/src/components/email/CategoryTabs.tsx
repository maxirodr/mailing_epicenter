import { useState, type ReactNode } from 'react';
import type { EmailCategory } from '../../types/index.ts';

interface CategoryTabsProps {
  activeCategory: EmailCategory;
  onCategoryChange: (category: EmailCategory) => void;
  counts?: Record<string, number>;
  onDropThreads?: (threadIds: number[], category: EmailCategory) => void;
}

const CATEGORIES: { key: EmailCategory; label: string; icon: ReactNode }[] = [
  {
    key: 'primary',
    label: 'Primary',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
      </svg>
    ),
  },
  {
    key: 'promotions',
    label: 'Promotions',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
  {
    key: 'social',
    label: 'Social',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    key: 'updates',
    label: 'Updates',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  },
  {
    key: 'forums',
    label: 'Forums',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
];

export default function CategoryTabs({ activeCategory, onCategoryChange, counts, onDropThreads }: CategoryTabsProps) {
  const [dropTarget, setDropTarget] = useState<EmailCategory | null>(null);

  return (
    <div className="hidden lg:flex items-center gap-0 px-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {CATEGORIES.map((cat) => {
        const isActive = activeCategory === cat.key;
        const unread = counts?.[cat.key] ?? 0;
        const isDropTarget = dropTarget === cat.key;
        return (
          <button
            key={cat.key}
            onClick={() => onCategoryChange(cat.key)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(cat.key); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              const raw = e.dataTransfer.getData('application/x-thread-ids');
              if (!raw || !onDropThreads) return;
              const ids: number[] = JSON.parse(raw);
              onDropThreads(ids, cat.key);
            }}
            className={`
              relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-150
              ${isActive
                ? 'text-purple-300'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}
              ${isDropTarget ? 'ring-2 ring-purple-500/50 bg-purple-500/10 scale-105' : ''}
            `}
          >
            {cat.icon}
            <span>{cat.label}</span>
            {unread > 0 && (
              <span
                className="rounded-full px-1.5 text-xs font-medium"
                style={{
                  background: isActive ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                }}
              >
                {unread}
              </span>
            )}
            {isActive && (
              <span
                className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t-full"
                style={{ background: 'var(--accent-primary)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
