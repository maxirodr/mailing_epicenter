import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, type KeyboardEvent, type DragEvent } from 'react';
import api from '../../services/api.ts';

interface ContactSuggestion {
  address: string;
  name: string | null;
}

export interface RecipientInputHandle {
  flushPending: () => string[];
}

interface RecipientInputProps {
  label: string;
  recipients: string[];
  onChange: (recipients: string[]) => void;
  placeholder?: string;
  mailboxId?: number | null;
  onRecipientDrop?: (email: string) => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const RecipientInput = forwardRef<RecipientInputHandle, RecipientInputProps>(
  function RecipientInput({ label, recipients, onChange, placeholder, mailboxId, onRecipientDrop }, ref) {
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [nameMap, setNameMap] = useState<Record<string, string>>({});
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Look up names for pre-filled recipients (e.g. from replies)
    useEffect(() => {
      if (!mailboxId || recipients.length === 0) return;
      const unknowns = recipients.filter((r) => !nameMap[r]);
      if (unknowns.length === 0) return;

      unknowns.forEach(async (addr) => {
        try {
          const { data } = await api.get<ContactSuggestion[]>(
            `/api/mailboxes/${mailboxId}/contacts/suggest`,
            { params: { q: addr } },
          );
          const match = data.find((c) => c.address === addr);
          if (match?.name) {
            setNameMap((prev) => ({ ...prev, [addr]: match.name! }));
          }
        } catch {
          // ignore
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mailboxId, recipients.length]);

    // Fetch suggestions when input changes
    useEffect(() => {
      if (!mailboxId || inputValue.trim().length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const { data } = await api.get<ContactSuggestion[]>(
            `/api/mailboxes/${mailboxId}/contacts/suggest`,
            { params: { q: inputValue.trim() } },
          );
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
          setSelectedIdx(-1);
        } catch {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }, 300);

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [inputValue, mailboxId]);

    // Close suggestions on click outside
    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setShowSuggestions(false);
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useImperativeHandle(ref, () => ({
      flushPending(): string[] {
        const trimmed = inputValue.trim();
        if (trimmed && isValidEmail(trimmed) && !recipients.includes(trimmed)) {
          const updated = [...recipients, trimmed];
          onChange(updated);
          setInputValue('');
          return updated;
        }
        return recipients;
      },
    }));

    function addRecipient(value: string) {
      const trimmed = value.trim();
      if (trimmed && isValidEmail(trimmed) && !recipients.includes(trimmed)) {
        onChange([...recipients, trimmed]);
      }
      setInputValue('');
    }

    function selectSuggestion(s: ContactSuggestion) {
      if (!recipients.includes(s.address)) {
        onChange([...recipients, s.address]);
      }
      if (s.name) {
        setNameMap((prev) => ({ ...prev, [s.address]: s.name! }));
      }
      setInputValue('');
      setSuggestions([]);
      setShowSuggestions(false);
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (showSuggestions && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
          return;
        }
        if (e.key === 'Enter' && selectedIdx >= 0) {
          e.preventDefault();
          selectSuggestion(suggestions[selectedIdx]);
          return;
        }
      }
      if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
        e.preventDefault();
        addRecipient(inputValue);
      }
      if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
        onChange(recipients.slice(0, -1));
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }

    function handleBlur() {
      if (inputValue.trim()) {
        addRecipient(inputValue);
      }
    }

    function removeRecipient(index: number) {
      onChange(recipients.filter((_, i) => i !== index));
    }

    const [expandedChip, setExpandedChip] = useState<number | null>(null);
    const [dropTarget, setDropTarget] = useState(false);

    const copyEmail = useCallback((email: string) => {
      navigator.clipboard.writeText(email);
      setExpandedChip(null);
    }, []);

    function handleChipDragStart(e: DragEvent, email: string) {
      e.dataTransfer.setData('application/x-recipient', email);
      e.dataTransfer.setData('text/plain', email);
      e.dataTransfer.effectAllowed = 'move';
    }

    function handleContainerDragOver(e: DragEvent) {
      if (e.dataTransfer.types.includes('application/x-recipient')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(true);
      }
    }

    function handleContainerDragLeave() {
      setDropTarget(false);
    }

    function handleContainerDrop(e: DragEvent) {
      e.preventDefault();
      setDropTarget(false);
      const email = e.dataTransfer.getData('application/x-recipient');
      if (email && !recipients.includes(email)) {
        onChange([...recipients, email]);
        onRecipientDrop?.(email);
      }
    }

    return (
      <div className="flex items-start gap-2" ref={wrapperRef}>
        <label className="shrink-0 pt-2 text-xs font-medium text-gray-500">{label}</label>
        <div className="relative flex-1">
          <div
            onDragOver={handleContainerDragOver}
            onDragLeave={handleContainerDragLeave}
            onDrop={handleContainerDrop}
            className={`flex min-h-[36px] flex-wrap items-center gap-1 rounded-lg border px-2 py-1 transition-colors focus-within:border-[var(--accent-primary)] ${dropTarget ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700'}`}
            style={dropTarget ? undefined : { background: 'var(--surface-2)' }}
          >
            {recipients.map((email, idx) => (
              <div key={idx} className="relative">
                <span
                  draggable
                  onDragStart={(e) => handleChipDragStart(e, email)}
                  onClick={() => setExpandedChip(expandedChip === idx ? null : idx)}
                  className="group flex cursor-grab items-center gap-1 rounded-md px-2 py-0.5 text-xs text-gray-200 transition-colors hover:bg-white/[0.08] active:cursor-grabbing"
                  style={{ background: 'var(--surface-3)' }}
                >
                  <span className="max-w-[200px] truncate">
                    {nameMap[email] ? `${nameMap[email]} <${email}>` : email}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeRecipient(idx); }}
                    className="ml-0.5 shrink-0 rounded-full p-0.5 text-gray-400 transition-colors hover:bg-white/[0.1] hover:text-gray-100"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
                {expandedChip === idx && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExpandedChip(null)} />
                    <div
                      className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg py-1 shadow-xl animate-fadeIn"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}
                    >
                      {nameMap[email] && (
                        <div className="px-3 py-1.5 text-xs font-medium text-gray-200">{nameMap[email]}</div>
                      )}
                      <div className="px-3 py-1 text-xs text-gray-400 break-all select-all">{email}</div>
                      <div className="mt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <button
                          onClick={() => copyEmail(email)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.06]"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                          Copy email
                        </button>
                        <button
                          onClick={() => { removeRecipient(idx); setExpandedChip(null); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-white/[0.06]"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79" />
                          </svg>
                          Remove
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              placeholder={recipients.length === 0 ? (placeholder || 'Add recipients') : ''}
              className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-gray-200 placeholder-gray-500 outline-none"
            />
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl">
              {suggestions.map((s, idx) => (
                <button
                  key={s.address}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    idx === selectedIdx ? 'bg-gray-700 text-gray-100' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <span className="truncate font-medium">{s.name || s.address}</span>
                  {s.name && <span className="truncate text-xs text-gray-500">{s.address}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default RecipientInput;
