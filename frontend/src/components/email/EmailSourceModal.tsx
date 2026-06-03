import { useEffect } from 'react';
import type { Email } from '../../types/index.ts';

interface EmailSourceModalProps {
  email: Email;
  onClose: () => void;
}

function HeaderRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="w-36 shrink-0 text-xs font-medium text-gray-400">{label}</span>
      <span className="min-w-0 break-all text-xs text-gray-300 select-all">{value}</span>
    </div>
  );
}

export default function EmailSourceModal({ email, onClose }: EmailSourceModalProps) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 className="text-base font-semibold text-gray-100">Original Message</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 [scrollbar-color:theme(colors.gray.700)_transparent] [scrollbar-width:thin]">
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Message Headers</h4>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
              <HeaderRow label="Message-ID" value={email.message_id} />
              <HeaderRow label="From" value={email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address} />
              <HeaderRow label="To" value={email.to_addresses.join(', ')} />
              {email.cc_addresses && email.cc_addresses.length > 0 && (
                <HeaderRow label="CC" value={email.cc_addresses.join(', ')} />
              )}
              {email.bcc_addresses && email.bcc_addresses.length > 0 && (
                <HeaderRow label="BCC" value={email.bcc_addresses.join(', ')} />
              )}
              <HeaderRow label="Subject" value={email.subject} />
              <HeaderRow label="Date" value={email.sent_at ? new Date(email.sent_at).toUTCString() : null} />
              <HeaderRow label="Direction" value={email.direction} />
              <HeaderRow label="In-Reply-To" value={email.in_reply_to} />
              <HeaderRow label="References" value={email.references_header} />
              <HeaderRow label="List-ID" value={email.list_id} />
              <HeaderRow label="List-Unsubscribe" value={email.list_unsubscribe} />
            </div>
          </div>

          {(email.spam_score !== null || email.auth_results) && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Security & Authentication</h4>
              <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                {email.spam_score !== null && (
                  <HeaderRow label="Spam Score" value={String(email.spam_score)} />
                )}
                <HeaderRow label="Auth Results" value={email.auth_results} />
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Raw Content</h4>
            <pre
              className="max-h-72 overflow-auto rounded-lg p-3 text-xs text-gray-400 select-all [scrollbar-color:theme(colors.gray.700)_transparent] [scrollbar-width:thin]"
              style={{ background: 'var(--surface-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >
              {email.html_body || email.text_body || '(empty)'}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(email.message_id);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/[0.06]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
            Copy Message ID
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6042e0 100%)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
