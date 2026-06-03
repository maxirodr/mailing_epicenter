import { useState } from 'react';
import { useMailboxes } from '../../hooks/useMailboxes.ts';
import { useLabels } from '../../hooks/useLabels.ts';
import { useCounts } from '../../hooks/useCounts.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { useComposeStore } from '../../stores/composeStore.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { useCategoryCounts } from '../../hooks/useCategoryCounts.ts';
import { usePreferences, useUpdatePreferences } from '../../hooks/useSettings.ts';
import type { Label, Mailbox, EmailCategory } from '../../types/index.ts';
import type { ReactNode } from 'react';

interface SidebarProps {
  activeLabel: string;
  onLabelChange: (label: string) => void;
  onManageLabels: () => void;
  activeCategory?: EmailCategory;
  onCategoryChange?: (category: EmailCategory) => void;
}

const SYSTEM_LABELS: { key: string; name: string; icon: ReactNode }[] = [
  {
    key: 'INBOX',
    name: 'Inbox',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
      </svg>
    ),
  },
  {
    key: 'SENT',
    name: 'Sent',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
  {
    key: 'DRAFT',
    name: 'Drafts',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    key: 'SCHEDULED',
    name: 'Scheduled',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'SPAM',
    name: 'Spam',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    key: 'TRASH',
    name: 'Trash',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    ),
  },
];

