import type { Thread, PaginatedResponse } from '../../types/index.ts';
import ThreadItem from './ThreadItem.tsx';

interface ThreadListProps {
  data: PaginatedResponse<Thread> | undefined;
  isLoading: boolean;
  selectedThreadIds: Set<number>;
  activeThreadId: number | null;
  onToggleSelect: (id: number, shiftKey?: boolean) => void;
  onToggleStar: (id: number, starred: boolean) => void;
  onClickThread: (id: number) => void;
  onPageChange: (page: number) => void;
  onTrash?: (id: number) => void;
  onToggleRead?: (id: number, read: boolean) => void;
}

function SkeletonRow() {
  return (
    <div className="flex items-start gap-2 border-b border-gray-800/50 px-3 py-2.5">
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <div className="h-5 w-5 animate-pulse rounded border border-gray-700 bg-gray-800" />
        <div className="h-4 w-4 animate-pulse rounded bg-gray-800" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-800" />
        <div className="h-3 w-full animate-pulse rounded bg-gray-800/60" />
      </div>
      <div className="h-3 w-12 animate-pulse rounded bg-gray-800" />
    </div>
  );
}

export default function ThreadList({
  data,
  isLoading,
  selectedThreadIds,
  activeThreadId,
  onToggleSelect,
  onToggleStar,
  onClickThread,
  onPageChange,
  onTrash,
  onToggleRead,
}: ThreadListProps) {
  if (isLoading) {
    return (
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 animate-fadeIn">
        <div className="animate-breathe mb-6">
          <svg className="h-24 w-24" viewBox="0 0 120 120" fill="none">
            <rect x="20" y="35" width="80" height="55" rx="8" fill="rgba(124,92,252,0.08)" stroke="rgba(124,92,252,0.2)" strokeWidth="1.5"/>
            <path d="M20 43L60 68L100 43" stroke="rgba(124,92,252,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="95" cy="30" r="2" fill="rgba(245,158,66,0.4)"/>
            <circle cx="25" cy="28" r="1.5" fill="rgba(124,92,252,0.3)"/>
            <path d="M48 60L55 67L72 50" stroke="rgba(52,211,153,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="text-base font-medium" style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)' }}>All caught up</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>No conversations to show</p>
      </div>
    );
  }

  const { meta } = data;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto [scrollbar-color:theme(colors.gray.700)_transparent] [scrollbar-width:thin]">
        {data.data.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isSelected={selectedThreadIds.has(thread.id)}
            isActive={activeThreadId === thread.id}
            selectedThreadIds={selectedThreadIds}
            onToggleSelect={onToggleSelect}
            onToggleStar={onToggleStar}
            onClick={onClickThread}
            onTrash={onTrash}
            onToggleRead={onToggleRead}
          />
        ))}
      </div>

      {meta.last_page > 1 && (
        <div className="flex items-center justify-between border-t border-gray-800 px-4 py-2">
          <span className="text-xs text-gray-500">
            {(meta.current_page - 1) * meta.per_page + 1}
            {' - '}
            {Math.min(meta.current_page * meta.per_page, meta.total)}
            {' of '}
            {meta.total}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(meta.current_page - 1)}
              disabled={meta.current_page <= 1}
              className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => onPageChange(meta.current_page + 1)}
              disabled={meta.current_page >= meta.last_page}
              className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
