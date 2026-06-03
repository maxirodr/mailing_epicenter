import { useState, useEffect, useRef } from 'react';
import { useUiStore } from '../../stores/uiStore.ts';
import type { SearchParams } from '../../hooks/useSearch.ts';
import type { EmailCategory } from '../../types/index.ts';
import SearchFilters from '../search/SearchFilters.tsx';
import ConfirmDialog from '../ui/ConfirmDialog.tsx';
import api from '../../services/api.ts';

interface ContactSuggestion {
  address: string;
  name: string | null;
}

interface HeaderProps {
  selectedCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkAction: (action: 'read' | 'unread' | 'trash' | 'delete' | 'spam') => void;
  onMoveToCategory?: (category: EmailCategory) => void;
  showCategoryMove?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  wsConnected?: boolean;
  searchFilters: SearchParams;
  onSearchFiltersChange: (filters: SearchParams) => void;
  onMarkAllRead?: () => void;
  onMarkPageRead?: () => void;
  mailboxId?: number | null;
  activeLabel?: string;
  onEmptyTrash?: () => void;
}

export default function Header({
  selectedCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onBulkAction,
  onMoveToCategory,
  showCategoryMove,
  onRefresh,
  isRefreshing,
  wsConnected,
  searchFilters,
  onSearchFiltersChange,
  onMarkAllRead,
  onMarkPageRead,
  mailboxId,
  activeLabel,
  onEmptyTrash,
}: HeaderProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [showFilters, setShowFilters] = useState(false);
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSugIdx, setSelectedSugIdx] = useState(-1);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // Fetch contact suggestions as user types
  useEffect(() => {
    if (!mailboxId || searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get<ContactSuggestion[]>(
          `/api/mailboxes/${mailboxId}/contacts/suggest`,
          { params: { q: searchQuery.trim() } },
        );
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
        setSelectedSugIdx(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
    return () => { if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current); };
  }, [searchQuery, mailboxId]);

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectSuggestion(s: ContactSuggestion) {
    setSearchQuery(`from:${s.address}`);
    onSearchFiltersChange({ ...searchFilters, from: s.address });
    setShowSuggestions(false);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSugIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSugIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && selectedSugIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedSugIdx]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-4" style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        onClick={toggleSidebar}
        className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200 lg:hidden"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {selectedCount > 0 ? (
        <div className="flex items-center gap-2">
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-gray-300 transition-all duration-150 hover:bg-white/[0.06] active:scale-95"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-600">
              {allSelected ? (
                <svg className="h-3 w-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-3 w-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span>{selectedCount} selected</span>
          </button>

          <div className="mx-1 h-4 w-px bg-gray-700" />

          <button
            onClick={() => onBulkAction('read')}
            title="Mark as read"
            className="rounded-lg p-1.5 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-gray-200 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51" />
            </svg>
          </button>
          <button
            onClick={() => onBulkAction('unread')}
            title="Mark as unread"
            className="rounded-lg p-1.5 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-gray-200 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </button>
          <button
            onClick={() => onBulkAction('trash')}
            title="Move to trash"
            className="rounded-lg p-1.5 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-gray-200 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
          <button
            onClick={() => onBulkAction('spam')}
            title="Report spam"
            className="rounded-lg p-1.5 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-gray-200 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </button>
          {activeLabel === 'TRASH' && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete forever"
              className="rounded-lg p-1.5 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-red-400 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
          {showCategoryMove && onMoveToCategory && <MoveToCategory onMove={onMoveToCategory} />}
          <ConfirmDialog
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={() => {
              setShowDeleteConfirm(false);
              onBulkAction('delete');
            }}
            title="Delete forever?"
            message={`This will permanently delete ${selectedCount} conversation${selectedCount > 1 ? 's' : ''} and all attachments. This cannot be undone.`}
            confirmLabel="Delete forever"
            destructive
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <div className="relative max-w-xl flex-1" ref={searchWrapperRef}>
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              data-search-input
              className="w-full rounded-lg py-2 pl-9 pr-3 text-sm placeholder-gray-500 outline-none transition-all duration-150 focus:border-[#7c5cfc] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.15)]"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl py-1 shadow-2xl animate-fadeIn"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}
              >
                <div className="px-3 py-1.5 text-xs font-medium text-gray-500">Contacts</div>
                {suggestions.map((s, idx) => (
                  <button
                    key={s.address}
                    onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      idx === selectedSugIdx ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-gray-200"
                      style={{ background: `hsl(${Math.abs([...s.address].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360}, 50%, 40%)` }}
                    >
                      {(s.name || s.address).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      {s.name && <div className="truncate text-sm text-gray-200">{s.name}</div>}
                      <div className="truncate text-xs text-gray-500">{s.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showFilters && (
              <SearchFilters
                filters={searchFilters}
                onApply={(filters) => { onSearchFiltersChange(filters); setShowFilters(false); }}
                onClear={() => { onSearchFiltersChange({}); setShowFilters(false); }}
              />
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            title="Search filters"
            className={`shrink-0 rounded-lg p-2 transition-all duration-150 active:scale-95 ${showFilters ? 'bg-white/[0.1] text-gray-200' : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>
          {(onMarkPageRead || onMarkAllRead) && (
            <MarkReadMenu onMarkPageRead={onMarkPageRead} onMarkAllRead={onMarkAllRead} />
          )}
          {activeLabel === 'TRASH' && onEmptyTrash && (
            <button
              onClick={() => setShowEmptyTrashConfirm(true)}
              title="Empty trash"
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-red-300 transition-all duration-150 hover:bg-red-500/10 hover:text-red-200 active:scale-95"
              style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}
            >
              Empty Trash
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title={wsConnected ? 'Refresh (live sync active)' : 'Refresh (live sync disconnected - click to reconnect)'}
              className="relative shrink-0 rounded-lg p-2 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-gray-200 active:scale-95 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.015 4.356v4.992" />
              </svg>
              <span
                className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
                title={wsConnected ? 'Connected' : 'Disconnected'}
              />
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={showEmptyTrashConfirm}
        onClose={() => setShowEmptyTrashConfirm(false)}
        onConfirm={() => {
          setShowEmptyTrashConfirm(false);
          onEmptyTrash?.();
        }}
        title="Empty Trash?"
        message="This will permanently delete every conversation in Trash and all its attachments. This cannot be undone."
        confirmLabel="Empty Trash"
        destructive
      />
    </header>
  );
}

const CATEGORY_OPTIONS: { key: EmailCategory; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'social', label: 'Social' },
  { key: 'updates', label: 'Updates' },
  { key: 'forums', label: 'Forums' },
];

function MarkReadMenu({ onMarkPageRead, onMarkAllRead }: { onMarkPageRead?: () => void; onMarkAllRead?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Mark as read"
        className="shrink-0 rounded-lg p-2 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-gray-200 active:scale-95"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl py-1 shadow-2xl animate-fadeIn"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}
        >
          {onMarkPageRead && (
            <button
              onClick={() => { onMarkPageRead(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/[0.06]"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51" />
              </svg>
              Mark page as read
            </button>
          )}
          {onMarkAllRead && (
            <button
              onClick={() => { onMarkAllRead(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/[0.06]"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              Mark all as read
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MoveToCategory({ onMove }: { onMove: (category: EmailCategory) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Move to category"
        className="rounded-lg p-1.5 text-gray-400 transition-all duration-150 hover:bg-white/[0.06] hover:text-gray-200 active:scale-95"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg py-1 shadow-lg animate-slideUp"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}
        >
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.key}
              onClick={() => { onMove(cat.key); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-gray-100"
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