export default function Sidebar({ activeLabel, onLabelChange, onManageLabels, activeCategory, onCategoryChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const { data: mailboxes } = useMailboxes();
  const selectedMailboxId = useUiStore((s) => s.selectedMailboxId);
  const setSelectedMailboxId = useUiStore((s) => s.setSelectedMailboxId);
  const openNewCompose = useComposeStore((s) => s.openNew);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const { data: labels } = useLabels(selectedMailboxId);
  const { data: counts } = useCounts(selectedMailboxId);
  const { data: categoryCounts } = useCategoryCounts(selectedMailboxId);

  const customLabels = labels?.filter((l: Label) => l.type === 'custom') ?? [];

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`
          fixed left-0 top-0 z-30 flex h-full w-64 flex-col glass-panel transition-transform duration-200
          lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ borderRight: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <svg className="h-7 w-7" style={{ color: 'var(--accent-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <span className="text-gradient text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>NexoMail</span>
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={() => {
              const mailbox = mailboxes?.find((m) => m.id === selectedMailboxId);
              openNewCompose(selectedMailboxId, mailbox?.signature || undefined);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)',
              boxShadow: '0 4px 16px rgba(124, 92, 252, 0.25)',
            }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Compose
          </button>
        </div>

        {/* Mailbox selector removed — now in the account switcher at the bottom */}

        <nav className="flex-1 overflow-y-auto px-2">
          <div className="space-y-0.5">
            {SYSTEM_LABELS.map((item) => {
              const isActive = activeLabel === item.key;
              const unread = counts?.[item.key] ?? 0;
              return (
                <div key={item.key}>
                  <button
                    onClick={() => onLabelChange(item.key)}
                    className={`
                      relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150
                      ${isActive
                        ? 'bg-white/[0.06] text-purple-300'
                        : 'text-gray-300 hover:bg-white/[0.04] hover:text-gray-200'}
                    `}
                  >
                    {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full animate-scaleIn" style={{ background: 'var(--accent-primary)' }} />}
                    {item.icon}
                    <span className="flex-1 text-left">{item.name}</span>
                    {unread > 0 && (
                      <span className="rounded-full px-1.5 text-xs text-white animate-badgePulse" style={{ background: 'var(--accent-primary)' }}>
                        {unread}
                      </span>
                    )}
                  </button>
                  {item.key === 'INBOX' && activeLabel === 'INBOX' && (
                    <div className="lg:hidden ml-6 mt-0.5 space-y-0.5">
                      {([
                        { key: 'primary' as EmailCategory, label: 'Primary' },
                        { key: 'promotions' as EmailCategory, label: 'Promotions' },
                        { key: 'social' as EmailCategory, label: 'Social' },
                        { key: 'updates' as EmailCategory, label: 'Updates' },
                        { key: 'forums' as EmailCategory, label: 'Forums' },
                      ] as const).filter(cat => cat.key === 'primary' || (categoryCounts?.[cat.key] ?? 0) > 0).map(cat => (
                        <button
                          key={cat.key}
                          onClick={() => onCategoryChange?.(cat.key)}
                          className={`
                            flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150
                            ${activeCategory === cat.key
                              ? 'text-purple-300 bg-white/[0.06]'
                              : 'text-gray-400 hover:text-gray-300 hover:bg-white/[0.04]'}
                          `}
                        >
                          <span className="flex-1 text-left">{cat.label}</span>
                          {(categoryCounts?.[cat.key] ?? 0) > 0 && (
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {categoryCounts?.[cat.key]}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {customLabels.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                Labels
              </h3>
              <div className="space-y-0.5">
                {customLabels.map((label: Label) => {
                  const isActive = activeLabel === `label:${label.id}`;
                  return (
                    <button
                      key={label.id}
                      onClick={() => onLabelChange(`label:${label.id}`)}
                      className={`
                        flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150
                        ${isActive
                          ? 'bg-gray-800 text-gray-100'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}
                      `}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: label.color || '#6b7280' }}
                      />
                      <span className="truncate">{label.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-2 px-3">
            <button
              onClick={onManageLabels}
              className="text-xs text-gray-500 transition-colors duration-150 hover:text-gray-300"
            >
              Manage labels
            </button>
          </div>
        </nav>

        <div className="px-2 py-2 space-y-0.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <a
            href="/settings"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors duration-150 hover:bg-white/[0.04] hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </a>
          {user?.is_admin && (
            <a
              href="/admin"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors duration-150 hover:bg-white/[0.04] hover:text-gray-200"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Admin Panel
            </a>
          )}
        </div>

        <AccountSwitcher
          mailboxes={mailboxes || []}
          selectedMailboxId={selectedMailboxId}
          onSelectMailbox={(id) => {
            setSelectedMailboxId(id);
            onLabelChange('INBOX');
          }}
          user={user}
          onLogout={() => logout.mutate()}
        />
      </aside>
    </>
  );
}

/* ─── Account Switcher ─── */

interface AccountSwitcherProps {
  mailboxes: Mailbox[];
  selectedMailboxId: number | null;
  onSelectMailbox: (id: number) => void;
  user: { name: string; email: string } | null | undefined;
  onLogout: () => void;
}

function AccountSwitcher({ mailboxes, selectedMailboxId, onSelectMailbox, user, onLogout }: AccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { data: preferences } = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const current = mailboxes.find((m) => m.id === selectedMailboxId);
  const defaultMailboxId = preferences?.default_mailbox_id ?? null;

  function handleSetDefault(e: React.MouseEvent, mbId: number) {
    e.stopPropagation();
    const newDefault = defaultMailboxId === mbId ? null : mbId;
    updatePrefs.mutate({ default_mailbox_id: newDefault });
  }

  return (
    <div className="relative" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors duration-150 hover:bg-gray-800"
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium"
          style={{
            background: 'linear-gradient(135deg, rgba(124,92,252,0.2), rgba(245,158,66,0.15))',
            color: 'var(--accent-primary)',
          }}
        >
          {current?.avatar_url ? (
            <img src={current.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            (current?.display_name || current?.address || user?.name || '?').charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-200">
            {current?.display_name || current?.address || user?.name}
          </p>
          <p className="truncate text-xs text-gray-500">
            {current?.full_address || current?.address || user?.email}
          </p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg glass-panel animate-slideUp" style={{ boxShadow: 'var(--shadow-lg)' }}>
          {mailboxes.length > 1 && (
            <div className="max-h-48 overflow-y-auto p-1">
              {mailboxes.map((mb) => {
                const isFavorite = defaultMailboxId === mb.id;
                const unread = mb.inbox_unread_count ?? 0;
                return (
                  <button
                    key={mb.id}
                    onClick={() => {
                      onSelectMailbox(mb.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 ${
                      mb.id === selectedMailboxId
                        ? 'bg-white/[0.06] text-purple-300'
                        : 'text-gray-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-gray-300">
                      {mb.avatar_url ? (
                      <img src={mb.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      (mb.display_name || mb.address).charAt(0).toUpperCase()
                    )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {mb.display_name || mb.address}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {mb.full_address || mb.address}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="rounded-full px-1.5 text-xs text-white" style={{ background: 'var(--accent-primary)' }}>
                        {unread}
                      </span>
                    )}
                    <span
                      onClick={(e) => handleSetDefault(e, mb.id)}
                      className="shrink-0 rounded p-0.5 transition-colors hover:bg-white/[0.08]"
                      title={isFavorite ? 'Remove as default' : 'Set as default'}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill={isFavorite ? '#f59e42' : 'none'} stroke={isFavorite ? '#f59e42' : 'currentColor'} strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="p-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 transition-colors duration-150 hover:bg-white/[0.04] hover:text-gray-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
