import { useState, useRef, useEffect } from 'react';
import { useThread, useUpdateThread, useNotSpam } from '../../hooks/useThreads.ts';
import { useCancelSend, useSendScheduledNow } from '../../hooks/useEmails.ts';
import { showNotificationToast } from '../ui/NotificationToast.tsx';
import type { Email, EmailCategory } from '../../types/index.ts';
import EmailMessage from './EmailMessage.tsx';

interface ThreadViewProps {
  mailboxId: number;
  threadId: number;
  onReply: (email: Email) => void;
  onReplyAll: (email: Email) => void;
  onForward: (email: Email) => void;
  onClose: () => void;
}

export default function ThreadView({
  mailboxId,
  threadId,
  onReply,
  onReplyAll,
  onForward,
  onClose,
}: ThreadViewProps) {
  const { data: thread, isLoading } = useThread(mailboxId, threadId);
  const updateThread = useUpdateThread(mailboxId);
  const notSpam = useNotSpam(mailboxId);
  const cancelSend = useCancelSend(mailboxId);
  const sendNow = useSendScheduledNow(mailboxId);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden animate-fadeIn" style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="h-6 w-3/4 animate-pulse rounded bg-gray-800" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-gray-800/50 p-4">
              <div className="h-4 w-1/3 animate-pulse rounded bg-gray-800" />
              <div className="h-3 w-full animate-pulse rounded bg-gray-800/60" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-gray-800/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center animate-fadeIn" style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border-subtle)' }}>
        <p className="text-sm text-gray-500">Thread not found</p>
      </div>
    );
  }

  const emails = thread.emails ?? [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border-subtle)' }}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-gray-100">{thread.subject || '(no subject)'}</h2>
          {thread.labels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {thread.labels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: `${label.color || '#374151'}25`,
                    color: label.color || '#9ca3af',
                  }}
                >
                  {label.type === 'custom' && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: label.color || '#6b7280' }}
                    />
                  )}
                  {label.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => updateThread.mutate({ threadId, data: { is_read: false } })}
            className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
            title="Mark as unread"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </button>
          <button
            onClick={() => updateThread.mutate({ threadId, data: { is_spam: true } })}
            className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
            title="Report spam"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </button>
          <button
            onClick={() => updateThread.mutate({ threadId, data: { is_starred: !thread.user_state?.is_starred } })}
            className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
            title={thread.user_state?.is_starred ? 'Unstar' : 'Star'}
          >
            {thread.user_state?.is_starred ? (
              <svg className="h-5 w-5 animate-starBounce" style={{ color: 'var(--accent-secondary)' }} fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => updateThread.mutate({ threadId, data: { is_trashed: true } })}
            className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-red-400"
            title="Move to trash"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
          <ThreadCategoryMenu
            current={thread.category}
            onChange={(cat) => updateThread.mutate({ threadId, data: { category: cat } })}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-color:theme(colors.gray.700)_transparent] [scrollbar-width:thin]">
        {emails.length > 0 && (
          <div className="p-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              className="glass-card flex cursor-text items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.03]"
              onClick={() => onReply(emails[0])}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-gray-400"
                style={{ background: 'var(--surface-3)' }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </div>
              <span className="flex-1 text-sm text-gray-500">Click to reply...</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onReply(emails[0]); }}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                  title="Reply"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onReplyAll(emails[0]); }}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                  title="Reply All"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15l-4.5-6 4.5-6m6 12l-4.5-6 4.5-6M15 9h6a3 3 0 010 6h-3" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onForward(emails[0]); }}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                  title="Forward"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {emails.map((email, idx) => (
          <EmailMessage
            key={email.id}
            email={email}
            defaultExpanded={idx === 0}
            isSpam={thread.user_state?.is_spam === true}
            onReply={(email) => onReply(email)}
            onReplyAll={(email) => onReplyAll(email)}
            onForward={(email) => onForward(email)}
            onMarkUnread={() => updateThread.mutate({ threadId, data: { is_read: false } })}
            onStar={() => updateThread.mutate({ threadId, data: { is_starred: !thread.user_state?.is_starred } })}
            onDelete={() => updateThread.mutate({ threadId, data: { is_trashed: true } })}
            onSpam={() => updateThread.mutate({ threadId, data: { is_spam: true } })}
            onNotSpam={() => notSpam.mutate({ threadId }, {
              onSuccess: () => showNotificationToast('Moved to Inbox', 'Message marked as not spam.'),
            })}
            onTrustSender={() => notSpam.mutate({ threadId, trustSender: true }, {
              onSuccess: () => showNotificationToast('Sender trusted', 'Future emails from this sender will skip spam detection.'),
            })}
            onCancelSchedule={email.scheduled_at && !email.sent_at ? () => cancelSend.mutate(email.id, {
              onSuccess: () => showNotificationToast('Schedule cancelled', 'Email moved to drafts.'),
            }) : undefined}
            onSendNow={email.scheduled_at && !email.sent_at ? () => sendNow.mutate(email.id, {
              onSuccess: () => showNotificationToast('Sending now', 'Email will be sent shortly.'),
            }) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

const CATEGORIES: { key: EmailCategory; label: string; icon: string }[] = [
  { key: 'primary', label: 'Primary', icon: 'M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3' },
  { key: 'promotions', label: 'Promotions', icon: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z' },
  { key: 'social', label: 'Social', icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197' },
  { key: 'updates', label: 'Updates', icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0' },
  { key: 'forums', label: 'Forums', icon: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155' },
];

function ThreadCategoryMenu({ current, onChange }: { current: EmailCategory; onChange: (cat: EmailCategory) => void }) {
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
        className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-gray-200"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl py-1 shadow-2xl animate-fadeIn"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => { onChange(cat.key); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.06] ${current === cat.key ? 'text-[var(--accent-primary)] font-medium' : 'text-gray-300'}`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
              </svg>
              {cat.label}
              {current === cat.key && (
                <svg className="ml-auto h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
