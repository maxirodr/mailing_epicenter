import { useState, useEffect } from 'react';
import type { SearchParams } from '../../hooks/useSearch.ts';

interface SearchFiltersProps {
  filters: SearchParams;
  onApply: (filters: SearchParams) => void;
  onClear: () => void;
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'primary', label: 'Primary' },
  { value: 'promotions', label: 'Promotions' },
  { value: 'social', label: 'Social' },
  { value: 'updates', label: 'Updates' },
  { value: 'forums', label: 'Forums' },
];

const inputClass = 'w-full rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-[var(--accent-primary)]';
const inputStyle = { background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' };

export default function SearchFilters({ filters, onApply, onClear }: SearchFiltersProps) {
  const [from, setFrom] = useState(filters.from || '');
  const [to, setTo] = useState(filters.to || '');
  const [after, setAfter] = useState(filters.after || '');
  const [before, setBefore] = useState(filters.before || '');
  const [hasAttachment, setHasAttachment] = useState(filters.has_attachment || false);
  const [isUnread, setIsUnread] = useState(filters.is_unread || false);
  const [category, setCategory] = useState(filters.category || '');

  useEffect(() => {
    setFrom(filters.from || '');
    setTo(filters.to || '');
    setAfter(filters.after || '');
    setBefore(filters.before || '');
    setHasAttachment(filters.has_attachment || false);
    setIsUnread(filters.is_unread || false);
    setCategory(filters.category || '');
  }, [filters]);

  function handleApply() {
    const newFilters: SearchParams = {};
    if (from) newFilters.from = from;
    if (to) newFilters.to = to;
    if (after) newFilters.after = after;
    if (before) newFilters.before = before;
    if (hasAttachment) newFilters.has_attachment = true;
    if (isUnread) newFilters.is_unread = true;
    if (category) newFilters.category = category;
    onApply(newFilters);
  }

  function handleClear() {
    setFrom('');
    setTo('');
    setAfter('');
    setBefore('');
    setHasAttachment(false);
    setIsUnread(false);
    setCategory('');
    onClear();
  }

  return (
    <div
      className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl p-4 shadow-2xl animate-fadeIn"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">From</label>
          <input
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="sender@example.com"
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">To</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">After</label>
          <input
            type="date"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Before</label>
          <input
            type="date"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-400">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={hasAttachment}
            onChange={(e) => setHasAttachment(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
          />
          Has attachment
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isUnread}
            onChange={(e) => setIsUnread(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
          />
          Unread only
        </label>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={handleClear}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
        >
          Clear
        </button>
        <button
          onClick={handleApply}
          className="rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)' }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
